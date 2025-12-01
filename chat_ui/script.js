// Global state
let currentUser = null;
let chatHistory = [];
let apiKey = localStorage.getItem('openrouter_api_key') || '';

// DOM Elements
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const chatContainer = document.getElementById('chat-container');
const settingsBtn = document.getElementById('settings-btn');
const apiKeyModal = document.getElementById('api-key-modal');
const saveApiKeyBtn = document.getElementById('save-api-key');
const apiKeyInput = document.getElementById('api-key-input');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const sidebar = document.getElementById('sidebar');
const newChatBtn = document.getElementById('new-chat-btn');
const userProfile = document.getElementById('user-profile');
const gIdOnload = document.getElementById('g_id_onload');
const gIdSignin = document.querySelector('.g_id_signin');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Load saved API key
    if (apiKey) {
        apiKeyInput.value = apiKey;
    }

    // Event Listeners
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    settingsBtn.addEventListener('click', () => {
        apiKeyModal.style.display = 'block';
    });

    saveApiKeyBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (key) {
            apiKey = key;
            localStorage.setItem('openrouter_api_key', key);
            apiKeyModal.style.display = 'none';
            alert('API Key saved!');
        }
    });

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === apiKeyModal) {
            apiKeyModal.style.display = 'none';
        }
    });

    mobileMenuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });

    newChatBtn.addEventListener('click', startNewChat);

    // Logout handler
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
});

// Google Sign-In Callback
function handleCredentialResponse(response) {
    if (response.credential) {
        // Send token to backend
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
                    currentUser = data.user;
                    updateUIForLogin();
                }
            })
            .catch(err => console.error('Login error:', err));
    }
}

function updateUIForLogin() {
    if (currentUser) {
        document.getElementById('user-name').textContent = currentUser.name;
        document.getElementById('user-email').textContent = currentUser.email;
        document.getElementById('user-avatar').src = currentUser.picture;
        userProfile.style.display = 'flex';
        gIdOnload.style.display = 'none';
        gIdSignin.style.display = 'none';
    }
}

function handleLogout() {
    currentUser = null;
    userProfile.style.display = 'none';
    gIdOnload.style.display = 'block';
    gIdSignin.style.display = 'block';
    // Reload to reset Google button state if needed
    location.reload();
}

// Chat Functions
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    if (!apiKey) {
        alert('Please set your OpenRouter API Key in Settings first.');
        apiKeyModal.style.display = 'block';
        return;
    }

    // Add User Message
    appendMessage(text, 'user');
    messageInput.value = '';

    // Show Typing Indicator
    const typingId = showTypingIndicator();

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}` // Send API Key in Auth header as expected by backend
            },
            body: JSON.stringify({
                message: text,
                history: chatHistory,
                model: "google/gemma-3-27b-it:free" // Default model
            })
        });

        const data = await response.json();

        // Remove Typing Indicator
        removeTypingIndicator(typingId);

        if (data.success) {
            const aiMsg = data.data.message;
            appendMessage(aiMsg, 'ai');

            // Update History
            chatHistory.push({ role: "user", content: text });
            chatHistory.push({ role: "assistant", content: aiMsg });
        } else {
            appendMessage('Error: ' + (data.detail || 'Unknown error'), 'ai');
        }

    } catch (error) {
        removeTypingIndicator(typingId);
        appendMessage('Error: ' + error.message, 'ai');
    }
}

function appendMessage(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', sender === 'user' ? 'user-message' : 'ai-message');

    const avatar = document.createElement('div');
    avatar.classList.add('avatar');
    avatar.textContent = sender === 'user' ? 'U' : 'A';
    if (sender === 'user' && currentUser) {
        // Use user image if logged in
        avatar.innerHTML = `<img src="${currentUser.picture}" style="width:100%;height:100%;border-radius:50%;">`;
    }

    const bubble = document.createElement('div');
    bubble.classList.add('bubble');
    bubble.innerHTML = escapeHtml(text); // Use innerHTML to support <br>

    if (sender === 'user') {
        msgDiv.appendChild(bubble);
        msgDiv.appendChild(avatar);
    } else {
        msgDiv.appendChild(avatar);
        msgDiv.appendChild(bubble);
    }

    chatContainer.appendChild(msgDiv);
    scrollToBottom();
}

function showTypingIndicator() {
    const id = 'typing-' + Date.now();
    const msgDiv = document.createElement('div');
    msgDiv.id = id;
    msgDiv.classList.add('message', 'ai-message');

    const avatar = document.createElement('div');
    avatar.classList.add('avatar');
    avatar.textContent = 'A';

    const bubble = document.createElement('div');
    bubble.classList.add('bubble');
    bubble.innerHTML = '<i class="fas fa-ellipsis-h fa-fade"></i>'; // Typing animation

    msgDiv.appendChild(avatar);
    msgDiv.appendChild(bubble);
    chatContainer.appendChild(msgDiv);
    scrollToBottom();
    return id;
}

function removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function startNewChat() {
    chatHistory = [];
    chatContainer.innerHTML = '';
    // Add Welcome Message
    const welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'message ai-message';
    welcomeDiv.innerHTML = `
        <div class="avatar">A</div>
        <div class="bubble">สวัสดีครับ มีอะไรให้พี่ช่วยไหม</div>
    `;
    chatContainer.appendChild(welcomeDiv);
}

// Helper to escape HTML to prevent XSS, but allow line breaks
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");
}
