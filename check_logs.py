import asyncio
import os
from opensearchpy import AsyncOpenSearch
from urllib.parse import urlparse
from dotenv import load_dotenv

async def run():
    load_dotenv(override=True)
    url = os.getenv('OPENSEARCH_URL')
    u = urlparse(url)
    client = AsyncOpenSearch(
        hosts=[{'host': u.hostname, 'port': u.port or (443 if u.scheme == 'https' else 9200)}],
        use_ssl=(u.scheme == 'https'),
        http_auth=(u.username, u.password),
        verify_certs=False
    )
    
    try:
        indices = ["ai_chat_logs", "chat_summaries", "token_usage", "prompt_evaluations"]
        
        for idx in indices:
            print(f"\n--- Checking Index: {idx} ---")
            exists = await client.indices.exists(index=idx)
            if not exists:
                print(f"Index {idx} does not exist.")
                continue
                
            count = await client.count(index=idx)
            print(f"Total documents: {count['count']}")
            
            if count['count'] > 0:
                resp = await client.search(
                    index=idx,
                    body={
                        "size": 3,
                        "sort": [{"@timestamp" if idx != "chat_summaries" else "last_message_at": {"order": "asc"}}]
                    }
                )
                print("Oldest 3 documents:")
                for hit in resp['hits']['hits']:
                    src = hit['_source']
                    ts = src.get('@timestamp') or src.get('last_message_at')
                    print(f"  Time: {ts}, Data: {str(src)[:100]}...")
                    
                resp_new = await client.search(
                    index=idx,
                    body={
                        "size": 1,
                        "sort": [{"@timestamp" if idx != "chat_summaries" else "last_message_at": {"order": "desc"}}]
                    }
                )
                if resp_new['hits']['hits']:
                    src = resp_new['hits']['hits'][0]['_source']
                    ts = src.get('@timestamp') or src.get('last_message_at')
                    print(f"Latest document time: {ts}")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(run())
