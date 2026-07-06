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
        "fastapi",
        "fonttools",
    )
    .run_commands(
        "mkdir -p /usr/share/fonts/truetype/montserrat",
        "curl -L -o /usr/share/fonts/truetype/montserrat/Montserrat-Bold.ttf 'https://github.com/JulietaUla/Montserrat/raw/master/fonts/ttf/Montserrat-Bold.ttf'",
    )
    .run_commands(
        # Per-niche display fonts (see CAPTION_STYLES in lib/constants.ts).
        # Google Fonts ships all four of these as variable fonts only — there
        # is no flat "-Bold.ttf" to curl the way Montserrat above works — so
        # each is downloaded as its variable source and then cut down to one
        # static instance with fonttools. Verified by hand that this produces
        # correctly name-tabled, correctly weighted static faces that
        # fontconfig indexes cleanly:
        #   SpaceGrotesk-Bold.ttf              -> family "Space Grotesk", style "Bold"
        #   Cinzel-Black.ttf                   -> family "Cinzel Black"      (weight folds into the name)
        #   BigShouldersStencilDisplay-Bold.ttf-> family "Big Shoulders Stencil Display", style "Bold"
        #   Fraunces-Black.ttf                 -> family "Fraunces 72pt Black" (weight+opsz fold into the name)
        # The exact family strings above MUST match CAPTION_STYLES.fontFamily
        # in lib/constants.ts, or libass will silently fail to match and fall
        # back to whatever fontconfig's default happens to be.
        "mkdir -p /tmp/fontbuild /usr/share/fonts/truetype/custom",
        "curl -L -o /tmp/fontbuild/SpaceGrotesk.ttf 'https://raw.githubusercontent.com/google/fonts/main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf'",
        "curl -L -o /tmp/fontbuild/Cinzel.ttf 'https://raw.githubusercontent.com/google/fonts/main/ofl/cinzel/Cinzel%5Bwght%5D.ttf'",
        "curl -L -o /tmp/fontbuild/BigShouldersStencilDisplay.ttf 'https://raw.githubusercontent.com/google/fonts/main/ofl/bigshouldersstencildisplay/BigShouldersStencilDisplay%5Bwght%5D.ttf'",
        "curl -L -o /tmp/fontbuild/Fraunces.ttf 'https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/Fraunces%5BSOFT,WONK,opsz,wght%5D.ttf'",
        "fonttools varLib.instancer /tmp/fontbuild/SpaceGrotesk.ttf wght=700 --update-name-table -o /usr/share/fonts/truetype/custom/SpaceGrotesk-Bold.ttf",
        "fonttools varLib.instancer /tmp/fontbuild/Cinzel.ttf wght=900 --update-name-table -o /usr/share/fonts/truetype/custom/Cinzel-Black.ttf",
        "fonttools varLib.instancer /tmp/fontbuild/BigShouldersStencilDisplay.ttf wght=700 --update-name-table -o /usr/share/fonts/truetype/custom/BigShouldersStencilDisplay-Bold.ttf",
        "fonttools varLib.instancer /tmp/fontbuild/Fraunces.ttf wght=900 opsz=72 SOFT=0 WONK=1 --update-name-table -o /usr/share/fonts/truetype/custom/Fraunces-Black.ttf",
        "fc-cache -f -v",
    )
)

app = modal.App("slideshow-render", image=image)

FPS = 30

# Used when a job doesn't pass caption_style at all (older enqueued jobs,
# manual test calls, etc.) — the same look the pipeline always had.
DEFAULT_CAPTION_STYLE = {
    "fontFamily": "Montserrat",
    "textColor": "#FFFFFF",
    "strokeColor": "#000000",
}


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


def hex_to_ass_color(hex_color: str, alpha: str = "00") -> str:
    """Convert a '#RRGGBB' web color to ASS/SSA's '&HAABBGGRR' format.
    ASS stores color channels in reverse (BGR) order, and alpha is inverted —
    00 is fully opaque, FF is fully transparent."""
    h = (hex_color or "#FFFFFF").lstrip("#")
    if len(h) != 6:
        h = "FFFFFF"
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H{alpha}{b}{g}{r}".upper()


def get_audio_duration(path: str) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        capture_output=True, text=True, check=True, timeout=30,
    )
    return float(result.stdout.strip())


