from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, HttpUrl
import httpx
from bs4 import BeautifulSoup
from typing import Optional, List, Dict, Any
from fastapi.middleware.cors import CORSMiddleware
import json
import os
import uuid

app = FastAPI()
# auto_error=False allows the dependency to return None instead of raising 403
security = HTTPBearer(auto_error=False)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files
app.mount("/static", StaticFiles(directory="chat_ui"), name="static")

@app.get("/")
async def root():
    return {
        "message": "OG Extractor & Chat API is running",
        "endpoints": ["/extract", "/chat", "/docs", "/ui", "/image"]
    }

@app.get("/ui")
async def read_ui():
    return FileResponse('chat_ui/index.html')

@app.get("/image")
async def read_image_ui():
    return FileResponse('chat_ui/image.html')

class ExtractRequest(BaseModel):
    url: HttpUrl

@app.post("/extract")
async def extract_og(data: ExtractRequest):
    url = str(data.url)

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "*/*",
        "Referer": "https://www.google.com/"
    }

    try:
        async with httpx.AsyncClient(follow_redirects=True, verify=False) as client:
            response = await client.get(url, headers=headers, timeout=10)
            response.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"HTTP error: {str(e)}"
        )
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error fetching URL: {str(e)}"
        )

    soup = BeautifulSoup(response.text, "html.parser")

    og_tags: Dict[str, str] = {}
    for tag in soup.find_all("meta", property=True):
        prop = tag.get("property")
        if prop and prop.startswith("og:") and tag.get("content"):
            og_tags[prop] = tag["content"]

    page_title = soup.title.string.strip() if soup.title else None

    return {
        "success": True,
        "data": {
            "url": url,
            "page_title": page_title,
            "og": og_tags
        }
    }

# ==============================
# 2) Google Auth API
# ==============================
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

class GoogleAuthRequest(BaseModel):
    token: str

@app.post("/auth/google")
async def google_login(request: GoogleAuthRequest):
    try:
        # Verify the token
        id_info = id_token.verify_oauth2_token(
            request.token, 
            google_requests.Request(),
            audience="888682176364-95k6bep0ajble7a48romjeui850dptg0.apps.googleusercontent.com"
        )

        return {
            "success": True,
            "user": {
                "email": id_info['email'],
                "name": id_info.get('name'),
                "picture": id_info.get('picture')
            }
        }
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google Token")

# ==============================
# 3) Share Chat API
# ==============================

# In-memory storage for shared chats (will be lost on restart)
SHARED_CHATS: Dict[str, List[Dict[str, str]]] = {}

class ShareRequest(BaseModel):
    messages: List[Dict[str, str]]

@app.post("/share")
async def share_chat(request: ShareRequest):
    share_id = str(uuid.uuid4())
    SHARED_CHATS[share_id] = request.messages
    return {"messages": SHARED_CHATS[share_id]}

# ==============================
# 4) Translation API
# ==============================

async def _translate_logic(text: str, api_key: str) -> str:
    # List of models to try in order
    models = [
        "meta-llama/llama-3.2-3b-instruct:free",
        "google/gemini-2.0-flash-exp:free",
        "huggingfaceh4/zephyr-7b-beta:free",
        "mistralai/mistral-7b-instruct:free",
        "openchat/openchat-7b:free"
    ]

    errors = []

    async with httpx.AsyncClient(timeout=60) as client:
        for model in models:
            try:
                payload = {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": "You are a strict translation engine for image prompts.\n\nYour job:\n- Input: Thai text describing an image.\n- Output: a SHORT English prompt that can be sent directly to an image generation model.\n- Output MUST be in English ONLY. No Thai, no explanations, no extra sentences.\n- Do NOT add quotes around the text.\n- Do NOT say things like \"Here is your prompt\" or \"The translation is\".\n- Just output the prompt text itself.\n\nStyle rules:\n- Keep it concise but descriptive enough for an image (5–20 words).\n- If the Thai input is only one word (e.g., \"กระต่าย\"), output 1–3 English words (e.g., \"rabbit\", \"cute white rabbit\").\n- You may add 1–2 visual adjectives if they make sense, but NEVER change the main subject.\n\nIf you break any of these rules, the system will not work.\n\nExamples:\n\nThai: กระต่าย\nEnglish: rabbit\n\nThai: กระต่ายน่ารัก\nEnglish: cute rabbit\n\nThai: กระต่ายน่ารักบนดวงจันทร์\nEnglish: cute rabbit sitting on the moon, night sky, stars\n\nThai: ทะเลช่วงพระอาทิตย์ตก\nEnglish: sunset over the sea, warm colors, calm waves"},
                        {"role": "user", "content": text}
                    ]
                }

                response = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://og-extractor-zxkk.onrender.com",
                        "X-Title": "FastAPI Chat"
                    },
                    json=payload
                )
                
                if response.status_code == 200:
                    data = response.json()
                    if "choices" in data and len(data["choices"]) > 0:
                        return data["choices"][0]["message"]["content"].strip()
                
                # If we get here, the request failed (non-200) or empty choices
                error_msg = f"Model {model} failed: {response.status_code} - {response.text[:200]}"
                print(error_msg)
                errors.append(error_msg)
                continue # Try next model

            except Exception as e:
                error_msg = f"Model {model} error: {str(e)}"
                print(error_msg)
                errors.append(error_msg)
                continue # Try next model

    # If all models fail, return original text to prevent 500 error
    print(f"All translation models failed. Returning original text. Errors: {errors}")
    return text

