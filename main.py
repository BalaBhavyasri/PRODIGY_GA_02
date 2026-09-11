import os
import uuid
import time
import requests
import asyncio
import httpx
import urllib.parse
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Header, Body, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
import io
from dotenv import load_dotenv
# Load server environment variables
load_dotenv()
app = FastAPI(title="Image Generation Studio API", description="Backend for premium Image Generation Studio supporting Pollinations and DALL-E mini")
# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Directory configurations
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
OUTPUT_DIR = STATIC_DIR / "outputs"
# Ensure directories exist
STATIC_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)
# Pydantic Schemas
class PollinationsRequest(BaseModel):
    prompt: str
    negative_prompt: Optional[str] = ""
    model: str = "flux"
    width: int = 512
    height: int = 512
    seed: Optional[int] = None
class DalleMiniRequest(BaseModel):
    prompt: str
    negative_prompt: Optional[str] = ""
# Helpers
def generate_random_seed() -> int:
    return int(time.time() * 1000) % 1000000
async def download_image_async(client: httpx.AsyncClient, url: str, file_path: Path) -> bool:
    try:
        response = await client.get(url, timeout=40.0)
        if response.status_code == 200:
            # Verify it's an image
            img = Image.open(io.BytesIO(response.content))
            img.save(file_path, "PNG")
            return True
    except Exception as e:
        print(f"Async download error: {e}")
    return False
# Endpoints
# 1. Pollinations.ai Image Generation (No API Key Required)
@app.post("/api/generate/pollinations")
async def generate_pollinations(request: PollinationsRequest):
    if not request.prompt:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")
        
    seed = request.seed if request.seed is not None else generate_random_seed()
    
    # URL encode prompt
    encoded_prompt = urllib.parse.quote(request.prompt)
    
    # Construct Pollinations.ai URL
    # Format: https://image.pollinations.ai/prompt/{prompt}?width={width}&height={height}&seed={seed}&model={model}&nologo=true
    url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width={request.width}&height={request.height}&seed={seed}&model={request.model}&nologo=true"
    
    if request.negative_prompt:
        encoded_neg = urllib.parse.quote(request.negative_prompt)
        url += f"&negative={encoded_neg}"
        
    filename = f"poll_gen_{seed}_{uuid.uuid4().hex[:8]}.png"
    file_path = OUTPUT_DIR / filename
    
    # Download image bytes
    async with httpx.AsyncClient() as client:
        success = await download_image_async(client, url, file_path)
        
    if not success:
        # Fallback to direct client-side serving if download failed
        return {
            "status": "success",
            "image_url": url, # direct external URL
            "seed": seed,
            "model": request.model,
            "prompt": request.prompt,
            "width": request.width,
            "height": request.height
        }
        
    return {
        "status": "success",
        "image_url": f"/outputs/{filename}",
        "seed": seed,
        "model": request.model,
        "prompt": request.prompt,
        "width": request.width,
        "height": request.height
    }
# 2. DALL-E mini / Craiyon (3x3 Grid simulation via parallel Pollinations requests)
@app.post("/api/generate/dalle-mini")
async def generate_dalle_mini(request: DalleMiniRequest):
    if not request.prompt:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")
        
    base_seed = generate_random_seed()
    encoded_prompt = urllib.parse.quote(request.prompt)
    
    tasks = []
    filenames = []
    urls = []
    
    async with httpx.AsyncClient() as client:
        for i in range(9):
            seed = base_seed + i
            # Use turbo model for faster grid generation
            url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=256&height=256&seed={seed}&model=turbo&nologo=true"
            if request.negative_prompt:
                encoded_neg = urllib.parse.quote(request.negative_prompt)
                url += f"&negative={encoded_neg}"
                
            filename = f"dalle_gen_{seed}_{uuid.uuid4().hex[:4]}.png"
            file_path = OUTPUT_DIR / filename
            
            filenames.append(filename)
            urls.append(url)
            tasks.append(download_image_async(client, url, file_path))
            
        # Execute all 9 downloads concurrently
        results = await asyncio.gather(*tasks)
        
    # Build list of output URLs (use local path if successfully downloaded, otherwise fallback to external URL)
    output_urls = []
    for idx, downloaded in enumerate(results):
        if downloaded:
            output_urls.append(f"/outputs/{filenames[idx]}")
        else:
            output_urls.append(urls[idx])
            
    return {
        "status": "success",
        "images": output_urls,
        "prompt": request.prompt,
        "seed": base_seed
    }
