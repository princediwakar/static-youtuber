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
        "curl -L -o /usr/share/fonts/truetype/custom/Anton-Regular.ttf 'https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf'",
        "curl -L -o /usr/share/fonts/truetype/custom/Inter-Bold.ttf 'https://raw.githubusercontent.com/google/fonts/main/ofl/inter/static/Inter-Bold.ttf'",
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
    "textColor": "#000000",
    "strokeColor": "#FFFFFF",
}


def get_render_config(content_type: str) -> dict:
    """Return per-content-type render settings.
    Shorts: portrait 1080×1920. Long-form: landscape 1920×1080."""
    if content_type == 'long':
        return {
            'play_res_x': 1920, 'play_res_y': 1080,
            'font_size': 72,
            'margin_l': 120, 'margin_r': 120, 'margin_v': 80,
            'alignment': 2,
            'scale': '1920:1080', 'size': '1920x1080',
            'cloudinary_folder': 'ai-slideshow/rendered-long',
        }
    return {
        'play_res_x': 1080, 'play_res_y': 1920,
        'font_size': 72,
        'margin_l': 120, 'margin_r': 120, 'margin_v': 1080,
        'alignment': 8,
        'scale': '1080:1920', 'size': '1080x1920',
        'cloudinary_folder': 'ai-slideshow/rendered',
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


def align_narration(audio_path: str) -> list:
    import whisper_timestamped as whisper
    model = whisper.load_model("small")
    # Do NOT pass initial_prompt — feeding the full narration text causes Whisper
    # to hallucinate temporally compressed timestamps (it "knows" what's coming
    # and rushes through alignment), which is the primary cause of degenerate
    # one-shot-consuming-80%-of-runtime failures.
    results = whisper.transcribe(model, audio_path, language="en")

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
    # 5.0s per word — relaxed from 1.0 to accommodate F5-TTS voice-cloned audio
    # which has non-standard prosody and multi-second inter-chunk silences. The tighter
    # values were rejecting valid matches and leaving large unmatched spans that
    # the interpolator then distributed catastrophically.
    MAX_GAP_PER_WORD = 5.0
    MIN_GAP = -0.05

    def is_match(target, candidate, allow_short=True):
        if not target or not candidate:
            return False
        if target == candidate:
            if not allow_short and len(target) < 4:
                return False
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
        
        MAX_GAP_ABSOLUTE = 6.0

        candidate = w_idx if is_match(t_clean, w_clean) else None

        if candidate is None:
            for look in range(1, RESYNC_WINDOW):
                if w_idx + look < len(words):
                    cand_clean = re.sub(r'[^a-z0-9]', '', words[w_idx + look]["text"].lower())
                    # require a distinctive (len>=4) word to justify jumping the
                    # cursor forward — short/common words recur too often and were
                    # locking onto the wrong occurrence far downstream
                    if is_match(t_clean, cand_clean, allow_short=False):
                        candidate = w_idx + look
                        break

        if candidate is not None:
            w = words[candidate]
            prev_end = last_matched_end(t_idx)
            n_since = max(candidate - w_idx, 0) + 1
            gap = w["start"] - prev_end
            gap_ceiling = min(MAX_GAP_PER_WORD * n_since, MAX_GAP_ABSOLUTE)
            if MIN_GAP <= gap <= gap_ceiling:
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

    # A single bad anchor can inflate one shot's duration far past what its
    # word count justifies. Unlike the global 60% kill-switch below, this
    # catches localized drift on individual shots and swaps in a proportional
    # estimate for just that shot — everything else stays untouched.
    word_counts = [max(len(shot["spoken_text"].split()), 1) for shot in shots]
    total_words = sum(word_counts)
    cum_words = 0
    for s_idx, b in enumerate(boundaries):
        expected_dur = total_duration * (word_counts[s_idx] / total_words)
        actual_dur = b[1] - b[0]
        if actual_dur > max(expected_dur * 3, expected_dur + 5.0):
            prop_start = total_duration * (cum_words / total_words)
            print(f"[align] shot {s_idx}: {actual_dur:.1f}s vs expected {expected_dur:.1f}s — using proportional estimate")
            b[0] = prop_start
            b[1] = prop_start + expected_dur
        cum_words += word_counts[s_idx]

    for i in range(len(boundaries) - 1):
        boundaries[i][1] = boundaries[i+1][0]

    if boundaries:
        # End exactly at the audio duration (no +10.0 overshoot — that was
        # inflating the last shot by 10s and causing it to breach the 60%
        # degenerate-alignment kill-switch even on healthy renders).
        boundaries[-1][1] = max(total_duration, boundaries[-1][0] + 1.0)

    return boundaries


def proportional_split(shots: list, total_duration: float) -> list:
    """Fallback: distribute total_duration proportionally by word-count per shot.
    Used when Whisper alignment is degenerate so the render still succeeds."""
    word_counts = [max(len(shot["spoken_text"].split()), 1) for shot in shots]
    total_words = sum(word_counts)
    boundaries = []
    cursor = 0.0
    for i, count in enumerate(word_counts):
        frac = count / total_words
        end = cursor + total_duration * frac
        boundaries.append([cursor, end, []])
        cursor = end
    if boundaries:
        boundaries[-1][1] = total_duration
    return boundaries

def build_continuous_ass(
    shot_boundaries: list,
    shots: list,
    caption_style: dict,
    play_res_x: int = 1080,
    play_res_y: int = 1920,
    font_size: int = 72,
    margin_v: int = 1080,
    alignment: int = 8,
) -> str:
    style = {**DEFAULT_CAPTION_STYLE, **(caption_style or {})}
    primary_colour = hex_to_ass_color(style.get("textColor", "#000000"), alpha="00")
    back_colour = hex_to_ass_color(style.get("strokeColor", "#FFFFFF"), alpha="00")

    ass_content = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {play_res_x}",
        f"PlayResY: {play_res_y}",
        "WrapStyle: 1",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        # BorderStyle 1 is Outline+DropShadow. We drop the old BorderStyle 3 (opaque box).
        f"Style: Default,{style['fontFamily']},{font_size},{primary_colour},&H000000FF,{back_colour},&H40000000,-1,0,0,0,100,100,0,0,1,12,4,{alignment},120,120,{margin_v},1",
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

@app.function(cpu=8.0, timeout=1800, secrets=[modal.Secret.from_name("cloudinary")])
def render_video(job_id: str, account_id: str, shots: list, audio_url: str, music_url: str, callback_url: str, visual_world: str = None, caption_style: dict = None, shot_audio_urls: list = None, content_type: str = 'shorts', payload_creds: dict = None):
    import cloudinary.uploader
    import requests

    cfg = get_render_config(content_type)
    work_dir = f"/tmp/{job_id}"
    os.makedirs(work_dir, exist_ok=True)
    print(f"[{job_id}] Starting render — account={account_id}, content_type={content_type}, visual_world={visual_world or 'default'}, shots={len(shots)}")

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
        bg_music_path = f"{work_dir}/bg_music.mp3"

        with ThreadPoolExecutor(max_workers=10) as executor:
            tasks = [executor.submit(download_asset, shot["image_url"], img_paths[i]) for i, shot in enumerate(shots)]
            tasks.append(executor.submit(download_asset, music_url, bg_music_path))

            if shot_audio_urls and len(shot_audio_urls) == len(shots):
                shot_audio_paths = [f"{work_dir}/shot_audio_{i}.mp3" for i in range(len(shots))]
                for i, url in enumerate(shot_audio_urls):
                    tasks.append(executor.submit(download_asset, url, shot_audio_paths[i]))
            else:
                master_audio_raw = f"{work_dir}/narration_raw.mp3"
                tasks.append(executor.submit(download_asset, audio_url, master_audio_raw))

            for task in tasks:
                task.result()

        if shot_audio_urls and len(shot_audio_urls) == len(shots):
            # ── Per-shot TTS path: exact timing by construction, no Whisper ──
            print(f"[{job_id}] Using per-shot TTS — {len(shot_audio_urls)} shot audio files")

            # Get duration of each shot's audio
            shot_durations = [get_audio_duration(p) for p in shot_audio_paths]
            for i, dur in enumerate(shot_durations):
                print(f"[{job_id}] Shot {i} audio duration: {dur:.2f}s")

            # Build shot_boundaries directly from known durations
            cursor = 0.0
            shot_boundaries = []
            for i, dur in enumerate(shot_durations):
                shot_boundaries.append([cursor, cursor + dur, []])
                cursor += dur

            # Concatenate all per-shot audios into the master narration track
            concat_list = f"{work_dir}/narration_concat.txt"
            with open(concat_list, "w") as f:
                for p in shot_audio_paths:
                    f.write(f"file '{p}'\n")

            master_audio = f"{work_dir}/narration_trimmed.mp3"
            subprocess.run([
                "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list,
                "-c:a", "libmp3lame", "-b:a", "128k", master_audio
            ], check=True, capture_output=True, timeout=120)
        else:
            # ── Legacy path: monolithic audio + Whisper alignment ──
            print(f"[{job_id}] Using legacy monolithic audio + Whisper alignment")

            master_audio_raw = f"{work_dir}/narration_raw.mp3"
            master_audio = f"{work_dir}/narration_trimmed.mp3"
            subprocess.run([
                "ffmpeg", "-y", "-i", master_audio_raw,
                "-c:a", "libmp3lame", "-b:a", "128k", master_audio
            ], check=True, capture_output=True, timeout=120)

            actual_duration = get_audio_duration(master_audio)
            words = align_narration(master_audio)

            if not words:
                print(f"[{job_id}] WARNING: Whisper returned no words — falling back to proportional split.")
                shot_boundaries = proportional_split(shots, actual_duration)
            else:
                coverage = words[-1]["end"] / actual_duration
                if coverage < 0.6:
                    print(
                        f"[{job_id}] WARNING: Whisper only transcribed {words[-1]['end']:.1f}s of a "
                        f"{actual_duration:.1f}s narration ({coverage:.0%} coverage) — "
                        f"falling back to proportional split instead of aborting."
                    )
                    shot_boundaries = proportional_split(shots, actual_duration)
                else:
                    shot_boundaries = slice_words_by_shot(words, shots, actual_duration)

                    # Degenerate alignment guard — fall back to proportional split
                    durations = [max(end - start, 0) for start, end, _ in shot_boundaries]
                    total_dur = sum(durations)
                    if total_dur > 0 and max(durations) / total_dur > 0.6:
                        worst = max(durations) / total_dur
                        print(
                            f"[{job_id}] WARNING: Degenerate shot alignment — one shot consumed "
                            f"{worst:.0%} of runtime. Falling back to word-count proportional split."
                        )
                        shot_boundaries = proportional_split(shots, actual_duration)

        ass_path = f"{work_dir}/captions.ass"
        with open(ass_path, "w") as f:
            f.write(build_continuous_ass(
                shot_boundaries, shots, caption_style,
                play_res_x=cfg['play_res_x'],
                play_res_y=cfg['play_res_y'],
                font_size=cfg['font_size'],
                margin_v=cfg['margin_v'],
                alignment=cfg.get('alignment', 8),
            ))

        rendered_shots = []
        for i, (shot, img_path) in enumerate(zip(shots, img_paths)):
            start_time, end_time, _ = shot_boundaries[i]
            duration = max(end_time - start_time, 0.35)
            frames = max(int(round(duration * FPS)), 1)

            # Ken Burns alternating Zoompan effect
            #
            # BUGFIX: the zoom expression used to be
            #   if(eq(mod(on,2),0), scale_expr, zoom_expr)
            # which re-seeds `zoom` back to the constant scale_expr on EVERY
            # even frame, not just the first one. Since zoompan's `zoom` self-
            # reference means "previous frame's output zoom", that reset wipes
            # out the accumulated increment every other frame — the net effect
            # measured in testing was zero visible motion across the whole
            # shot (verified: a 150-frame/5s render moved a reference marker
            # by 0 px). `eq(on,0)` seeds the start zoom exactly once, on the
            # first frame of the shot, then lets every subsequent frame
            # accumulate zoom_expr on top of the previous frame — restoring
            # the intended continuous 1.0<->1.12 Ken Burns ramp.
            # Loop engineering: force the last shot to always zoom OUT
            # (scale_expr=1.12, zoom_expr="zoom-0.0006") so it ends near 1.0 —
            # matching shot 0's starting zoom and making the replay cut seamless.
            # Without this, an even-indexed last shot would start at 1.0 and
            # zoom IN, creating a jarring jump back to shot 0 (also at 1.0).
            # Note: only changes behaviour when len(shots)-1 is even (i.e.,
            # 12-shot or 14-shot videos); odd-indexed last shots already zoom out.
            if i == len(shots) - 1:
                zoom_expr = "zoom-0.0006"
                scale_expr = "1.12"
            else:
                zoom_expr = "zoom+0.0006" if i % 2 == 0 else "zoom-0.0006"
                scale_expr = "1.0" if i % 2 == 0 else "1.12"

            out_shot = f"{work_dir}/shot_rendered_{i}.mp4"
            subprocess.run([
                "ffmpeg", "-y", "-loop", "1", "-i", img_path,
                "-vf", f"scale={cfg['scale']},zoompan=z='if(eq(on,0),{scale_expr},{zoom_expr})':d={frames}:s={cfg['size']}:fps={FPS}",
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
        # 1. Boost the TTS voice slightly (volume=1.5)
        # 2. Drop the base background music (volume=0.3)
        # 3. Duck the music when the voice speaks (sidechaincompress)
        # 4. Mix them (amix divides volume by 2 to prevent clipping, so we apply a 2x boost to the final mix)
        filter_complex = (
            "[0:a]volume=1.5,asplit=2[voice_main][voice_sc]; "
            "[1:a]volume=0.3[bg_vol]; "
            "[bg_vol][voice_sc]sidechaincompress=threshold=-22dB:ratio=4:attack=5:release=50[bg_ducked]; "
            "[voice_main][bg_ducked]amix=inputs=2:duration=first:dropout_transition=2:weights=2 1[mix]; "
            "[mix]volume=2.0[aout]"
        )

        subprocess.run([
            "ffmpeg", "-y", "-i", master_audio, "-stream_loop", "-1", "-i", bg_music_path, "-i", captioned_out,
            "-filter_complex", filter_complex, "-map", "2:v", "-map", "[aout]",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2", "-shortest", final_out
        ], check=True, timeout=120)

        env_suffix = account_id.upper().replace("-", "_")
        cloud_name = payload_creds.get("cloud_name") if payload_creds else os.environ.get(f"CLOUDINARY_CLOUD_NAME_{env_suffix}")
        api_key = payload_creds.get("api_key") if payload_creds else os.environ.get(f"CLOUDINARY_API_KEY_{env_suffix}")
        api_secret = payload_creds.get("api_secret") if payload_creds else os.environ.get(f"CLOUDINARY_API_SECRET_{env_suffix}")

        if not (api_key and api_secret and cloud_name):
            raise Exception(f"[{job_id}] CRITICAL: No Cloudinary credentials found for account: {account_id}")

        cloudinary.config(cloud_name=cloud_name, api_key=api_key, api_secret=api_secret, secure=True)

        upload_result = cloudinary.uploader.upload(
            final_out,
            resource_type="video",
            folder=cfg['cloudinary_folder']
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
    # Per-shot TTS — when present, bypasses Whisper alignment entirely
    shot_audio_urls = payload.get("shot_audio_urls")
    # content_type: 'shorts' (portrait 1080x1920) or 'long' (landscape 1920x1080)
    content_type = payload.get("content_type", "shorts")
    payload_creds = payload.get("cloudinary_credentials")
    sync = payload.get("sync", False)

    if not all([job_id, account_id, shots, music_url, callback_url]):
        raise HTTPException(status_code=400, detail="Missing required fields")
    if not shot_audio_urls and not audio_url:
        raise HTTPException(status_code=400, detail="Must provide either shot_audio_urls or audio_url")

    try:
        if sync:
            print(f"[trigger_render] Running synchronously for job {job_id}")
            result = render_video.remote(job_id, account_id, shots, audio_url, music_url, callback_url, visual_world, caption_style, shot_audio_urls, content_type, payload_creds)
            return {"status": "completed", "jobId": job_id, "videoUrl": result["videoUrl"]}
        else:
            render_video.spawn(job_id, account_id, shots, audio_url, music_url, callback_url, visual_world, caption_style, shot_audio_urls, content_type, payload_creds)
            return {"status": "queued", "jobId": job_id}
    except Exception as e:
        print(f"[trigger_render] render_video failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))