from fastapi import FastAPI, HTTPException, Depends, Response, BackgroundTasks, Query, Header
from datetime import datetime, timezone, timedelta
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from urllib.parse import urlparse

from fastapi.responses import Response, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl
import os
from typing import Optional, List, Dict, Any, Tuple
from bs4 import BeautifulSoup
import httpx
import uuid
import json
import asyncio

# OpenSearch
from opensearchpy import AsyncOpenSearch
from opensearchpy.exceptions import NotFoundError
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Mount frontend static files
# Ensure 'dist' directory exists or handle it gracefully if running locally without build
if os.path.isdir("dist"):
    app.mount("/ui", StaticFiles(directory="dist", html=True), name="ui")

@app.get("/")
def root():
    return RedirectResponse(url="/ui")

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


def build_opensearch_client():
    # Get from docker-compose: OPENSEARCH_URL=http://opensearch-node:9200
    url = os.getenv("OPENSEARCH_URL", "http://localhost:9200")
    u = urlparse(url)

    host = u.hostname or "localhost"
    port = u.port or 9200
    use_ssl = (u.scheme == "https")

    username = os.getenv("OPENSEARCH_USERNAME") or None
    password = os.getenv("OPENSEARCH_PASSWORD") or None

    kwargs = dict(
        hosts=[{"host": host, "port": port}],
        use_ssl=use_ssl,
        verify_certs=False,
    )

    if username and password:
        kwargs["http_auth"] = (username, password)

    # Enforce short timeout to prevent hanging on reconnect
    kwargs["timeout"] = 5

    return AsyncOpenSearch(**kwargs)


@app.on_event("startup")
async def startup_event():
    global opensearch_client
    print("Initializing OpenSearch client via OPENSEARCH_URL...")
    try:
        opensearch_client = build_opensearch_client()
        ok = await opensearch_client.ping()
        print("OpenSearch ping =", ok)
        if ok:
            await init_opensearch_index()
    except Exception as e:
        print("Failed to initialize OpenSearch client:", e)


async def init_opensearch_index():
    """Initialize the chat_summaries and token_usage indices with proper mapping if they don't exist."""
    if not opensearch_client:
        return

    # ==========================================
    # Index 1: chat_summaries
    # ==========================================
    index_name_summaries = "chat_summaries"
    mapping_summaries = {
        "mappings": {
            "properties": {
                "id": {"type": "keyword"},
                "user_email": {"type": "keyword"},
                "title": {
                    "type": "text",
                    "fields": {"keyword": {"type": "keyword"}}
                },
                "summary": {"type": "text"},
                "topics": {"type": "keyword"},
                "message_count": {"type": "integer"},
                "last_message_at": {"type": "date"}
            }
        }
    }

    try:
        exists = await opensearch_client.indices.exists(index=index_name_summaries)
        if not exists:
            await opensearch_client.indices.create(index=index_name_summaries, body=mapping_summaries)
            print(f"Index '{index_name_summaries}' created with mapping.")
        else:
            print(f"Index '{index_name_summaries}' already exists.")
    except Exception as e:
        print(f"Error initializing index '{index_name_summaries}': {e}")

    # ==========================================
    # Index 2: token_usage (NEW)
    # ==========================================
    index_name_tokens = "token_usage"
    mapping_tokens = {
        "mappings": {
            "properties": {
                "request_id": {"type": "keyword"},
                "timestamp": {"type": "date"},
                "session_id": {"type": "keyword"},
                "user_id": {"type": "keyword"},
                "model": {"type": "keyword"},
                "provider": {"type": "keyword"},
                "prompt_tokens": {"type": "integer"},
                "completion_tokens": {"type": "integer"},
                "total_tokens": {"type": "integer"},
                "cost": {"type": "float"},
                "response_time_ms": {"type": "float"},
                "status": {"type": "keyword"},
                "endpoint": {"type": "keyword"}
            }
        }
    }

    try:
        exists = await opensearch_client.indices.exists(index=index_name_tokens)
        if not exists:
            await opensearch_client.indices.create(index=index_name_tokens, body=mapping_tokens)
            print(f"Index '{index_name_tokens}' created with mapping.")
        else:
            print(f"Index '{index_name_tokens}' already exists.")
    except Exception as e:
        print(f"Error initializing index '{index_name_tokens}': {e}")



async def get_opensearch_or_raise():
    global opensearch_client
    if opensearch_client is None:
        print("⚠️ OpenSearch client is None. Attempting to reconnect...")
        try:
            opensearch_client = build_opensearch_client()
            if not await opensearch_client.ping():
                 opensearch_client = None
                 print("❌ OpenSearch ping failed during reconnection attempt.")
                 raise HTTPException(status_code=503, detail="OpenSearch unreachable")
            print("✅ OpenSearch reconnected successfully.")
            await init_opensearch_index()
        except Exception as e:
            print(f"❌ Re-init failed: {e}")
            raise HTTPException(status_code=503, detail="OpenSearch unavailable")
    return opensearch_client

@app.on_event("shutdown")
async def shutdown_event():
    """Close OpenSearch client on shutdown."""
    if opensearch_client:
        await opensearch_client.close()



async def log_to_opensearch(
    session_id: str,
    user_id: str,
    role: str,
    model: str,
    status: str,
    content: Optional[str] = None,
    response_time_ms: Optional[float] = None,
    user_avatar: Optional[str] = None
):
    """
    Logs a single document to OpenSearch index 'ai_chat_logs'.
    Format follows the requirement: 1 message = 1 document.
    """
    # ✅ STEP 1 & 3: No Auth Check + Print/Log
    print(f"LOGGING TO OPENSEARCH: {role} (Status: {status}) | RT: {response_time_ms}")

    if not opensearch_client:
        try:
            await get_opensearch_or_raise()
        except:
            print("Skipping OpenSearch logging: client not initialized and reconnection failed.")
            return

    doc = {
        "session_id": session_id,
        "user_id": user_id,
        "role": role,
        "model": model,
        "status": status,
        "environment": "dev",
        "@timestamp": datetime.now(timezone.utc).isoformat(),
        "content_length": len(content) if content else 0,
        "content_length": len(content) if content else 0,
        "is_anonymous": True if user_id == "anonymous" else False,
        "user_avatar": user_avatar
    }

    if response_time_ms is not None:
        doc["response_time_ms"] = int(round(response_time_ms))
    
    if content:
        doc["content_snippet"] = content[:1000]

    try:
        print(f"Index doc payload: {json.dumps(doc, default=str)}")
        resp = await opensearch_client.index(index="ai_chat_logs", body=doc)
        print(f"OpenSearch Response: {resp}")
    except Exception as e:
        print(f"Failed to log to OpenSearch: {e}")


