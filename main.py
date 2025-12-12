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
            # Append AI response to history for the summarizer
            full_history = messages + [{"role": "assistant", "content": ai_message}]
            background_tasks.add_task(
                _analyze_chat_logic,
                chat_id=request.chat_id,
                messages=full_history,
                api_key=api_key,
                user_email=request.user_email
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
    Shared logic to analyze chat, generate summary, and index to OpenSearch.
    """
    model = "google/gemma-3-27b-it:free"

    conversation_text = ""
    first_iso = None
    last_iso = datetime.utcnow().isoformat()

    for i, msg in enumerate(messages):
        role = msg.get("role", "unknown")
        content = msg.get("content", "")
        # Skip system prompts in text generation to save tokens, 
        # usually we only care about user/assistant flow for summary
        if role == "system": 
            continue
        
        # Determine approx timestamp if not present
        if first_iso is None:
            first_iso = last_iso # Fallback
            
        conversation_text += f"{role}: {content}\n"

    system_prompt = (
        "You are a 'Chat Session Analyzer' for a chat application.\n\n"
        "You will receive a chat transcript.\n"
        "Your tasks:\n"
        "1) Read and understand the conversation.\n"
        "2) In THAI, summarize what this chat is about (topics, intent, conclusions).\n"
        "3) Create a short Thai title (5–12 words).\n"
        "4) Generate 3–8 Thai topics (keywords).\n"
        "5) Prepare a JSON object `opensearch_doc` with:\n"
        "   - id: (use provided chat_id)\n"
        "   - user_email: string (or null)\n"
        "   - title: string\n"
        "   - summary: string (The summary text)\n"
        "   - topics: [string]\n"
        "   - message_count: int\n"
        "   - first_message_at: ISO string\n"
        "   - last_message_at: ISO string\n"
        "IMPORTANT RULES:\n"
        "- All text values (title, summary, topics) MUST be in Thai.\n"
        "- Output MUST be valid JSON only.\n"
    )

    user_prompt = f"Chat ID: {chat_id}\nUser Email: {user_email}\n\nTranscript:\n{conversation_text}"

    user_prompt = f"Chat ID: {chat_id}\nUser Email: {user_email}\n\nTranscript:\n{conversation_text}"

    max_retries = 3
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://og-extractor-zxkk.onrender.com",
                        "X-Title": "FastAPI Chat Analyzer",
                    },
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "response_format": {"type": "json_object"}
                    },
                )

                # ⚠️ Handle Rate Limit (429)
                if response.status_code == 429:
                    print(f"Rate limited (429). Retrying {attempt + 1}/{max_retries}...")
                    if attempt < max_retries - 1:
                        await asyncio.sleep(2 * (attempt + 1)) # Backoff: 2s, 4s, 6s
                        continue
                    else:
                         return {"success": False, "error": f"Rate limit exceeded after {max_retries} attempts."}

                if response.status_code != 200:
                    print(f"Analysis failed: {response.text}")
                    return {"success": False, "error": response.text}

                data = response.json()
                if "choices" in data and data["choices"]:
                    content = data["choices"][0]["message"]["content"]
                    
                    try:
                        parsed_data = json.loads(content)
                        
                        # 🟢 FORCE STRUCTURE UPDATE if missing
                        if "opensearch_doc" not in parsed_data:
                            # Fallback heuristic
                            parsed_data["opensearch_doc"] = {
                                "id": chat_id,
                                "user_email": user_email,
                                "title": parsed_data.get("title", "No Title"),
                                "summary": parsed_data.get("summary", ""),
                                "topics": parsed_data.get("topics", []),
                                "message_count": len(messages),
                                "first_message_at": first_iso or last_iso,
                                "last_message_at": last_iso
                            }
                        else:
                            # Ensure fields exist
                            doc = parsed_data["opensearch_doc"]
                            doc["id"] = chat_id
                            doc["user_email"] = user_email
                            doc["message_count"] = len(messages)
                            doc["last_message_at"] = last_iso
                            # Keep existing first_at if possible or use current
                            if "first_message_at" not in doc:
                                doc["first_message_at"] = first_iso or last_iso

                        print(f"Indexing chat {chat_id} to OpenSearch...")
                        
                        final_payload = {
                            "index": "chat_summaries",
                            "id": chat_id,
                            "body": parsed_data["opensearch_doc"]
                        }
                        
                        await index_chat_summary(final_payload)
                        
                        return {"success": True, "data": parsed_data}
                    
                    except json.JSONDecodeError:
                        print("JSON Decode Error in Summary", content)
                        return {"success": False, "error": "JSON Decode Error"}

                # If no choices, fall through to retry? or fail?
                # Usually if 200 OK but no choices, it's weird. Fail.
                return {"success": False, "error": "No content returned"}

        except Exception as e:
            print(f"Analysis error (Attempt {attempt+1}): {str(e)}")
            if attempt < max_retries - 1:
                await asyncio.sleep(2)
                continue
            return {"success": False, "error": str(e)}

    return {"success": False, "error": "Max retries exceeded"}


@app.post("/chat/summary")
async def summarize_chat_session(
    request: AnalyzeRequest,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    api_key = resolve_openrouter_key(creds)
    return await _analyze_chat_logic(request.chat_id, request.messages, api_key, request.user_email)


# ==============================
# 7) NEW: Simple Summary API สำหรับปุ่มสรุปใน UI
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
    ใช้สำหรับปุ่มสรุปในหน้าเว็บ:
    รับ { chat_id, messages } แล้วตอบกลับเป็น { summary: "..." }
    """
    api_key = resolve_openrouter_key(creds)

    # แปลง messages เป็น text ย่อย ๆ
    conversation_text = ""
    for msg in request.messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        role_th = "ผู้ใช้" if role == "user" else "ผู้ช่วย"
        conversation_text += f"{role_th}: {content}\n"

    system_prompt = (
        "คุณเป็นระบบสรุปบทสนทนาภาษาไทยแบบสั้น ๆ.\n"
        "คุณมีความจำดีมาก สามารถจำรายละเอียดของบทสนทนาได้ทั้งหมด\n"
        "- งานของคุณคือ อ่านแชททั้งหมด แล้วสรุปว่าในแชทนี้เขาคุยเรื่องอะไรเป็นหลัก\n"
        "- ให้ตอบเป็นภาษาไทย 2–4 ประโยค สั้น กระชับ แต่ชัดเจน\n"
        "- ห้ามใส่คำอธิบายส่วนเกิน เช่น \"สรุปแล้ว\", \"จากบทสนทนา\" ฯลฯ\n"
        "- ให้ตอบเฉพาะข้อความสรุปอย่างเดียวเท่านั้น"
    )

    payload = {
        "model": "google/gemma-3-27b-it:free",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": conversation_text},
        ],
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
        if "choices" in data and data["choices"]:
            summary_text = data["choices"][0]["message"]["content"].strip()
            return {"summary": summary_text}

        raise HTTPException(status_code=500, detail="No summary returned")

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
