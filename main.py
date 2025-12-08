from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, HttpUrl
import httpx
from bs4 import BeautifulSoup
from typing import Optional, List, Dict
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
        "endpoints": ["/extract", "/chat", "/docs", "/ui"]
    }

@app.get("/ui")
async def read_ui():
    return FileResponse('chat_ui/index.html')

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
    return {"id": share_id}

@app.get("/share/{share_id}")
async def get_shared_chat(share_id: str):
    if share_id not in SHARED_CHATS:
        raise HTTPException(status_code=404, detail="Shared chat not found")
    return {"messages": SHARED_CHATS[share_id]}

# ==============================
# 4) Chat API (OpenRouter)
# ==============================

class ChatRequest(BaseModel):
    message: str
    model: Optional[str] = "google/gemini-2.5-flash-image-preview"
    history: Optional[List[Dict[str, str]]] = None

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

    async def stream_generator():
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                async with client.stream(
                    "POST",
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://og-extractor-zxkk.onrender.com",
                        "X-Title": "FastAPI Chat"
                    },
                    json={
                        "model": request.model,
                        "messages": messages,
                        "stream": True
                    }
                ) as response:
                    if response.status_code != 200:
                        error_detail = await response.aread()
                        yield json.dumps({"error": f"Error: {response.status_code} - {error_detail.decode()}"}) + "\n"
                        return

                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            data_str = line[6:]
                            if data_str.strip() == "[DONE]":
                                break
                            try:
                                data = json.loads(data_str)
                                if "choices" in data and len(data["choices"]) > 0:
                                    delta = data["choices"][0].get("delta", {})
                                    content = delta.get("content", "")
                                    if content:
                                        yield content
                            except json.JSONDecodeError:
                                continue
        except Exception as e:
            yield json.dumps({"error": str(e)}) + "\n"

    return StreamingResponse(stream_generator(), media_type="text/plain")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)