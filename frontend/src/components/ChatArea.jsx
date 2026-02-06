import React, { useEffect, useRef } from 'react';
import Message from './Message';
import ExportButton from './ExportButton';


const ChatArea = ({
    messages,
    currentChatId,
    onToggleSidebar,
    onSummarize,
    onSendMessage,
    isImageMode,
    onToggleImageMode,
    isBusy,
    currentUser
}) => {
    // ... existing refs and effects ...
    const chatContainerRef = useRef(null);
    const inputRef = useRef(null);

    // Auto scroll to bottom
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages]);

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, [isImageMode]);

    const handleSend = () => {
        if (!inputRef.current) return;
        const text = inputRef.current.value.trim();
        if (text) {
            onSendMessage(text);
            inputRef.current.value = '';
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };



    return (
        <div className="main-content">
            <div className="chat-header">
                <div className="header-left">
                    <i className="fas fa-bars" id="mobile-menu-btn" onClick={onToggleSidebar}></i>
                    <span>ABDUL Chat</span>
                </div>
                <div className="header-right">
                    <ExportButton messages={messages} chatId={currentChatId} />


                    <button className="summary-btn-primary" title="สรุปบทสนทนานี้คุยเรื่องอะไร" onClick={onSummarize}>
                        <i className="fas fa-list"></i>
                        <span>สรุปแชทนี้</span>
                    </button>
                    {/* Share button can be added later */}
                </div>
            </div>

            <div className="chat-container" id="chat-container" ref={chatContainerRef}>
                {messages.length === 0 ? (
                    <div className="message ai-message welcome-message">
                        <div className="avatar">
                            <img src={`${import.meta.env.BASE_URL}cat_avatar.png`} alt="AI" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                        </div>
                        <div className="bubble">
                            <div className="content">
                                สวัสดีครับ มีอะไรให้พี่ช่วยไหม
                            </div>
                        </div>
                    </div>
                ) : (
                    messages.map((msg, idx) => (
                        <Message key={idx} message={msg} currentUser={currentUser || msg.currentUserForMsg} />
                    ))
                )}

            </div>

            <div className="input-area">
                {!isImageMode && (
                    <div className="image-trigger-container">
                        <button id="create-image-trigger" onClick={() => onToggleImageMode(true)}>
                            <i className="fas fa-image"></i> Create image
                        </button>
                    </div>
                )}

                <div className={`input-wrapper ${isImageMode ? 'image-mode' : ''}`} id="input-wrapper">
                    {isImageMode && (
                        <div className="image-mode-badge" onClick={() => onToggleImageMode(false)}>
                            <i className="fas fa-times"></i>
                            <span>Image</span>
                        </div>
                    )}

                    <textarea
                        ref={inputRef}
                        id="message-input"
                        placeholder={isBusy ? "Ai is thinking..." : (isImageMode ? "Describe an image..." : "Send a message...")}
                        rows="1"
                        onKeyDown={handleKeyDown}
                        disabled={isBusy}
                    ></textarea>

                    <button id="send-btn" className="input-action-btn" onClick={handleSend} disabled={isBusy}>
                        <i className="fas fa-paper-plane"></i>
                    </button>
                </div>
                <div className="disclaimer">ABDUL Chat may produce inaccurate information.</div>
            </div>
        </div>
    );
};

export default ChatArea;