async def log_token_usage(
    request_id: str,
    session_id: str,
    user_id: str,
    model: str,
    usage: Optional[Dict[str, Any]],
    response_time_ms: float,
    status: str = "success",
    endpoint: str = "/chat"
):
    """
    Logs token usage from OpenRouter API response to OpenSearch.
    
    Args:
        request_id: Unique ID for this request (UUID)
        session_id: Chat session ID
        user_id: User email or "anonymous"
        model: Model name (e.g., "google/gemini-pro")
        usage: Usage dict from OpenRouter response with prompt_tokens, completion_tokens, total_tokens
        response_time_ms: Response time in milliseconds
        status: "success" or "error"
        endpoint: API endpoint that was called
    """
    print(f"\n{'='*60}")
    print(f"🚀 log_token_usage CALLED!")
    print(f"   request_id: {request_id}")
    print(f"   session_id: {session_id}")
    print(f"   user_id: {user_id}")
    print(f"   model: {model}")
    print(f"   status: {status}")
    print(f"   endpoint: {endpoint}")
    print(f"   response_time_ms: {response_time_ms}ms")
    print(f"   📊 USAGE DATA: {usage}")
    print(f"   📊 USAGE TYPE: {type(usage)}")
    if usage:
        print(f"   📊 USAGE KEYS: {usage.keys()}")
    print(f"{'='*60}\n")
    
    if not opensearch_client:
        try:
            await get_opensearch_or_raise()
        except:
             print("Skipping token usage logging: OpenSearch client not initialized and reconnection failed.")
             return
    
    # Extract token counts from usage (handle missing gracefully)
    prompt_tokens = None
    completion_tokens = None
    total_tokens = None
    
    if usage:
        prompt_tokens = usage.get("prompt_tokens")
        completion_tokens = usage.get("completion_tokens")
        total_tokens = usage.get("total_tokens")
    
    # ⚠️ FALLBACK: If usage data is missing (common for free models)
    # Estimate tokens from response time and status
    # This is an approximation - not accurate but better than nothing
    if total_tokens is None:
        # Rough estimation: ~4 characters per token (average for English/Thai mix)
        # For free models, we at least want to track API calls
        estimated_total = 0
        if status == "success":
            # Assume average request uses ~100-500 tokens
            estimated_total = max(100, int(response_time_ms / 10))  # Rough heuristic
        
        prompt_tokens = estimated_total // 2 if estimated_total > 0 else 0
        completion_tokens = estimated_total // 2 if estimated_total > 0 else 0
        total_tokens = estimated_total
        
        print(f"   ⚠️  Usage data not provided by API - using estimates")
        print(f"   📊 Estimated: prompt={prompt_tokens}, completion={completion_tokens}, total={total_tokens}")
    
    # Parse provider from model string (e.g., "google" from "google/gemini-pro")
    provider = "unknown"
    if "/" in model:
        provider = model.split("/")[0]
    
    # Build document for OpenSearch
    doc = {
        "request_id": request_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "session_id": session_id,
        "user_id": user_id,
        "model": model,
        "provider": provider,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "cost": 0.0,  # TODO: Implement cost calculation based on model pricing
        "response_time_ms": round(response_time_ms, 2),
        "status": status,
        "endpoint": endpoint
    }
    
    try:
        print(f"Token usage doc: {json.dumps(doc, default=str)}")
        resp = await opensearch_client.index(index="token_usage", body=doc)
        print(f"Token usage logged: {resp.get('_id')}")
    except Exception as e:
        print(f"Failed to log token usage to OpenSearch: {e}")



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
        "message": "OG Extractor & Chat API is running (Backend Only)",
        "endpoints": ["/extract", "/chat", "/docs", "/summary", "/chat/summary"],
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
# 4) Translation API
# ==============================

from typing import Tuple, List, Optional
from fastapi import HTTPException, Depends
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel
import httpx

# ------------------------------
# Core translation logic
# ------------------------------
async def _translate_logic(text: str, api_key: str) -> Tuple[str, List[str]]:
    """
    Translate Thai -> English for image prompt.
    Uses ONLY free lightweight model:
    google/gemma-3-27b-it:free
    """

    models = [
        "google/gemma-3-27b-it:free",
    ]

    errors: List[str] = []

    if not text or not text.strip():
        return "", errors

    async with httpx.AsyncClient(timeout=60) as client:
        for model in models:
            try:
                payload = {
                    "model": model,
                    "messages": [
                        {
                            "role": "user",
                            "content": (
                                "You are a strict translation engine for image prompts.\n\n"
                                "Input: Thai text describing an image.\n"
                                "Output: SHORT English image prompt only.\n\n"
                                "Rules:\n"
                                "- English only\n"
                                "- No Thai\n"
                                "- No explanation\n"
                                "- No quotes\n"
                                "- 5–20 words\n"
                                "- Concise and visual\n"
                                "\nInput: " + text
                            ),
                        }
                    ],
                }

                response = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://og-extractor-zxkk.onrender.com",
                        "X-Title": "FastAPI Translation API",
                    },
                    json=payload,
                )

                if response.status_code == 200:
                    data = response.json()
                    if data.get("choices"):
                        content = data["choices"][0]["message"]["content"].strip()
                        if content:
                            return content, errors

                error_msg = (
                    f"Model {model} failed: {response.status_code} - "
                    f"{response.text[:200]}"
                )
                errors.append(error_msg)

            except Exception as e:
                error_msg = f"Model {model} exception: {str(e)}"
                errors.append(error_msg)

    # All models failed → return original text
    return text, errors


