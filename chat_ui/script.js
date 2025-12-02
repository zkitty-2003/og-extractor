// Global state
let currentUser = null;
let chatHistory = []; // Current chat messages
let apiKey = localStorage.getItem('openrouter_api_key') || '';
let currentChatId = null; // ID of the current active chat session

// Initialize
document.addEventListener('DOMContentLoaded', () => {
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

    // Load saved API key
    if (apiKey) {
        apiKeyInput.value = apiKey;
    }

    // Load Chat History
    loadChatHistory();

    // Event Listeners
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);

    if (messageInput) {
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
    }

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            apiKeyModal.style.display = 'block';
        });
    }

    if (saveApiKeyBtn) {
        saveApiKeyBtn.addEventListener('click', () => {
            const key = apiKeyInput.value.trim();
            if (key) {
                apiKey = key;
                localStorage.setItem('openrouter_api_key', key);
                apiKeyModal.style.display = 'none';
                alert('API Key saved!');
            }
        });
    }

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === apiKeyModal) {
            apiKeyModal.style.display = 'none';
        }
    });

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });
    }

    if (newChatBtn) newChatBtn.addEventListener('click', startNewChat);

    // Login button handler - Event listener as backup
    if (loginBtn) {
        loginBtn.addEventListener('click', window.openLoginOverlay);
    }

    // Back to Chat handler
    const backBtn = document.getElementById('back-to-chat-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            document.getElementById('login-overlay').style.display = 'none';
        });
    }

    // User Profile Click Handler (Sidebar)
    if (userProfile) {
        userProfile.addEventListener('click', () => {
            // Update UI just in case (though it should be updated on login)
            updateUIForLogin();
            window.openLoginOverlay();
        });
    }
});

// Define globally so it can be called from HTML if needed
window.openLoginOverlay = function () {
    console.log("Login button clicked (Global)");
    const overlay = document.getElementById('login-overlay');
    if (overlay) overlay.style.display = 'flex';

    // If already logged in, ensure profile view is shown
    if (currentUser) {
        updateUIForLogin();
        return; // Skip rendering Google button
    }

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
};

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
                    // Reload history for the logged-in user
                    loadChatHistory();
                    startNewChat(); // Optional: Start fresh or load last chat? Let's start fresh.
                }
            })
            .catch(err => console.error('Login error:', err));
    }
}

function updateUIForLogin() {
    if (currentUser) {
        // Update Sidebar Profile
        document.getElementById('user-name').textContent = currentUser.name;
        document.getElementById('user-email').textContent = currentUser.email;
        document.getElementById('user-avatar').src = currentUser.picture;
        const userProfile = document.getElementById('user-profile');
        const loginBtn = document.getElementById('login-btn');
        if (userProfile) userProfile.style.display = 'flex';
        if (loginBtn) loginBtn.style.display = 'none';

        // Update Overlay Content to Profile View
        const loginContent = document.querySelector('.login-content');
        if (loginContent) {
            loginContent.innerHTML = `
                <h1>User Profile</h1>
                <img src="${currentUser.picture}" class="profile-avatar-large" alt="Profile">
                <div class="profile-name-large">${currentUser.name}</div>
                <div class="profile-email-large">${currentUser.email}</div>
                <p style="margin-top: 10px; color: #fff;">Welcome back!</p>
                <button id="overlay-logout-btn" class="sign-out-btn">Sign Out</button>
            `;

            // Add Logout Handler
            document.getElementById('overlay-logout-btn').addEventListener('click', handleLogout);
        }
    }
}

function handleLogout() {
    currentUser = null;
    const userProfile = document.getElementById('user-profile');
    const loginBtn = document.getElementById('login-btn');
    if (userProfile) userProfile.style.display = 'none';
    if (loginBtn) loginBtn.style.display = 'flex';

    // Reset Overlay to Login View
    const loginContent = document.querySelector('.login-content');
    if (loginContent) {
        loginContent.innerHTML = `
            <h1>User Profile</h1>
            <p>Sign in to your account to save your chat history.</p>
            <div id="google-login-container"></div>
        `;
    }

    // Re-render Google Button
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
        google.accounts.id.renderButton(
            document.getElementById("google-login-container"),
            { theme: "outline", size: "large", width: 250 }
        );
    }

    // Reload history for guest
    loadChatHistory();
    location.reload();
}

// --- Chat History Logic ---

function getStorageKey() {
    return currentUser ? `chat_history_${currentUser.email}` : 'chat_history_guest';
}

function loadChatHistory() {
    const key = getStorageKey();
    const history = JSON.parse(localStorage.getItem(key) || '[]');
    renderHistoryList(history);
}

