# Path: modal/render.py
import modal
import os
import subprocess
import urllib.request
import re
from concurrent.futures import ThreadPoolExecutor

# ------------------------------------------------------------------------
# 1. ENVIRONMENT DEFINITION
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

FPS = 30

# ------------------------------------------------------------------------
# 2. HELPER: ASS TIMESTAMPS
# ------------------------------------------------------------------------
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

# ------------------------------------------------------------------------
# 3. GPU/CPU WORKER: WHISPER ALIGNMENT ON THE FULL, CONTINUOUS NARRATION
#    (run ONCE per job, not once per shot)
# ------------------------------------------------------------------------
@app.function()
def align_narration(audio_path: str, full_text: str) -> list:
    """
    Runs whisper-timestamped ONCE on the entire narration track and returns
    a flat list of word dicts: {"text": str, "start": float, "end": float, ...}.

    This replaces the old per-shot alignment call. Aligning short fragments
    in isolation is what made the old pipeline both slower (N whisper calls
    instead of 1) AND boundary-jittery — each fragment's timestamps were
    relative to its own tiny clip, whereas everything here shares one
    timeline by construction.
    """
    import whisper_timestamped as whisper
    model = whisper.load_model("base")
    results = whisper.transcribe(model, audio_path, language="en", initial_prompt=full_text)

    words = []
    for segment in results.get("segments", []):
        for w in segment.get("words", []):
            words.append(w)
    return words


def slice_words_by_shot(words: list, shot_word_counts: list) -> list:
    """
    Maps the flat whisper word list back onto shot boundaries using each
    shot's known source word count. Returns a list of (start, end, words_slice)
    tuples, one per shot.

    Boundaries are stitched together — shot[i].end == shot[i+1].start — so
    there is ZERO gap between shots on the timeline. The image cut happens
    at the exact instant the next shot's first word begins, which is what
    makes the visual pacing feel continuous instead of padded.

    If EdgeTTS/Whisper drift slightly from the source word count (e.g. a
    number gets transcribed differently), later shots absorb the small
    error rather than the whole thing breaking — worst case a cut is off
    by a word or two, which is imperceptible at normal shot lengths.
    """
    boundaries = []
    cursor = 0
    n = len(words)

    for i, count in enumerate(shot_word_counts):
        is_last_shot = (i == len(shot_word_counts) - 1)

        if n == 0:
            boundaries.append((0.0, 0.5, []))
            continue

        start_idx = min(cursor, n - 1)
        end_idx = min(cursor + count, n)
        slice_words = words[start_idx:end_idx] if end_idx > start_idx else words[start_idx:start_idx + 1]

        start_time = slice_words[0]['start'] if slice_words else words[min(start_idx, n - 1)]['end']

        if is_last_shot:
            end_time = (slice_words[-1]['end'] if slice_words else start_time) + 0.5
        elif end_idx < n:
            end_time = words[end_idx]['start']  # cut exactly when the next shot's first word starts
        else:
            end_time = (slice_words[-1]['end'] if slice_words else start_time) + 0.5

        boundaries.append((start_time, end_time, slice_words))
        cursor = end_idx

    return boundaries


