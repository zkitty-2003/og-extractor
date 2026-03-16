import random
from locust import HttpUser, task, between

class OGExtractorUser(HttpUser):
    wait_time = between(1, 5)

    @task
    def chat_session(self):
        """Simulate a user chatting with the AI"""
        messages = [
            "Hello, what is this system?",
            "Can you help me extract data from a website?",
            "How do I use the dashboard?",
            "What technologies are used in this project?"
        ]
        
        payload = {
            "message": random.choice(messages),
            "chat_history": []
        }
        
        # Adjust the endpoint if necessary based on main.py analysis
        headers = {"Content-Type": "application/json"}
        with self.client.post("/chat", json=payload, headers=headers, catch_response=True) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Chat failed with status code: {response.status_code}")

    @task(2)
    def index_page(self):
        """Simulate a user visiting the landing page"""
        self.client.get("/")

    @task(1)
    def check_health(self):
        """Standard health check"""
        self.client.get("/health") # Assuming there's a health check endpoint
