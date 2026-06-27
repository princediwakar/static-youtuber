"""
Modal service: Slideshow video renderer.

Mirrors lib/videoAssembler.ts — downloads Cloudinary assets, builds per-shot
MP4 clips with alternating Ken Burns zoompan, assembles with gapless concat,
mixes background music with sidechain compression, uploads final video to
Cloudinary, and returns the MP4 URL.

Deploy:
    modal deploy modal/render.py

Set Cloudinary secrets before deploying:
    modal secret create cloudinary \\
        CLOUDINARY_CLOUD_NAME=your_cloud_name \\
        CLOUDINARY_API_KEY=your_api_key \\
        CLOUDINARY_API_SECRET=your_api_secret
"""

import os
import shutil
import subprocess
import tempfile
import concurrent.futures
from pathlib import Path

import modal
import requests
import cloudinary
import cloudinary.uploader

# ─── Constants (mirrors lib/constants.ts) ─────────────────────────────────

VIDEO_WIDTH = 1080
VIDEO_HEIGHT = 1920
VIDEO_FPS = 25
FFMPEG_CRF = "23"
FFMPEG_PRESET = "medium"
FFMPEG_AUDIO_BITRATE = "128k"
TTS_SAMPLE_RATE = 24000
ZOOMPAN_ZOOM_IN_START = 1.0
ZOOMPAN_ZOOM_IN_END = 1.12
ZOOMPAN_ZOOM_OUT_START = 1.12
ZOOMPAN_ZOOM_OUT_END = 1.0
ZOOMPAN_SPEED = 0.0006
CLOUDINARY_FOLDER = "ai-slideshow"

# ─── Modal image ─────────────────────────────────────────────────────────

image = (
    modal.Image.debian_slim()
    .apt_install("ffmpeg")
    .pip_install("cloudinary", "requests", "fastapi")
)

app = modal.App("slideshow-render", image=image)


# ─── Helpers ─────────────────────────────────────────────────────────────

def download_file(url: str, dest: str) -> None:
    r = requests.get(url, timeout=120)
    r.raise_for_status()
    with open(dest, "wb") as f:
        f.write(r.content)


def run_ffmpeg(cmd: list[str]) -> None:
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print("[ffmpeg stdout]", result.stdout)
        print("[ffmpeg stderr]", result.stderr)
        raise RuntimeError(f"FFmpeg exited {result.returncode}")


# ─── Pipeline stages ─────────────────────────────────────────────────────

def build_shot_clip(
    image_path: str,
    audio_path: str,
    output_path: str,
    shot_index: int,
) -> None:
    """Still image + raw PCM audio → MP4 with Ken Burns zoompan."""
    if shot_index % 2 == 0:
        zoom_expr = f"min({ZOOMPAN_ZOOM_IN_START}+{ZOOMPAN_SPEED}*on,{ZOOMPAN_ZOOM_IN_END})"
    else:
        zoom_expr = f"max({ZOOMPAN_ZOOM_OUT_END},{ZOOMPAN_ZOOM_OUT_START}-{ZOOMPAN_SPEED}*on)"

    zoompan = (
        f"zoompan=z='{zoom_expr}':"
        "x='iw/2-(iw/zoom/2)':"
        "y='ih/2-(ih/zoom/2)':"
        "d=99999:"
        f"s={VIDEO_WIDTH}x{VIDEO_HEIGHT}:"
        f"fps={VIDEO_FPS}"
    )

    run_ffmpeg([
        "ffmpeg", "-y",
        "-loop", "1", "-i", image_path,
        "-f", "s16le", "-ar", str(TTS_SAMPLE_RATE), "-ac", "1", "-i", audio_path,
        "-filter_complex", f"[0:v]{zoompan}[v]",
        "-map", "[v]", "-map", "1:a",
        "-c:v", "libx264", "-crf", FFMPEG_CRF, "-preset", FFMPEG_PRESET,
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", FFMPEG_AUDIO_BITRATE,
        "-shortest", "-movflags", "+faststart",
        output_path,
    ])


def assemble_clips(clip_paths: list[str], output_path: str) -> None:
    """Assemble clips with concat filter (gapless audio, video re-encode)."""
    if len(clip_paths) == 1:
        shutil.copy2(clip_paths[0], output_path)
        return

    inputs: list[str] = []
    for p in clip_paths:
        inputs.extend(["-i", p])

    n = len(clip_paths)
    filter_inputs = "".join(f"[{i}:v][{i}:a]" for i in range(n))
    filter_graph = f"{filter_inputs}concat=n={n}:v=1:a=1[v][a]"

    run_ffmpeg([
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", filter_graph,
        "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-crf", FFMPEG_CRF, "-preset", FFMPEG_PRESET,
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", FFMPEG_AUDIO_BITRATE,
        "-movflags", "+faststart",
        output_path,
    ])


def mix_music(video_path: str, music_path: str, output_path: str) -> None:
    """Mix background music with sidechain compression (audio ducking)."""
    run_ffmpeg([
        "ffmpeg", "-y",
        "-i", video_path,
        "-stream_loop", "-1", "-i", music_path,
        "-filter_complex",
        "[1:a]asplit[mus1][mus2];"
        "[0:a][mus1]sidechaincompress=threshold=0.04:ratio=4:attack=5:release=50[ducked];"
        "[ducked][mus2]amix=inputs=2:duration=first:dropout_transition=2",
        "-map", "0:v", "-c:v", "copy",
        "-c:a", "aac", "-b:a", FFMPEG_AUDIO_BITRATE,
        "-shortest", "-movflags", "+faststart",
        output_path,
    ])


