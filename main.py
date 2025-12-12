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
            # Optional: Check connection
            # info = await opensearch_client.info()
            # print(f"Connected to OpenSearch: {info['version']['number']}")
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
    """
    Helper function to index (upsert) chat summary to OpenSearch.
    Does not raise exception on failure, just logs error.
    """
    if not opensearch_client:
        print("Skipping OpenSearch indexing: Client not initialized.")
        return

    try:
        index_name = doc.get("index", "chat_summaries")
        doc_id = doc.get("id")
        body = doc.get("body")

        if not body:
            print("Skipping OpenSearch indexing: 'body' is missing in opensearch_doc")
            return

        # Perform Indexing
        response = await opensearch_client.index(
            index=index_name,
            id=doc_id,  # Can be None, OS will generate ID
            body=body,
            refresh=True  # Make it searchable immediately
        )
        print(f"Indexed chat summary to OpenSearch. ID: {response.get('_id')}, Result: {response.get('result')}")

    except Exception as e:
        print(f"Error indexing chat summary to OpenSearch: {str(e)}")


async def get_chat_summary(chat_id: str) -> Optional[str]:
    """
    Retrieve existing summary for a chat_id from OpenSearch.
    """
    if not opensearch_client:
        return None
    try:
        # Check if document exists
        exists = await opensearch_client.exists(index="chat_summaries", id=chat_id)
        if exists:
            response = await opensearch_client.get(index="chat_summaries", id=chat_id)
            if response and "_source" in response:
                return response["_source"].get("summary")
    except Exception as e:
        print(f"Error fetching summary for {chat_id}: {e}")
    return None


@app.get("/")
async def root():
    return {
        "message": "OG Extractor & Chat API is running",
        "endpoints": ["/extract", "/chat", "/docs", "/ui", "/image", "/summary", "/chat/summary"]
    }





    return None


async def quick_update_opensearch(chat_id: str, user_email: Optional[str], message_count: int):
    """
    Lightweight update to OpenSearch (timestamp & count only) without invoking LLM.
    Prevents Rate Limit exhaustion from background tasks.
    """
    if not opensearch_client:
        return

    try:
        body = {
            "doc": {
                "last_message_at": datetime.utcnow().isoformat(),
                "message_count": message_count,
            },
            "doc_as_upsert": True
        }
        if user_email:
            body["doc"]["user_email"] = user_email

        await opensearch_client.update(
            index="chat_summaries",
            id=chat_id,
            body=body
        )
        # print(f"Quick updated chat {chat_id}")
    except Exception as e:
        # Ignore "document missing" if strict update, but doc_as_upsert handles creation
        print(f"Quick update OS failed: {e}")


async def search_user_memory(user_email: str) -> Optional[str]:
    """
    Search for the latest chat summary for a specific user to use as long-term memory.
    """
    if not opensearch_client or not user_email:
        return None
    
    try:
        # Search for the most recent summary for this user
        query = {
            "size": 1,
            "sort": [{"last_message_at": {"order": "desc"}}],
            "query": {
                "term": {
                    "user_email.keyword": user_email
                }
            }
        }
        
        response = await opensearch_client.search(
            body=query,
            index="chat_summaries"
        )
        
        hits = response.get("hits", {}).get("hits", [])
        if hits:
            source = hits[0]["_source"]
            summary = source.get("summary")
            # You might want to include the title or date for better context
            timestamp = source.get("last_message_at", "")[:10]
            if summary:
                return f"[From previous chat on {timestamp}]: {summary}"
                
    except Exception as e:
        # Index might not exist yet or mapping issue
        print(f"Error searching user memory: {e}")
        
    return None


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
# 4) Translation API
# ==============================

