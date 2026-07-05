# Path: modal/tts.py
"""
F5-TTS voice cloning inference on Modal (A10G GPU).

One-time setup:
  modal volume create f5-tts-voices
  modal volume put f5-tts-voices public/voice-profile.mp3 /voice-profile.mp3
  modal secret create f5-tts-secrets F5_TTS_API_KEY=your-strong-secret-here

Deploy:
  modal deploy modal/tts.py

Smoke test (copy the endpoint URL printed by modal deploy):
  curl -X POST <endpoint_url> \
       -H "Authorization: Bearer <F5_TTS_API_KEY>" \
       -H "Content-Type: application/json" \
       -d '{"text": "In the summer of 2009, one decision changed everything."}' \
       --output test_output.wav && afplay test_output.wav
"""

import io
import os
import re
import modal

# fastapi is installed in the Modal image AND must be available for the
# module-level import below (which is needed so Header() works as a default
# parameter value in the class method signature).
from fastapi import Header, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel

# ── Volume holding the voice profile ─────────────────────────────────────────
voice_volume = modal.Volume.from_name("f5-tts-voices", create_if_missing=True)
VOICE_PROFILE_PATH = "/voices/voice-profile.mp3"

# Maximum characters per F5-TTS inference call.
# The model degrades in quality and slows down significantly beyond ~200 chars.
# We chunk at sentence boundaries and concatenate the resulting audio arrays.
F5_MAX_CHARS = 180

# ── Container image ───────────────────────────────────────────────────────────
# torch 2.4+ is mandatory — transformers (pulled by f5-tts) dropped 2.3.x.
image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04",
        add_python="3.11",
    )
    .apt_install("ffmpeg", "git", "curl")
    .pip_install(
        "torch==2.4.1",
        "torchaudio==2.4.1",
        "f5-tts",
        "openai-whisper",
        "soundfile",
        "numpy",
        "fastapi[standard]",
    )
)

app = modal.App("f5-tts", image=image)


# ── Request / Response schemas ────────────────────────────────────────────────
class TTSRequest(BaseModel):
    text: str


# ── Text chunking ─────────────────────────────────────────────────────────────
def chunk_text(text: str, max_chars: int = F5_MAX_CHARS) -> list[str]:
    """
    Split narration text into sentence-boundary-aligned chunks that each fit
    within max_chars. This prevents F5-TTS quality degradation on long inputs.

    Strategy:
      1. Split on sentence-ending punctuation (. ! ?), keeping delimiters.
      2. Accumulate sentences into a chunk until adding the next sentence
         would exceed max_chars.
      3. If a single sentence is itself > max_chars, split on commas.
      4. If still > max_chars, hard-split at the character boundary.
    """
    # Sentence split — keep the delimiter attached to the preceding text
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())

    chunks: list[str] = []
    current = ""

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue

        # Sentence fits in the current chunk
        candidate = (current + " " + sentence).strip()
        if len(candidate) <= max_chars:
            current = candidate
            continue

        # Flush current chunk before starting a new one
        if current:
            chunks.append(current)
            current = ""

        # The sentence itself is too long — split on commas
        if len(sentence) > max_chars:
            parts = re.split(r'(?<=,)\s+', sentence)
            sub = ""
            for part in parts:
                part = part.strip()
                if not part:
                    continue
                candidate = (sub + " " + part).strip()
                if len(candidate) <= max_chars:
                    sub = candidate
                else:
                    if sub:
                        chunks.append(sub)
                    # Hard-split if a single comma-phrase is still too long
                    if len(part) > max_chars:
                        for i in range(0, len(part), max_chars):
                            chunks.append(part[i:i + max_chars])
                    else:
                        sub = part
            if sub:
                chunks.append(sub)
        else:
            current = sentence

    if current:
        chunks.append(current)

    return [c for c in chunks if c.strip()]


