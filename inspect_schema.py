import asyncio
import os
from opensearchpy import AsyncOpenSearch
from urllib.parse import urlparse
from dotenv import load_dotenv
import json

async def run():
    load_dotenv(override=True)
    url = os.getenv('OPENSEARCH_URL')
    u = urlparse(url)
    client = AsyncOpenSearch(
        hosts=[{'host': u.hostname, 'port': u.port or 443}],
        use_ssl=(u.scheme == 'https'),
        http_auth=(u.username, u.password),
        verify_certs=False
    )
    
    try:
        # Check one doc from each important index to see schema
        for idx in ["ai_chat_logs", "chat_summaries"]:
            print(f"\n--- Sample from {idx} ---")
            resp = await client.search(index=idx, body={"size": 1})
            if resp['hits']['hits']:
                print(json.dumps(resp['hits']['hits'][0]['_source'], indent=2))
            else:
                print("No documents found.")
                
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(run())
