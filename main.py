from fastapi import FastAPI, HTTPException, Depends, Response
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

# ==============================
# FastAPI setup
# ==============================

app = FastAPI()
security = HTTPBearer(auto_error=False)

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


@app.get("/")
async def root():
    return {
        "message": "OG Extractor & Chat API is running",
        "endpoints": ["/extract", "/chat", "/docs", "/ui", "/image"]
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
# 4) Translation API
# ==============================

async def _translate_logic(text: str, api_key: str) -> Tuple[str, List[str]]:
    """
    พยายามแปลข้อความ Thai -> English สำหรับ image prompt
    โดยลองหลายโมเดลต่อกัน ถ้าตัวแรก ๆ โดน rate-limit ก็จะลองตัวถัดไป
    ถ้าทุกตัวพังหมด จะคืนข้อความเดิม + debug errors
    """
    # เรียงลำดับโมเดลตัวฟรีที่ค่อนข้างเสถียรไว้ก่อน
    models = [
        "google/gemma-3-27b-it:free",
        "mistralai/mistral-7b-instruct:free",
        "openchat/openchat-7b:free",
        # ค่อยลอง Llama ทีหลัง เพราะช่วงนี้ชอบโดน rate-limit
        "meta-llama/llama-3.2-3b-instruct:free",
    ]

    errors: List[str] = []

    # ถ้าข้อความว่างเปล่า ไม่ต้องไปยิง API
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
                        # กันเคสที่โมเดลตอบว่างเปล่า
                        if content:
                            return content, errors

                # ถ้า status != 200 เก็บเป็น debug ไว้
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

    # ถ้าทุกโมเดลพังหมด → ส่งข้อความเดิมกลับไป พร้อม debug
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

# ==============================
# 5) Chat API
# ==============================

class ChatRequest(BaseModel):
    message: str
    model: Optional[str] = "meta-llama/llama-3.2-3b-instruct:free"
    history: Optional[List[Dict[str, Any]]] = None
    image_config: Optional[Dict[str, Any]] = None


@app.post("/chat")
async def chat_with_ai(
    request: ChatRequest,
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
                    "model": "meta-llama/llama-3.2-3b-instruct:free",
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

    # ===== เตรียม messages =====
    messages = request.history or []

    system_prompt = {
        "role": "system",
        "content": (
            "You are ABDUL, a helpful AI assistant. "
            "You must remember the context of the conversation, "
            "including the user's name and previous messages. "
            "Always answer in Thai unless asked otherwise. "
            "DO NOT transliterate Thai to English (Karaoke) or provide English translations "
            "unless explicitly asked. Just answer naturally in Thai."
        ),
    }

    if not messages or messages[0].get("role") != "system":
        messages.insert(0, system_prompt)

    messages.append({"role": "user", "content": request.message})

    # ===== สร้าง payload แบบไม่บังคับ image =====
    payload: Dict[str, Any] = {
        "model": request.model,
        "messages": messages,
        "stream": False,
    }

    # ถ้ามี image_config ค่อยใส่ field สำหรับ multimodal
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

        # ===== เช็ค error จาก OpenRouter / provider =====
        if response.status_code != 200:
            # debug log ไว้ดูใน console ของ server
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

        # ===== แปลงผลลัพธ์ปกติ =====
        data = response.json()

        ai_message = ""
        images: List[str] = []

        if "choices" in data and data["choices"]:
            message_obj = data["choices"][0]["message"]
            ai_message = message_obj.get("content", "")

            # รองรับข้อความที่มี images (ถ้ามี)
            if "images" in message_obj:
                for img in message_obj["images"]:
                    if "image_url" in img and "url" in img["image_url"]:
                        images.append(img["image_url"]["url"])

        return {
            "success": True,
            "data": {
                "message": ai_message,
                "images": images,
                "model": data.get("model"),
            },
        }

    except HTTPException:
        # ถ้าเรา raise HTTPException ข้างบนแล้ว ก็โยนต่อเฉย ๆ
        raise
    except httpx.RequestError as e:
        # ปัญหา network ระหว่างเซิร์ฟเวอร์เรากับ OpenRouter
        raise HTTPException(status_code=500, detail=f"Connection error: {str(e)}")
    except Exception as e:
        # ปัญหาอื่น ๆ ในโค้ดฝั่งเราเอง
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


# ==============================
# 6) Analyze Chat API
# ==============================

class AnalyzeRequest(BaseModel):
    chat_id: str
    messages: List[Dict[str, Any]]


@app.post("/chat/summary")
async def summarize_chat_session(
    request: AnalyzeRequest,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    api_key = resolve_openrouter_key(creds)

    # Use a smart model for analysis
    model = "google/gemini-2.0-flash-exp:free"

    # Convert messages to a string representation for the prompt
    conversation_text = ""
    for msg in request.messages:
        role = msg.get("role", "unknown")
        content = msg.get("content", "")
        # Timestamp might be in the message or not, handle safely
        timestamp = msg.get("timestamp", "N/A")
        conversation_text += f"[{timestamp}] {role}: {content}\n"

    system_prompt = (
        "You are a 'Chat Session Analyzer' for a chat application.\n\n"
        "You will receive ONE chat session in JSON format with:\n"
        "- chat_id: string\n"
        "- messages: an array of objects { \"role\": \"user\" | \"assistant\", \"content\": string, \"timestamp\": string }\n\n"
        "Your tasks:\n\n"
        "1) Read and understand the entire conversation.\n"
        "2) In THAI, summarize what this chat is mainly about:\n"
        "   - What topics are being discussed?\n"
        "   - What is the main purpose or intent of the user?\n"
        "   - What are the key actions, decisions, or conclusions?\n\n"
        "3) Create a short Thai title for this chat (5–12 words).\n"
        "4) Generate 3–8 short \"topics\" (tags/keywords) in THAI, each 1–4 words, e.g.\n"
        "   [\"สภาพอากาศ\", \"สรุปงาน\", \"เตรียมสอบ OS\"].\n"
        "5) Prepare a JSON object that can be saved to OpenSearch for this chat.\n\n"
        "IMPORTANT RULES:\n"
        "- All human-readable text (title, summary, topics) MUST be in Thai.\n"
        "- Be concise but clear.\n"
        "- Do NOT include any personal data that is not already in the chat.\n"
        "- Output MUST be valid JSON only. No explanation text outside JSON. No markdown.\n\n"
        "OUTPUT FORMAT (very important):\n\n"
        "{\n"
        "  \"chat_id\": \"<same as input chat_id>\",\n"
        "  \"title\": \"<short Thai title of this chat>\",\n"
        "  \"summary\": \"<Thai summary (3–6 bullet-style sentences, but as one string, you may use \\n for new lines)>\",\n"
        "  \"topics\": [\"...\", \"...\", \"...\"],\n"
        "  \"opensearch_doc\": {\n"
        "    \"index\": \"chat_summaries\",\n"
        "    \"id\": \"<chat_id>\",\n"
        "    \"body\": {\n"
        "      \"chat_id\": \"<chat_id>\",\n"
        "      \"title\": \"<same as above>\",\n"
        "      \"summary\": \"<same as above>\",\n"
        "      \"topics\": [\"...\", \"...\", \"...\"],\n"
        "      \"message_count\": <number of messages in this chat>,\n"
        "      \"first_message_at\": \"<ISO8601 timestamp of first message>\",\n"
        "      \"last_message_at\": \"<ISO8601 timestamp of last message>\"\n"
        "    }\n"
        "  }\n"
        "}\n\n"
        "If some timestamps are missing, you may leave first_message_at and last_message_at as null.\n"
        "Always make sure the JSON is syntactically valid.\n\n"
        "ONE-SHOT EXAMPLE:\n"
        "Input Chat ID: chat_2025_12_11_001\n"
        "Input Messages:\n"
        "[2025-12-11T04:20:00Z] user: สภาพอากาศพรุ่งนี้จะเป็นยังไง\n"
        "[2025-12-11T04:20:05Z] assistant: สวัสดีค่ะ ... ถ้าบอกตำแหน่งได้จะเช็กให้ค่ะ\n"
        "[2025-12-11T04:21:00Z] user: ปทุมธานี\n\n"
        "Output JSON:\n"
        "{\n"
        "  \"chat_id\": \"chat_2025_12_11_001\",\n"
        "  \"title\": \"ถามสภาพอากาศพรุ่งนี้ที่ปทุมธานี\",\n"
        "  \"summary\": \"ผู้ใช้ถามเกี่ยวกับสภาพอากาศในวันพรุ่งนี้\\nระบุสถานที่เป็นจังหวัดปทุมธานี\\nผู้ช่วยอธิบายแนวโน้มอากาศว่าอากาศร้อนถึงร้อนจัดและมีโอกาสฝนบางส่วน\\nมีการแนะนำให้ระวังแดดจัดและดื่มน้ำมาก ๆ\",\n"
        "  \"topics\": [\"สภาพอากาศ\", \"พยากรณ์อากาศ\", \"ปทุมธานี\", \"อากาศร้อน\"],\n"
        "  \"opensearch_doc\": {\n"
        "    \"index\": \"chat_summaries\",\n"
        "    \"id\": \"chat_2025_12_11_001\",\n"
        "    \"body\": {\n"
        "      \"chat_id\": \"chat_2025_12_11_001\",\n"
        "      \"title\": \"ถามสภาพอากาศพรุ่งนี้ที่ปทุมธานี\",\n"
        "      \"summary\": \"ผู้ใช้ถามเกี่ยวกับสภาพอากาศในวันพรุ่งนี้\\nระบุสถานที่เป็นจังหวัดปทุมธานี\\nผู้ช่วยอธิบายแนวโน้มอากาศว่าอากาศร้อนถึงร้อนจัดและมีโอกาสฝนบางส่วน\\nมีการแนะนำให้ระวังแดดจัดและดื่มน้ำมาก ๆ\",\n"
        "      \"topics\": [\"สภาพอากาศ\", \"พยากรณ์อากาศ\", \"ปทุมธานี\", \"อากาศร้อน\"],\n"
        "      \"message_count\": 3,\n"
        "      \"first_message_at\": \"2025-12-11T04:20:00Z\",\n"
        "      \"last_message_at\": \"2025-12-11T04:21:00Z\"\n"
        "    }\n"
        "  }\n"
        "}"
    )

    user_prompt = f"Chat ID: {request.chat_id}\n\nMessages:\n{conversation_text}"

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

            if response.status_code != 200:
                print(f"Analysis failed: {response.text}")
                raise HTTPException(status_code=response.status_code, detail="Analysis failed")

            data = response.json()
            if "choices" in data and data["choices"]:
                content = data["choices"][0]["message"]["content"]
                # Parse JSON string to object to ensure it is valid JSON before returning
                import json
                try:
                    return {"success": True, "data": json.loads(content)}
                except json.JSONDecodeError:
                     return {"success": True, "data": content} # Return raw string if parse fails, though model should return JSON

            raise HTTPException(status_code=500, detail="No content returned")

    except Exception as e:
        print(f"Analysis error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))



# ==============================
# Uvicorn entrypoint
# ==============================

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)
