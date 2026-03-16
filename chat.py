from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
from typing import Optional, List, Dict, Any
import os

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Serve static files
app.mount("/static", StaticFiles(directory="chat_ui"), name="static")

@app.get("/")
async def read_root():
    return FileResponse('chat_ui/index.html')

security = HTTPBearer()

class ChatRequest(BaseModel):
    message: str
    model: Optional[str] = "google/gemma-3-27b-it:free" # Default model, can be changed
    history: Optional[List[Dict[str, str]]] = None # Optional conversation history

@app.post("/chat")
async def chat_with_ai(
    request: ChatRequest,
    creds: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Chat with AI using OpenRouter.
    Click the 'Authorize' button (lock icon) and enter your API Key.
    """
    api_key = creds.credentials
    
    messages = []
    if request.history:
        messages.extend(request.history)
    messages.append({"role": "user", "content": request.message})

    payload = {
        "model": request.model,
        "messages": messages
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    # Optional: OpenRouter specific headers
                    "HTTP-Referer": "http://localhost:8081", 
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
            # Extract the content from the response
            ai_message = data["choices"][0]["message"]["content"]
            
            return {
                "success": True,
                "data": {
                    "message": ai_message,
                    "model": data.get("model"),
                    "raw": data # Return raw response if needed for debugging
                }
            }

    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Connection error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


# ==============================
# Prompt Evaluation API (Mock for chat.py)
# ==============================

class PromptEvalRequest(BaseModel):
    prompt_version: str # e.g. "v1_polite", "v2_expert"
    system_prompt: str # The actual prompt text to test
    user_input: str
    model: Optional[str] = "google/gemma-3-27b-it:free"

class PromptScoreRequest(BaseModel):
    eval_id: str
    score: int # 1-5
    comment: Optional[str] = ""

@app.post("/eval/prompt")
async def evaluate_prompt(
    request: PromptEvalRequest,
    creds: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Test a specific system prompt version and return results.
    Does not log to OpenSearch since this is the lightweight chat.py version.
    """
    import time
    import uuid
    api_key = creds.credentials
    eval_id = str(uuid.uuid4())
    start_time = time.time()
    
    messages = [
        {"role": "system", "content": request.system_prompt},
        {"role": "user", "content": request.user_input}
    ]
    
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
                },
                json=payload,
            )
            
        end_time = time.time()
        duration_ms = (end_time - start_time) * 1000.0
            
        if response.status_code != 200:
            return {"success": False, "error": response.text}
            
        data = response.json()
        ai_response = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        total_tokens = usage.get("total_tokens", 0)
            
        return {
            "success": True,
            "eval_id": eval_id,
            "response": ai_response,
            "duration_ms": duration_ms,
            "tokens": total_tokens
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/eval/score")
async def score_prompt_evaluation(
    request: PromptScoreRequest,
    creds: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Assign a score (1-5) and comment to a previous prompt test.
    Mock endpoint for UI compatibility in chat.py
    """
    return {"success": True, "message": "Score received (Mocked, not saved to DB in local mode)"}

@app.get("/eval/results")
async def get_prompt_evaluation_results(
    creds: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Mocks aggregate results for UI compatibility in chat.py.
    """
    return {"success": False, "error": "Evaluation results require the full backend (main.py) with OpenSearch."}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 10001))
    uvicorn.run(app, host="0.0.0.0", port=port)
