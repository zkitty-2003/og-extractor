from fastapi import FastAPI, HTTPException, Depends, Response, BackgroundTasks
from datetime import datetime
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl

from typing import Optional, List, Dict, Any, Tuple
from bs4 import BeautifulSoup
import httpx
import os
import uuid
import json
import asyncio

# OpenSearch
from opensearchpy import AsyncOpenSearch
from dotenv import load_dotenv

load_dotenv()

# ==============================
# FastAPI setup
# ==============================

app = FastAPI()
security = HTTPBearer(auto_error=False)

# Global OpenSearch Client
opensearch_client: Optional[AsyncOpenSearch] = None

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files
app.mount("/static", StaticFiles(directory="chat_ui"), name="static")


@app.on_event("startup")
async def startup_event():
    """Initialize OpenSearch client on startup."""
    global opensearch_client
    opensearch_url = os.environ.get("OPENSEARCH_URL")
    username = os.environ.get("OPENSEARCH_USERNAME")
    password = os.environ.get("OPENSEARCH_PASSWORD")

    if opensearch_url and username and password:
        try:
            print(f"Initializing OpenSearch client connecting to {opensearch_url}...")
            opensearch_client = AsyncOpenSearch(
                hosts=[opensearch_url],
                http_auth=(username, password),
                use_ssl=True,
                verify_certs=True,
                ssl_show_warn=False,
            )
            print("OpenSearch client initialized successfully.")
        except Exception as e:
            print(f"Failed to initialize OpenSearch client: {e}")
    else:
        print("OpenSearch credentials not found in env. Indexing will be disabled.")


@app.on_event("shutdown")
async def shutdown_event():
    """Close OpenSearch client on shutdown."""
    if opensearch_client:
        await opensearch_client.close()


async def index_chat_summary(doc: dict) -> None:
    """Index (upsert) chat summary to OpenSearch."""
    if not opensearch_client:
        print("Skipping OpenSearch indexing: client not initialized.")
        return

    try:
        index_name = doc.get("index", "chat_summaries")
        doc_id = doc.get("id")
        body = doc.get("body")

        if not body:
            print("Skipping OpenSearch indexing: 'body' missing.")
            return

        resp = await opensearch_client.index(
            index=index_name,
            id=doc_id,
            body=body,
            refresh=True,
        )
        print(f"Indexed chat summary to OpenSearch. ID: {resp.get('_id')}, result: {resp.get('result')}")
    except Exception as e:
        print(f"Error indexing chat summary to OpenSearch: {str(e)}")


async def get_chat_summary(chat_id: str) -> Optional[str]:
    """Retrieve existing summary for a chat_id from OpenSearch."""
    if not opensearch_client:
        return None
    try:
        exists = await opensearch_client.exists(index="chat_summaries", id=chat_id)
        if exists:
            response = await opensearch_client.get(index="chat_summaries", id=chat_id)
            if response and "_source" in response:
                return response["_source"].get("summary")
    except Exception as e:
        print(f"Error fetching summary for {chat_id}: {e}")
    return None


async def quick_update_opensearch(chat_id: str, user_email: Optional[str], message_count: int):
    """
    Lightweight update to OpenSearch (timestamp & count only) without invoking LLM.
    """
    if not opensearch_client:
        return

    try:
        body = {
            "doc": {
                "last_message_at": datetime.utcnow().isoformat(),
                "message_count": message_count,
            },
            "doc_as_upsert": True,
        }
        if user_email:
            body["doc"]["user_email"] = user_email

        await opensearch_client.update(
            index="chat_summaries",
            id=chat_id,
            body=body,
        )
    except Exception as e:
        print(f"Quick update OS failed: {e}")


async def search_user_memory(user_email: str) -> Optional[str]:
    """
    Search for the latest chat summary for a specific user to use as long-term memory.
    """
    if not opensearch_client or not user_email:
        return None

    try:
        query = {
            "size": 1,
            "sort": [{"last_message_at": {"order": "desc"}}],
            "query": {"term": {"user_email.keyword": user_email}},
        }

        response = await opensearch_client.search(
            body=query,
            index="chat_summaries",
        )
        hits = response.get("hits", {}).get("hits", [])
        if hits:
            source = hits[0]["_source"]
            summary = source.get("summary")
            timestamp = source.get("last_message_at", "")[:10]
            if summary:
                return f"[From previous chat on {timestamp}]: {summary}"
    except Exception as e:
        print(f"Error searching user memory: {e}")

    return None


@app.get("/")
async def root():
    return {
        "message": "OG Extractor & Chat API is running",
        "endpoints": ["/extract", "/chat", "/docs", "/ui", "/image", "/summary", "/chat/summary"],
    }


@app.get("/ui")
async def read_ui():
    return FileResponse("chat_ui/index.html")


