const API_URL = "/chat";
let API_KEY = localStorage.getItem("openrouter_api_key") || "";

const chatContainer = document.getElementById('chat-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const settingsBtn = document.getElementById('settings-btn');
const modal = document.getElementById('api-key-modal');
const apiKeyInput = document.getElementById('api-key-input');
const saveApiKeyBtn = document.getElementById('save-api-key');

// Initialize
if (!API_KEY) {
    modal.style.display = 'flex';
}

// Event Listeners
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

settingsBtn.addEventListener('click', () => {
    apiKeyInput.value = API_KEY;
    modal.style.display = 'flex';
});

saveApiKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key) {
        API_KEY = key;
        localStorage.setItem("openrouter_api_key", key);
        modal.style.display = 'none';
    }
});

// Functions
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    if (!API_KEY) {
        alert("กรุณาตั้งค่า API Key ก่อนครับ");
        modal.style.display = 'flex';
        return;
    }

    // Add User Message
    addMessage(text, 'user');
    messageInput.value = '';
    scrollToBottom();

    // Show Loading
    const loadingId = addLoadingMessage();
    scrollToBottom();

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                message: text,
                model: "openai/gpt-3.5-turbo",
                history: [] // You can implement history management here if needed
            })
        });

        const data = await response.json();

        // Remove Loading
        removeMessage(loadingId);

        if (data.success) {
            addMessage(data.data.message, 'ai');
        } else {
            addMessage("Error: " + (data.detail || "Something went wrong"), 'ai');
        }

    } catch (error) {
        removeMessage(loadingId);
        addMessage("Error: " + error.message, 'ai');
    }

    scrollToBottom();
}

function addMessage(text, sender) {
    const div = document.createElement('div');
    div.className = `message ${sender}-message`;

    let avatarHtml = '';
    if (sender === 'ai') {
        avatarHtml = `<div class="avatar">A</div>`;
    }

    div.innerHTML = `
        ${avatarHtml}
        <div class="bubble">${formatText(text)}</div>
    `;

    chatContainer.appendChild(div);
    return div;
}

function addLoadingMessage() {
    const id = 'loading-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = 'message ai-message';
    div.innerHTML = `
        <div class="avatar">A</div>
        <div class="bubble">...</div>
    `;
    chatContainer.appendChild(div);
    return id;
}

function removeMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function formatText(text) {
    // Simple escape to prevent XSS and handle newlines
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");
}
