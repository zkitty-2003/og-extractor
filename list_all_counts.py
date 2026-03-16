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
        # Check all indices for any documents at all
        indices = await client.cat.indices(format="json")
        print(f"{'Index':<30} | {'Docs':<10}")
        print("-" * 45)
        for idx in indices:
            name = idx['index']
            count = idx['docs.count']
            print(f"{name:<30} | {count:<10}")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(run())
