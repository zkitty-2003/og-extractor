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
// Google Login
function handleCredentialResponse(response) {
    // Send JWT to backend
    fetch('/auth/google', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token: response.credential })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                // Login Success
                localStorage.setItem("user_info", JSON.stringify(data.user));
                updateUI(data.user);
            }
        })
        .catch(console.error);
}

function updateUI(user) {
    if (user) {
        // Hide Sign-In button, Show Profile
        document.querySelector('.g_id_signin').style.display = 'none';
        const profile = document.getElementById('user-profile');
        profile.style.display = 'flex';
        document.getElementById('user-avatar').src = user.picture;
        document.getElementById('user-name').textContent = user.name;
    } else {
        // Show Sign-In button, Hide Profile
        document.querySelector('.g_id_signin').style.display = 'block';
        document.getElementById('user-profile').style.display = 'none';
    }
}

// Check login status on load
const savedUser = localStorage.getItem("user_info");
if (savedUser) {
    updateUI(JSON.parse(savedUser));
}

// Logout
document.getElementById('logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem("user_info");
    updateUI(null);
    // Reload to reset Google button state if needed
    window.location.reload();
});

// Chat History
let chatHistory = JSON.parse(localStorage.getItem("chat_history") || "[]");

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
                history: chatHistory // Send history
            })
        });

        const data = await response.json();

        // Remove Loading
        removeMessage(loadingId);

        if (data.success) {
            const aiMsg = data.data.message;
            addMessage(aiMsg, 'ai');

            // Update History
            chatHistory.push({ role: "user", content: text });
            chatHistory.push({ role: "assistant", content: aiMsg });
            localStorage.setItem("chat_history", JSON.stringify(chatHistory));
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
        <div class="bubble">
            <div class="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        </div>
    `;
    chatContainer.appendChild(div);
    return id;
}

function removeMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function scrollToBottom() {
    setTimeout(() => {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 50); // Small delay to ensure DOM is updated
}

function formatText(text) {
    // Simple escape to prevent XSS and handle newlines
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");
}
