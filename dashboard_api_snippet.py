
# ==============================
# 7) Admin Dashboard API
# ==============================

@app.get("/api/dashboard/summary")
async def get_dashboard_summary(
    time_range: str = Query("24h", regex="^(24h|7d|30d)$")
):
    if not opensearch_client:
        raise HTTPException(status_code=503, detail="OpenSearch client not initialized")

    # Time range logic
    if time_range == "24h":
        gte_val = "now-24h"
        interval = "hour"
    elif time_range == "7d":
        gte_val = "now-7d"
        interval = "day"
    else:
        gte_val = "now-30d"
        interval = "day"

    query = {
        "size": 0,
        "query": {
            "bool": {
                "must": [
                    {"range": {"@timestamp": {"gte": gte_val, "lte": "now"}}}
                ]
            }
        },
        "aggs": {
            "total_messages": {"value_count": {"field": "session_id.keyword"}},
            "active_users": {"cardinality": {"field": "user_id.keyword"}},
            "sessions": {"cardinality": {"field": "session_id.keyword"}},
            "response_time_stats": {
                "percentiles": {
                    "field": "response_time_ms",
                    "percents": [50, 95] 
                }
            },
            "status_breakdown": {
                "terms": {"field": "status.keyword"}
            },
            "top_users": {
                "terms": {"field": "user_id.keyword", "size": 5}
            },
             "top_models": {
                "terms": {"field": "model.keyword", "size": 5}
            },
            "anonymous_messages": {
                "filter": {"term": {"is_anonymous": True}}
            }
        }
    }

    try:
        resp = await opensearch_client.search(index="ai_chat_logs", body=query)
        aggs = resp["aggregations"]

        # Process Status for Error Rate
        status_buckets = aggs["status_breakdown"]["buckets"]
        error_count = sum(b["doc_count"] for b in status_buckets if b["key"] == "error")
        total_for_rate = aggs["total_messages"]["value"]
        error_rate_pct = (error_count / total_for_rate * 100) if total_for_rate > 0 else 0

        # Percentiles
        p50 = aggs["response_time_stats"]["values"]["50.0"] or 0
        p95 = aggs["response_time_stats"]["values"]["95.0"] or 0

        # Anonymous Rate
        anon_count = aggs["anonymous_messages"]["doc_count"]
        anon_rate = (anon_count / total_for_rate * 100) if total_for_rate > 0 else 0

        return {
            "total_messages": aggs["total_messages"]["value"],
            "active_users": aggs["active_users"]["value"],
            "sessions": aggs["sessions"]["value"],
            "response_time_p50_ms": p50,
            "response_time_p95_ms": p95,
            "error_count": error_count,
            "error_rate_pct": round(error_rate_pct, 2),
            "top_users": [{"name": b["key"], "count": b["doc_count"]} for b in aggs["top_users"]["buckets"]],
            "top_models": [{"name": b["key"], "count": b["doc_count"]} for b in aggs["top_models"]["buckets"]],
            "anonymous_messages": anon_count,
            "anonymous_rate_pct": round(anon_rate, 2)
        }
    except Exception as e:
        print(f"Error in dashboard summary: {e}")
        # Return fallback zeros on error (e.g. index not found yet)
        return {
            "total_messages": 0, "active_users": 0, "sessions": 0,
            "response_time_p50_ms": 0, "response_time_p95_ms": 0,
            "error_count": 0, "error_rate_pct": 0,
            "top_users": [], "top_models": [],
            "anonymous_messages": 0, "anonymous_rate_pct": 0
        }


@app.get("/api/dashboard/timeseries")
async def get_dashboard_timeseries(
    time_range: str = Query("24h", regex="^(24h|7d|30d)$")
):
    if not opensearch_client:
         raise HTTPException(status_code=503, detail="OpenSearch client not initialized")

    if time_range == "24h":
        gte_val = "now-24h"
        interval = "1h"
        fmt = "yyyy-MM-dd HH:mm"
    elif time_range == "7d":
        gte_val = "now-7d"
        interval = "1d"
        fmt = "yyyy-MM-dd"
    else:
        gte_val = "now-30d"
        interval = "1d"
        fmt = "yyyy-MM-dd"

    query = {
        "size": 0,
        "query": {
            "bool": {
                "must": [
                    {"range": {"@timestamp": {"gte": gte_val, "lte": "now"}}}
                ]
            }
        },
        "aggs": {
            "timeline": {
                "date_histogram": {
                    "field": "@timestamp",
                    "fixed_interval": interval,
                    "format": fmt,
                    "min_doc_count": 0,
                    "extended_bounds": {"min": gte_val, "max": "now"}
                },
                "aggs": {
                    "active_users": {"cardinality": {"field": "user_id.keyword"}},
                    "p50": {"percentiles": {"field": "response_time_ms", "percents": [50]}},
                    "error_count": {
                        "filter": {"term": {"status.keyword": "error"}}
                    }
                }
            }
        }
    }

    try:
        resp = await opensearch_client.search(index="ai_chat_logs", body=query)
        buckets = resp["aggregations"]["timeline"]["buckets"]
        
        timeseries_data = []
        for b in buckets:
             p50_val = b["p50"]["values"]["50.0"]
             timeseries_data.append({
                 "timestamp": b["key_as_string"],
                 "count": b["doc_count"],
                 "active_users": b["active_users"]["value"],
                 "p50": p50_val if p50_val else 0,
                 "errors": b["error_count"]["doc_count"]
             })

        return {
            "messages_over_time": timeseries_data,
            # For simplicity, using same data structure for other charts but ideally separate
            "response_time_over_time": timeseries_data, 
            "errors_over_time": timeseries_data
        }
    except Exception as e:
        print(f"Error in dashboard timeseries: {e}")
        return {"messages_over_time": [], "response_time_over_time": [], "errors_over_time": []}


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
        if not await opensearch_client.indices.exists(index="token_usage"):
             return {
                "total_tokens": 0, "total_prompt_tokens": 0, "total_completion_tokens": 0,
                "total_cost": 0.0, "avg_tokens_per_request": 0.0, "total_requests": 0,
                "tokens_by_model": [], "tokens_by_provider": []
            }

        response = await opensearch_client.search(index="token_usage", body=query_body)
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
            "total_tokens": 0, "total_prompt_tokens": 0, "total_completion_tokens": 0,
            "total_cost": 0.0, "avg_tokens_per_request": 0.0, "total_requests": 0,
            "tokens_by_model": [], "tokens_by_provider": []
        }

@app.get("/api/dashboard/insights")
async def get_dashboard_insights():
    # Simple mockup or basic comparison logic
    # Real implementation would query "today" vs "yesterday"
    return {
        "total_messages_today": 0,
        "total_messages_yesterday": 0,
        "unique_users_today": 0,
        "unique_users_yesterday": 0,
        "avg_latency_today_ms": 0,
        "avg_latency_yesterday_ms": 0,
        "msg_change_pct": 0,
        "user_change_pct": 0,
        "peak_hour_today": "N/A",
        "peak_hour_users": 0,
        "peak_hour_messages": 0,
        "latency_anomaly": False,
        "latency_insight_text": "No data available",
        "usage_insight_text": "No data available",
        "peak_insight_text": "No data available",
        "badges": {
            "usage": "gray",
            "latency": "gray",
            "peak": "gray"
        }
    }