# ------------------------------
# Request schema
# ------------------------------
class TranslationRequest(BaseModel):
    text: str


# ------------------------------
# API endpoint
# ------------------------------
@app.post("/translate")
async def translate_text(
    request: TranslationRequest,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    api_key = resolve_openrouter_key(creds)

    try:
        english_text, debug_info = await _translate_logic(
            request.text,
            api_key,
        )

        return {
            "english": english_text,
            "debug": debug_info,
            # 👇 build tag เอาไว้เช็กว่าเข้าโค้ดนี้จริง
            "build": "translate-v2-gemma-only",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Translation error: {str(e)}",
        )


# ==============================
# 5) Chat API (Simplified)
# ==============================

class ChatRequest(BaseModel):
    message: str
    model: Optional[str] = "google/gemma-3-27b-it:free"
    history: Optional[List[Dict[str, Any]]] = None
    chat_id: Optional[str] = None
    user_email: Optional[str] = None
    user_avatar: Optional[str] = None


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
    Main Chat Endpoint (Standard) with Long-term Memory Injection
    """
    print("\n" + "="*60)
    print(f"🎯 /CHAT ENDPOINT HIT! Time: {datetime.now()}")
    print(f"   Message: {request.message[:50]}...")
    print(f"   User: {request.user_email}")
    print("="*60 + "\n")
    
    api_key = resolve_openrouter_key(creds)

    # 1. Translate if needed (Logic remains same)
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
                   "model": "google/gemma-3-27b-it:free",
               },
            }
        except Exception as e:
             return {"success": False, "error": str(e)}

    # 2. Prepare Memory & System Prompt
    system_content = (
        "You are ABDUL, a helpful AI assistant.\n"
        "CORE DIRECTIVES:\n"
        "1. LANGUAGE: Answer in THAI only (unless user speaks English).\n"
        "2. SCRIPT: Use THAI SCRIPT ONLY. Do not use Roman/English letters for Thai words.\n"
        "3. NO PRONUNCIATION: Do not explain how to pronounce Thai words.\n"
        "4. NO REPETITION: Do not repeat meanings in multiple languages.\n\n"
        "CORRECT EXAMPLE:\n"
        "✅ 'สวัสดีครับ มีอะไรให้ช่วยไหมครับ'\n"
        "✅ '1 วัน มี 24 ชั่วโมงครับ'"
    )


    # Inject Memory if User is Known
    if request.user_email:
        memory_context = await search_user_memory(request.user_email)
        if memory_context:
            print(f"Injecting memory for {request.user_email}")
            system_content += f"\n\n[Long-term memory from previous chats]:\n{memory_context}"

    # 3. Construct Messages
    messages = request.history or []
    
    # Check for models that don't support 'system' role (e.g., gemma-3)
    # Error: "Developer instruction is not enabled for models/gemma-3-12b-it"
    is_no_system_role_model = "gemma-3" in request.model

    if is_no_system_role_model:
        # Strategy: Prepend system prompt to the FIRST message in the conversation
        if messages:
            # If history exists, prepend to the first message (usually user)
            # Ensure we don't duplicate if it somehow already has it (though history from FE usually doesn't)
            messages[0]["content"] = f"{system_content}\n\n{messages[0]['content']}"
            # Force role to user if it was somehow system
            if messages[0]["role"] == "system":
                messages[0]["role"] = "user"
        else:
            # No history, prepend to the new user message
            request.message = f"{system_content}\n\n{request.message}"
    else:
        # Standard behavior: Add System Message at index 0
        if not messages or messages[0].get("role") != "system":
            messages.insert(0, {"role": "system", "content": system_content})
        else:
            messages[0]["content"] = system_content

    messages.append({"role": "user", "content": request.message})

    # 4. Call AI
    import time
    start_time = time.time()
    
    # Generate unique request_id for token tracking
    request_id = str(uuid.uuid4())
    
    # ✅ STEP 2: Log User Message
    # Generate/Use chat_id as session_id
    session_id = request.chat_id or str(uuid.uuid4())
    user_id = request.user_email if request.user_email and request.user_email.strip() else "anonymous"
    
    # 🔍 DEBUG: Check user_id assignment
    print(f"🔍 DEBUG: request.user_email={repr(request.user_email)} → user_id={repr(user_id)}")
    
    background_tasks.add_task(
        log_to_opensearch,
        session_id=session_id,
        user_id=user_id,
        role="user",
        model=request.model,
        status="success",
        content=request.message,
        user_avatar=request.user_avatar
    )

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

        # Calculate time
        end_time = time.time()
        duration_ms = (end_time - start_time) * 1000.0

        if response.status_code != 200:
             error_txt = f"OpenRouter Error: {response.text}"
             # Log Error
             background_tasks.add_task(
                log_to_opensearch,
                session_id=session_id,
                user_id=user_id,
                role="assistant",
                model=request.model,
                status="error",
                content=error_txt,
                response_time_ms=duration_ms
             )
             return {"success": False, "error": error_txt}

        data = response.json()
        ai_message = data["choices"][0]["message"]["content"]
        
        # ✅ STEP 2: Log AI Message (Success)
        background_tasks.add_task(
            log_to_opensearch,
            session_id=session_id,
            user_id=user_id,
            role="assistant",
            model=data.get("model", request.model),
            status="success",
            content=ai_message,
            response_time_ms=duration_ms
        )
        
        # ✅ NEW: Log Token Usage
        # Extract usage from OpenRouter response (OpenAI-compatible format)
        usage_data = data.get("usage")  # Contains prompt_tokens, completion_tokens, total_tokens
        # Log token usage SYNCHRONOUSLY (not background task)
        await log_token_usage(
            request_id=request_id,
            session_id=session_id,
            user_id=user_id,
            model=data.get("model", request.model),
            usage=usage_data,
            response_time_ms=duration_ms,
            status="success",
            endpoint="/chat"
        )

        # 5. Background Task (Simple Update for Summary Index)
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
        # Log Exception
        background_tasks.add_task(
            log_to_opensearch,
            session_id=request.chat_id or "unknown",
            user_id=request.user_email or "unknown",
            role="assistant",
            model=request.model,
            status="error",
            content=str(e)
        )
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
    Strictly follows the provided conversation.
    """
    # Expanded list of models for robustness
    SUMMARY_MODELS = [
        "google/gemini-2.0-flash-exp:free",
        "google/gemini-2.0-flash-thinking-exp:free",
        "meta-llama/llama-3-70b-instruct:free",
        "mistralai/mixtral-8x7b-instruct",
        "qwen/qwen-2-7b-instruct:free",
    ]

    # Use more context if possible, but keep it within limits
    MAX_MSG = 50
    trimmed = [m for m in messages[-MAX_MSG:] if m.get("role") in ("user", "assistant")]

    if not trimmed:
        return {"success": False, "error": "No conversation to analyze"}

    conversation_text = ""
    for m in trimmed:
        role_th = "User" if m.get("role") == "user" else "AI"
        conversation_text += f"{role_th}: {m.get('content', '')}\n"

    system_prompt = (
        "You are a strict conversation summarizer.\n\n"
        "LANGUAGE RULE: Detect the dominant language of the conversation.\n"
        "- If Thai, summarize in THAI.\n"
        "- If English, summarize in ENGLISH.\n"
        "- Do NOT switch languages mid-summary.\n\n"
        "STRICT GUIDELINES:\n"
        "1. Summarize ONLY based on ACTUAL conversation content.\n"
        "2. NO meta-explanations (e.g. 'AI can help...', 'The user asked...').\n"
        "3. NO advertising, NO hallucinations, NO broad generalizations.\n"
        "4. Be concise and factual.\n\n"
        "REQUIRED OUTPUT FORMAT:\n"
        "Title: (1 line, short & clear, in detected language)\n"
        "Summary: (2-4 sentences, purely factual, in detected language)\n"
        "Topics: (3-6 keywords, comma-separated, in detected language)\n"
    )
    
    final_user_content = f"Conversation to summarize:\n{conversation_text}"

    import re

    errors = []

    async with httpx.AsyncClient(timeout=60) as client:
        for model in SUMMARY_MODELS:

            print(f"Analyzing chat with model: {model}")
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": final_user_content},
                ],
                # removed json object response format since user asks for text format
                "max_tokens": 1500,
            }

            try:
                r = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "HTTP-Referer": "https://og-extractor.onrender.com",
                        "X-Title": "FastAPI Analyzer",
                    },
                    json=payload,
                )

                if r.status_code == 200:
                    data = r.json()
                    if "choices" in data and data["choices"]:
                        content = data["choices"][0]["message"]["content"]
                        
                        # Parse Text Output with Regex
                        title_match = re.search(r"Title:\s*(.+)", content, re.IGNORECASE)
                        summary_match = re.search(r"Summary:\s*(.+)", content, re.IGNORECASE | re.DOTALL)
                        topics_match = re.search(r"Topics:\s*(.+)", content, re.IGNORECASE)

                        title = title_match.group(1).strip() if title_match else "สรุปแชท"
                        
                        summary = "ไม่มีสรุป"
                        if summary_match:
                            # Capture everything until "Topics:" or end of string
                            raw_summary = summary_match.group(1).strip()
                            # If topics come after summary, cut it off
                            topics_start = re.search(r"Topics:", raw_summary, re.IGNORECASE)
                            if topics_start:
                                summary = raw_summary[:topics_start.start()].strip()
                            else:
                                summary = raw_summary

                        topics = []
                        if topics_match:
                            raw_topics = topics_match.group(1).strip()
                            # Split by comma or space if no commas
                            if "," in raw_topics:
                                topics = [t.strip() for t in raw_topics.split(",")]
                            else:
                                topics = [t.strip() for t in raw_topics.split()]
                        
                        # Fallback: if regex failed completely, treat whole content as summary
                        if not title_match and not summary_match:
                             summary = content.strip()

                        # Construct Response
                        parsed = {
                            "title": title,
                            "summary": summary,
                            "topics": topics
                        }
                            
                        # Standard OpenSearch Doc Prep
                        doc = {}
                        doc["id"] = chat_id
                        doc["user_email"] = user_email
                        doc["title"] = title
                        doc["summary"] = summary
                        doc["topics"] = topics
                        doc["last_message_at"] = datetime.utcnow().isoformat()
                        doc["message_count"] = len(messages)
                        
                        parsed["opensearch_doc"] = doc

                        # Indexing
                        await index_chat_summary({
                            "index": "chat_summaries", 
                            "id": chat_id, 
                            "body": doc
                        })

                        return {"success": True, "data": parsed}
                else:
                    error_msg = f"{model}: {r.status_code} - {r.text[:200]}"
                    print(error_msg)
                    errors.append(error_msg)
                    if r.status_code == 429:
                        await asyncio.sleep(1)

            except Exception as e:
                error_msg = f"{model} error: {str(e)}"
                print(error_msg)
                errors.append(error_msg)
                continue

    return {"success": False, "error": f"All models failed. Last error: {errors[-1] if errors else 'Unknown'}"}


