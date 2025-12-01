from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, HttpUrl
import httpx
from bs4 import BeautifulSoup
from typing import Optional, List, Dict
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
security = HTTPBearer()

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
# 2) Chat API (OpenRouter)
# ==============================
from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, HttpUrl
import httpx
from bs4 import BeautifulSoup
from typing import Optional, List, Dict
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
security = HTTPBearer()

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
# 2) Chat API (OpenRouter)
# ==============================

class ChatRequest(BaseModel):
    message: str
    model: Optional[str] = "google/gemma-3-27b-it:free"
    history: Optional[List[Dict[str, str]]] = None

@app.post("/chat")
async def chat_with_ai(
    request: ChatRequest,
    creds: HTTPAuthorizationCredentials = Depends(security)
):
    # Get API key from Authorization header
    api_key = creds.credentials

    messages = request.history or []
    
    # Add System Prompt
    system_prompt = {
        "role": "system", 
        "content": "You are ABDUL, a helpful AI assistant. You must remember the context of the conversation, including the user's name and previous messages. Always answer in Thai unless asked otherwise."
    }
    
    # Ensure system prompt is first
    if not messages or messages[0].get("role") != "system":
        messages.insert(0, system_prompt)
        
    messages.append({"role": "user", "content": request.message})

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://og-extractor-zxkk.onrender.com",
                    "X-Title": "FastAPI Chat"
                },
                json={
                    "model": request.model,
                    "messages": messages
                }
            )
            response.raise_for_status()

            data = response.json()
            ai_msg = data["choices"][0]["message"]["content"]

            return {
                "success": True,
                "data": {
        "message": ai_msg,
                    "raw": data
                }
            }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)