# 3. Image-to-Image Generation (Supports Local Blending simulation if no HF token, or HF API)
@app.post("/api/generate/img2img")
async def generate_img2img(
    prompt: str = Form(...),
    strength: float = Form(0.5),
    model: str = Form("runwayml/stable-diffusion-v1-5"),
    image: UploadFile = File(...)
):
    hf_token = os.getenv("HF_TOKEN")
    image_data = await image.read()
    
    try:
        # Open source image
        src_image = Image.open(io.BytesIO(image_data))
        # Ensure RGB
        if src_image.mode != "RGB":
            src_image = src_image.convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid source image format: {e}")
    # Case A: Hugging Face API key is configured -> Call HF Stable Diffusion Image-to-Image
    if hf_token:
        # Prepare Hugging Face API call
        # Some Hugging Face models expect image + prompt in different formats.
        # The standard Hugging Face pipeline for img2img expects:
        # - The input image bytes sent as body, parameters sent in headers
        # OR a multipart/form-data upload.
        # Let's try calling runwayml/stable-diffusion-v1-5 img2img
        api_url = f"https://api-inference.huggingface.co/models/{model}"
        headers = {
            "Authorization": f"Bearer {hf_token}",
        }
        
        # Hugging Face serverless API for img2img expects a base64 encoded image or multipart.
        # Often it requires binary image in payload, and parameters in headers or custom fields.
        # A highly reliable format is posting binary image directly, but passing prompt parameters.
        # Since serverless API handles binary direct, we can also use a fallback simulation.
        # Let's attempt the call:
        try:
            # Save temporary source image as PNG bytes
            temp_buffer = io.BytesIO()
            src_image.save(temp_buffer, format="PNG")
            temp_bytes = temp_buffer.getvalue()
            
            # Simple binary post
            response = requests.post(
                api_url,
                headers=headers,
                data=temp_bytes,
                params={"prompt": prompt, "strength": strength},
                timeout=45
            )
            
            if response.status_code == 200 and "image" in response.headers.get("content-type", ""):
                gen_image = Image.open(io.BytesIO(response.content))
                filename = f"img2img_{int(time.time())}_{uuid.uuid4().hex[:6]}.png"
                file_path = OUTPUT_DIR / filename
                gen_image.save(file_path, "PNG")
                return {
                    "status": "success",
                    "image_url": f"/outputs/{filename}",
                    "method": "huggingface"
                }
        except Exception as e:
            print(f"HF img2img API failed: {e}. Falling back to simulation mode.")
    # Case B: No Hugging Face Token OR HF call failed -> Local Blending Simulation Mode
    # 1. Generate a stylized target image using Pollinations based on the prompt
    encoded_prompt = urllib.parse.quote(prompt)
    target_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width={src_image.width}&height={src_image.height}&nologo=true&model=flux"
    
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(target_url, timeout=30)
            if res.status_code == 200:
                target_image = Image.open(io.BytesIO(res.content))
                
                # Blend the source image and target image based on similarity strength
                # strength = 0.0 -> identical to source image
                # strength = 1.0 -> identical to generated target image
                # PIL.Image.blend: out = image1 * (1.0 - alpha) + image2 * alpha
                # So image1 = src_image, image2 = target_image, alpha = strength
                
                # Resize target if mismatch
                if target_image.size != src_image.size:
                    target_image = target_image.resize(src_image.size, Image.Resampling.LANCZOS)
                    
                blended_image = Image.blend(src_image, target_image, alpha=strength)
                
                # Save blended output
                filename = f"img2img_sim_{int(time.time())}_{uuid.uuid4().hex[:6]}.png"
                file_path = OUTPUT_DIR / filename
                blended_image.save(file_path, "PNG")
                
                return {
                    "status": "success",
                    "image_url": f"/outputs/{filename}",
                    "method": "simulation"
                }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image-to-Image failed: {str(e)}")
        
    raise HTTPException(status_code=500, detail="Image-to-Image generation failed. Verify server internet access.")
