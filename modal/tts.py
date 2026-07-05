# Path: modal/tts.py
"""
F5-TTS voice cloning inference on Modal (A10G GPU).

Voice profile flow:
  1. Upload once:  modal volume put f5-tts-voices voice-profile.mp3 /voice-profile.mp3
  2. This function mounts the volume at /voices/ and reads /voices/voice-profile.mp3.
  3. Whisper auto-transcribes the ref audio on cold start, so you never need
     to hard-code the ref_text.

Deploy:
  modal deploy modal/tts.py

Endpoint:
  POST https://<your-workspace>--f5-tts-generate-speech.modal.run
  Headers: Authorization: Bearer <F5_TTS_API_KEY>
  Body (multipart/form-data):
    text: str  — the narration text to synthesize
"""

import io
import os
import modal

# ── Volume that holds the voice profile ──────────────────────────────────────
# Create once with:  modal volume create f5-tts-voices
# Upload once with:  modal volume put f5-tts-voices /path/to/voice-profile.mp3 /voice-profile.mp3
voice_volume = modal.Volume.from_name("f5-tts-voices", create_if_missing=True)

VOICE_PROFILE_PATH = "/voices/voice-profile.mp3"

# ── Image ────────────────────────────────────────────────────────────────────
# Uses a CUDA-enabled base so torch is happy; installs f5-tts + whisper for
# automatic ref-text transcription.
image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04",
        add_python="3.11",
    )
    .apt_install("ffmpeg", "git", "curl")
    .pip_install(
        "f5-tts",
        "torch==2.3.1",
        "torchaudio==2.3.1",
        "openai-whisper",
        "fastapi[standard]",
        "soundfile",
        "numpy",
    )
)

app = modal.App("f5-tts", image=image)

# ── Cold-start: load model + transcribe ref audio once per container ──────────
@app.cls(
    gpu="A10G",
    timeout=300,
    volumes={"/voices": voice_volume},
    secrets=[modal.Secret.from_name("f5-tts-secrets")],
    allow_concurrent_inputs=5,
)
class F5TTSModel:
    @modal.enter()
    def load(self):
        """
        Runs once when the container starts.
        Loads F5-TTS and transcribes the voice profile so every inference
        call has ref_text ready without doing it on the hot path.
        """
        import whisper
        from f5_tts.api import F5TTS

        print("[F5-TTS] Loading model...")
        self.tts = F5TTS(device="cuda")

        print(f"[F5-TTS] Transcribing voice profile: {VOICE_PROFILE_PATH}")
        whisper_model = whisper.load_model("base")
        result = whisper_model.transcribe(VOICE_PROFILE_PATH, language="en")
        self.ref_text: str = result["text"].strip()
        print(f"[F5-TTS] Voice profile ref_text: {self.ref_text!r}")

        # Validate voice profile exists
        if not os.path.exists(VOICE_PROFILE_PATH):
            raise RuntimeError(
                f"Voice profile not found at {VOICE_PROFILE_PATH}. "
                "Run: modal volume put f5-tts-voices /path/to/voice-profile.mp3 /voice-profile.mp3"
            )

    @modal.fastapi_endpoint(method="POST")
    async def generate_speech(self, request: "Request") -> "Response":  # type: ignore[name-defined]
        """
        POST /generate-speech
        Headers:
          Authorization: Bearer <F5_TTS_API_KEY>
        Body (JSON):
          { "text": "The narration to synthesize." }

        Returns: audio/wav binary
        """
        from fastapi import Request, Response, HTTPException
        import soundfile as sf
        import numpy as np

        # ── Auth ──────────────────────────────────────────────────────────────
        api_key = os.environ.get("F5_TTS_API_KEY", "")
        auth_header = request.headers.get("Authorization", "")
        if api_key and auth_header != f"Bearer {api_key}":
            raise HTTPException(status_code=401, detail="Unauthorized")

        # ── Parse body ────────────────────────────────────────────────────────
        body = await request.json()
        text: str = body.get("text", "").strip()

        if not text:
            raise HTTPException(status_code=400, detail="'text' field is required")

        if len(text) > 10_000:
            raise HTTPException(status_code=400, detail="'text' exceeds 10,000 character limit")

        print(f"[F5-TTS] Synthesizing {len(text)} chars...")

        # ── Inference ─────────────────────────────────────────────────────────
        # F5TTS.infer() returns (audio_np, sample_rate, _spectrogram)
        # We write to a BytesIO WAV buffer and return it.
        audio_array, sample_rate, _ = self.tts.infer(
            ref_file=VOICE_PROFILE_PATH,
            ref_text=self.ref_text,
            gen_text=text,
            # Remove silence from the generated output
            remove_silence=True,
        )

        # Ensure audio is float32 in [-1, 1]
        audio_array = np.array(audio_array, dtype=np.float32)

        buf = io.BytesIO()
        sf.write(buf, audio_array, sample_rate, format="WAV")
        buf.seek(0)

        print(f"[F5-TTS] Done. Output sample_rate={sample_rate}")

        return Response(
            content=buf.read(),
            media_type="audio/wav",
            headers={"X-Sample-Rate": str(sample_rate)},
        )


# ── Local test entrypoint ─────────────────────────────────────────────────────
# Run with: modal run modal/tts.py
@app.local_entrypoint()
def main():
    """Smoke test — synthesizes a short phrase and writes test_output.wav."""
    import requests

    print("Smoke testing F5-TTS endpoint...")
    # This calls the class method directly in local test mode
    model = F5TTSModel()
    # For local entrypoint we call the underlying method:
    print("Note: For a full smoke test, deploy first and call the HTTP endpoint.")
    print("  modal deploy modal/tts.py")
    print("  curl -X POST <endpoint-url> -H 'Authorization: Bearer <key>' \\")
    print("       -H 'Content-Type: application/json' \\")
    print("       -d '{\"text\": \"Hello, this is a voice cloning test.\"}' \\")
    print("       --output test_output.wav")
