// Global state
let currentUser = null;
let chatHistory = []; // Current chat messages
let apiKey = localStorage.getItem('openrouter_api_key') || '';
let currentChatId = null; // ID of the current active chat session
let isBusy = false; // Flag to prevent multiple requests

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log("Chat UI v16 loaded - Image Gen Enabled");
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
    if (apiKey && apiKeyInput) {
        apiKeyInput.value = apiKey;
    }

    // Force hide modal on load to prevent ghosting
    if (apiKeyModal) apiKeyModal.style.display = 'none';

    // Restore Session
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            console.log("Restored session for:", currentUser.email);
            updateUIForLogin();
            initThemeAfterLogin(currentUser.email);
        } catch (e) {
            console.error("Error restoring session:", e);
            localStorage.removeItem('currentUser');
        }
    }

    // Load Chat History
    loadChatHistory();

    // Initialize Theme
    initTheme();

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
            console.log("Back to chat clicked");
            document.getElementById('login-overlay').style.display = 'none';
        });
    } else {
        console.error("Back to chat button not found!");
    }

    // User Profile Click Handler (Sidebar)
    if (userProfile) {
        userProfile.addEventListener('click', () => {
            // Update UI just in case (though it should be updated on login)
            updateUIForLogin();
            window.openLoginOverlay();
        });
    }

    // Share Button Handler
    const shareBtn = document.getElementById('share-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', shareCurrentChat);
    }

    // Check for Shared Chat in URL
    const urlParams = new URLSearchParams(window.location.search);
    const shareId = urlParams.get('share');
    if (shareId) {
        loadSharedChat(shareId);
    }
});

// Define globally
window.closeLoginOverlay = function () {
    console.log("Back to chat clicked (Global)");
    const overlay = document.getElementById('login-overlay');
    if (overlay) overlay.style.display = 'none';
};

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
            .then(res => {
                if (!res.ok) {
                    return res.json().then(err => { throw new Error(err.detail || 'Server error'); });
                }
                return res.json();
            })
            .then(data => {
                if (data.success) {
                    currentUser = data.user;
                    // Save to localStorage for persistence
                    localStorage.setItem('currentUser', JSON.stringify(currentUser));

                    updateUIForLogin();
                    // Load User Theme
                    initThemeAfterLogin(currentUser.email);
                    // Reload history for the logged-in user
                    loadChatHistory();
                    startNewChat();
                } else {
                    alert('Login failed: ' + (data.error || 'Unknown error'));
                }
            })
            .catch(err => {
                console.error('Login error:', err);
                alert('Login error: ' + err.message);
            });
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
    localStorage.removeItem('currentUser'); // Clear session

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
        item.innerHTML = `
            <span class="title">${escapeHtml(session.title)}</span>
            <i class="fas fa-ellipsis-h menu-btn" onclick="toggleHistoryMenu(event, '${session.id}')"></i>
            <div id="menu-${session.id}" class="history-menu" style="display: none;">
                <div class="menu-item" onclick="renameChat('${session.id}')">
                    <i class="fas fa-edit"></i> Rename
                </div>
                <div class="menu-item delete" onclick="deleteChat('${session.id}')">
                    <i class="fas fa-trash-alt"></i> Delete
                </div>
            </div>
        `;
        item.addEventListener('click', (e) => {
            // Prevent loading chat if clicking menu or menu items
            if (!e.target.closest('.menu-btn') && !e.target.closest('.history-menu')) {
                loadChatSession(session);
            }
        });
        historyList.appendChild(item);
    });
}

// Global click to close menus
document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-btn') && !e.target.closest('.history-menu')) {
        document.querySelectorAll('.history-menu').forEach(menu => {
            menu.style.display = 'none';
            // Remove active class from buttons
            const btn = menu.previousElementSibling;
            if (btn && btn.classList.contains('menu-btn')) {
                btn.classList.remove('active');
            }
        });
    }
});

function toggleHistoryMenu(event, chatId) {
    event.stopPropagation();
    // Close other menus
    document.querySelectorAll('.history-menu').forEach(menu => {
        if (menu.id !== `menu-${chatId}`) {
            menu.style.display = 'none';
            const btn = menu.previousElementSibling;
            if (btn) btn.classList.remove('active');
        }
    });

    const menu = document.getElementById(`menu-${chatId}`);
    const btn = event.target;

    if (menu) {
        if (menu.style.display === 'block') {
            menu.style.display = 'none';
            btn.classList.remove('active');
        } else {
            menu.style.display = 'block';
            btn.classList.add('active');
        }
    }
}

function renameChat(chatId) {
    const key = getStorageKey();
    let history = JSON.parse(localStorage.getItem(key) || '[]');
    const session = history.find(h => h.id === chatId);

    if (session) {
        const newTitle = prompt("Enter new chat name:", session.title);
        if (newTitle && newTitle.trim()) {
            session.title = newTitle.trim();
            localStorage.setItem(key, JSON.stringify(history));
            renderHistoryList(history);
        }
    }
    // Close menu
    const menu = document.getElementById(`menu-${chatId}`);
    if (menu) menu.style.display = 'none';
}