def align_narration(audio_path: str, full_text: str) -> list:
    import whisper_timestamped as whisper
    model = whisper.load_model("small")
    results = whisper.transcribe(model, audio_path, language="en", initial_prompt=full_text)

    words = []
    for segment in results.get("segments", []):
        for w in segment.get("words", []):
            words.append(w)
    return words


def slice_words_by_shot(words: list, shots: list, total_duration: float) -> list:
    boundaries = []
    target_words = []
    for s_idx, shot in enumerate(shots):
        # Pad punctuation so str.split() produces distinct tokens matching Whisper output
        text_to_split = shot["spoken_text"].replace("—", "— ").replace("–", "– ").replace("-", "- ").replace("/", "/ ")
        for w_text in text_to_split.split():
            target_words.append({
                "text": w_text,
                "clean": re.sub(r'[^a-z0-9]', '', w_text.lower()),
                "shot_idx": s_idx
            })

    def last_matched_end(before_idx):
        for j in range(before_idx - 1, -1, -1):
            if "end" in target_words[j]:
                return target_words[j]["end"]
        return 0.0

    RESYNC_WINDOW = 24
    MAX_GAP_PER_WORD = 0.6
    MIN_GAP = -0.05

    def is_match(target, candidate):
        if not target or not candidate:
            return False
        if target == candidate:
            return True
        if len(target) >= 4 and len(candidate) >= 4:
            return target in candidate or candidate in target
        # NUMBER OVERRIDE: Match "$10B" (target "10b") to Whisper's "10"
        num_t = re.sub(r'[^0-9]', '', target)
        num_c = re.sub(r'[^0-9]', '', candidate)
        if num_t and num_c and num_t == num_c:
            return True
        return False

    w_idx = 0
    t_idx = 0
    while t_idx < len(target_words) and w_idx < len(words):
        t_clean = target_words[t_idx]["clean"]
        w_clean = re.sub(r'[^a-z0-9]', '', words[w_idx]["text"].lower())
        
        candidate = w_idx if is_match(t_clean, w_clean) else None

        if candidate is None:
            for look in range(1, RESYNC_WINDOW):
                if w_idx + look < len(words):
                    cand_clean = re.sub(r'[^a-z]', '', words[w_idx + look]["text"].lower())
                    if is_match(t_clean, cand_clean):
                        candidate = w_idx + look
                        break

        if candidate is not None:
            w = words[candidate]
            prev_end = last_matched_end(t_idx)
            n_since = max(candidate - w_idx, 0) + 1
            gap = w["start"] - prev_end
            if MIN_GAP <= gap <= MAX_GAP_PER_WORD * n_since:
                target_words[t_idx]["start"] = w["start"]
                target_words[t_idx]["end"] = w["end"]
                w_idx = candidate + 1

        t_idx += 1

    # Fill in the blanks for missed words
    for i in range(len(target_words)):
        if "start" not in target_words[i]:
            prev_t = last_matched_end(i)

            next_t = total_duration
            next_idx = len(target_words)
            for j in range(i+1, len(target_words)):
                if "start" in target_words[j]:
                    next_t = target_words[j]["start"]
                    next_idx = j
                    break

            missing_count = next_idx - i
            duration = max(0.1, next_t - prev_t)
            chunk = duration / (missing_count + 1)

            for k in range(missing_count):
                target_words[i+k]["start"] = prev_t + chunk * (k + 1) - (chunk * 0.8)
                target_words[i+k]["end"] = prev_t + chunk * (k + 1)

    for s_idx in range(len(shots)):
        shot_words = [tw for tw in target_words if tw["shot_idx"] == s_idx]
        if not shot_words:
            start_t = boundaries[-1][1] if boundaries else 0.0
            end_t = start_t + 1.0
        else:
            start_t = shot_words[0]["start"]
            end_t = shot_words[-1]["end"]

        boundaries.append([start_t, end_t, shot_words])

    for i in range(len(boundaries) - 1):
        boundaries[i][1] = boundaries[i+1][0]

    if boundaries:
        boundaries[-1][1] = max(total_duration + 10.0, boundaries[-1][0] + 1.0)

    return boundaries

