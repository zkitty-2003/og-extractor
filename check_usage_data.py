"""
Enhanced test to check if OpenRouter returns usage data
"""
import requests
import json

print("=" * 60)
print("Testing OpenRouter Response Structure")
print("=" * 60)

url = "http://localhost:10000/chat"
payload = {
    "message": "test",
    "chat_id": "test-123",
    "user_email": "test@example.com",
    "user_avatar": None,
    "history": [],
    "model": "google/gemma-3-27b-it:free"
}

print(f"\n📤 Sending request...")

response = requests.post(url, json=payload, timeout=60)

print(f"\n📊 Status: {response.status_code}")

if response.status_code == 200:
    data = response.json()
    print(f"\n📝 Response structure:")
    print(json.dumps(data, indent=2))
    
    # Check if data.data exists
    if "data" in data and isinstance(data["data"], dict):
        inner_data = data["data"]
        print(f"\n🔍 Checking for 'usage' field in response...")
        
        if "usage" in inner_data:
            print(f"✅ FOUND usage data: {inner_data['usage']}")
        else:
            print(f"❌ NO 'usage' field in response!")
            print(f"\nAvailable fields: {list(inner_data.keys())}")
            print(f"\n⚠️  This means OpenRouter didn't return token usage data")
            print(f"    This is common for FREE models!")
else:
    print(f"❌ Error: {response.text}")

print("\n" + "=" * 60)
