
import os
import time
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import httpx
from opensearchpy import AsyncOpenSearch

# ==========================================
# 1. Configuration & Setup
# ==========================================
# Normally these would be in .env, but for a single-file demo, we use defaults or os.getenv
OPENSEARCH_HOST = os.getenv("OPENSEARCH_HOST", "localhost")
OPENSEARCH_PORT = int(os.getenv("OPENSEARCH_PORT", 9200))
# Default: admin/admin or no auth depending on setup. Modify as needed.
OPENSEARCH_AUTH = (os.getenv("OPENSEARCH_USER", "admin"), os.getenv("OPENSEARCH_PASS", "admin"))
INDEX_NAME = "ai_chat_logs"
ENVIRONMENT = "dev"
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")  # Put your key here or in env
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


# ===============================
# Simple in-memory session store
# (ใช้ได้กับ dev / ทดลอง)
# ===============================
ACTIVE_SESSION_BY_USER = {}  # user_id -> session_id

# Logging setup for console
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ==========================================
# 2. Data Models (Pydantic)
# ==========================================

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    model: str = "openai/gpt-3.5-turbo"  # Example model
    user_id: str = "dev_user"
    session_id: Optional[str] = None

class ChatResponse(BaseModel):
    role: str
    content: str
    session_id: str
    model: str
    response_time_ms: float
    status: str

class NewChatResponse(BaseModel):
    session_id: str
    user_id: str


# ==========================================
# 3. OpenSearch Client & Logging Logic
# ==========================================

oss_client = AsyncOpenSearch(
    hosts=[{'host': OPENSEARCH_HOST, 'port': OPENSEARCH_PORT}],
    http_auth=OPENSEARCH_AUTH,
    use_ssl=False,     # Set True for production/cloud
    verify_certs=False, 
    ssl_show_warn=False
)

async def log_to_opensearch(
    session_id: str,
    user_id: str,
    role: str,
    model: str,
    status: str,
    content: Optional[str] = None,
    response_time_ms: Optional[float] = None
):
    """
    Logs a single document to OpenSearch index 'ai_chat_logs'.
    Format follows the requirement: 1 message = 1 document.
    """
    doc = {
        "session_id": session_id,
        "user_id": user_id,
        "role": role,
        "model": model,
        "status": status,
        "environment": ENVIRONMENT,
        "@timestamp": datetime.now(timezone.utc).isoformat(),
        # Optional fields for better debugging/context
        "content_length": len(content) if content else 0
    }

    # Only assistant has response_time_ms
    if response_time_ms is not None:
        doc["response_time_ms"] = response_time_ms
    
    # Store content if needed (good for debugging, though careful with PII)
    if content:
        doc["content_snippet"] = content[:1000] # Truncate for safety/size

    try:
        await oss_client.index(index=INDEX_NAME, body=doc)
        logger.info(f"Logged {role} event to OpenSearch. Status: {status}")
    except Exception as e:
        logger.error(f"Failed to log to OpenSearch: {e}")

# ==========================================
# 4. FastAPI Application
# ==========================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Verify OS connection
    try:
        await oss_client.ping()
        logger.info(f"Successfully connected to OpenSearch at {OPENSEARCH_HOST}:{OPENSEARCH_PORT}")
    except Exception as e:
        logger.error(f"Warning: OpenSearch connection failed: {e}")
    yield
    # Shutdown
    await oss_client.close()

app = FastAPI(title="AI Usage Logger System", lifespan=lifespan)

@app.post("/new_chat", response_model=NewChatResponse)
async def new_chat(user_id: str = "dev_user"):
    session_id = str(uuid.uuid4())
    ACTIVE_SESSION_BY_USER[user_id] = session_id
    return NewChatResponse(session_id=session_id, user_id=user_id)

@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    user_id = request.user_id or "dev_user"

    # ✅ Session logic (กัน session แตก)
    if request.session_id:
        session_id = request.session_id
        ACTIVE_SESSION_BY_USER[user_id] = session_id  # update ล่าสุด
    else:
        # ถ้า user เคยมี session ล่าสุดอยู่แล้ว ให้ใช้ต่อ
        session_id = ACTIVE_SESSION_BY_USER.get(user_id)
        if not session_id:
            session_id = str(uuid.uuid4())
            ACTIVE_SESSION_BY_USER[user_id] = session_id
    
    start_time = time.time()
    current_model = request.model
    # user_id is already set above

    # ---------------------------------------------------------
    # Step A: Log User Request
    # ---------------------------------------------------------
    # Extract the last user message for logging context
    last_user_msg = next((m.content for m in reversed(request.messages) if m.role == 'user'), "")
    
    await log_to_opensearch(
        session_id=session_id,
        user_id=user_id,
        role="user",
        model=current_model,
        status="success",
        content=last_user_msg
    )

    # ---------------------------------------------------------
    # Step B: Call AI Service (OpenRouter)
    # ---------------------------------------------------------
    ai_content = ""
    status = "success"
    try:
        async with httpx.AsyncClient() as client:
            # 4. Response Time Measurement (Start)
            # We already have start_time, but this measures strictly API call time if preferred. 
            # Requirements say "response_time" which usually means Turn-around-time.
            
            headers = {
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "HTTP-Referer": "http://localhost:8000", # Required by OpenRouter
                "X-Title": "Dev AI Logger"
            }
            
            payload = {
                "model": current_model,
                "messages": [m.dict() for m in request.messages]
            }

            resp = await client.post(
                OPENROUTER_URL,
                json=payload,
                headers=headers,
                timeout=30.0
            )
            
            if resp.status_code != 200:
                status = "error"
                ai_content = f"Provider Error: {resp.text}"
                # We log strictly as error below
            else:
                data = resp.json()
                # Parse OpenRouter/OpenAI format
                if "choices" in data and len(data["choices"]) > 0:
                    ai_content = data["choices"][0]["message"]["content"]
                else:
                    status = "error"
                    ai_content = "No content in response"

    except Exception as e:
        status = "error"
        ai_content = f"Internal Error: {str(e)}"
    
    # ---------------------------------------------------------
    # Step C: Log AI Response (Success or Error)
    # ---------------------------------------------------------
    # 4. Calculate Duration
    duration_ms = (time.time() - start_time) * 1000.0
    
    await log_to_opensearch(
        session_id=session_id,
        user_id=user_id,
        role="assistant",
        model=current_model,
        status=status,
        content=ai_content,
        response_time_ms=duration_ms
    )

    if status == "error":
        raise HTTPException(status_code=502, detail=f"AI Request Failed: {ai_content}")

    return ChatResponse(
        role="assistant",
        content=ai_content,
        session_id=session_id,
        model=current_model,
        response_time_ms=round(duration_ms, 2),
        status=status
    )

if __name__ == "__main__":
    import uvicorn
    # Single file runnable
    uvicorn.run(app, host="0.0.0.0", port=8000)