@app.get("/image")
async def read_image_ui():
    return FileResponse("chat_ui/image.html")


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)


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
        "Referer": "https://www.google.com/",
    }

    try:
        async with httpx.AsyncClient(follow_redirects=True, verify=False) as client:
            response = await client.get(url, headers=headers, timeout=10)
            response.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"HTTP error: {str(e)}",
        )
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error fetching URL: {str(e)}",
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
            "og": og_tags,
        },
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
        id_info = id_token.verify_oauth2_token(
            request.token,
            google_requests.Request(),
            audience="888682176364-95k6bep0ajble7a48romjeui850dptg0.apps.googleusercontent.com",
        )

        return {
            "success": True,
            "user": {
                "email": id_info["email"],
                "name": id_info.get("name"),
                "picture": id_info.get("picture"),
            },
        }
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google Token")


# ==============================
# 3) Share Chat API
# ==============================

SHARED_CHATS: Dict[str, List[Dict[str, str]]] = {}


class ShareRequest(BaseModel):
    messages: List[Dict[str, Any]]


@app.post("/share")
async def share_chat(request: ShareRequest):
    share_id = str(uuid.uuid4())
    SHARED_CHATS[share_id] = request.messages
    return {"id": share_id, "messages": SHARED_CHATS[share_id]}


@app.get("/share/{share_id}")
async def get_shared_chat(share_id: str):
    if share_id not in SHARED_CHATS:
        raise HTTPException(status_code=404, detail="Shared chat not found")
    return {"id": share_id, "messages": SHARED_CHATS[share_id]}


# ==============================
# Helper: Resolve OpenRouter API Key
# ==============================

def resolve_openrouter_key(
    creds: Optional[HTTPAuthorizationCredentials],
) -> str:
    """
    เลือก API key จาก:
    1) Authorization header จาก client (ถ้ามี)
    2) ENV: OPENROUTER_API_KEY
    ถ้าไม่เจอ -> 401
    """
    api_key: Optional[str] = None

    # 1) จาก client (Bearer)
    if creds and creds.credentials:
        api_key = creds.credentials.strip()

    # 2) จาก Environment Variable บน server
    if not api_key:
        api_key = os.environ.get("OPENROUTER_API_KEY")

    if not api_key:
        raise HTTPException(status_code=401, detail="API Key missing")

    # Log ไว้ดู แต่ไม่โชว์ทั้งดอก
    print("Using OpenRouter key prefix:", api_key[:10] + "****")
    return api_key


# ==============================
# 4) Translation API (ใช้โมเดลเล็กฟรี)
# ==============================

async def _translate_logic(text: str, api_key: str) -> Tuple[str, List[str]]:
    """
    พยายามแปลข้อความ Thai -> English สำหรับ image prompt
    โดยใช้โมเดลฟรีที่เบาลง: google/gemma-3-4b-it:free
    """
    models = [
        "google/gemma-3-4b-it:free",
    ]

    errors: List[str] = []

    if not text.strip():
        return "", errors

    async with httpx.AsyncClient(timeout=60) as client:
        for model in models:
            try:
                payload = {
                    "model": model,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You are a strict translation engine for image prompts.\n\n"
                                "Input: Thai text describing an image.\n"
                                "Output: SHORT English prompt only.\n"
                                "- English only, no Thai, no explanation.\n"
                                "- No quotes, no extra phrases.\n"
                                "- 5–20 words, concise.\n"
                            ),
                        },
                        {"role": "user", "content": text},
                    ],
                }

                response = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://og-extractor-zxkk.onrender.com",
                        "X-Title": "FastAPI Chat Translation",
                    },
                    json=payload,
                )

                if response.status_code == 200:
                    data = response.json()
                    if "choices" in data and data["choices"]:
                        content = data["choices"][0]["message"]["content"].strip()
                        if content:
                            return content, errors

                error_msg = (
                    f"Model {model} failed: {response.status_code} - "
                    f"{response.text[:200]}"
                )
                print(error_msg)
                errors.append(error_msg)
                continue

            except Exception as e:
                error_msg = f"Model {model} error: {str(e)}"
                print(error_msg)
                errors.append(error_msg)
                continue

    print(f"All translation models failed. Returning original text. Errors: {errors}")
    return text, errors


class TranslationRequest(BaseModel):
    text: str


