// src/App.jsx
import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import LoginOverlay from './components/LoginOverlay';
import SummaryModal from './components/SummaryModal';
import { sendMessage, translatePrompt, summarizeChat } from './utils/api';

function App() {
  // ===== Storage Keys =====
  const OPENROUTER_KEY_STORAGE = 'openrouter_api_key';
  const OPENROUTER_MODEL_STORAGE = 'openrouter_model';

  // ===== Defaults =====
  const DEFAULT_THEME = 'default';

  // ===== State =====
  const [currentUser, setCurrentUser] = useState(null);
  const [history, setHistory] = useState([]);
  const [messages, setMessages] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [theme, setTheme] = useState(DEFAULT_THEME);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isImageMode, setIsImageMode] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  // ===== Helpers =====
  const getOpenRouterKey = () =>
    localStorage.getItem(OPENROUTER_KEY_STORAGE) || '';

  const getOpenRouterModel = () =>
    localStorage.getItem(OPENROUTER_MODEL_STORAGE) || 'google/gemma-3-27b-it:free';

  const getUserKeySuffix = (user = currentUser) => {
    const raw =
      user?.email ||
      user?.username ||
      user?.id ||
      user?.user_id ||
      user?.name;

    if (!raw) return 'guest';

    // กัน key แปลกๆ (ช่องว่าง/อักขระพิเศษ)
    return String(raw).trim().toLowerCase().replace(/\s+/g, '_');
  };


  const getHistoryStorageKey = (user) =>
    `chat_history_${getUserKeySuffix(user)}`;

  const getThemeStorageKey = (user) =>
    `theme_${getUserKeySuffix(user)}`;

  const applyTheme = (newTheme) => {
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  const loadThemeFromStorage = (user = currentUser) => {
    const key = getThemeStorageKey(user);
    let savedTheme = localStorage.getItem(key);

    // ✅ migrate: ถ้าไม่มี per-user theme ให้ลองใช้ของเก่า "theme"
    if (!savedTheme) {
      const legacy = localStorage.getItem('theme');
      if (legacy) {
        savedTheme = legacy;
        localStorage.setItem(key, legacy); // ย้ายเข้า per-user key
      }
    }

    applyTheme(savedTheme || DEFAULT_THEME);
  };


  const saveThemeToStorage = (newTheme, user) => {
    const key = getThemeStorageKey(user);
    localStorage.setItem(key, newTheme);
  };

  const loadHistoryFromStorage = (user) => {
    const key = getHistoryStorageKey(user);
    const loadedHistory = JSON.parse(localStorage.getItem(key) || '[]');
    setHistory(loadedHistory);
  };

  const saveHistoryToStorage = (newHistory, user) => {
    const key = getHistoryStorageKey(user);
    localStorage.setItem(key, JSON.stringify(newHistory));
    setHistory(newHistory);
  };

  const updateHistory = (newMessages) => {
    let newHistory = [...history];
    let chatId = currentChatId;

    if (!chatId) {
      chatId = uuidv4();
      setCurrentChatId(chatId);

      const title =
        newMessages.length > 0
          ? newMessages[0].content.substring(0, 30) + '...'
          : 'New Chat';

      newHistory.unshift({
        id: chatId,
        title,
        timestamp: Date.now(),
        messages: newMessages,
      });
    } else {
      const index = newHistory.findIndex((h) => h.id === chatId);
      if (index !== -1) {
        const prev = newHistory[index];
        const updated = {
          ...prev,
          messages: newMessages,
          timestamp: Date.now(),
        };
        newHistory.splice(index, 1);
        newHistory.unshift(updated);
      }
    }

    saveHistoryToStorage(newHistory, currentUser);
  };

  // ===== Init (once) =====
  useEffect(() => {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch {
        setCurrentUser(null);
      }
    }
  }, []);

  // ===== When user changes =====
  useEffect(() => {
    loadThemeFromStorage(currentUser);
    loadHistoryFromStorage(currentUser);

    setMessages([]);
    setCurrentChatId(null);
    setIsImageMode(false);
  }, [currentUser]);

  // ===== UI Actions =====
  const handleThemeChange = (newTheme) => {
    applyTheme(newTheme);
    saveThemeToStorage(newTheme, currentUser);
  };

  const startNewChat = () => {
    setMessages([]);
    setCurrentChatId(null);
    setIsSidebarOpen(false);
    setIsImageMode(false);
  };

  const loadChat = (session) => {
    setCurrentChatId(session.id);
    setMessages(session.messages || []);
    setIsSidebarOpen(false);
  };

  const renameChat = (id) => {
    const session = history.find((h) => h.id === id);
    if (!session) return;

    const newTitle = prompt('Enter new chat name:', session.title);
    if (newTitle && newTitle.trim()) {
      const newHistory = history.map((h) =>
        h.id === id ? { ...h, title: newTitle.trim() } : h
      );
      saveHistoryToStorage(newHistory, currentUser);
    }
  };

  const deleteChat = (id) => {
    if (window.confirm('Are you sure you want to delete this chat?')) {
      const newHistory = history.filter((h) => h.id !== id);
      saveHistoryToStorage(newHistory, currentUser);
      if (currentChatId === id) startNewChat();
    }
  };

  // ===== Core: Send Message =====
  const handleSendMessage = async (text) => {
    if (isBusy) return;
    setIsBusy(true);

    const userMsg = { role: 'user', content: text, currentUserForMsg: currentUser };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    updateHistory(newMessages);

    try {
      const token = getOpenRouterKey();

      if (isImageMode) {
        // ===== Image Generation Flow =====
        let prompt = text;

        if (/[\u0E00-\u0E7F]/.test(text)) {
          try {
            const res = await translatePrompt(text, token);
            if (res.data && res.data.english) {
              prompt = res.data.english;
            }
          } catch (e) {
            console.error('Translation failed', e);
          }
        }

        const encodedPrompt = encodeURIComponent(prompt);
        const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}`;

        const img = new Image();
        img.onload = () => {
          const aiMsg = {
            role: 'assistant',
            content: `Generated image for: "${text}"`,
            images: [imageUrl],
          };
          const finalMessages = [...newMessages, aiMsg];
          setMessages(finalMessages);
          updateHistory(finalMessages);
          setIsBusy(false);
        };
        img.onerror = () => {
          const aiMsg = { role: 'assistant', content: 'Failed to generate image.' };
          const finalMessages = [...newMessages, aiMsg];
          setMessages(finalMessages);
          updateHistory(finalMessages);
          setIsBusy(false);
        };
        img.src = imageUrl;

      } else {
        // ===== Text Chat Flow =====
        const historyForApi = newMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await sendMessage(
          text,
          currentChatId,
          currentUser?.email || null,  // ✅ Explicitly null for anonymous users
          currentUser?.picture || null, // ✅ User avatar
          historyForApi,
          getOpenRouterModel(), // ✅ Use selected model (or default)
          token
        );

        if (res.data.success) {
          const aiData = res.data.data;
          const aiMsg = { role: 'assistant', content: aiData.message, images: aiData.images || [] };
          const finalMessages = [...newMessages, aiMsg];
          setMessages(finalMessages);
          updateHistory(finalMessages);
        } else {
          throw new Error(res.data.error || 'Unknown error');
        }

        setIsBusy(false);
      }
    } catch (error) {
      console.error(error);
      const errorMsg = { role: 'assistant', content: `Error: ${error.message}` };
      const finalMessages = [...newMessages, errorMsg];
      setMessages(finalMessages);
      updateHistory(finalMessages);
      setIsBusy(false);
    }
  };

  // ===== Summarize =====
  const handleSummarize = async () => {
    if (!currentChatId || messages.length === 0) return;
    if (isBusy) return;

    setIsBusy(true);

    // Add Thinking Message
    const thinkingId = 'summary-thinking-' + Date.now();
    setMessages(prev => [...prev, { role: 'assistant', isThinking: true, id: thinkingId }]);

    try {
      const token = getOpenRouterKey();

      const historyForApi = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await summarizeChat(currentChatId, historyForApi, currentUser?.email || null, token);
      const result = res.data;

      if (result.success) {
        const title = result.data?.title || 'สรุปแชทนี้';
        const summary = result.data?.summary || 'ไม่มีสรุป';

        // Format as Markdown message (No Topics)
        const responseText = `**${title}**\n\n${summary}`;

        const aiMsg = { role: 'assistant', content: responseText };

        // Replace thinking message with result
        setMessages(prev => {
          const newMsgs = [...prev];
          newMsgs.pop();
          return [...newMsgs, aiMsg];
        });

        // We need to update history with the final state
        updateHistory([...messages, aiMsg]);

      } else {
        throw new Error(result.error || 'Summary failed');
      }
    } catch (error) {
      console.error('Summary failed', error);
      const errorMsg = { role: 'assistant', content: "Failed to summarize chat." };

      setMessages(prev => {
        const newMsgs = [...prev];
        newMsgs.pop();
        return [...newMsgs, errorMsg];
      });
      updateHistory([...messages, errorMsg]);

    } finally {
      setIsBusy(false);
    }
  };

  // ===== Auth =====
  const handleLoginSuccess = (user) => {
    console.log('LOGIN USER OBJECT =', user);
    localStorage.setItem('currentUser', JSON.stringify(user));
    setCurrentUser(user);
    setIsLoginOpen(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    setCurrentUser(null);

    // รีเซ็ต UI เป็น default แต่ไม่ลบ theme_<email>
    applyTheme(DEFAULT_THEME);

    setMessages([]);
    setCurrentChatId(null);
    setIsImageMode(false);
    setIsSidebarOpen(false);

    loadHistoryFromStorage(null);
    setIsLoginOpen(false);
  };

  // ===== Render =====
  return (
    <div className="app-container">
      <Sidebar
        history={history}
        onNewChat={startNewChat}
        onLoadChat={loadChat}
        onRenameChat={renameChat}
        onDeleteChat={deleteChat}
        currentUser={currentUser}
        onLoginClick={() => setIsLoginOpen(true)}
        currentTheme={theme}
        onThemeChange={handleThemeChange}
        isSidebarOpen={isSidebarOpen}
        onToggleImageMode={setIsImageMode}
      />

      <ChatArea
        messages={messages}
        currentChatId={currentChatId}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onSummarize={handleSummarize}
        onSendMessage={handleSendMessage}
        isImageMode={isImageMode}
        onToggleImageMode={setIsImageMode}
        isBusy={isBusy}
        currentUser={currentUser}
      />

      <LoginOverlay
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        currentUser={currentUser}
        onLoginSuccess={handleLoginSuccess}
        onLogout={handleLogout}
      />
    </div>
  );
}

export default App;