# ── Model class ───────────────────────────────────────────────────────────────
@app.cls(
    gpu="A10G",
    timeout=600,  # 10 min — long narrations need time for chunked synthesis
    volumes={"/voices": voice_volume},
    secrets=[modal.Secret.from_name("f5-tts-secrets")],
)
@modal.concurrent(max_inputs=5)
class F5TTSModel:
    @modal.enter()
    def load(self):
        """
        Runs once per container lifecycle.
        Loads F5-TTS and prepares the voice profile:
          1. Trims it to 12 seconds (F5-TTS degrades badly on >15s refs —
             the original 30+ second marketing demo caused 10x compressed audio).
          2. Converts to 24kHz mono WAV to match F5-TTS native sample rate.
          3. Auto-transcribes with Whisper so ref_text is ready on the hot path.
        """
        import subprocess
        import whisper
        from f5_tts.api import F5TTS

        if not os.path.exists(VOICE_PROFILE_PATH):
            raise RuntimeError(
                f"Voice profile not found at {VOICE_PROFILE_PATH}.\n"
                "Run:\n"
                "  modal volume create f5-tts-voices\n"
                "  modal volume put f5-tts-voices public/voice-profile.mp3 /voice-profile.mp3"
            )

        # Trim to 12 seconds and normalise to 24kHz mono WAV.
        # F5-TTS recommendation: 5–15 seconds of clean speech.
        # The original voice-profile.mp3 was a 30+ second marketing demo which
        # caused F5-TTS to calibrate speaking rate at ~10x normal speed.
        self.trimmed_ref_path = "/tmp/voice-profile-12s.wav"
        trim_result = subprocess.run([
            "ffmpeg", "-y", "-i", VOICE_PROFILE_PATH,
            "-t", "12",          # first 12 seconds
            "-ar", "24000",      # 24kHz — F5-TTS native sample rate
            "-ac", "1",          # mono
            "-af", "loudnorm",   # normalize amplitude so ref isn't too quiet/loud
            self.trimmed_ref_path,
        ], capture_output=True)
        if trim_result.returncode != 0:
            print(f"[F5-TTS] WARN: ffmpeg trim failed, using original: {trim_result.stderr.decode()[:200]}")
            self.trimmed_ref_path = VOICE_PROFILE_PATH
        else:
            print(f"[F5-TTS] Voice profile trimmed to 12s at 24kHz mono → {self.trimmed_ref_path}")

        print("[F5-TTS] Loading model...")
        self.tts = F5TTS(device="cuda")

        print(f"[F5-TTS] Transcribing trimmed voice profile...")
        whisper_model = whisper.load_model("base")
        result = whisper_model.transcribe(self.trimmed_ref_path, language="en")
        self.ref_text: str = result["text"].strip()
        print(f"[F5-TTS] ref_text: {self.ref_text!r}")

    def _infer_chunk(self, text: str):
        """Run a single F5-TTS inference call. Returns (audio_np_1d, sample_rate)."""
        import numpy as np

        # remove_silence=False: let render.py's ffmpeg silenceremove handle
        # cleanup. F5-TTS's built-in trimmer was over-aggressive on voice-cloned
        # audio and stripped most of the output after the speed bug was present.
        audio_array, sample_rate, _ = self.tts.infer(
            ref_file=self.trimmed_ref_path,
            ref_text=self.ref_text,
            gen_text=text,
            remove_silence=False,
        )
        audio_np = np.array(audio_array, dtype=np.float32).flatten()  # guarantee 1-D
        duration = len(audio_np) / sample_rate
        print(f"[F5-TTS] chunk {len(text)}c → {duration:.2f}s ({len(audio_np)} samples @ {sample_rate}Hz)")
        return audio_np, sample_rate

    @modal.fastapi_endpoint(method="POST")
    async def generate_speech(
        self,
        payload: TTSRequest,
        # Header() is the ONLY correct way to read an HTTP header in a
        # @modal.fastapi_endpoint class method. A bare `str = ""` would be
        # treated as a query parameter by FastAPI → causes 422.
        authorization: str = Header(default=""),
    ):
        """
        POST /generate-speech
        Headers:  Authorization: Bearer <F5_TTS_API_KEY>
        Body:     {"text": "full narration text"}
        Returns:  audio/wav binary
        """
        import numpy as np
        import soundfile as sf

        # ── Auth ──────────────────────────────────────────────────────────────
        expected_key = os.environ.get("F5_TTS_API_KEY", "")
        if expected_key:
            token = authorization.removeprefix("Bearer ").strip()
            if token != expected_key:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or missing bearer token",
                    headers={"WWW-Authenticate": "Bearer"},
                )

        # ── Validate ──────────────────────────────────────────────────────────
        text = payload.text.strip()
        if not text:
            raise HTTPException(status_code=400, detail="'text' field is required")
        if len(text) > 10_000:
            raise HTTPException(status_code=400, detail="'text' exceeds 10,000 character limit")

        # ── Chunk + synthesize ────────────────────────────────────────────────
        # Split into sentence-aligned chunks to keep each F5-TTS call under
        # F5_MAX_CHARS. Quality degrades sharply beyond that threshold.
        chunks = chunk_text(text)
        print(f"[F5-TTS] Synthesizing {len(text)} chars in {len(chunks)} chunk(s)...")

        audio_parts: list = []
        sample_rate: int = 24_000  # F5-TTS default; will be set from first chunk

        silence_frames = int(sample_rate * 0.08)  # 80 ms natural inter-sentence pause

        for i, chunk in enumerate(chunks):
            print(f"[F5-TTS] Chunk {i + 1}/{len(chunks)}: {chunk!r}")
            audio_np, sr = self._infer_chunk(chunk)
            sample_rate = sr
            audio_parts.append(audio_np)
            if i < len(chunks) - 1:
                # Add a brief silence between sentences for natural pacing
                audio_parts.append(np.zeros(silence_frames, dtype=np.float32))

        combined = np.concatenate(audio_parts, axis=0) if audio_parts else np.zeros(1, dtype=np.float32)

        # ── Encode WAV ────────────────────────────────────────────────────────
        buf = io.BytesIO()
        sf.write(buf, combined, sample_rate, format="WAV")
        buf.seek(0)
        wav_bytes = buf.read()

        print(f"[F5-TTS] Done — {len(chunks)} chunks, {len(wav_bytes):,} bytes, sr={sample_rate}")

        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={"X-Sample-Rate": str(sample_rate)},
        )


# ── Local entrypoint (smoke-test instructions) ────────────────────────────────
@app.local_entrypoint()
def main():
    print("Deploy:  modal deploy modal/tts.py")
    print("Test:")
    print('  F5_TTS_URL=<your_url>')
    print('  F5_TTS_API_KEY=<your_key>')
    print('  curl -X POST "$F5_TTS_URL" \\')
    print('       -H "Authorization: Bearer $F5_TTS_API_KEY" \\')
    print('       -H "Content-Type: application/json" \\')
    print("       -d '{\"text\": \"In the summer of 2009, one decision changed everything.\"}' \\")
    print('       --output test_output.wav && afplay test_output.wav')