async def _translate_logic(text: str, api_key: str) -> Tuple[str, List[str]]:
    """
    พยายามแปลข้อความ Thai -> English สำหรับ image prompt
    โดยลองหลายโมเดลต่อกัน ถ้าตัวแรก ๆ โดน rate-limit ก็จะลองตัวถัดไป
    ถ้าทุกตัวพังหมด จะคืนข้อความเดิม + debug errors
    """
    models = [
        "google/gemma-3-27b-it:free",
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
                                "Your job:\n"
                                "- Input: Thai text describing an image.\n"
                                "- Output: a SHORT English prompt that can be sent directly to an image generation model.\n"
                                "- Output MUST be in English ONLY. No Thai, no explanations, no extra sentences.\n"
                                "- Do NOT add quotes around the text.\n"
                                "- Do NOT say things like \"Here is your prompt\" or \"The translation is\".\n"
                                "- Just output the prompt text itself.\n\n"
                                "Style rules:\n"
                                "- Keep it concise but descriptive enough for an image (5–20 words).\n"
                                "- If the Thai input is only one word (e.g., \"กระต่าย\"), output 1–3 English words (e.g., \"rabbit\", \"cute white rabbit\").\n"
                                "- You may add 1–2 visual adjectives if they make sense, but NEVER change the main subject.\n\n"
                                "If you break any of these rules, the system will not work.\n\n"
                                "Examples:\n\n"
                                "Thai: กระต่าย\n"
                                "English: rabbit\n\n"
                                "Thai: กระต่ายน่ารัก\n"
                                "English: cute rabbit\n\n"
                                "Thai: กระต่ายน่ารักบนดวงจันทร์\n"
                                "English: cute rabbit sitting on the moon, night sky, stars\n\n"
                                "Thai: ทะเลช่วงพระอาทิตย์ตก\n"
                                "English: sunset over the sea, warm colors, calm waves"
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
                        "X-Title": "FastAPI Chat",
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
# 5) Chat API
# ==============================

class ChatRequest(BaseModel):
    message: str
    model: Optional[str] = "google/gemma-3-27b-it:free"
    history: Optional[List[Dict[str, Any]]] = None
    image_config: Optional[Dict[str, Any]] = None
    chat_id: Optional[str] = None
    user_email: Optional[str] = None


@app.post("/chat")
async def chat_with_ai(
    request: ChatRequest,
    background_tasks: BackgroundTasks,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    api_key = resolve_openrouter_key(creds)

    # /translate shortcut command
    if request.message.strip().startswith("/translate"):
        text_to_translate = request.message.strip()[10:].strip()
        if not text_to_translate:
            return {
                "success": True,
                "data": {
                    "message": "Please provide text to translate. Usage: /translate [Thai text]",
                    "images": [],
                    "model": "system",
                },
            }

        try:
            translated_text, _ = await _translate_logic(text_to_translate, api_key)
            return {
                "success": True,
                "data": {
                    "message": translated_text,
                    "images": [],
                    "model": "google/gemma-3-27b-it:free",
                },
            }
        except Exception as e:
            return {
                "success": False,
                "data": {
                    "message": f"Translation error: {str(e)}",
                    "images": [],
                    "model": "error",
                },
            }

    messages = request.history or []

    system_prompt = {
        "role": "system",
        "content": (
            "You are ABDUL, a helpful AI assistant. "
            "You must remember the context of the conversation, "
            "including the user's name and previous messages. "
            "Always answer in Thai unless asked otherwise. "
            "STRICTLY FORBIDDEN: Do NOT provide Romanized Thai (Karaoke/Transliteration) in parentheses or otherwise. "
            "Write ONLY in standard Thai script. "
            "Example Error: 'Sawasdee (Hello)' -> CORRECT: 'สวัสดี'"
        ),
    }

    if not messages or messages[0].get("role") != "system":
        messages.insert(0, system_prompt)

    # 🟢 CHECK FOR EXISTING SUMMARY (Long-term Memory)
    memory_context = ""
    
    # Priority 1: Specific Chat Summary (Resume session)
    if request.chat_id:
        chat_summary = await get_chat_summary(request.chat_id)
        if chat_summary:
            memory_context += f"Current Chat Summary: {chat_summary}\n"

    # Priority 2: User Level Memory (Context from other chats)
    if request.user_email and not memory_context:
        # Only fetch user memory if we don't have a specific chat summary 
        # (or you can combine them)
        user_memory = await search_user_memory(request.user_email)
        if user_memory:
            memory_context += f"User's Previous Context: {user_memory}\n"

    if memory_context:
        print(f"Injecting Memory: {memory_context[:50]}...")
        summary_prompt = {
            "role": "system",
            "content": (
                "SYSTEM MEMORY:\n"
                f"{memory_context}\n"
                "Use this information to maintain continuity. "
                "Do not explicitly mention 'I read your summary', just know it."
            )
        }
        # Insert after the main system prompt
        messages.insert(1, summary_prompt)

    messages.append({"role": "user", "content": request.message})

    payload: Dict[str, Any] = {
        "model": request.model,
        "messages": messages,
        "stream": False,
    }

    if request.image_config:
        payload["modalities"] = ["image", "text"]
        payload["image_config"] = request.image_config

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
            print("OpenRouter error status:", response.status_code)
            print("OpenRouter error body:", response.text)

            try:
                err_json = response.json()
                if "error" in err_json and "message" in err_json["error"]:
                    msg = err_json["error"]["message"]
                else:
                    msg = response.text
            except Exception:
                msg = response.text

            raise HTTPException(
                status_code=response.status_code,
                detail=f"OpenRouter Error: {msg}",
            )

        data = response.json()

        ai_message = ""
        images: List[str] = []

        if "choices" in data and data["choices"]:
            message_obj = data["choices"][0]["message"]
            ai_message = message_obj.get("content", "")

            if "images" in message_obj:
                for img in message_obj["images"]:
                    if "image_url" in img and "url" in img["image_url"]:
                        images.append(img["image_url"]["url"])



        # 🟢 BACKGROUND TASK: Auto-Index / Summarize Chat
        if request.chat_id:
            # 🟢 LIGHTWEIGHT UPDATE logic
            # Just update the timestamp and count, DON'T call the heavy LLM summarizer
            full_history = messages + [{"role": "assistant", "content": ai_message}]
            background_tasks.add_task(
                quick_update_opensearch,
                chat_id=request.chat_id,
                user_email=request.user_email,
                message_count=len(full_history)
            )
        
        return {
            "success": True,
            "data": {
                "message": ai_message,
                "images": images,
                "model": data.get("model"),
            },
        }

    except HTTPException:
        raise
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Connection error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


# ==============================
# 6) Analyze Chat API (Updated with OpenSearch)
# ==============================

class AnalyzeRequest(BaseModel):
    chat_id: str
    messages: List[Dict[str, Any]]
    user_email: Optional[str] = None


async def _analyze_chat_logic(chat_id: str, messages: List[Dict[str, Any]], api_key: str, user_email: Optional[str] = None):
    """
    เวอร์ชันเบา → ใช้ฟรีได้จริง โดยไม่ชน 429 ง่าย ๆ
    สรุปแชทสำหรับ OpenSearch
    """

    SUMMARY_MODEL = "google/gemma-3-4b-it:free"   # ✔ เบามาก / ✔ ฟรี / ✔ รอด 429 ง่ายมาก
    MAX_MSG = 50                                   # ใช้ล่าสุด 50 ข้อความสำหรับ summary
    MAX_RETRIES = 1                                # ไม่ retry หลายรอบ

    # เก็บเฉพาะข้อความสำคัญ (user/assistant)
    trimmed = []
    for m in messages[-MAX_MSG:]:
        if m.get("role") in ["user", "assistant"]:
            trimmed.append(m)

    # แปลงเป็น text
    conversation_text = ""
    for m in trimmed:
        role = "ผู้ใช้" if m["role"] == "user" else "ผู้ช่วย"
        conversation_text += f"{role}: {m['content']}\n"

    system_prompt = (
        "คุณคือระบบวิเคราะห์แชทภาษาไทย\n"
        "- สรุปเนื้อหาของแชทเป็นภาษาไทย กระชับ ชัดเจน\n"
        "- ตั้งชื่อเรื่อง (title) 5–12 คำ\n"
        "- แตกหัวข้อ (topics) 3–8 คำ\n"
        "- ตอบกลับเป็น JSON เท่านั้น เช่น:\n"
        "{\n"
        "  \"title\": \"...\",\n"
        "  \"summary\": \"...\",\n"
        "  \"topics\": [\"...\", \"...\"],\n"
        "  \"opensearch_doc\": {\n"
        "       \"id\": \"...\",\n"
        "       \"user_email\": \"...\",\n"
        "       \"title\": \"...\",\n"
        "       \"summary\": \"...\",\n"
        "       \"topics\": [\"...\"],\n"
        "       \"message_count\": 10,\n"
        "       \"first_message_at\": \"...\",\n"
        "       \"last_message_at\": \"...\"\n"
        "   }\n"
        "}"
    )

    payload = {
        "model": SUMMARY_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": conversation_text},
        ],
        "response_format": {"type": "json_object"},
        "max_tokens": 800
    }

    # ยิงครั้งเดียวพอ
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload
            )

        if r.status_code != 200:
            return {"success": False, "error": r.text}

        data = r.json()
        content = data["choices"][0]["message"]["content"]

        parsed = json.loads(content)

        # บังคับใส่ข้อมูล essential
        doc = parsed.get("opensearch_doc", {})
        doc["id"] = chat_id
        doc["user_email"] = user_email
        doc["message_count"] = len(messages)
        doc["first_message_at"] = datetime.utcnow().isoformat()
        doc["last_message_at"] = datetime.utcnow().isoformat()

        parsed["opensearch_doc"] = doc

        # index
        await index_chat_summary({
            "index": "chat_summaries",
            "id": chat_id,
            "body": doc
        })

        return {"success": True, "data": parsed}

    except Exception as e:
        return {"success": False, "error": str(e)}

