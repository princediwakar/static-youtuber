# Path: modal/render.py
import modal
import os
import subprocess
import urllib.request
import re
import shutil
from concurrent.futures import ThreadPoolExecutor

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

FPS = 30


def format_ass_time(seconds: float) -> str:
    if seconds < 0:
        seconds = 0.0
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    centisecs = int(round((seconds % 1) * 100))
    if centisecs == 100:
        centisecs = 99
    return f"{hours}:{minutes:02d}:{secs:02d}.{centisecs:02d}"


@app.function()
def align_narration(audio_path: str, full_text: str) -> list:
    import whisper_timestamped as whisper
    model = whisper.load_model("base")
    results = whisper.transcribe(model, audio_path, language="en", initial_prompt=full_text)

    words = []
    for segment in results.get("segments", []):
        for w in segment.get("words", []):
            words.append(w)
    return words


def slice_words_by_shot(words: list, shots: list) -> list:
    boundaries = []
    word_idx = 0
    n = len(words)

    for i, shot in enumerate(shots):
        target_words = re.findall(r'[a-z0-9]+', shot["text"].lower())
        if not target_words:
            target_words = ["none"]

        slice_words = []
        match_count = 0

        while word_idx < n:
            w = words[word_idx]
            slice_words.append(w)
            clean_w = re.sub(r'[^a-z0-9]', '', w['text'].lower())

            if clean_w and clean_w in target_words:
                match_count += 1

            word_idx += 1

            if match_count >= len(target_words) * 0.8:
                break

        start_time = slice_words[0]['start'] if slice_words else (boundaries[-1][1] if boundaries else 0.0)
        boundaries.append([start_time, 0.0, slice_words])

    for i in range(len(boundaries) - 1):
        boundaries[i][1] = boundaries[i + 1][0]

    if boundaries:
        last_end = boundaries[-1][2][-1]['end'] if boundaries[-1][2] else boundaries[-1][0]
        boundaries[-1][1] = last_end + 0.5

    return boundaries


def build_continuous_ass(shot_boundaries: list) -> str:
    """
    Kinetic .ass subtitles. Scales highlighted words up (\fscx130\fscy130)
    and colors them gold so they pop — replacing the old imageGenerator.ts
    burnCaption logic directly in the video stream.
    """
    ass_content = [
        "[Script Info]",
        "ScriptType: v4.00+",
        "PlayResX: 1080",
        "PlayResY: 1920",
        "WrapStyle: 1",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        "Style: Default,Montserrat,72,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,4,2,80,80,672,1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
    ]

    for start_time, end_time, words_data in shot_boundaries:
        if not words_data:
            continue

        for i, current_word in enumerate(words_data):
            w_start = format_ass_time(current_word['start'])
            w_end_raw = words_data[i + 1]['start'] if i < len(words_data) - 1 else current_word['end'] + 0.15
            w_end = format_ass_time(max(w_end_raw - 0.01, current_word['start'] + 0.01))

            line_text = ""
            for j, w in enumerate(words_data):
                clean_word = re.sub(r'[,.—!?]', '', w['text']).strip()
                if j == i:
                    line_text += f"{{\\fscx130\\fscy130\\c&H00D7FF&}}{{\\b1}}{clean_word}{{\\b0}}{{\\fscx100\\fscy100\\c&HFFFFFF&}} "
                else:
                    line_text += f"{clean_word} "

            ass_content.append(f"Dialogue: 0,{w_start},{w_end},Default,,0,0,0,,{line_text.strip()}")

    return "\n".join(ass_content)