# Legacy endpoint fallback redirecting to Pollinations
@app.post("/api/generate")
async def legacy_generate(
    request: dict = Body(...),
    x_hf_token: Optional[str] = Header(None, alias="X-HF-Token")
):
    # If a token is provided or set, use the old HF endpoint code path, otherwise direct to Pollinations!
    hf_token = x_hf_token or os.getenv("HF_TOKEN")
    prompt = request.get("prompt", "")
    
    if not hf_token:
        # Fallback to Pollinations
        encoded = urllib.parse.quote(prompt)
        seed = request.get("seed") or generate_random_seed()
        url = f"https://image.pollinations.ai/prompt/{encoded}?seed={seed}&nologo=true"
        filename = f"gen_fallback_{seed}.png"
        file_path = OUTPUT_DIR / filename
        
        async with httpx.AsyncClient() as client:
            success = await download_image_async(client, url, file_path)
            
        if success:
            return {
                "status": "success",
                "image_url": f"/outputs/{filename}",
                "seed": seed,
                "model": "pollinations/flux",
                "prompt": prompt
            }
        else:
            return {
                "status": "success",
                "image_url": url,
                "seed": seed,
                "model": "pollinations/flux",
                "prompt": prompt
            }
            
    # Old HF code path
    model = request.get("model", "stabilityai/stable-diffusion-xl-base-1.0")
    headers = {"Authorization": f"Bearer {hf_token}", "Content-Type": "application/json"}
    api_url = f"https://api-inference.huggingface.co/models/{model}"
    
    payload = {"inputs": prompt, "parameters": {}}
    if request.get("negative_prompt"):
        payload["parameters"]["negative_prompt"] = request.get("negative_prompt")
    if request.get("guidance_scale"):
        payload["parameters"]["guidance_scale"] = float(request.get("guidance_scale"))
    if request.get("steps"):
        payload["parameters"]["num_inference_steps"] = int(request.get("steps"))
    
    seed = request.get("seed") or generate_random_seed()
    payload["parameters"]["seed"] = seed
    response = requests.post(api_url, headers=headers, json=payload, timeout=90)
    if response.status_code != 200:
        # Try redirecting to Pollinations if Hugging Face fails
        encoded = urllib.parse.quote(prompt)
        return {
            "status": "success",
            "image_url": f"https://image.pollinations.ai/prompt/{encoded}?seed={seed}&nologo=true",
            "seed": seed,
            "model": "pollinations/flux",
            "prompt": prompt
        }
        
    image = Image.open(io.BytesIO(response.content))
    filename = f"gen_{seed}.png"
    image.save(OUTPUT_DIR / filename, "PNG")
    return {
        "status": "success",
        "image_url": f"/outputs/{filename}",
        "seed": seed,
        "model": model,
        "prompt": prompt
    }
# Mount static folder
app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
if __name__ == "__main__":
    import uvicorn
    # Create empty .env file if it doesn't exist
    dotenv_path = BASE_DIR / ".env"
    if not dotenv_path.exists():
        dotenv_path.write_text("# Hugging Face API Token\n# HF_TOKEN=your_token_here\n")
    
    print(f"Starting server on http://127.0.0.1:8000 ...")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)