function deleteChat(chatId) {
    if (confirm("Are you sure you want to delete this chat?")) {
        const key = getStorageKey();
        let history = JSON.parse(localStorage.getItem(key) || '[]');
        history = history.filter(h => h.id !== chatId);
        localStorage.setItem(key, JSON.stringify(history));

        renderHistoryList(history);

        // If deleted current chat, clear UI or load another
        if (currentChatId === chatId) {
            startNewChat();
        }
    }
}

function loadChatSession(session) {
    currentChatId = session.id;
    chatHistory = session.messages || [];

    // Clear UI
    const chatContainer = document.getElementById('chat-container');
    chatContainer.innerHTML = '';

    // Render messages
    chatHistory.forEach(msg => {
        renderMessageToUI(msg.content, msg.role === 'user' ? 'user' : 'ai', null, msg.images);
    });

    // Close mobile menu if open
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
    }
}

function renderMessageToUI(text, sender, id = null, images = []) {
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

    // Render Images
    if (images && images.length > 0) {
        images.forEach(imgUrl => {
            const img = document.createElement('img');
            img.src = imgUrl;
            img.className = 'ai-image'; // Use requested class
            img.alt = 'Generated Image';
            img.onclick = () => window.open(imgUrl, '_blank');
            contentDiv.appendChild(img);
        });
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

// Chat Functions
// Image Mode State
let isImageMode = false;
let selectedStyle = "";

// Initialize UI Event Listeners
// Initialize UI Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    const imageModeBadge = document.getElementById('image-mode-badge');
    const inputWrapper = document.getElementById('input-wrapper');
    const messageInput = document.getElementById('message-input');

    // Handle Image Mode Toggle
    function toggleImageMode(active) {
        isImageMode = active;
        const createTrigger = document.getElementById('create-image-trigger');

        if (active) {
            inputWrapper.classList.add('image-mode');
            imageModeBadge.style.display = 'flex';
            messageInput.placeholder = "Describe an image...";
            if (createTrigger) createTrigger.style.display = 'none';
        } else {
            inputWrapper.classList.remove('image-mode');
            imageModeBadge.style.display = 'none';
            messageInput.placeholder = "Send a message...";
            if (createTrigger) createTrigger.style.display = 'flex';
        }
        // Focus input
        if (messageInput) messageInput.focus();
    }

    // Expose toggle for external use
    window.toggleImageMode = toggleImageMode;
});

