import os
import modal

app = modal.App("llm-server")

MINUTES = 60

vllm_image = (
    modal.Image.from_registry("nvidia/cuda:12.1.1-devel-ubuntu22.04", add_python="3.10")
    .pip_install(
        "vllm",
    )
)

MODEL_NAME = "Qwen/Qwen2.5-7B-Instruct"
hf_volume = modal.Volume.from_name("huggingface-cache", create_if_missing=True)

@app.function(
    image=vllm_image,
    gpu="A10G",
    scaledown_window=5 * MINUTES, # Fixed deprecation warning from container_idle_timeout
    timeout=10 * MINUTES,
    volumes={"/root/.cache/huggingface": hf_volume},
)
@modal.asgi_app()
def fastapi_app():
    import fastapi
    from fastapi import Request
    from fastapi.responses import JSONResponse
    from vllm.engine.arg_utils import AsyncEngineArgs
    from vllm.engine.async_llm_engine import AsyncLLMEngine
    from vllm.sampling_params import SamplingParams
    from transformers import AutoTokenizer
    import uuid

    engine_args = AsyncEngineArgs(
        model=MODEL_NAME,
        max_model_len=8192,
        enforce_eager=False,
    )
    engine = AsyncLLMEngine.from_engine_args(engine_args)
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)

    web_app = fastapi.FastAPI(title="vLLM API")
    
    @web_app.post("/v1/chat/completions")
    async def chat_completions(request: Request):
        try:
            req = await request.json()
        except:
            return JSONResponse(status_code=400, content={"error": "Invalid JSON"})
            
        messages = req.get("messages", [])
        if not messages:
            return JSONResponse(status_code=400, content={"error": "Messages are required"})

        temperature = float(req.get("temperature", 0.7))
        max_tokens = int(req.get("max_tokens", 4096))
        
        prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        
        sampling_params = SamplingParams(
            temperature=temperature,
            max_tokens=max_tokens,
        )
        
        request_id = str(uuid.uuid4())
        results_generator = engine.generate(prompt, sampling_params, request_id)
        
        final_output = None
        async for request_output in results_generator:
            final_output = request_output
            
        if final_output:
            text = final_output.outputs[0].text
            finish_reason = final_output.outputs[0].finish_reason
            return {
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": text
                        },
                        "finish_reason": finish_reason
                    }
                ],
                "usage": {
                    "prompt_tokens": len(final_output.prompt_token_ids),
                    "completion_tokens": len(final_output.outputs[0].token_ids),
                    "total_tokens": len(final_output.prompt_token_ids) + len(final_output.outputs[0].token_ids)
                }
            }
        
        return JSONResponse(status_code=500, content={"error": "Generation failed"})

    return web_app
