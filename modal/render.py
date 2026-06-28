import modal
import os
import subprocess
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor

# ------------------------------------------------------------------------
# 1. ENVIRONMENT DEFINITION
# We build a custom Debian image packed with FFmpeg and Whisper.
# We also download the Montserrat font directly into the container's font path.
# ------------------------------------------------------------------------
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "fontconfig", "curl")
    .pip_install(
        "openai-whisper",
        "whisper-timestamped",
        "requests",
        "cloudinary",
        "fastapi"
    )
    .run_commands(
        "mkdir -p /usr/share/fonts/truetype/montserrat",
        "curl -L -o /usr/share/fonts/truetype/montserrat/Montserrat-Bold.ttf 'https://github.com/JulietaUla/Montserrat/raw/master/fonts/ttf/Montserrat-Bold.ttf'",
        "fc-cache -f -v"
    )
)

app = modal.App("slideshow-render", image=image)

# ------------------------------------------------------------------------
# 2. HELPER: ASS TIMESTAMPS
# Converts seconds (float) to ASS format: H:MM:SS.cs
# ------------------------------------------------------------------------
def format_ass_time(seconds: float) -> str:
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    centisecs = int(round((seconds % 1) * 100))
    # Cap centiseconds at 99 to prevent ASS parsing errors
    if centisecs == 100:
        centisecs = 99
    return f"{hours}:{minutes:02d}:{secs:02d}.{centisecs:02d}"

# ------------------------------------------------------------------------
# 3. GPU WORKER: WHISPER ALIGNMENT -> KINETIC TYPOGRAPHY
# Uses the T4 GPU to generate an Advanced SubStation Alpha (.ass) file
# ------------------------------------------------------------------------
@app.function(gpu="T4")
def generate_ass_subtitles(audio_path: str, caption_text: str, shot_index: int) -> str:
    import whisper_timestamped as whisper
    
    # Load model (Modal caches this across warm invocations)
    model = whisper.load_model("base", device="cuda")
    
    # Transcribe with forced alignment
    # We pass the expected caption_text as the initial prompt to guide the model
    results = whisper.transcribe(model, audio_path, language="en", initial_prompt=caption_text)
    
    ass_path = f"/tmp/shot_{shot_index}.ass"
    
    # ASS File Header for 1080x1920
    ass_content = [
        "[Script Info]",
        "ScriptType: v4.00+",
        "PlayResX: 1080",
        "PlayResY: 1920",
        "WrapStyle: 1",  # Smart word wrapping
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        # Style definition: Montserrat, 72px, White text, Black outline/shadow, Centered (Alignment 5 or 8)
        "Style: Default,Montserrat,72,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,4,5,100,100,600,1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
    ]
    
    # Kinetic Typography Logic:
    # We display the full caption for the duration of the shot, but highlight 
    # the currently spoken word in Gold (\c&H00D7FF&) and scale it up (\fscx120\fscy120).
    
    words_data = []
    if 'segments' in results and len(results['segments']) > 0:
        for segment in results['segments']:
            for w in segment.get('words', []):
                words_data.append(w)
                
    # Fallback if Whisper returns empty (extremely rare, but saves the pipeline)
    if not words_data:
        ass_content.append(f"Dialogue: 0,0:00:00.00,0:00:10.00,Default,,0,0,0,,{caption_text}")
        with open(ass_path, "w") as f:
            f.write("\n".join(ass_content))
        return ass_path

    # Build the karaoke-style ASS lines
    for i, current_word in enumerate(words_data):
        start_time = format_ass_time(current_word['start'])
        # If it's the last word, hold it for an extra 0.5s to prevent abrupt cutoff
        end_time = format_ass_time(current_word['end'] if i < len(words_data) - 1 else current_word['end'] + 0.5)
        
        line_text = ""
        for j, w in enumerate(words_data):
            clean_word = w['text'].strip()
            if j == i:
                # Active word: Gold (BGR: 00D7FF) + 120% scale
                line_text += f"{{\\c&H00D7FF&}}{{\\fscx120\\fscy120}}{clean_word}{{\\fscx100\\fscy100}}{{\\c&HFFFFFF&}} "
            else:
                # Inactive word: White
                line_text += f"{clean_word} "
                
        # Append the event line
        ass_content.append(f"Dialogue: 0,{start_time},{end_time},Default,,0,0,0,,{line_text.strip()}")

    with open(ass_path, "w") as f:
        f.write("\n".join(ass_content))
        
    return ass_path

