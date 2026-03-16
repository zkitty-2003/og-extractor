import requests
import time

BASE_URL = "http://localhost:10000"

print("====================================")
print("🧪 Prompt Evaluation System Tester")
print("====================================")

# 1. Test Prompt A (Polite)
print("\n[1] Testing Prompt_Version: v1_polite")
payload_A = {
    "prompt_version": "v1_polite",
    "system_prompt": "คุณคือผู้ช่วย AI ที่ตอบคำถามสั้นๆ ได้ใจความ และสุภาพมากๆ ห้ามตอบยาวเกิน 2 บรรทัด",
    "user_input": "อธิบายทฤษฎีแรงโน้มถ่วงให้เด็ก 10 ขวบฟังหน่อย",
    "model": "google/gemma-3-27b-it:free"
}

res_A = requests.post(f"{BASE_URL}/eval/prompt", json=payload_A)
data_A = res_A.json()
print("--> RAW RESPONSE A:", data_A)
print("--> Response A:", data_A.get("response", "").replace("\n", " "))
print(f"--> Time: {data_A.get('duration_ms', 0):.0f}ms | Tokens: {data_A.get('tokens', 0)}")
eval_id_A = data_A.get("eval_id")

# 2. Test Prompt B (Expert)
time.sleep(2) # rate limit prevention
print("\n[2] Testing Prompt_Version: v2_expert")
payload_B = {
    "prompt_version": "v2_expert",
    "system_prompt": "คุณคือศาสตราจารย์ฟิสิกส์ ที่ชอบตอบคำถามดุดัน จริงจัง และอธิบายเป็นข้อๆ ตามรูปแบบวิชาการ",
    "user_input": "อธิบายทฤษฎีแรงโน้มถ่วงให้เด็ก 10 ขวบฟังหน่อย",
    "model": "google/gemma-3-27b-it:free"
}

res_B = requests.post(f"{BASE_URL}/eval/prompt", json=payload_B)
data_B = res_B.json()
print("--> Response B:", data_B.get("response", "").replace("\n", " "))
print(f"--> Time: {data_B.get('duration_ms', 0):.0f}ms | Tokens: {data_B.get('tokens', 0)}")
eval_id_B = data_B.get("eval_id")

# 3. Score the responses
print("\n[3] Scoring the prompts...")
if eval_id_A:
    requests.post(f"{BASE_URL}/eval/score", json={
        "eval_id": eval_id_A, "score": 4, "comment": "ตอบได้น่ารัก สั้นกระชับเข้าใจง่าย"
    })
    print(f"--> Scored A = 4/5")

if eval_id_B:
    requests.post(f"{BASE_URL}/eval/score", json={
        "eval_id": eval_id_B, "score": 2, "comment": "ดุเกินไป เด็กตกใจ ไม่เหมาะกับ target"
    })
    print(f"--> Scored B = 2/5")

# 4. Fetch Results
print("\n[4] Fetching Aggregate Results...")
time.sleep(1) # wait for OpenSearch refresh
res_results = requests.get(f"{BASE_URL}/eval/results")
print("\n=== RESULTS ===")
for r in res_results.json().get("data", []):
    print(f"- Version: {r['version']}")
    print(f"  Avg Score: {r['average_score']}/5 (Scored {r['scored_tests']}/{r['total_tests']})")
    print(f"  Avg Time:  {r['average_time_ms']}ms")
    print(f"  Avg Token: {r['average_tokens']}")
