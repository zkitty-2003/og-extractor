import asyncio
import os
from opensearchpy import AsyncOpenSearch
from urllib.parse import urlparse
from dotenv import load_dotenv

async def run():
    load_dotenv(override=True)
    url = os.getenv('OPENSEARCH_URL')
    if not url:
        print("OPENSEARCH_URL not found")
        return
        
    u = urlparse(url)
    host = u.hostname
    port = u.port or (443 if u.scheme == 'https' else 9200)
    
    auth = None
    if u.username and u.password:
        auth = (u.username, u.password)
        
    client = AsyncOpenSearch(
        hosts=[{'host': host, 'port': port}],
        use_ssl=(u.scheme == 'https'),
        http_auth=auth,
        verify_certs=False
    )
    
    try:
        print("--- Indices ---")
        indices = await client.cat.indices(v=True)
        print(indices)
        
        print("\n--- Indices Detail (JSON) ---")
        detail = await client.indices.get_alias("*")
        print(list(detail.keys()))
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(run())