// Chat Functions
async function sendMessage() {
    if (isBusy) return;

    const messageInput = document.getElementById('message-input');
    const text = messageInput.value.trim();
    if (!text) return;

    // Lock UI
    setBusyState(true);

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
        if (isImageMode) {
            // --- Image Generation Flow ---
            contentDiv.textContent = "Translating prompt...";

            // 1. Translate Prompt
            let finalPrompt = text;
            const thaiRegex = /[\u0E00-\u0E7F]/;

            if (thaiRegex.test(text)) {
                try {
                    const headers = { 'Content-Type': 'application/json' };
                    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

                    const transResponse = await fetch('/translate', {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify({ text: text })
                    });

                    if (transResponse.ok) {
                        const transData = await transResponse.json();
                        if (transData.debug) {
                            console.log("Translation Debug Info:", transData.debug);
                        }
                        finalPrompt = transData.english;
                        console.log(`Translated "${text}" -> "${finalPrompt}"`);
                    } else {
                        const errorText = await transResponse.text().catch(() => "Unknown error");
                        console.error(`Translation failed with status ${transResponse.status}: ${errorText}`);
                    }
                } catch (e) {
                    console.error("Translation network/logic error:", e);
                }
            }

            // Append Style
            if (selectedStyle) {
                finalPrompt += `, ${selectedStyle} style`;
            }

            contentDiv.textContent = "Generating image...";

            // 2. Generate Image URL (Pollinations)
            const encodedPrompt = encodeURIComponent(finalPrompt);
            const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}`;

            // 3. Preload Image
            const img = new Image();
            img.onload = () => {
                aiMsgElement.remove();
                // User Requirement: Show English prompt for debugging
                const displayMsg = `Generated image for: "${text}"<br><small style="color:#888">(English prompt: ${finalPrompt})</small>`;
                appendMessage(displayMsg, 'ai', null, [imageUrl]);
            };
            img.onerror = () => {
                throw new Error("Failed to generate image.");
            };
            img.src = imageUrl;

        } else {
            // --- Normal Chat Flow ---
            const headers = { 'Content-Type': 'application/json' };
            if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

            const response = await fetch('/chat', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    message: text,
                    history: chatHistory.map(msg => ({ role: msg.role, content: msg.content })),
                    model: "google/gemini-2.0-flash-exp:free"
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: response.statusText }));
                throw new Error(errorData.detail || 'Server error');
            }

            const data = await response.json();

            if (data.success) {
                const aiMessage = data.data.message;
                const images = data.data.images || [];
                aiMsgElement.remove();
                appendMessage(aiMessage, 'ai', null, images);
            } else {
                throw new Error('Unknown error from server');
            }
        }

    } catch (error) {
        contentDiv.textContent = 'Error: ' + error.message;
        chatHistory.push({ role: "assistant", content: 'Error: ' + error.message });
        saveChatHistory();
    } finally {
        setBusyState(false);
    }
}



function appendMessage(text, sender, id = null, images = []) {
    // Render UI
    renderMessageToUI(text, sender, id, images);

    // Save History only if it's a user message or completed AI message (not placeholder)
    if (!id) {
        // Update State
        chatHistory.push({ role: sender === 'user' ? "user" : "assistant", content: text, images: images });
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
        welcomeDiv.className = 'message ai-message welcome-message';
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

    // Reset Image Mode
    if (window.toggleImageMode) {
        window.toggleImageMode(false);
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

function setBusyState(busy) {
    isBusy = busy;
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');

    if (messageInput) {
        messageInput.disabled = busy;
        if (busy) {
            messageInput.placeholder = "AI is thinking...";
        } else {
            messageInput.placeholder = "Send a message...";
            messageInput.focus();
        }
    }

    if (sendBtn) {
        sendBtn.disabled = busy;
        if (busy) {
            sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            sendBtn.style.opacity = '0.7';
            sendBtn.style.cursor = 'not-allowed';
        } else {
            sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
            sendBtn.style.opacity = '1';
            sendBtn.style.cursor = 'pointer';
        }
    }
}

async function shareCurrentChat() {
    if (chatHistory.length === 0) {
        alert("ยังไม่มีข้อความให้แชร์ครับ");
        return;
    }

    try {
        const response = await fetch('/share', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: chatHistory })
        });

        if (!response.ok) throw new Error("Share failed");

        const data = await response.json();
        const shareUrl = `${window.location.origin}${window.location.pathname}?share=${data.id}`;

        await navigator.clipboard.writeText(shareUrl);
        alert("คัดลอกลิงก์แชร์เรียบร้อยแล้ว! ส่งให้เพื่อนได้เลยครับ\n\n" + shareUrl);
    } catch (error) {
        console.error("Error sharing chat:", error);
        alert("เกิดข้อผิดพลาดในการแชร์แชท");
    }
}

async function loadSharedChat(shareId) {
    try {
        const response = await fetch(`/share/${shareId}`);
        if (!response.ok) throw new Error("Shared chat not found");

        const data = await response.json();
        chatHistory = data.messages;
        currentChatId = null; // Important: Treat as new session for the guest

        // Render UI
        const chatContainer = document.getElementById('chat-container');
        chatContainer.innerHTML = '';

        // Add a system message indicating this is a shared chat
        const systemDiv = document.createElement('div');
        systemDiv.style.textAlign = 'center';
        systemDiv.style.color = '#8e8ea0';
        systemDiv.style.fontSize = '0.8rem';
        systemDiv.style.margin = '10px 0';
        systemDiv.textContent = '--- โหลดประวัติแชทที่แชร์มาเรียบร้อย (เริ่มคุยต่อได้เลย) ---';
        chatContainer.appendChild(systemDiv);

        chatHistory.forEach(msg => {
            renderMessageToUI(msg.content, msg.role === 'user' ? 'user' : 'ai');
        });

        scrollToBottom();

        // Clear URL params to avoid reloading on refresh
        window.history.replaceState({}, document.title, window.location.pathname);

    } catch (error) {
        console.error("Error loading shared chat:", error);
        alert("ไม่พบแชทที่แชร์มา หรือลิงก์หมดอายุแล้ว");
    }
}

// Theme Management
// Theme Management
function loadThemeForUser(userId) {
    return localStorage.getItem('theme_' + userId);
}

function saveThemeForUser(userId, themeName) {
    localStorage.setItem('theme_' + userId, themeName);
}

function applyTheme(themeName) {
    document.body.setAttribute('data-theme', themeName);

    // Update active button state
    document.querySelectorAll('.theme-btn').forEach(btn => {
        if (btn.dataset.themeValue === themeName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function initThemeAfterLogin(userId) {
    const userTheme = loadThemeForUser(userId);
    if (userTheme) {
        console.log(`Loading saved theme for ${userId}: ${userTheme}`);
        applyTheme(userTheme);
    } else {
        console.log(`First time login for ${userId}, setting default theme.`);
        applyTheme('default');
        saveThemeForUser(userId, 'default');
    }
}

function saveTheme(themeName) {
    applyTheme(themeName);

    if (currentUser && currentUser.email) {
        saveThemeForUser(currentUser.email, themeName);
    } else {
        // Fallback for guest
        localStorage.setItem('chat_theme', themeName);
    }
}

function initTheme() {
    // Initial load (Guest mode or before login)
    const savedTheme = localStorage.getItem('chat_theme') || 'default';
    applyTheme(savedTheme);

    // Add event listeners to theme buttons
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.dataset.themeValue;
            saveTheme(theme);
        });
    });
}

// Initialize theme on load
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
});
