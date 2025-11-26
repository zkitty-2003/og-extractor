from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, HttpUrl
import httpx
from bs4 import BeautifulSoup
from typing import Optional, List, Dict

app = FastAPI()
security = HTTPBearer()

# ==============================
# 0) Root endpoint (กัน 404 เวลาเปิด "/")
# ==============================

@app.get("/")
async def root():
    return {
        "message": "OG Extractor & Chat API is running",
        "endpoints": ["/extract", "/chat", "/docs"]
    }

# ==============================
# 1) OG Extractor
# ==============================

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
    model: Optional[str] = "openai/gpt-3.5-turbo"
    history: Optional[List[Dict[str, str]]] = None

@app.post("/chat")
async def chat_with_ai(
    request: ChatRequest,
    creds: HTTPAuthorizationCredentials = Depends(security)
):
    # เอา API key จาก header Authorization (ปุ่ม Authorize ใน /docs)
    api_key = creds.credentials

    messages = request.history or []
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
