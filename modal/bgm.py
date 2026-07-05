# modal/bgm.py
"""
ACE-Step 1.5 instrumental BGM generation on Modal (A10G GPU).

One-time setup:
  modal volume create bgm-model-cache
  modal secret create acestep-secrets ACE_STEP_API_KEY=your-strong-secret-here

Deploy:
  modal deploy modal/bgm.py
"""

import os
from pathlib import Path

import modal
from fastapi import Header, HTTPException, status
from pydantic import BaseModel

checkpoints_dir = "/opt/ace-step/checkpoints"
model_cache = modal.Volume.from_name("bgm-model-cache", create_if_missing=True)

image = (
    modal.Image.from_registry(
        "nvidia/cuda:13.0.0-cudnn-devel-ubuntu22.04", add_python="3.12"
    )
    .apt_install("git", "ffmpeg")
    .run_commands(
        "git clone --branch v0.1.6 --depth 1 "
        "https://github.com/ace-step/ACE-Step-1.5.git /opt/ace-step",
    )
    .uv_pip_install(
        "/opt/ace-step",
        "hf_transfer==0.1.9",
        "torchcodec==0.10.0",
        "torch~=2.10.0",
    )
    .entrypoint([])
    .env({"ACESTEP_PROJECT_ROOT": "/opt/ace-step", "HF_HUB_ENABLE_HF_TRANSFER": "1"})
)

app = modal.App("bgm-generator", image=image)

class BGMRequest(BaseModel):
    prompt: str
    duration: float = 60.0
    format: str = "mp3"


@app.cls(
    gpu="A10G",
    timeout=300,
    volumes={checkpoints_dir: model_cache},
    secrets=[modal.Secret.from_name("acestep-secrets")],
    max_containers=1,
)
class BGMGenerator:
    @modal.enter()
    def load(self):
        """
        Loads ACE-Step 1.5 models once per container lifecycle.
        DiT: acestep-v15-turbo (8 inference steps, fast)
        LM:  acestep-5Hz-lm-1.7B
        """
        from acestep.handler import AceStepHandler
        from acestep.llm_inference import LLMHandler
        from acestep.model_downloader import ensure_lm_model, ensure_main_model

        lm_model_name = "acestep-5Hz-lm-1.7B"

        ensure_main_model(checkpoints_dir=checkpoints_dir)
        ensure_lm_model(model_name=lm_model_name, checkpoints_dir=checkpoints_dir)

        self.dit_handler = AceStepHandler()
        init_status, enable_generate = self.dit_handler.initialize_service(
            project_root="/opt/ace-step",
            config_path="acestep-v15-turbo",
            device="cuda",
        )
        if not enable_generate:
            raise RuntimeError(f"DiT model initialization failed: {init_status}")

        self.llm_handler = LLMHandler()
        lm_status, lm_success = self.llm_handler.initialize(
            checkpoint_dir=checkpoints_dir,
            lm_model_path=lm_model_name,
            backend="vllm",
            device="cuda",
        )
        if not lm_success:
            raise RuntimeError(f"LM initialization failed: {lm_status}")

        print(f"[ACE-Step] Models loaded. DiT: acestep-v15-turbo, LM: {lm_model_name}")

    def _generate(self, prompt: str, duration: float, format: str) -> bytes:
        from acestep.inference import GenerationConfig, GenerationParams, generate_music

        params = GenerationParams(
            caption=prompt,
            lyrics="[Instrumental]",
            duration=duration,
            thinking=True,
        )
        config = GenerationConfig(
            audio_format=format,
            batch_size=1,
            seeds=None,
            use_random_seed=True,
        )

        result = generate_music(
            self.dit_handler,
            self.llm_handler,
            params,
            config,
            save_dir="/dev/shm",
        )

        if not result.success:
            raise RuntimeError(f"Music generation failed: {result.error}")

        audio_path = result.audios[0]["path"]
        return Path(audio_path).read_bytes()

    @modal.fastapi_endpoint(method="GET")
    async def warmup(self):
        """
        Dummy endpoint to force Modal to spin up the container and run @modal.enter().
        Returns immediately once models are loaded in VRAM.
        """
        return {"status": "warm", "gpu": "A10G"}

    @modal.fastapi_endpoint(method="POST")
    async def generate_bgm(
        self,
        payload: BGMRequest,
        authorization: str = Header(default=""),
    ):
        expected_key = os.environ.get("ACE_STEP_API_KEY", "")
        if expected_key:
            token = authorization.removeprefix("Bearer ").strip()
            if token != expected_key:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or missing bearer token",
                    headers={"WWW-Authenticate": "Bearer"},
                )

        prompt = payload.prompt.strip()
        if not prompt:
            raise HTTPException(status_code=400, detail="'prompt' field is required")
        if len(prompt) > 1000:
            raise HTTPException(status_code=400, detail="'prompt' exceeds 1000 character limit")

        duration = max(10.0, min(payload.duration, 300.0))
        format = payload.format if payload.format in ("mp3", "wav") else "mp3"

        print(f"[ACE-Step] Generating {duration}s of BGM: {prompt[:80]}...")
        audio_bytes = self._generate(prompt, duration, format)

        content_type = "audio/mpeg" if format == "mp3" else "audio/wav"
        print(f"[ACE-Step] Done — {len(audio_bytes):,} bytes")

        from fastapi.responses import Response
        return Response(content=audio_bytes, media_type=content_type)
