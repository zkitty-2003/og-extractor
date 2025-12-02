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
const loginBtn = document.getElementById('login-btn');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Load saved API key
    if (apiKey) {
        apiKeyInput.value = apiKey;
    }

    // Event Listeners
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Auto-resize textarea
    messageInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if (this.value === '') {
            this.style.height = 'auto';
        }
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

    // Login button handler
    loginBtn.addEventListener('click', () => {
        document.getElementById('login-overlay').style.display = 'flex';
        // Render Google Button inside the overlay
        try {
            if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
                // Initialize Google Sign-In
                google.accounts.id.initialize({
                    client_id: "888682176364-95k6bep0ajble7a48romjeui850dptg0.apps.googleusercontent.com",
                    callback: handleCredentialResponse
                });

                google.accounts.id.renderButton(
                    document.getElementById("google-login-container"),
                    { theme: "outline", size: "large", width: 250 }
                );
            } else {
                console.error("Google Sign-In library not loaded.");
                document.getElementById("google-login-container").innerHTML = '<p style="color: red;">Error loading Google Sign-In. Please refresh the page.</p>';
            }
        } catch (error) {
            console.error("Error rendering Google button:", error);
        }
    });

    // Back to Chat handler
    document.getElementById('back-to-chat-btn').addEventListener('click', () => {
        document.getElementById('login-overlay').style.display = 'none';
    });

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
                    document.getElementById('login-overlay').style.display = 'none';
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
        loginBtn.style.display = 'none';
    }
}

function handleLogout() {
    currentUser = null;
    userProfile.style.display = 'none';
    loginBtn.style.display = 'flex';
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

    const contentDiv = document.createElement('div');
    contentDiv.className = 'content';

    if (sender === 'ai') {
        // Check for Thinking Process
        const thinkingMatch = text.match(/<thought>([\s\S]*?)<\/thought>/);
        let thinkingHtml = '';
        let mainText = text;

        if (thinkingMatch) {
            const thinkingContent = thinkingMatch[1].trim();
            thinkingHtml = `
                <div class="thinking-process">
                    <details open>
                        <summary>Thinking Process</summary>
                        <p>${escapeHtml(thinkingContent).replace(/\n/g, '<br>')}</p>
                    </details>
                </div>
            `;
            mainText = text.replace(thinkingMatch[0], '').trim();
        }

        // Parse Markdown for main text
        contentDiv.innerHTML = thinkingHtml + marked.parse(mainText);
    } else {
        contentDiv.textContent = text;
    }

    bubble.appendChild(contentDiv);

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
    bubble.innerHTML = '<div class="content"><i class="fas fa-ellipsis-h fa-fade"></i></div>'; // Typing animation

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
        <div class="bubble">
            <div class="content">
                สวัสดีครับ มีอะไรให้พี่ช่วยไหม
            </div>
        </div>
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