function saveChatHistory() {
    const key = getStorageKey();
    let history = JSON.parse(localStorage.getItem(key) || '[]');

    if (!currentChatId) {
        // Create new chat session
        currentChatId = Date.now().toString();
        const newSession = {
            id: currentChatId,
            title: chatHistory.length > 0 ? chatHistory[0].content.substring(0, 30) + '...' : 'New Chat',
            timestamp: Date.now(),
            messages: chatHistory
        };
        history.unshift(newSession); // Add to top
    } else {
        // Update existing session
        const index = history.findIndex(h => h.id === currentChatId);
        if (index !== -1) {
            history[index].messages = chatHistory;
            // Update title if it's the first message
            if (chatHistory.length > 0) {
                history[index].title = chatHistory[0].content.substring(0, 30) + '...';
            }
            history[index].timestamp = Date.now();
            // Move to top
            const updatedSession = history.splice(index, 1)[0];
            history.unshift(updatedSession);
        }
    }

    localStorage.setItem(key, JSON.stringify(history));
    renderHistoryList(history);
}

function renderHistoryList(history) {
    const historyList = document.getElementById('history-list');
    if (!historyList) return;

    historyList.innerHTML = ''; // Clear current list

    history.forEach(session => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `<span class="title">${escapeHtml(session.title)}</span>`;
        item.addEventListener('click', () => loadChatSession(session));
        historyList.appendChild(item);
    });
}

function loadChatSession(session) {
    currentChatId = session.id;
    chatHistory = session.messages || [];

    // Clear UI
    const chatContainer = document.getElementById('chat-container');
    chatContainer.innerHTML = '';

    // Render messages
    chatHistory.forEach(msg => {
        renderMessageToUI(msg.content, msg.role === 'user' ? 'user' : 'ai');
    });

    // Close mobile menu if open
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
    }
}

function renderMessageToUI(text, sender, id = null) {
    const chatContainer = document.getElementById('chat-container');
    const msgDiv = document.createElement('div');
    if (id) msgDiv.id = id;
    msgDiv.classList.add('message', sender === 'user' ? 'user-message' : 'ai-message');

    const avatar = document.createElement('div');
    avatar.classList.add('avatar');
    avatar.textContent = sender === 'user' ? 'U' : 'A';
    if (sender === 'user' && currentUser) {
        avatar.innerHTML = `<img src="${currentUser.picture}" style="width:100%;height:100%;border-radius:50%;">`;
    }

    const bubble = document.createElement('div');
    bubble.classList.add('bubble');

    const contentDiv = document.createElement('div');
    contentDiv.className = 'content';

    if (sender === 'ai') {
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

// --- End Chat History Logic ---

// Chat Functions
async function sendMessage() {
    const messageInput = document.getElementById('message-input');
    const apiKeyModal = document.getElementById('api-key-modal');

    const text = messageInput.value.trim();
    if (!text) return;

    if (!apiKey) {
        alert('Please set your OpenRouter API Key in Settings first.');
        if (apiKeyModal) apiKeyModal.style.display = 'block';
        return;
    }

    // Add User Message
    appendMessage(text, 'user');
    messageInput.value = '';

    // Create AI Message Placeholder
    const aiMsgId = 'ai-msg-' + Date.now();
    appendMessage('', 'ai', aiMsgId); // Empty content initially
    const aiMsgElement = document.getElementById(aiMsgId);
    const contentDiv = aiMsgElement.querySelector('.content');

    // Show Loading/Typing initially
    contentDiv.innerHTML = '<i class="fas fa-ellipsis-h fa-fade"></i>';

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                message: text,
                history: chatHistory.map(msg => ({ role: msg.role, content: msg.content })),
                model: "google/gemma-3-27b-it:free"
            })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });

            // Handle potential error JSON in stream
            if (chunk.startsWith('{"error":')) {
                try {
                    const errData = JSON.parse(chunk);
                    fullText = "Error: " + errData.error;
                } catch (e) {
                    fullText += chunk;
                }
            } else {
                fullText += chunk;
            }

            // Update UI
            // Check for Thinking Process
            const thinkingMatch = fullText.match(/<thought>([\s\S]*?)<\/thought>/);
            let thinkingHtml = '';
            let mainText = fullText;

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
                mainText = fullText.replace(thinkingMatch[0], '').trim();
            } else if (fullText.includes('<thought>')) {
                // Partial thought tag, don't render yet or render partially
                // For simplicity, we just render what we have, but it might look broken temporarily
            }

            contentDiv.innerHTML = thinkingHtml + marked.parse(mainText);
            scrollToBottom();
        }

        // Final update to state
        chatHistory.push({ role: "assistant", content: fullText });
        saveChatHistory();

    } catch (error) {
        contentDiv.textContent = 'Error: ' + error.message;
        chatHistory.push({ role: "assistant", content: 'Error: ' + error.message });
        saveChatHistory();
    }
}

function appendMessage(text, sender, id = null) {
    // Render UI
    renderMessageToUI(text, sender, id);

    // Save History only if it's a user message or completed AI message (not placeholder)
    if (!id) {
        // Update State
        chatHistory.push({ role: sender === 'user' ? "user" : "assistant", content: text });
        saveChatHistory();
    }
}

function scrollToBottom() {
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
}

function startNewChat() {
    const chatContainer = document.getElementById('chat-container');
    chatHistory = [];
    currentChatId = null; // Reset ID for new chat

    if (chatContainer) {
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

    // Close mobile menu if open
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
    }
}

// Helper to escape HTML to prevent XSS, but allow line breaks
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");
}
