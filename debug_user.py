
import asyncio
import os
import json
from dotenv import load_dotenv
from opensearchpy import AsyncOpenSearch
from urllib.parse import urlparse

# Force load .env from the root of the project
load_dotenv(os.path.join(os.getcwd(), ".env"), override=True)

async def check_data():
    url = os.environ.get("OPENSEARCH_URL")
    if not url:
        print("Error: OPENSEARCH_URL not found in environment!")
        return

    print(f"Connecting to OpenSearch...")
    u = urlparse(url)
    host = u.hostname
    port = u.port or (443 if u.scheme == "https" else 9200)
    use_ssl = (u.scheme == "https")
    
    client = AsyncOpenSearch(
        hosts=[{"host": host, "port": port}],
        use_ssl=use_ssl,
        verify_certs=False,
        http_auth=(os.getenv("OPENSEARCH_USERNAME"), os.getenv("OPENSEARCH_PASSWORD"))
    )

    user_email = "siramol.k@ku.th"
    
    print(f"\n--- Checking chat_summaries for {user_email} ---")
    query = {
        "size": 5,
        "query": {
            "term": {"user_email.keyword": user_email}
        }
    }
    
    try:
        resp = await client.search(index="chat_summaries", body=query)
        for hit in resp['hits']['hits']:
            print(f"ID: {hit['_id']}")
            print(f"Title: {hit['_source'].get('title')}")
            print(f"Summary: {hit['_source'].get('summary')}")
            print("-" * 20)
            if "Castell" in str(hit['_source']):
                print(">>> FOUND 'Castell' in this summary! <<<")

        print(f"\n--- Checking ai_chat_logs for {user_email} ---")
        query_logs = {
            "size": 10,
            "sort": [{"@timestamp": {"order": "desc"}}],
            "query": {
                "term": {"user_id.keyword": user_email}
            }
        }
        resp_logs = await client.search(index="ai_chat_logs", body=query_logs)
        for hit in resp_logs['hits']['hits']:
            content = hit['_source'].get('content_snippet', '')
            print(f"Role: {hit['_source'].get('role')} | Content: {content[:100]}...")
            if "Castell" in content:
                print(">>> FOUND 'Castell' in this log! <<<")
                print(f"Full Content: {content}")

    except Exception as e:
        print(f"Error during search: {e}")

    await client.close()

if __name__ == "__main__":
    asyncio.run(check_data())
