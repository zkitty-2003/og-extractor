# Token Usage Statistics API Endpoint
# Add this after /api/dashboard/timeseries endpoint (around line 1400)

@app.get("/api/dashboard/token-usage")
async def dashboard_token_usage(
    time_range: str = Query("24h", regex="^(24h|7d|30d)$")
):
    """Get token usage statistics"""
    if not opensearch_client:
        raise HTTPException(status_code=503, detail="OpenSearch client not initialized")
    
    # Calculate time range
    if time_range == "24h":
        gte = "now-24h"
    elif time_range == "7d":
        gte = "now-7d"
    else:
        gte = "now-30d"
    
    query_body = {
        "size": 0,
        "query": {
            "bool": {
                "must": [
                    {"range": {"timestamp": {"gte": gte, "lte": "now"}}}
                ]
            }
        },
        "aggs": {
            "total_tokens": {"sum": {"field": "total_tokens"}},
            "total_prompt_tokens": {"sum": {"field": "prompt_tokens"}},
            "total_completion_tokens": {"sum": {"field": "completion_tokens"}},
            "total_cost": {"sum": {"field": "cost"}},
            "avg_tokens_per_request": {"avg": {"field": "total_tokens"}},
            "total_requests": {"value_count": {"field": "request_id.keyword"}},
            "tokens_by_model": {
                "terms": {"field": "model.keyword", "size": 10},
                "aggs": {
                    "total_tokens": {"sum": {"field": "total_tokens"}},
                    "avg_tokens": {"avg": {"field": "total_tokens"}}
                }
            },
            "tokens_by_provider": {
                "terms": {"field": "provider.keyword", "size": 10},
                "aggs": {
                    "total_tokens": {"sum": {"field": "total_tokens"}}
                }
            }
        }
    }
    
    try:
        response = opensearch_client.search(index="token_usage", body=query_body)
        aggs = response["aggregations"]
        
        return {
            "total_tokens": int(aggs["total_tokens"]["value"] or 0),
            "total_prompt_tokens": int(aggs["total_prompt_tokens"]["value"] or 0),
            "total_completion_tokens": int(aggs["total_completion_tokens"]["value"] or 0),
            "total_cost": round(aggs["total_cost"]["value"] or 0, 4),
            "avg_tokens_per_request": round(aggs["avg_tokens_per_request"]["value"] or 0, 1),
            "total_requests": aggs["total_requests"]["value"],
            "tokens_by_model": [
                {
                    "model": b["key"],
                    "total_tokens": int(b["total_tokens"]["value"]),
                    "avg_tokens": round(b["avg_tokens"]["value"], 1),
                    "requests": b["doc_count"]
                }
                for b in aggs["tokens_by_model"]["buckets"]
            ],
            "tokens_by_provider": [
                {
                    "provider": b["key"],
                    "total_tokens": int(b["total_tokens"]["value"]),
                    "requests": b["doc_count"]
                }
                for b in aggs["tokens_by_provider"]["buckets"]
            ]
        }
    except Exception as e:
        print(f"Error fetching token usage: {e}")
        return {
            "total_tokens": 0,
            "total_prompt_tokens": 0,
            "total_completion_tokens": 0,
            "total_cost": 0.0,
            "avg_tokens_per_request": 0.0,
            "total_requests": 0,
            "tokens_by_model": [],
            "tokens_by_provider": []
        }
