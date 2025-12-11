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
    model: Optional[str] = "meta-llama/llama-3.2-3b-instruct:free" # Default model, can be changed
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

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)
