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
        email = "siramol2546@gmail.com"
        print(f"--- Searching for user: {email} across ALL indices ---")
        
        # Search all indices (_) for this email string
        resp = await client.search(
            index="_all", 
            body={
                "size": 10,
                "query": {
                    "query_string": {
                        "query": f'"{email}"'
                    }
                }
            }
        )
        
        hits = resp.get('hits', {}).get('hits', [])
        print(f"Found {len(hits)} occurrences across the cluster.")
        
        for hit in hits:
            print(f"Index: {hit['_index']} | ID: {hit['_id']}")
            # print(json.dumps(hit['_source'], indent=2))
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(run())
