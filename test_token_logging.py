"""
Test script to verify token usage logging
"""
import requests
import json
import time

# Test /chat endpoint
print("=" * 60)
print("Testing /chat endpoint...")
print("=" * 60)

url = "http://localhost:10000/chat"

payload = {
    "message": "Hello, this is a test message",
    "chat_id": "test-chat-123",
    "user_email": "test@example.com",
    "user_avatar": "https://via.placeholder.com/150",
    "history": [],
    "model": "google/gemma-3-27b-it:free"
}

headers = {
    "Content-Type": "application/json"
}

print(f"\nSending POST request to: {url}")
print(f"Payload: {json.dumps(payload, indent=2)}")

try:
    response = requests.post(url, json=payload, headers=headers, timeout=60)
    
    print(f"\nResponse Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    
    if response.status_code == 200:
        print("\n✅ Chat request successful!")
        print("\n⏳ Waiting 2 seconds for background tasks to complete...")
        time.sleep(2)
        
        # Check token_usage count
        print("\n" + "=" * 60)
        print("Checking OpenSearch token_usage count...")
        print("=" * 60)
        
        os_url = "http://localhost:9200/token_usage/_count"
        os_response = requests.get(os_url)
        os_data = os_response.json()
        
        count = os_data.get("count", 0)
        print(f"\n📊 Token usage count: {count}")
        
        if count > 0:
            print("✅ SUCCESS! Token usage is being logged!")
            
            # Get latest token usage entry
            search_url = "http://localhost:9200/token_usage/_search"
            search_payload = {
                "size": 1,
                "sort": [{"timestamp": {"order": "desc"}}]
            }
            search_response = requests.post(search_url, json=search_payload, headers=headers)
            search_data = search_response.json()
            
            if search_data.get("hits", {}).get("hits"):
                latest_entry = search_data["hits"]["hits"][0]["_source"]
                print("\n📝 Latest token usage entry:")
                print(json.dumps(latest_entry, indent=2))
        else:
            print("❌ PROBLEM: Token usage count is still 0")
            print("\nCheck backend logs for:")
            print("  - '🚀 log_token_usage CALLED!'")
            print("  - '📊 USAGE DATA: ...'")
            print("  - Any errors related to token logging")
    else:
        print(f"\n❌ Error: {response.text}")
        
except Exception as e:
    print(f"\n❌ Exception: {e}")

print("\n" + "=" * 60)
print("Test completed!")
print("=" * 60)