@app.post("/chat/summary")
async def summarize_chat_session(
    request: AnalyzeRequest,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    api_key = resolve_openrouter_key(creds)
    return await _analyze_chat_logic(
        request.chat_id, request.messages, api_key, request.user_email
    )


# Unified to use the same robust logic
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
    Unified Summary Endpoint
    """
    api_key = resolve_openrouter_key(creds)
    return await _analyze_chat_logic(
        request.chat_id, request.messages, api_key, request.user_email
    )


# ==============================
# 7) Dashboard API (Analytics)
# ==============================

@app.get("/api/dashboard/summary")
async def dashboard_summary(
    time_range: str = Query("24h", regex="^(24h|7d|30d)$"),
    model: Optional[str] = None
):
    try:
        # Auto-reconnect if needed
        await get_opensearch_or_raise()
    except HTTPException:
        # Fallback: Return empty data if DB is down
        return {
            "total_messages": 0,
            "active_users": 0,
            "sessions": 0,
            "response_time_p50_ms": 0,
            "response_time_p95_ms": 0,
            "error_count": 0,
            "error_rate_pct": 0,
            "top_users": [],
            "top_models": [],
            "anonymous_messages": 0,
            "anonymous_rate_pct": 0
        }

    # 1. OpenSearch Date Math for time range
    # 2. Strict field usage (no .keyword)
    # 3. Aggregations as requested
    query_body = {
        "size": 0,
        "query": {
            "bool": {
                "must": [
                    {"range": {"@timestamp": {"gte": f"now-{time_range}", "lte": "now"}}}
                ]
            }
        },
        "aggs": {
            "total_messages": {"value_count": {"field": "@timestamp"}},
            "active_users": {
                "filter": {
                    "bool": {
                        "must_not": [
                             {"term": {"is_anonymous": True}}
                        ]
                    }
                },
                "aggs": {
                    "count": {"cardinality": {"field": "user_id.keyword"}}
                }
            },
            "sessions": {"cardinality": {"field": "session_id.keyword"}},
            "response_time_stats": {
                "percentiles": {
                    "field": "response_time_ms",
                    "percents": [50, 95]
                }
            },
            "error_count": {"filter": {"term": {"status.keyword": "error"}}},
            "anonymous_messages": {"filter": {"term": {"is_anonymous": True}}},

            "top_users": {"terms": {"field": "user_id.keyword", "size": 10}},
            "top_models": {"terms": {"field": "model.keyword", "size": 5}}
        }
    }

    # Debug print
    print(f"DEBUG: Dashboard Summary Query (Fixed) -> {json.dumps(query_body)}")
    
    try:
        resp = await opensearch_client.search(index="ai_chat_logs", body=query_body)
    except Exception as e:
        print(f"Summary Search Error: {e}")
        return {
            "total_messages": 0,
            "active_users": 0,
            "sessions": 0,
            "response_time_p50_ms": 0,
            "response_time_p95_ms": 0,
            "error_count": 0,
            "error_rate_pct": 0,
            "top_users": [],
            "top_models": [],
            "anonymous_messages": 0,
            "anonymous_rate_pct": 0
        }
    
    aggs = resp["aggregations"]

    # Extract Aggregations
    total_messages = aggs["total_messages"]["value"]

    # True Active Users (Authenticated Only)
    active_users = aggs["active_users"]["count"]["value"]
    
    sessions = aggs["sessions"]["value"]
    
    # Percentiles (Handle Nulls)
    p50 = aggs["response_time_stats"]["values"].get("50.0")
    p95 = aggs["response_time_stats"]["values"].get("95.0")
    
    response_time_p50_ms = int(round(p50)) if p50 is not None else 0
    response_time_p95_ms = int(round(p95)) if p95 is not None else 0
    
    # Error Stats
    error_count = aggs["error_count"]["doc_count"]
    error_rate_pct = 0
    if total_messages > 0:
        error_rate_pct = int(round((error_count / total_messages) * 100))

    # Anonymous Stats
    anonymous_msg_count = aggs["anonymous_messages"]["doc_count"]
    anonymous_rate_pct = 0
    if total_messages > 0:
        anonymous_rate_pct = int(round((anonymous_msg_count / total_messages) * 100))

    # Top Users Processing
    raw_top_users = aggs["top_users"]["buckets"]
    
    final_top_users = []
    
    # Process all users including anonymous
    for b in raw_top_users:
        uid = b["key"]
        count = b["doc_count"]
        
        # Treat both "anonymous" and "dev_user" as Anonymous
        if uid == "anonymous" or uid == "dev_user":
            # Use friendly name for anonymous users
            final_top_users.append({
                "name": "Anonymous",
                "count": count,
                "is_anonymous": True
            })
        else:
            final_top_users.append({
                "name": uid,
                "count": count,
                "is_anonymous": False
            })
    
    # Sort by count descending (already sorted by OpenSearch, but ensure it)
    final_top_users.sort(key=lambda x: x["count"], reverse=True)
    
    # Limit to top 10 users total (including anonymous)
    final_top_users = final_top_users[:10]

    # 🟢 Safe Avatar Fetching (Retroactive)
    # Fetch latest avatar for each real user via separate efficient queries
    async def fetch_avatar(u_entry):
        if u_entry["is_anonymous"]: 
            return u_entry
            
        try:
            # Search for 1 latest doc with this user_id that has user_avatar
            av_query = {
                "size": 1,
                "sort": [{"@timestamp": {"order": "desc"}}],
                "_source": ["user_avatar"],
                "query": {
                    "bool": {
                        "must": [
                            {"term": {"user_id.keyword": u_entry["name"]}},
                            {"exists": {"field": "user_avatar"}}
                        ]
                    }
                }
            }
            av_resp = await opensearch_client.search(index="ai_chat_logs", body=av_query)
            if av_resp["hits"]["hits"]:
                url = av_resp["hits"]["hits"][0]["_source"].get("user_avatar")
                if url:
                    u_entry["avatar_url"] = url
        except Exception as e:
            print(f"Avatar fetch failed for {u_entry['name']}: {e}")
        return u_entry

    # Run avatar fetches - DISABLED for performance
    # for u in final_top_users:
    #    await fetch_avatar(u)

    
    # Top Models
    top_models = [
        {"name": b["key"], "count": b["doc_count"]}
        for b in aggs["top_models"]["buckets"]
    ]

    return {
        "total_messages": int(total_messages),
        "active_users": int(active_users),
        "sessions": int(sessions),
        "response_time_p50_ms": response_time_p50_ms,
        "response_time_p95_ms": response_time_p95_ms,
        "error_count": int(error_count),
        "error_rate_pct": int(error_rate_pct),
        "top_users": final_top_users,
        "top_models": top_models,
        "anonymous_messages": int(anonymous_msg_count),
        "anonymous_rate_pct": int(anonymous_rate_pct)
    }


@app.get("/api/dashboard/timeseries")
async def dashboard_timeseries(
    time_range: str = Query("24h", regex="^(24h|7d|30d)$")
):
    try:
        # Auto-reconnect if needed
        await get_opensearch_or_raise()
    except HTTPException:
        return {
            "messages_over_time": [],
            "response_time_over_time": [],
            "errors_over_time": []
        }

    interval = "1h"
    if time_range == "24h":
        interval = "1h"
    elif time_range == "7d":
        interval = "1d"
    else:
        interval = "1d"

    # Use OpenSearch Date Math and fixed interval
    query_body = {
        "size": 0,
        "query": {
            "bool": {
                "must": [
                    {"range": {"@timestamp": {"gte": f"now-{time_range}", "lte": "now"}}}
                ]
            }
        },
        "aggs": {
            "timeline": {
                "date_histogram": {
                    "field": "@timestamp",
                    "fixed_interval": interval,
                    "min_doc_count": 0,
                    "extended_bounds": {"min": f"now-{time_range}", "max": "now"},
                    "time_zone": "+07:00"
                },
                "aggs": {
                    "response_time_stats": {
                        "percentiles": {
                            "field": "response_time_ms",
                            "percents": [50, 95]
                        }
                    },
                    "errors": {"filter": {"term": {"status.keyword": "error"}}},
                    "anonymous_split": {"terms": {"field": "is_anonymous", "size": 2}},
                    "active_users": {"cardinality": {"field": "user_id.keyword"}}
                }
            }
        }
    }

    try:
        resp = await opensearch_client.search(index="ai_chat_logs", body=query_body)
    except Exception as e:
        print(f"Timeseries Query Error: {e}")
        return {
            "messages_over_time": [],
            "response_time_over_time": [],
            "errors_over_time": []
        }

    buckets = resp["aggregations"]["timeline"]["buckets"]

    # Initialize 0-23 buckets
    hours_data = {h: {"count": 0, "anonymous": 0, "authenticated": 0, "active_users": 0, "p50_sum": 0, "p50_count": 0, "p95_sum": 0, "p95_count": 0, "status_errors": 0} for h in range(24)}

    from datetime import datetime
    
    for b in buckets:
        ts_str = b["key_as_string"]
        # Parse ISO string to get hour. OpenSearch returns ISO8601 usually.
        # Assuming format like '2025-12-30T10:00:00.000Z' or similar.
        # Simplest way: extract T and :
        try:
            # Handle standard ISO format
            dt = datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
            # Adjust to local time if needed? The user seems to be in +07:00. 
            # Ideally backend respects server time or passes UTC. 
            # For now, let's just use the hour from the timestamp provided by OS (usually UTC).
            # If we want local hour, we need to adjust. 
            # Let's assume the Dashboard is displaying server time or browser time.
            # Ideally we pass 'hour' to frontend and frontend formats it?
            # But here we are aggregating. We must aggregate by LOCAL hour to be meaningful visually?
            # Or just aggregate by UTC hour and frontend shifts?
            # Frontend shifting 0-23 buckets is hard if we sum them up.
            # Let's simple-parse the hour from the string.
            hour = dt.hour 
            
            # Simple aggregation (Summing for now - useful for density map)
            hours_data[hour]["count"] += int(b["doc_count"])
            hours_data[hour]["active_users"] += int(b.get("active_users", {}).get("value", 0))
            hours_data[hour]["status_errors"] += int(b["errors"]["doc_count"])
            
            # Anonymous split
            anon_buckets = b["anonymous_split"]["buckets"]
            for ab in anon_buckets:
                is_anon = str(ab["key"]).lower() == "true" or ab["key"] == 1
                if is_anon:
                    hours_data[hour]["anonymous"] += int(ab["doc_count"])
                else:
                    hours_data[hour]["authenticated"] += int(ab["doc_count"])

        except Exception as e:
            print(f"Error parsing timestamp {ts_str}: {e}")
            continue

    # Flatten correctly
    messages_data = []
    # logic to reconstruct list
    for h in range(24):
        d = hours_data[h]
        messages_data.append({
            "timestamp": f"{h:02d}:00", # Use generic hour label
            "hour_index": h,
            "count": d["count"],
            "anonymous": d["anonymous"],
            "authenticated": d["authenticated"],
            "active_users": d["active_users"]
        })

    # Response time stats are harder to average from percentiles (mathematically wrong), 
    # but for "Trends" broadly, we can just return the raw buckets or skip latency aggregation for this view 
    # since user asked for Activity charts.
    # The frontend still expects 'response_time_over_time' for types, but we are removing the Latency chart.
    # We'll return dummy/empty for response_time to satisfy contract or just raw data.
    # Actually, we should keep 'response_time_over_time' roughly working or empty if unused.
    response_time_data = []

    return {
        "messages_over_time": messages_data,
        "response_time_over_time": [], # Not used in new charts
        "errors_over_time": [] # Not used in new charts
    }


# ==============================
# User Dashboard Endpoints & Simulation
# ==============================

ADMIN_EMAILS = ["admin@example.com", "debug@example.com", "root@localhost"]

class LoginRequest(BaseModel):
    email: str

@app.post("/api/auth/login")
async def login(req: LoginRequest):
    """
    Simulated login.
    If email in ADMIN_EMAILS -> role=admin
    Else -> role=user
    """
    role = "admin" if req.email in ADMIN_EMAILS else "user"
    # In a real app, we'd issue a JWT. Here we just return the identity.
    return {
        "user_id": req.email,
        "role": role,
        "token": "simulated-token"
    }

@app.get("/api/user/summary")
async def user_dashboard_summary(
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
    time_range: str = Query("24h", regex="^(24h|7d|30d)$")
):
    # STUBBED: Returning empty summary to prevent errors
    return {
        "total_messages": 0,
        "sessions": 0,
        "response_time_p50_ms": 0,
        "error_count": 0,
        "user_id": x_user_id
    }

@app.get("/api/user/activity")
async def user_activity(
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
    limit: int = 10
):
    # STUBBED: Returning empty activity list to prevent errors
    return []


# ==============================
# Token Usage Statistics API
# ==============================

# ==============================
# Dashboard Summary & Timeseries API
# ==============================

@app.get("/api/dashboard/summary")
async def dashboard_summary(
    time_range: str = Query("24h", regex="^(24h|7d|30d)$")
):
    """Get dashboard summary metrics"""
    # STUB: Return safe defaults for now to fix connection error
    return {
        "total_messages": 0,
        "active_users": 0,
        "sessions": 0,
        "response_time_p50_ms": 0,
        "response_time_p95_ms": 0,
        "error_count": 0,
        "error_rate_pct": 0,
        "top_users": [],
        "top_models": [],
        "anonymous_messages": 0,
        "anonymous_rate_pct": 0
    }

@app.get("/api/dashboard/timeseries")
async def dashboard_timeseries(
    time_range: str = Query("24h", regex="^(24h|7d|30d)$")
):
    """Get dashboard timeseries data"""
    # STUB: Return safe defaults
    return {
        "messages_over_time": [],
        "response_time_over_time": [],
        "errors_over_time": []
    }

@app.get("/api/dashboard/token-usage")
async def dashboard_token_usage(
    time_range: str = Query("24h", regex="^(24h|7d|30d)$")
):
    """Get token usage statistics"""
    try:
        await get_opensearch_or_raise()
    except HTTPException:
        return {
            "total_tokens": 0,
            "total_prompt_tokens": 0,
            "total_completion_tokens": 0,
            "total_cost": 0.0,
            "avg_tokens_per_request": 0.0,
            "total_requests": 0,
            "tokens_by_model": [],
            "tokens_by_provider": []
        }
    
    # Calculate time range
    if time_range == "24h":
        gte = "now-24h"
    elif time_range == "7d":
        gte = "now-7d"
    else:
        gte = "now-30d"
    
    query_body = {
        "size": 0,
        "query": {
            "bool": {
                "must": [
                    {"range": {"timestamp": {"gte": gte, "lte": "now"}}}
                ]
            }
        },
        "aggs": {
            "total_tokens": {"sum": {"field": "total_tokens"}},
            "total_prompt_tokens": {"sum": {"field": "prompt_tokens"}},
            "total_completion_tokens": {"sum": {"field": "completion_tokens"}},
            "total_cost": {"sum": {"field": "cost"}},
            "avg_tokens_per_request": {"avg": {"field": "total_tokens"}},
            "total_requests": {"value_count": {"field": "_id"}},
            "tokens_by_model": {
                "terms": {"field": "model", "size": 10},
                "aggs": {
                    "total_tokens": {"sum": {"field": "total_tokens"}},
                    "avg_tokens": {"avg": {"field": "total_tokens"}}
                }
            },
            "tokens_by_provider": {
                "terms": {"field": "provider", "size": 10},
                "aggs": {
                    "total_tokens": {"sum": {"field": "total_tokens"}}
                }
            }
        }
    }
    
    try:
        response = await opensearch_client.search(index="token_usage", body=query_body)
        aggs = response["aggregations"]
        
        return {
            "total_tokens": int(aggs["total_tokens"]["value"] or 0),
            "total_prompt_tokens": int(aggs["total_prompt_tokens"]["value"] or 0),
            "total_completion_tokens": int(aggs["total_completion_tokens"]["value"] or 0),
            "total_cost": round(aggs["total_cost"]["value"] or 0, 4),
            "avg_tokens_per_request": round(aggs["avg_tokens_per_request"]["value"] or 0, 1),
            "total_requests": aggs["total_requests"]["value"],
            "tokens_by_model": [
                {
                    "model": b["key"],
                    "total_tokens": int(b["total_tokens"]["value"]),
                    "avg_tokens": round(b["avg_tokens"]["value"], 1),
                    "requests": b["doc_count"]
                }
                for b in aggs["tokens_by_model"]["buckets"]
            ],
            "tokens_by_provider": [
                {
                    "provider": b["key"],
                    "total_tokens": int(b["total_tokens"]["value"]),
                    "requests": b["doc_count"]
                }
                for b in aggs["tokens_by_provider"]["buckets"]
            ]
        }
    except Exception as e:
        print(f"Error fetching token usage: {e}")
        return {
            "total_tokens": 0,
            "total_prompt_tokens": 0,
            "total_completion_tokens": 0,
            "total_cost": 0.0,
            "avg_tokens_per_request": 0.0,
            "total_requests": 0,
            "tokens_by_model": [],
            "tokens_by_provider": []
        }


# ==============================
# 8) AI Insights API
# ==============================

@app.get("/api/dashboard/insights")
async def admin_insights():
    try:
        await get_opensearch_or_raise()
    except HTTPException:
        # Return empty insights structure
        return {
            "total_messages_today": 0,
            "total_messages_yesterday": 0,
            "unique_users_today": 0,
            "unique_users_yesterday": 0,
            "avg_latency_today_ms": 0,
            "avg_latency_yesterday_ms": 0,
            "msg_change_pct": 0,
            "user_change_pct": 0,
            "peak_hour_today": "N/A",
            "peak_hour_users": 0,
            "peak_hour_messages": 0,
            "latency_anomaly": False,
            "latency_insight_text": "System offline",
            "usage_insight_text": "No data available",
            "peak_insight_text": "No data available",
            "badges": {"usage": "gray", "latency": "gray", "peak": "gray"}
        }

    # Timezone +07:00
    tz_offset = timezone(timedelta(hours=7))
    now = datetime.now(tz_offset)
    
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)
    yesterday_end = today_start

    # Helper for building query
    def build_stats_query(start_dt, end_dt, include_histogram=False):
        body = {
            "size": 0,
            "query": {
                "bool": {
                    "must": [
                        {"range": {"@timestamp": {"gte": start_dt.isoformat(), "lt": end_dt.isoformat()}}}
                    ]
                }
            },
            "aggs": {
                "total_messages": {"value_count": {"field": "_id"}},
                "active_users": {
                    "filter": {
                        "bool": {
                            "must_not": [{"term": {"is_anonymous": True}}]
                        }
                    },
                    "aggs": {
                        "count": {"cardinality": {"field": "user_id.keyword"}}
                    }
                },
                "avg_latency": {"avg": {"field": "response_time_ms"}}
            }
        }
        if include_histogram:
            body["aggs"]["timeline"] = {
                "date_histogram": {
                    "field": "@timestamp",
                    "fixed_interval": "1h",
                    "time_zone": "+07:00"
                },
                "aggs": {
                    "hourly_users": {"cardinality": {"field": "user_id.keyword"}},
                    "hourly_msgs": {"value_count": {"field": "_id"}}
                }
            }
        return body

    try:
        # Run queries in parallel
        t_query = build_stats_query(today_start, now, include_histogram=True)
        y_query = build_stats_query(yesterday_start, yesterday_end)

        queries = [
            opensearch_client.search(index="ai_chat_logs", body=t_query),
            opensearch_client.search(index="ai_chat_logs", body=y_query)
        ]
        
        results = await asyncio.gather(*queries)
        t_resp, y_resp = results

        # Parse Today
        t_aggs = t_resp["aggregations"]
        t_msgs = t_aggs["total_messages"]["value"]
        t_users = t_aggs["active_users"]["count"]["value"]
        t_lat = t_aggs["avg_latency"]["value"] or 0.0
        
        # Parse Yesterday
        y_aggs = y_resp["aggregations"]
        y_msgs = y_aggs["total_messages"]["value"]
        y_users = y_aggs["active_users"]["count"]["value"]
        y_lat = y_aggs["avg_latency"]["value"] or 0.0

        # Calculate % Changes
        def calc_pct(curr, prev):
            if prev == 0:
                return 100.0 if curr > 0 else 0.0
            return ((curr - prev) / prev) * 100.0

        msg_change = calc_pct(t_msgs, y_msgs)
        user_change = calc_pct(t_users, y_users)
        # Latency change not strictly asked as pct for return, but for anomaly logic
        
        # Peak Hour Logic
        peak_hour_str = "N/A"
        peak_users = 0
        peak_msgs = 0
        
        if "timeline" in t_aggs:
            buckets = t_aggs["timeline"]["buckets"]
            max_users = -1
            best_bucket = None
            
            for b in buckets:
                u_count = b["hourly_users"]["value"]
                if u_count > max_users:
                    max_users = u_count
                    best_bucket = b
            
            if best_bucket:
                # Format key_as_string or key based on timezone
                # key_as_string e.g. "2026-01-16T10:00:00.000+07:00"
                ts_str = best_bucket.get("key_as_string", "")
                try:
                    # Fix: Handle ISO format correctly, removing Z if present to avoid confusion if +07:00 is not standard
                    ts_clean = ts_str.replace("Z", "+00:00") 
                    p_dt = datetime.fromisoformat(ts_clean)
                    peak_hour_str = f"{p_dt.hour:02d}:00"
                except:
                    peak_hour_str = ts_str
                
                peak_users = max_users
                peak_msgs = best_bucket["hourly_msgs"]["value"]

        # Generate Insights Text & Logic
        usage_text = ""
        usage_badge = "gray"
        
        # 1. Usage Logic
        if t_msgs == 0:
            usage_badge = "gray"
            usage_text = "No activity recorded yet today."
        else:
            if msg_change > 0:
                usage_badge = "green"
                usage_text = f"Total message volume has increased by {abs(int(msg_change))}% today compared to yesterday."
            elif msg_change < 0:
                usage_badge = "red"
                usage_text = f"Total message volume has decreased by {abs(int(msg_change))}% today compared to yesterday."
            else:
                usage_badge = "gray"
                usage_text = "Message volume is stable compared to yesterday."

        # 2. Peak Hour Logic
        peak_text = ""
        peak_badge = "gray"
        if peak_hour_str == "N/A" or peak_users == 0:
             peak_hour_str = "No Peak Data"
             peak_text = "No usage data available to determine peak hours today."
             peak_badge = "gray"
        else:
             peak_badge = "gray"
             peak_text = f"Highest activity observed at {peak_hour_str} with {peak_users} concurrent active users."

        # 3. Latency Logic
        is_anomaly = False
        anomaly_text = "Latency is stable."
        latency_badge = "gray"

        if t_lat == 0:
            latency_badge = "gray"
            anomaly_text = "No latency data available yet"
        elif t_lat > y_lat:
            diff_ms = t_lat - y_lat
            pct_inc = calc_pct(t_lat, y_lat)
            
            if pct_inc >= 20 and diff_ms >= 500:
                is_anomaly = True
                latency_badge = "red"
                anomaly_text = f"Latency increased by {int(pct_inc)}% (+{int(diff_ms)}ms) vs yesterday (Anomaly Detected)."
            else:
                latency_badge = "gray" 
                anomaly_text = f"Latency increased slightly by {int(diff_ms)}ms."
        elif t_lat < y_lat:
             latency_badge = "green"
             anomaly_text = "Latency improved compared to yesterday."
        else:
             latency_badge = "gray"
             anomaly_text = "Latency is stable."

        # Badges Dictionary
        badges = {
            "usage": usage_badge,
            "latency": latency_badge,
            "peak": peak_badge
        }
             


        return {
            "total_messages_today": int(t_msgs),
            "total_messages_yesterday": int(y_msgs),
            "unique_users_today": int(t_users),
            "unique_users_yesterday": int(y_users),
            "avg_latency_today_ms": round(t_lat, 2),
            "avg_latency_yesterday_ms": round(y_lat, 2),
            "msg_change_pct": round(msg_change, 1),
            "user_change_pct": round(user_change, 1),
            "peak_hour_today": peak_hour_str,
            "peak_hour_users": int(peak_users),
            "peak_hour_messages": int(peak_msgs),
            "latency_anomaly": is_anomaly,
            "latency_insight_text": anomaly_text,
            "usage_insight_text": usage_text,
            "peak_insight_text": peak_text,
            "badges": badges
        }

    except Exception as e:
        print(f"Insights Error: {e}")
        return {
            "total_messages_today": 0,
            "total_messages_yesterday": 0,
            "unique_users_today": 0,
            "unique_users_yesterday": 0,
            "avg_latency_today_ms": 0,
            "avg_latency_yesterday_ms": 0,
            "msg_change_pct": 0,
            "user_change_pct": 0,
            "peak_hour_today": "N/A",
            "peak_hour_users": 0,
            "peak_hour_messages": 0,
            "latency_anomaly": False,
            "latency_insight_text": "System offline",
            "usage_insight_text": "No data available",
            "peak_insight_text": "No data available",
            "badges": {"usage": "gray", "latency": "gray", "peak": "gray"}
        }

# ==============================
# Uvicorn entrypoint
# ==============================

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)