# ==============================
# 7) NEW: Simple Summary API (Optimized for FREE MODEL)
# ==============================

class SimpleSummaryRequest(BaseModel):
    chat_id: Optional[str] = None
    messages: List[Dict[str, Any]]


@app.post("/summary")
async def summarize_simple(
    request: SimpleSummaryRequest,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """
    ปุ่มสรุปใน UI → ใช้โมเดลเบาฟรี และสรุปเฉพาะ 30 ข้อความล่าสุด
    ลดโอกาสโดน 429 ลงเยอะมาก
    """
    api_key = resolve_openrouter_key(creds)

    SUMMARY_MODEL = "google/gemma-3-4b-it:free"   # ✔ เบา ✔ ฟรี ✔ เร็ว ✔ รอด 429 มากขึ้น

    # ดึงแค่ 30 ข้อความล่าสุด (ถ้าจะลดอีก ปรับเป็น 20 ก็ได้)
    recent_messages = request.messages[-30:]

    # แปลงข้อความเป็น plain text
    conversation_text = ""
    for msg in recent_messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        role_th = "ผู้ใช้" if role == "user" else "ผู้ช่วย"
        conversation_text += f"{role_th}: {content}\n"

    system_prompt = (
        "คุณเป็นระบบสรุปบทสนทนาภาษาไทยแบบสั้น ๆ.\n"
        "- สรุปเนื้อหาเป็นภาษาไทย 2–4 ประโยค\n"
        "- ห้ามเขียนเกินความจำเป็น ห้ามใส่คำว่า 'สรุป', 'จากบทสนทนา'\n"
        "- ตอบเฉพาะเนื้อหาสรุปเท่านั้น"
    )

    payload = {
        "model": SUMMARY_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": conversation_text},
        ],
        "max_tokens": 300
    }

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://og-extractor-zxkk.onrender.com",
                    "X-Title": "FastAPI Chat Simple Summary",
                },
                json=payload,
            )

        if r.status_code != 200:
            print("Simple summary error:", r.status_code, r.text)
            raise HTTPException(status_code=r.status_code, detail="Summary failed")

        data = r.json()
        summary_text = data["choices"][0]["message"]["content"].strip()
        return {"summary": summary_text}

    except Exception as e:
        print("Simple summary exception:", str(e))
        raise HTTPException(status_code=500, detail=str(e))



# ==============================
# Uvicorn entrypoint
# ==============================

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)
