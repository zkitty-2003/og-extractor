"""
Test script using PORT 10001 (to avoid port 10000 conflicts)
"""
import requests
import json
import time

print("="*60)
print("Testing /chat endpoint on PORT 10001...")
print("="*60)

url = "http://localhost:10001/chat"

payload = {
    "message": "Hello, this is a test message",
    "chat_id": "test-chat-123",
    "user_email": "test@example.com",
    "user_avatar": "https://via.placeholder.com/150",
    "history": [],
    "model": "google/gemma-3-27b-it:free"
}

headers = {"Content-Type": "application/json"}

print(f"\n📤 Sending POST request to: {url}")

try:
    response = requests.post(url, json=payload, headers=headers, timeout=60)
    
    print(f"\n📊 Status: {response.status_code}")
    
    if response.status_code == 200:
        print("✅ Chat request successful!")
        time.sleep(2)
        
        # Check token_usage count
        os_url = "http://localhost:9200/token_usage/_count"
        os_response = requests.get(os_url)
        os_data = os_response.json()
        
        count = os_data.get("count", 0)
        print(f"\n📊 Token usage count: {count}")
        
        if count > 0:
            print("🎉 SUCCESS! Token usage is being logged!")
        else:
            print("❌ Count still 0 - check uvicorn logs")
    else:
        print(f"❌ Error: {response.text}")
        
except Exception as e:
    print(f"❌ Exception: {e}")