# Map account IDs to their Cloudinary credential suffixes.
# Each account requires three Modal secrets:
#   CLOUDINARY_CLOUD_NAME_{SUFFIX}
#   CLOUDINARY_API_KEY_{SUFFIX}
#   CLOUDINARY_API_SECRET_{SUFFIX}
ACCOUNT_CRED_SUFFIXES = {
    "tech_shots": "TECH_SHOTS",
    "finance_shots": "FINANCE_SHOTS",
    "stoic_shots": "STOIC_SHOTS",
    "survival_shots": "SURVIVAL_SHOTS",
}


def upload_video(file_path: str, job_id: str, account_id: str) -> str:
    """Upload final MP4 to Cloudinary, return secure URL.

    Selects the correct Cloudinary account credentials based on account_id.
    Credentials are stored in Modal secrets as:
        CLOUDINARY_CLOUD_NAME_{SUFFIX}
        CLOUDINARY_API_KEY_{SUFFIX}
        CLOUDINARY_API_SECRET_{SUFFIX}
    """
    suffix = ACCOUNT_CRED_SUFFIXES[account_id]

    cloudinary.config(
        cloud_name=os.environ[f"CLOUDINARY_CLOUD_NAME_{suffix}"],
        api_key=os.environ[f"CLOUDINARY_API_KEY_{suffix}"],
        api_secret=os.environ[f"CLOUDINARY_API_SECRET_{suffix}"],
    )
    result = cloudinary.uploader.upload(
        str(file_path),
        folder=f"{CLOUDINARY_FOLDER}/{job_id}",
        public_id="final",
        resource_type="video",
        tags=["ai-slideshow", "modal-render"],
        overwrite=True,
        invalidate=True,
    )
    return result["secure_url"]


# ─── Web endpoint ────────────────────────────────────────────────────────

@app.function(
    secrets=[modal.Secret.from_name("cloudinary")],
    timeout=600,
)
@modal.fastapi_endpoint(method="POST")
def render(payload: dict):
    """
    Render a slideshow video from Cloudinary-hosted assets.

    Expected payload:
        imageUrls   — list of Cloudinary image URLs
        audioUrls   — list of Cloudinary raw audio URLs (PCM, matching imageUrls length)
        musicUrl    — Cloudinary URL for background music MP3
        jobId       — unique job identifier
        accountId   — account ID for selecting the correct Cloudinary credentials
        callbackUrl — (optional) URL to POST result to after render completes
    Returns:
        { "mp4Url": "https://res.cloudinary.com/..." }
    """
    image_urls: list[str] = payload["imageUrls"]
    audio_urls: list[str] = payload["audioUrls"]
    music_url: str = payload["musicUrl"]
    job_id: str = payload["jobId"]
    account_id: str = payload["accountId"]

    n_shots = len(image_urls)
    if len(audio_urls) != n_shots:
        return {"error": f"Mismatch: {n_shots} images vs {len(audio_urls)} audio clips"}

    with tempfile.TemporaryDirectory() as work_dir:
        work = Path(work_dir)

        # ── Download all assets in parallel ─────────────────────────────
        image_paths = [work / f"shot-{i}.png" for i in range(n_shots)]
        audio_paths = [work / f"audio-{i}.pcm" for i in range(n_shots)]
        music_path = work / "music.mp3"

        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
            futures = []
            for i, url in enumerate(image_urls):
                futures.append(pool.submit(download_file, url, str(image_paths[i])))
            for i, url in enumerate(audio_urls):
                futures.append(pool.submit(download_file, url, str(audio_paths[i])))
            futures.append(pool.submit(download_file, music_url, str(music_path)))
            for f in futures:
                f.result()

        print(f"[render] Downloaded {n_shots * 2 + 1} assets for job {job_id}")

        # ── Build per-shot clips (sequential — FFmpeg is CPU-bound) ─────
        clip_paths: list[str] = []
        for i in range(n_shots):
            clip_path = work / f"clip-{i}.mp4"
            direction = "IN" if i % 2 == 0 else "OUT"
            print(f"[render] Building clip {i + 1}/{n_shots} (zoom {direction})…")
            build_shot_clip(
                str(image_paths[i]),
                str(audio_paths[i]),
                str(clip_path),
                i,
            )
            clip_paths.append(str(clip_path))

        # ── Assemble with concat filter ─────────────────────────────────
        assembled = work / "assembled.mp4"
        print(f"[render] Assembling {n_shots} clips…")
        assemble_clips(clip_paths, str(assembled))

        # ── Mix background music (sidechain compression) ────────────────
        final = work / "final.mp4"
        print("[render] Mixing background music…")
        mix_music(str(assembled), str(music_path), str(final))

        # ── Upload to Cloudinary ────────────────────────────────────────
        print("[render] Uploading final video to Cloudinary…")
        mp4_url = upload_video(str(final), job_id, account_id)

        # ── Callback to pipeline webhook ────────────────────────────────
        callback_url = payload.get("callbackUrl")
        if callback_url:
            try:
                cb_resp = requests.post(
                    callback_url,
                    json={"jobId": job_id, "mp4Url": mp4_url},
                    timeout=30,
                )
                print(f"[render] Webhook callback: {cb_resp.status_code}")
            except Exception as exc:
                print(f"[render] Webhook callback failed (non-fatal): {exc}")

        print(f"[render] Done: {mp4_url}")
        return {"mp4Url": mp4_url}
