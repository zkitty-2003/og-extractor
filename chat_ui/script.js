// Send token to backend
console.log("Sending token to backend...");
fetch('/auth/google', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ token: response.credential })
})
    .then(res => {
        console.log("Backend response status:", res.status);
        return res.json();
    })
    .then(data => {
        console.log("Backend data:", data);
        if (data.success) {
            console.log("Login successful, updating UI...");
            currentUser = data.user;
            updateUIForLogin();
            // Keep overlay open to show profile view
        } else {
            console.error("Login failed:", data);
        }
    })
    .catch(err => console.error('Login error:', err));



function updateUIForLogin() {
    console.log("updateUIForLogin called", currentUser);
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
        console.log("Found loginContent:", loginContent);
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

    location.reload();
}

// Chat Functions
async function sendMessage() {
    const messageInput = document.getElementById('message-input');
    const chatContainer = document.getElementById('chat-container');
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
    const chatContainer = document.getElementById('chat-container');
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
    const chatContainer = document.getElementById('chat-container');
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
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
}

function startNewChat() {
    const chatContainer = document.getElementById('chat-container');
    chatHistory = [];
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
}

// Helper to escape HTML to prevent XSS, but allow line breaks
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");
}
