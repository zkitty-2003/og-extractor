
# ==============================
# 6) Analyze Chat API
# ==============================

class AnalyzeRequest(BaseModel):
    chat_id: str
    messages: List[Dict[str, Any]]

@app.post("/analyze")
async def analyze_chat_session(
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
        timestamp = msg.get("timestamp", "")
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
        "Always make sure the JSON is syntactically valid."
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
                return {"success": True, "data": content}
            
            raise HTTPException(status_code=500, detail="No content returned")

    except Exception as e:
        print(f"Analysis error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