@app.post("/translate")
async def translate_text(
    request: TranslationRequest,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    api_key = resolve_openrouter_key(creds)

    try:
        english_text, debug_info = await _translate_logic(request.text, api_key)
        return {"english": english_text, "debug": debug_info}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Translation error: {str(e)}")


# ==============================
# 5) Chat API (Simplified)
# ==============================

class ChatRequest(BaseModel):
    message: str
    model: Optional[str] = "google/gemini-flash-1.5"
    history: Optional[List[Dict[str, Any]]] = None
    chat_id: Optional[str] = None
    user_email: Optional[str] = None


def is_image_generation_prompt(text: str) -> bool:
    """
    Checks if the text is likely an image generation prompt.
    """
    text_lower = text.lower().strip()
    keywords = ["/imagine", "/gen", "/image", "/img", "สร้างรูป", "วาดรูป", "generate image", "create image"]
    return any(text_lower.startswith(kw) for kw in keywords)


@app.post("/chat")
async def chat_with_ai(
    request: ChatRequest,
    background_tasks: BackgroundTasks,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """
    Main Chat Endpoint (Standard)
    """
    api_key = resolve_openrouter_key(creds)

    # 1. Translate if needed (Logic remains samte)
    if is_image_generation_prompt(request.message):
        print(f"Detected image prompt: {request.message}")
        text_to_translate = request.message.strip()
        # Remove the command prefix for translation
        for kw in ["/imagine", "/gen", "/image", "/img", "สร้างรูป", "วาดรูป", "generate image", "create image"]:
            if text_to_translate.lower().startswith(kw):
                text_to_translate = text_to_translate[len(kw):].strip()
                break

        translated_text, logs = await _translate_logic(text_to_translate, api_key)
        
        try:
            return {
               "success": True,
               "data": {
                   "message": translated_text,
                   "images": [],
                   "model": "google/gemma-3-4b-it:free",
               },
            }
        except Exception as e:
             return {"success": False, "error": str(e)}

    # 2. Prepare Messages
    messages = request.history or []
    
    # Simple System Prompt
    system_prompt = {
        "role": "system",
        "content": (
            "You are ABDUL, a helpful AI assistant. "
            "Always answer in Thai unless asked otherwise. "
            "Do NOT use Romanized Thai."
        )
    }
    
    # Insert system prompt at start
    if not messages or messages[0].get("role") != "system":
        messages.insert(0, system_prompt)

    messages.append({"role": "user", "content": request.message})

    # 3. Call AI
    payload = {
        "model": request.model,
        "messages": messages,
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://og-extractor-zxkk.onrender.com",
                    "X-Title": "FastAPI Chat",
                },
                json=payload,
            )

        if response.status_code != 200:
             return {"success": False, "error": f"OpenRouter Error: {response.text}"}

        data = response.json()
        ai_message = data["choices"][0]["message"]["content"]

        # 4. Background Task (Simple Update)
        if request.chat_id:
            full_history = messages + [{"role": "assistant", "content": ai_message}]
            background_tasks.add_task(
                quick_update_opensearch,
                chat_id=request.chat_id,
                user_email=request.user_email,
                message_count=len(full_history),
            )

        return {
            "success": True,
            "data": {
                "message": ai_message,
                "images": [],
                "model": data.get("model", request.model),
            },
        }

    except Exception as e:
        print(f"Chat error: {e}")
        return {"success": False, "error": str(e)}


# ==============================
# 6) Analyze Chat API (Stable Version)
# ==============================

class AnalyzeRequest(BaseModel):
    chat_id: str
    messages: List[Dict[str, Any]]
    user_email: Optional[str] = None


async def _analyze_chat_logic(
    chat_id: str,
    messages: List[Dict[str, Any]],
    api_key: str,
    user_email: Optional[str] = None,
):
    """
    Stabilized Analyzer with Multi-Model Fallback
    """
    # List of models to try in order
    SUMMARY_MODELS = [
        "google/gemini-flash-1.5",
        "google/gemini-2.0-flash-exp:free",
        "google/gemini-2.0-flash-thinking-exp:free",
        "huggingfaceh4/zephyr-7b-beta:free",
        "mistralai/mistral-7b-instruct:free",
        "qwen/qwen-2-7b-instruct:free",
    ]

    # Use last 40 messages to be safe
    MAX_MSG = 40
    trimmed = [m for m in messages[-MAX_MSG:] if m.get("role") in ("user", "assistant")]

    conversation_text = ""
    for m in trimmed:
        role_th = "ผู้ใช้" if m.get("role") == "user" else "ผู้ช่วย"
        conversation_text += f"{role_th}: {m.get('content', '')}\n"

    system_prompt = (
        "คุณคือระบบวิเคราะห์แชทภาษาไทย\n"
        "- สรุปบทสนทนาเป็นภาษาไทย\n"
        "- ตั้งชื่อเรื่อง (title)\n"
        "- สร้างหัวข้อ (topics)\n"
        "- ตอบเป็น JSON: { title, summary, topics, opensearch_doc: {...} }"
    )

    errors = []

    async with httpx.AsyncClient(timeout=60) as client:
        for model in SUMMARY_MODELS:
            print(f"Analyzing chat with model: {model}")
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": conversation_text},
                ],
                "response_format": {"type": "json_object"},
                "max_tokens": 1000,
            }

            try:
                r = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "HTTP-Referer": "https://og-extractor-zxkk.onrender.com",
                        "X-Title": "FastAPI Analyzer",
                    },
                    json=payload,
                )

                if r.status_code == 200:
                    data = r.json()
                    if "choices" in data and data["choices"]:
                        content = data["choices"][0]["message"]["content"]
                        try:
                            parsed = json.loads(content)
                            
                            # Standard OpenSearch Doc Prep
                            doc = parsed.get("opensearch_doc", {})
                            now_iso = datetime.utcnow().isoformat()
                            doc["id"] = chat_id
                            doc["user_email"] = user_email
                            doc["title"] = parsed.get("title", "No Title")
                            doc["summary"] = parsed.get("summary", "")
                            doc["topics"] = parsed.get("topics", [])
                            doc["last_message_at"] = now_iso
                            
                            parsed["opensearch_doc"] = doc

                            await index_chat_summary({
                                "index": "chat_summaries", 
                                "id": chat_id, 
                                "body": doc
                            })

                            return {"success": True, "data": parsed}
                        except json.JSONDecodeError:
                            print(f"Model {model} returned invalid JSON.")
                            errors.append(f"{model}: Invalid JSON")
                            continue
                else:
                    error_msg = f"{model}: {r.status_code} - {r.text[:100]}"
                    print(error_msg)
                    errors.append(error_msg)
                    # If 429, wait a bit before next model (optional, but good practice)
                    if r.status_code == 429:
                        await asyncio.sleep(1)

            except Exception as e:
                error_msg = f"{model} error: {str(e)}"
                print(error_msg)
                errors.append(error_msg)
                continue

    return {"success": False, "error": f"All models failed. Details: {errors}"}