def build_continuous_ass(shot_boundaries: list, shots: list, caption_style: dict) -> str:
    style = {**DEFAULT_CAPTION_STYLE, **(caption_style or {})}
    primary_colour = hex_to_ass_color(style.get("textColor"), alpha="00")
    outline_colour = hex_to_ass_color(style.get("strokeColor"), alpha="00")

    ass_content = [
        "[Script Info]",
        "ScriptType: v4.00+",
        "PlayResX: 1080",
        "PlayResY: 1920",
        "WrapStyle: 1",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Default,{style['fontFamily']},72,{primary_colour},&H000000FF,{outline_colour},&H80000000,-1,0,0,0,100,100,0,0,1,4,4,8,80,80,1080,1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
    ]

    for i, (start_time, end_time, _words_data) in enumerate(shot_boundaries):
        if i >= len(shots):
            break
        caption = shots[i].get("caption_text", "").strip()
        if not caption:
            continue

        ass_start = format_ass_time(start_time)
        ass_end = format_ass_time(end_time)
        ass_content.append(f"Dialogue: 0,{ass_start},{ass_end},Default,,0,0,0,,{caption}")

    return "\n".join(ass_content)

@app.function(cpu=8.0, timeout=600, secrets=[modal.Secret.from_name("cloudinary")])
def render_video(job_id: str, account_id: str, shots: list, audio_url: str, music_url: str, callback_url: str, visual_world: str = None, caption_style: dict = None):
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
            "-c:a", "libmp3lame", "-b:a", "128k", master_audio
        ], check=True, capture_output=True, timeout=120)

        full_text = " ".join(shot["spoken_text"].replace("—", "— ").replace("–", "– ").replace("-", "- ").replace("/", "/ ").strip() for shot in shots)
        words = align_narration(master_audio, full_text)

        if not words:
            raise Exception(f"[{job_id}] Whisper returned no words for narration — cannot align shots.")

        actual_duration = get_audio_duration(master_audio)
        coverage = words[-1]["end"] / actual_duration
        if coverage < 0.6:
            raise Exception(
                f"[{job_id}] Whisper only transcribed {words[-1]['end']:.1f}s of a "
                f"{actual_duration:.1f}s narration ({coverage:.0%} coverage) — "
                f"alignment unreliable, aborting instead of producing a truncated video."
            )

        shot_boundaries = slice_words_by_shot(words, shots, actual_duration)

        # Degenerate alignment kill-switch
        durations = [max(end - start, 0) for start, end, _ in shot_boundaries]
        total_dur = sum(durations)
        if total_dur > 0 and max(durations) / total_dur > 0.6:
            raise Exception(
                f"[{job_id}] Degenerate shot alignment: one shot consumed "
                f"{max(durations)/total_dur:.0%} of runtime — Whisper alignment "
                f"desynced. Aborting instead of rendering a broken video."
            )

        ass_path = f"{work_dir}/captions.ass"
        with open(ass_path, "w") as f:
            f.write(build_continuous_ass(shot_boundaries, shots, caption_style))

        rendered_shots = []
        for i, (shot, img_path) in enumerate(zip(shots, img_paths)):
            start_time, end_time, _ = shot_boundaries[i]
            duration = max(end_time - start_time, 0.35)
            frames = max(int(round(duration * FPS)), 1)

            # Ken Burns alternating Zoompan effect
            zoom_expr = "zoom+0.0006" if i % 2 == 0 else "zoom-0.0006"
            scale_expr = "1.0" if i % 2 == 0 else "1.12"

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
        
        # Audio Ducking (Sidechain compression)
        # Open up the base volume and relax the threshold to around -22dB
        filter_complex = "[1:a]volume=0.75[bg_vol]; [bg_vol][0:a]sidechaincompress=threshold=-22dB:ratio=4:attack=5:release=50[bg_ducked]; [0:a][bg_ducked]amix=inputs=2:duration=first:dropout_transition=2[aout]"

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
    # New, optional — see lib/constants.ts CAPTION_STYLES / getCaptionStyle().
    # Missing/older payloads fall back to DEFAULT_CAPTION_STYLE (Montserrat).
    visual_world = payload.get("visual_world")
    caption_style = payload.get("caption_style")

    if not all([job_id, account_id, shots, audio_url, music_url, callback_url]):
        raise HTTPException(status_code=400, detail="Missing required fields")

    try:
        render_video.spawn(job_id, account_id, shots, audio_url, music_url, callback_url, visual_world, caption_style)
    except Exception as e:
        print(f"[trigger_render] render_video.spawn() failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    return {"status": "queued", "jobId": job_id}