def build_continuous_ass(shot_boundaries: list) -> str:
    """
    Builds ONE .ass file covering the whole video timeline, with the same
    per-word highlight-bounce style as before, but timed continuously
    against the single master narration track instead of per-shot clips.
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
        "Style: Default,Montserrat,72,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,4,2,100,100,672,1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
    ]

    for start_time, end_time, words_data in shot_boundaries:
        if not words_data:
            continue

        for i, current_word in enumerate(words_data):
            w_start = format_ass_time(current_word['start'])
            w_end = format_ass_time(
                words_data[i + 1]['start'] if i < len(words_data) - 1 else current_word['end'] + 0.15
            )

            line_text = ""
            for j, w in enumerate(words_data):
                clean_word = re.sub(r'[,.—!?]', '', w['text']).strip()
                if j == i:
                    line_text += f"{{\\c&H00D7FF&}}{{\\b1}}{clean_word}{{\\b0}}{{\\c&HFFFFFF&}} "
                else:
                    line_text += f"{clean_word} "

            ass_content.append(f"Dialogue: 0,{w_start},{w_end},Default,,0,0,0,,{line_text.strip()}")

    return "\n".join(ass_content)

# ------------------------------------------------------------------------
# 4. CPU WORKER: ASSET DOWNLOAD & FFMPEG ASSEMBLY
# ------------------------------------------------------------------------
@app.function(cpu=8.0, timeout=600, secrets=[modal.Secret.from_name("cloudinary")])
def render_video(job_id: str, shots: list, audio_url: str, music_url: str, callback_url: str):
    """
    NEW CONTRACT:
      shots: [{ "image_url": str, "text": str }, ...]   (NO per-shot audio_url anymore)
      audio_url: ONE continuous narration track for the whole video
    """
    import cloudinary.uploader
    import requests

    print(f"[{job_id}] Starting render for {len(shots)} shots.")
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

        # ---- 1. Trim ONLY the lead-in / trail-off silence on the WHOLE narration, ONCE ----
        # stop_periods=1 (not -1) is deliberate: -1 would strip EVERY internal
        # silence gap above the threshold, which would rip out the natural
        # comma/em-dash pauses the narrative was written with. We only want to
        # trim the dead air before the first word and after the last word.
        master_audio = f"{work_dir}/narration_trimmed.mp3"
        subprocess.run([
            "ffmpeg", "-y", "-i", master_audio_raw,
            "-af", "silenceremove=start_periods=1:start_silence=0.05:start_threshold=-45dB:"
                   "stop_periods=1:stop_silence=0.05:stop_threshold=-45dB,apad=pad_dur=0.5",
            "-c:a", "libmp3lame", "-b:a", "128k",
            master_audio
        ], check=True, capture_output=True)

        # ---- 2. Align the full narration ONCE ----
        full_text = " ".join(shot["text"].strip() for shot in shots)
        words = align_narration.local(master_audio, full_text)

        if not words:
            raise Exception(f"[{job_id}] Whisper returned no words for narration — cannot align shots.")

        shot_word_counts = [len(shot["text"].strip().split()) for shot in shots]
        shot_boundaries = slice_words_by_shot(words, shot_word_counts)

        # ---- 3. Build ONE continuous caption file ----
        ass_path = f"{work_dir}/captions.ass"
        with open(ass_path, "w") as f:
            f.write(build_continuous_ass(shot_boundaries))

        # ---- 4. Render each shot as a silent, precisely-timed image clip ----
        rendered_shots = []
        for i, (shot, img_path) in enumerate(zip(shots, img_paths)):
            start_time, end_time, _ = shot_boundaries[i]
            duration = max(end_time - start_time, 0.35)  # floor so no shot flashes for ~0s
            frames = max(int(round(duration * FPS)), 1)

            zoom_expr = "zoom+0.0008" if i % 2 == 0 else "zoom-0.0008"
            scale_expr = "1.0" if i % 2 == 0 else "1.15"

            out_shot = f"{work_dir}/shot_rendered_{i}.mp4"
            subprocess.run([
                "ffmpeg", "-y",
                "-loop", "1", "-i", img_path,
                "-vf", f"scale=1080:1920,zoompan=z='if(eq(mod(on,2),0),{scale_expr},{zoom_expr})':d={frames}:s=1080x1920:fps={FPS}",
                "-frames:v", str(frames),
                "-r", str(FPS),
                "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p",
                "-an",
                out_shot
            ], check=True, capture_output=True)
            rendered_shots.append(out_shot)

        # ---- 5. Concat the silent image track — one continuous video stream ----
        concat_list_path = f"{work_dir}/concat_list.txt"
        with open(concat_list_path, "w") as f:
            for s in rendered_shots:
                f.write(f"file '{s}'\n")

        concat_out = f"{work_dir}/concat_out.mp4"
        subprocess.run([
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list_path,
            "-c", "copy", concat_out
        ], check=True, capture_output=True)

        # ---- 6. Burn the continuous captions onto the whole video in one pass ----
        captioned_out = f"{work_dir}/captioned.mp4"
        subprocess.run([
            "ffmpeg", "-y", "-i", concat_out,
            "-vf", f"ass='{ass_path}'",
            "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p",
            "-an",
            captioned_out
        ], check=True, capture_output=True)

        # ---- 7. Mux the single continuous narration + sidechain-ducked bg music ----
        final_out = f"{work_dir}/final_{job_id}.mp4"
        filter_complex = (
            "[1:a]volume=0.35[bg_vol]; "
            "[bg_vol][0:a]sidechaincompress=threshold=-28dB:ratio=4:attack=5:release=50[bg_ducked]; "
            "[0:a][bg_ducked]amix=inputs=2:duration=first:dropout_transition=2[aout]"
        )

        subprocess.run([
            "ffmpeg", "-y",
            "-i", master_audio,
            "-stream_loop", "-1", "-i", bg_music_path,
            "-i", captioned_out,
            "-filter_complex", filter_complex,
            "-map", "2:v",
            "-map", "[aout]",
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
            "-shortest",
            final_out
        ], check=True)

        suffixes = ["TECH_SHOTS", "FINANCE_SHOTS", "SURVIVAL_SHOTS", "STOIC_SHOTS"]
        cloud_name = api_key = api_secret = None
        for sfx in suffixes:
            cloud_name = os.environ.get(f"CLOUDINARY_CLOUD_NAME_{sfx}")
            api_key = os.environ.get(f"CLOUDINARY_API_KEY_{sfx}")
            api_secret = os.environ.get(f"CLOUDINARY_API_SECRET_{sfx}")
            if cloud_name and api_key and api_secret:
                break

        if api_key and api_secret and cloud_name:
            cloudinary.config(cloud_name=cloud_name, api_key=api_key, api_secret=api_secret, secure=True)
        else:
            raise Exception(f"No Cloudinary credentials found among suffixes: {suffixes}")

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

# ------------------------------------------------------------------------
# 5. WEBHOOK ENDPOINT
# ------------------------------------------------------------------------
from fastapi import Request, HTTPException

@app.function(secrets=[modal.Secret.from_name("cloudinary")])
@modal.fastapi_endpoint(method="POST")
async def trigger_render(request: Request):
    payload = await request.json()
    job_id = payload.get("jobId")
    shots = payload.get("shots")          # [{ "image_url": str, "text": str }, ...]
    audio_url = payload.get("audio_url")  # ONE continuous narration track for the whole video
    music_url = payload.get("music_url")
    callback_url = payload.get("callback_url")

    if not all([job_id, shots, audio_url, music_url, callback_url]):
        raise HTTPException(status_code=400, detail="Missing required fields")

    try:
        render_video.spawn(job_id, shots, audio_url, music_url, callback_url)
    except Exception as e:
        print(f"[trigger_render] render_video.spawn() failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    return {"status": "queued", "jobId": job_id}  