@app.post("/chat/summary")
async def summarize_chat_session(
    request: AnalyzeRequest,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    api_key = resolve_openrouter_key(creds)
    return await _analyze_chat_logic(
        request.chat_id, request.messages, api_key, request.user_email
    )


# ==============================
# 7) Simple Summary API (Button)
# ==============================

class SimpleSummaryRequest(BaseModel):
    chat_id: str
    messages: List[Dict[str, Any]]
    user_email: Optional[str] = None


@app.post("/summary")
async def summarize_simple(
    request: SimpleSummaryRequest,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """
    Restored Simple Summary with Multi-Model Fallback
    """
    api_key = resolve_openrouter_key(creds)
    
    # Same list of models as analyzer
    SUMMARY_MODELS = [
        "google/gemini-flash-1.5",
        "google/gemini-2.0-flash-exp:free",
        "google/gemini-2.0-flash-thinking-exp:free",
        "huggingfaceh4/zephyr-7b-beta:free",
        "mistralai/mistral-7b-instruct:free",
        "qwen/qwen-2-7b-instruct:free",
    ]

    conversation_text = ""
    for msg in request.messages[-30:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        conversation_text += f"{role}: {content}\n"

    last_error = ""

    async with httpx.AsyncClient(timeout=60) as client:
        for model in SUMMARY_MODELS:
            try:
                # Retry loop per model (optional, but good for transient 429s on a specific model)
                # But since we have many models, maybe just try once per model is faster?
                # Let's simple try once per model to avoid waiting too long if one is rate limited.
                
                print(f"Simple summary with model: {model}")
                r = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}", 
                        "HTTP-Referer": "https://og-extractor-zxkk.onrender.com",
                        "X-Title": "FastAPI Simple Summary"
                    },
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": "Summarize this chat in Thai (2-3 sentences)."},
                            {"role": "user", "content": conversation_text}
                        ]
                    }
                )
                
                if r.status_code == 200:
                    data = r.json()
                    summary = data["choices"][0]["message"]["content"]
                    
                    # Auto-save minimal doc
                    await index_chat_summary({
                        "index": "chat_summaries",
                        "id": request.chat_id,
                        "body": {
                            "id": request.chat_id,
                            "user_email": request.user_email,
                            "summary": summary,
                            "last_message_at": datetime.utcnow().isoformat()  
                        }
                    })
                    
                    return {
                        "success": True, 
                        "data": {"summary": summary}
                    }
                elif r.status_code == 429:
                    print(f"Model {model} rate limited (429). Trying next...")
                    last_error = f"{model} 429"
                    await asyncio.sleep(0.5) 
                else:
                    print(f"Model {model} failed: {r.status_code}")
                    last_error = f"{model} {r.status_code}"

            except Exception as e:
                print(f"Model {model} exception: {e}")
                last_error = str(e)
                continue
            
    return {"success": False, "error": f"Summary failed after trying all models. Last error: {last_error}"}

# ==============================
# Uvicorn entrypoint
# ==============================

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)