@app.function(cpu=8.0, timeout=600, secrets=[modal.Secret.from_name("cloudinary")])
def render_video(job_id: str, account_id: str, shots: list, audio_url: str, music_url: str, callback_url: str):
    import cloudinary.uploader
    import requests

    work_dir = f"/tmp/{job_id}"
    os.makedirs(work_dir, exist_ok=True)

    def send_failure_callback(error_msg: str):
        if not callback_url:
            return
        try:
            requests.post(
                callback_url,
                json={"jobId": job_id, "error": error_msg},
                timeout=15
            )
        except Exception as cb_err:
            print(f"[{job_id}] CRITICAL: Could not send failure callback: {cb_err}")

    try:
        def download_asset(url, filename):
            urllib.request.urlretrieve(url, filename)
            return filename

        img_paths = [f"{work_dir}/img_{i}.jpg" for i in range(len(shots))]
        master_audio_raw = f"{work_dir}/narration_raw.mp3"
        bg_music_path = f"{work_dir}/bg_music.mp3"

        with ThreadPoolExecutor(max_workers=10) as executor:
            tasks = [executor.submit(download_asset, shot["image_url"], img_paths[i]) for i, shot in enumerate(shots)]
            tasks.append(executor.submit(download_asset, audio_url, master_audio_raw))
            tasks.append(executor.submit(download_asset, music_url, bg_music_path))
            for task in tasks:
                task.result()

        master_audio = f"{work_dir}/narration_trimmed.mp3"
        subprocess.run([
            "ffmpeg", "-y", "-i", master_audio_raw,
            "-af", "silenceremove=start_periods=1:start_silence=0.05:start_threshold=-45dB:stop_periods=1:stop_silence=0.05:stop_threshold=-45dB,apad=pad_dur=0.5",
            "-c:a", "libmp3lame", "-b:a", "128k", master_audio
        ], check=True, capture_output=True, timeout=120)

        full_text = " ".join(shot["text"].strip() for shot in shots)
        words = align_narration.local(master_audio, full_text)

        if not words:
            raise Exception(f"[{job_id}] Whisper returned no words for narration — cannot align shots.")

        shot_boundaries = slice_words_by_shot(words, shots)

        ass_path = f"{work_dir}/captions.ass"
        with open(ass_path, "w") as f:
            f.write(build_continuous_ass(shot_boundaries))

        rendered_shots = []
        for i, (shot, img_path) in enumerate(zip(shots, img_paths)):
            start_time, end_time, _ = shot_boundaries[i]
            duration = max(end_time - start_time, 0.35)
            frames = max(int(round(duration * FPS)), 1)

            zoom_expr = "zoom+0.0006" if i % 2 == 0 else "zoom-0.0006"
            scale_expr = "1.0" if i % 2 == 0 else "1.15"

            out_shot = f"{work_dir}/shot_rendered_{i}.mp4"
            subprocess.run([
                "ffmpeg", "-y", "-loop", "1", "-i", img_path,
                "-vf", f"scale=1080:1920,zoompan=z='if(eq(mod(on,2),0),{scale_expr},{zoom_expr})':d={frames}:s=1080x1920:fps={FPS}",
                "-frames:v", str(frames), "-r", str(FPS),
                "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p", "-an", out_shot
            ], check=True, capture_output=True, timeout=120)
            rendered_shots.append(out_shot)

        concat_list_path = f"{work_dir}/concat_list.txt"
        with open(concat_list_path, "w") as f:
            for s in rendered_shots:
                f.write(f"file '{s}'\n")

        concat_out = f"{work_dir}/concat_out.mp4"
        subprocess.run([
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list_path,
            "-c", "copy", concat_out
        ], check=True, capture_output=True, timeout=120)

        captioned_out = f"{work_dir}/captioned.mp4"
        subprocess.run([
            "ffmpeg", "-y", "-i", concat_out, "-vf", f"ass='{ass_path}'",
            "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p", "-an", captioned_out
        ], check=True, capture_output=True, timeout=120)

        final_out = f"{work_dir}/final_{job_id}.mp4"
        filter_complex = "[1:a]volume=0.35[bg_vol]; [bg_vol][0:a]sidechaincompress=threshold=-28dB:ratio=4:attack=5:release=50[bg_ducked]; [0:a][bg_ducked]amix=inputs=2:duration=first:dropout_transition=2[aout]"

        subprocess.run([
            "ffmpeg", "-y", "-i", master_audio, "-stream_loop", "-1", "-i", bg_music_path, "-i", captioned_out,
            "-filter_complex", filter_complex, "-map", "2:v", "-map", "[aout]",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2", "-shortest", final_out
        ], check=True, timeout=120)

        env_suffix = account_id.upper().replace("-", "_")
        cloud_name = os.environ.get(f"CLOUDINARY_CLOUD_NAME_{env_suffix}")
        api_key = os.environ.get(f"CLOUDINARY_API_KEY_{env_suffix}")
        api_secret = os.environ.get(f"CLOUDINARY_API_SECRET_{env_suffix}")

        if not (api_key and api_secret and cloud_name):
            raise Exception(f"[{job_id}] CRITICAL: No Cloudinary credentials found for account: {account_id}")

        cloudinary.config(cloud_name=cloud_name, api_key=api_key, api_secret=api_secret, secure=True)

        upload_result = cloudinary.uploader.upload(
            final_out,
            resource_type="video",
            folder="ai-slideshow/rendered"
        )

        video_url = upload_result['secure_url']
        print(f"[{job_id}] Render complete. URL: {video_url}")

        if callback_url:
            try:
                response = requests.post(
                    callback_url,
                    json={"jobId": job_id, "mp4Url": video_url},
                    timeout=15
                )
                response.raise_for_status()
            except Exception as e:
                print(f"[{job_id}] CRITICAL: Callback failed: {e}")

        return {
            "jobId": job_id,
            "videoUrl": video_url
        }

    except Exception as e:
        print(f"[{job_id}] CRITICAL: Render failed mid-execution: {e}")
        send_failure_callback(str(e))
        raise
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


from fastapi import Request, HTTPException


@app.function(secrets=[modal.Secret.from_name("cloudinary")])
@modal.fastapi_endpoint(method="POST")
async def trigger_render(request: Request):
    payload = await request.json()
    job_id = payload.get("jobId")
    account_id = payload.get("accountId")
    shots = payload.get("shots")
    audio_url = payload.get("audio_url")
    music_url = payload.get("music_url")
    callback_url = payload.get("callback_url")

    if not all([job_id, account_id, shots, audio_url, music_url, callback_url]):
        raise HTTPException(status_code=400, detail="Missing required fields")

    try:
        render_video.spawn(job_id, account_id, shots, audio_url, music_url, callback_url)
    except Exception as e:
        print(f"[trigger_render] render_video.spawn() failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    return {"status": "queued", "jobId": job_id}