class TranslationRequest(BaseModel):
    text: str

@app.post("/translate")
async def translate_text(
    request: TranslationRequest,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security)
):
    # 1. Determine API Key
    api_key = None
    
    # Check if user provided a key
    if creds and creds.credentials:
        api_key = creds.credentials
    
    # Fallback to Server Key
    if not api_key:
        api_key = os.environ.get("OPENROUTER_API_KEY")

    if not api_key:
        raise HTTPException(status_code=401, detail="API Key missing")

    try:
        english_text = await _translate_logic(request.text, api_key)
        return {"english": english_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Translation error: {str(e)}")

# ==============================
# 5) Chat API (OpenRouter)
# ==============================

class ChatRequest(BaseModel):
    message: str
    model: Optional[str] = "google/gemini-2.0-flash-exp:free"
    history: Optional[List[Dict[str, str]]] = None
    image_config: Optional[Dict[str, Any]] = None

@app.post("/chat")
async def chat_with_ai(
    request: ChatRequest,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security)
):
    # 1. Determine API Key
    api_key = None
    
    # Check if user provided a key
    if creds and creds.credentials:
        api_key = creds.credentials
    
    # Fallback to Server Key
    if not api_key:
        api_key = os.environ.get("OPENROUTER_API_KEY")
    
    if not api_key:
        raise HTTPException(
            status_code=401, 
            detail="API Key missing. Please provide one or set OPENROUTER_API_KEY on server."
        )

    # Handle /translate command
    if request.message.strip().startswith("/translate"):
        text_to_translate = request.message.strip()[10:].strip()
        if not text_to_translate:
            return {
                "success": True,
                "data": {
                    "message": "Please provide text to translate. Usage: /translate [Thai text]",
                    "images": [],
                    "model": "system"
                }
            }
        
        try:
            translated_text = await _translate_logic(text_to_translate, api_key)
            return {
                "success": True,
                "data": {
                    "message": translated_text,
                    "images": [],
                    "model": "google/gemini-2.0-flash-exp:free"
                }
            }
        except Exception as e:
            return {
                "success": False,
                "data": {
                    "message": f"Translation error: {str(e)}",
                    "images": [],
                    "model": "error"
                }
            }

    messages = request.history or []
    
    # Add System Prompt
    system_prompt = {
        "role": "system", 
        "content": "You are ABDUL, a helpful AI assistant. You must remember the context of the conversation, including the user's name and previous messages. Always answer in Thai unless asked otherwise. DO NOT transliterate Thai to English (Karaoke) or provide English translations unless explicitly asked. Just answer naturally in Thai."
    }
    
    # Ensure system prompt is first
    if not messages or messages[0].get("role") != "system":
        messages.insert(0, system_prompt)
        
    messages.append({"role": "user", "content": request.message})

    # Construct Payload for Image Generation
    payload = {
        "model": request.model,
        "messages": messages,
        "modalities": ["image", "text"],
        "image_config": request.image_config or {"aspect_ratio": "16:9"}, # Default 16:9 as requested
        "stream": False
    }

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://og-extractor-zxkk.onrender.com",
                    "X-Title": "FastAPI Chat"
                },
                json=payload
            )
            
            if response.status_code != 200:
                error_detail = response.text
                try:
                    error_json = response.json()
                    if "error" in error_json:
                        error_detail = error_json["error"]["message"]
                except:
                    pass
                raise HTTPException(status_code=response.status_code, detail=f"OpenRouter Error: {error_detail}")

            data = response.json()
            
            # Extract content and images
            ai_message = ""
            images = []
            
            if "choices" in data and len(data["choices"]) > 0:
                message_obj = data["choices"][0]["message"]
                ai_message = message_obj.get("content", "")
                
                # Extract images from specific field as requested
                # choices[0].message.images[*].image_url.url
                if "images" in message_obj:
                    for img in message_obj["images"]:
                        if "image_url" in img and "url" in img["image_url"]:
                            images.append(img["image_url"]["url"])
                    
            return {
                "success": True,
                "data": {
                    "message": ai_message,
                    "images": images,
                    "model": data.get("model")
                }
            }

    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Connection error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)