# ------------------------------------------------------------------------
# 4. CPU WORKER: ASSET DOWNLOAD & FFMPEG ASSEMBLY
# Uses 8 CPU cores. This orchestrates the downloads, calls the GPU for ASS, 
# renders individual shots, concats them, and ducks the audio.
# ------------------------------------------------------------------------
@app.function(cpu=8.0, timeout=600)
def render_video(job_id: str, shots: list, music_url: str, callback_url: str):
    import cloudinary.uploader
    import requests
    
    print(f"[{job_id}] Starting render for {len(shots)} shots.")
    work_dir = f"/tmp/{job_id}"
    os.makedirs(work_dir, exist_ok=True)
    
    # 1. Download all assets in parallel
    def download_asset(url, filename):
        urllib.request.urlretrieve(url, filename)
        return filename

    download_tasks = []
    with ThreadPoolExecutor(max_workers=10) as executor:
        for i, shot in enumerate(shots):
            img_path = f"{work_dir}/img_{i}.jpg"
            aud_path = f"{work_dir}/aud_{i}.mp3"
            download_tasks.append(executor.submit(download_asset, shot["image_url"], img_path))
            download_tasks.append(executor.submit(download_asset, shot["audio_url"], aud_path))
        
        bg_music_path = f"{work_dir}/bg_music.mp3"
        download_tasks.append(executor.submit(download_asset, music_url, bg_music_path))
        
        # Wait for all downloads
        for task in download_tasks:
            task.result()

    # 2. Process Shots (Whisper ASS + Ken Burns Render)
    rendered_shots = []
    for i, shot in enumerate(shots):
        img_path = f"{work_dir}/img_{i}.jpg"
        aud_path = f"{work_dir}/aud_{i}.mp3"
        
        # Dispatch to GPU for subtitle generation
        ass_path = generate_ass_subtitles.remote(aud_path, shot["caption_text"], i)
        
        # Alternating zoom direction based on shot index
        zoom_expr = "zoom+0.0006" if i % 2 == 0 else "zoom-0.0006"
        scale_expr = "1.0" if i % 2 == 0 else "1.12"
        
        out_shot = f"{work_dir}/shot_rendered_{i}.mp4"
        
        # The PCM/Static fix is here: -ar 44100 -ac 2 forces uniform audio across all MP3s
        ffmpeg_shot_cmd = [
            "ffmpeg", "-y",
            "-loop", "1", "-i", img_path,
            "-i", aud_path,
            "-vf", f"scale=1080:1920,zoompan=z='if(eq(mod(on,2),0),{scale_expr},{zoom_expr})':d=10000:s=1080x1920,ass='{ass_path}'",
            "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
            "-shortest",
            out_shot
        ]
        subprocess.run(ffmpeg_shot_cmd, check=True)
        rendered_shots.append(out_shot)

    # 3. Concat all rendered shots
    concat_list_path = f"{work_dir}/concat_list.txt"
    with open(concat_list_path, "w") as f:
        for s in rendered_shots:
            f.write(f"file '{s}'\n")
            
    concat_out = f"{work_dir}/concat_out.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list_path,
        "-c", "copy", concat_out
    ], check=True)

    # 4. Final Mix: Sidechain Compression (The Audio Routing Fix)
    final_out = f"{work_dir}/final_{job_id}.mp4"
    
    # [0:a] = Concatenated Voice
    # [1:a] = Background Music (looped and volumed)
    # The output of sidechaincompress (ducked music) is explicitly mixed BACK with the voice via amix
    filter_complex = (
        "[1:a]volume=0.35[bg_vol]; "
        "[bg_vol][0:a]sidechaincompress=threshold=-28dB:ratio=4:attack=5:release=50[bg_ducked]; "
        "[0:a][bg_ducked]amix=inputs=2:duration=first:dropout_transition=2[aout]"
    )
    
    subprocess.run([
        "ffmpeg", "-y",
        "-i", concat_out,
        "-stream_loop", "-1", "-i", bg_music_path,
        "-filter_complex", filter_complex,
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
        "-shortest",
        final_out
    ], check=True)

    # 5. Upload to Cloudinary
    # (Assuming CLOUDINARY_URL environment variable is set via Modal Secrets)
    upload_result = cloudinary.uploader.upload(
        final_out, 
        resource_type="video",
        folder="ai-slideshow/rendered"
    )
    
    video_url = upload_result['secure_url']
    print(f"[{job_id}] Render complete. URL: {video_url}")

    # 6. Close the loop: Fire the webhook back to Next.js / Inngest
    if callback_url:
        print(f"[{job_id}] Firing callback to {callback_url}")
        try:
            response = requests.post(
                callback_url,
                json={"jobId": job_id, "videoUrl": video_url},
                timeout=15
            )
            response.raise_for_status()
            print(f"[{job_id}] Callback successful.")
        except Exception as e:
            print(f"[{job_id}] CRITICAL: Callback failed: {e}")

    return {
        "jobId": job_id,
        "videoUrl": video_url
    }

# ------------------------------------------------------------------------
# 5. WEBHOOK ENDPOINT
# Your Next.js app POSTs to this endpoint. It triggers the CPU worker asynchronously.
# ------------------------------------------------------------------------
from fastapi import Request

@app.function(secrets=[modal.Secret.from_name("cloudinary")])
@modal.fastapi_endpoint(method="POST")
async def trigger_render(request: Request):
    payload = await request.json()
    job_id = payload.get("jobId")
    shots = payload.get("shots")
    music_url = payload.get("music_url")
    callback_url = payload.get("callback_url")
    
    if not all([job_id, shots, music_url, callback_url]):
        return {"error": "Missing required fields"}

    # Spawn the heavy render asynchronously so the HTTP request completes immediately
    render_video.spawn(job_id, shots, music_url, callback_url)
    
    return {"status": "Render queued on Modal", "jobId": job_id}