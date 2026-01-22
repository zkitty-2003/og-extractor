import asyncio
from opensearchpy import AsyncOpenSearch
import os

async def check_data():
    client = AsyncOpenSearch(
        hosts=[{'host': 'localhost', 'port': 9200}],
        use_ssl=False,
        verify_certs=False
    )
    
    print("--- Checking OpenSearch Data ---")
    try:
        # Check if index exists
        exists = await client.indices.exists(index="ai_chat_logs")
        print(f"Index 'ai_chat_logs' exists: {exists}")
        
        if exists:
            # Count docs
            count = await client.count(index="ai_chat_logs")
            print(f"Total documents in 'ai_chat_logs': {count['count']}")
            
            # Get last 5 docs
            resp = await client.search(index="ai_chat_logs", body={
                "size": 5,
                "sort": [{"@timestamp": {"order": "desc"}}]
            })
            
            print("\n--- Last 5 Logs ---")
            for hit in resp['hits']['hits']:
                src = hit['_source']
                print(f"Time: {src.get('@timestamp')} | User: {src.get('user_id')} | Role: {src.get('role')} | Content: {src.get('content_snippet', '')[:50]}...")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(check_data())
