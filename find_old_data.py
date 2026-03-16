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
        hosts=[{'host': u.hostname, 'port': u.port or 443}],
        use_ssl=(u.scheme == 'https'),
        http_auth=(u.username, u.password),
        verify_certs=False
    )
    
    try:
        print("--- Cluster-wide Search for 2025 Data ---")
        # Search all indices for any docs with a timestamp in 2025
        # We'll try common date field names
        date_fields = ["@timestamp", "timestamp", "last_message_at", "created_at"]
        
        for field in date_fields:
            print(f"\nChecking field: {field}")
            query = {
                "size": 5,
                "query": {
                    "range": {
                        field: {
                            "gte": "2025-01-01T00:00:00",
                            "lte": "2025-12-31T23:59:59"
                        }
                    }
                }
            }
            try:
                resp = await client.search(index="_all", body=query)
                hits = resp['hits']['hits']
                print(f"  Found {resp['hits']['total']['value']} docs")
                for h in hits:
                     print(f"  Index: {h['_index']} | Time: {h['_source'].get(field)}")
            except Exception as e:
                print(f"  Could not search field '{field}': {e}")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(run())
