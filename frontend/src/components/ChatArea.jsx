import React, { useEffect, useRef, useState } from 'react';
import Message from './Message';
import ExportButton from './ExportButton';
import { shareChat } from '../utils/api';


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
    const fileInputRef = useRef(null);
    const [selectedFile, setSelectedFile] = useState(null);

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
        if (text || selectedFile) {
            onSendMessage(text, selectedFile);
            inputRef.current.value = '';
            setSelectedFile(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setSelectedFile(file);
        }
    };

    const handleShare = async () => {
        if (!messages || messages.length === 0) {
            alert("ไม่มีข้อความให้แชร์ครับ");
            return;
        }
        // Change text button to loading
        const btn = document.getElementById('share-btn-chatarea');
        if(btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>กำลังแชร์...</span>';
        }
        try {
            const response = await shareChat(messages);
            const shareId = response.data.id;
            const shareUrl = `${window.location.origin}${window.location.pathname}?share=${shareId}`;
            await navigator.clipboard.writeText(shareUrl);
            alert("คัดลอกลิงก์แชร์เรียบร้อยแล้ว! ส่งให้เพื่อนได้เลย\n\n" + shareUrl);
        } catch (error) {
            console.error("Error sharing chat:", error);
            alert("แชร์แชทล้มเหลว กรุณาลองใหม่");
        } finally {
            if(btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-share-alt"></i><span>แชร์แชท</span>';
            }
        }
    };



    return (
        <div className="main-content">
            <div className="chat-header" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div className="header-left">
                        <i className="fas fa-bars" id="mobile-menu-btn" onClick={onToggleSidebar}></i>
                        <span>ABDUL Chat</span>
                    </div>
                    <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>


                        <ExportButton messages={messages} chatId={currentChatId} />

                        <button id="share-btn-chatarea" className="summary-btn-primary" style={{ background: '#4CAF50' }} title="แชร์แชทนี้ให้ผู้อื่น" onClick={handleShare}>
                            <i className="fas fa-share-alt"></i>
                            <span>แชร์แชท</span>
                        </button>

                        <button className="summary-btn-primary" title="สรุปบทสนทนานี้คุยเรื่องอะไร" onClick={onSummarize}>
                            <i className="fas fa-list"></i>
                            <span>สรุปแชทนี้</span>
                        </button>
                    </div>
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
                    <div className="image-trigger-container" style={{ display: 'flex', gap: '10px' }}>
                        <button id="create-image-trigger" onClick={() => onToggleImageMode(true)}>
                            <i className="fas fa-image"></i> Create image
                        </button>
                        <button id="upload-file-trigger" style={{ background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '15px', padding: '5px 15px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }} onClick={() => fileInputRef.current?.click()}>
                            <i className="fas fa-paperclip"></i> แนบไฟล์
                        </button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            onChange={handleFileSelect}
                        />
                    </div>
                )}

                <div className={`input-wrapper ${isImageMode ? 'image-mode' : ''}`} id="input-wrapper" style={{ flexDirection: 'column' }}>
                    {isImageMode && (
                        <div className="image-mode-badge" onClick={() => onToggleImageMode(false)}>
                            <i className="fas fa-times"></i>
                            <span>Image</span>
                        </div>
                    )}

                    {selectedFile && (
                        <div className="file-preview-badge" style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', background: '#e0f7fa', borderRadius: '10px', margin: '5px 15px 0 15px', width: 'fit-content', fontSize: '12px' }}>
                            <i className="fas fa-file"></i>
                            <span>{selectedFile.name}</span>
                            <i className="fas fa-times" style={{ cursor: 'pointer', marginLeft: '5px' }} onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}></i>
                        </div>
                    )}

                    <div style={{ display: 'flex', width: '100%', alignItems: 'center' }}>
                        <textarea
                            ref={inputRef}
                            id="message-input"
                            placeholder={isBusy ? "Ai is thinking..." : (isImageMode ? "Describe an image..." : "Send a message...")}
                            rows="1"
                            onKeyDown={handleKeyDown}
                            disabled={isBusy}
                            style={{ flexGrow: 1, border: 'none', outline: 'none', padding: '15px' }}
                        ></textarea>

                        <button id="send-btn" className="input-action-btn" onClick={handleSend} disabled={isBusy} style={{ marginRight: '10px' }}>
                            <i className="fas fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
                <div className="disclaimer">ABDUL Chat may produce inaccurate information.</div>
            </div>
        </div>
    );
};

export default ChatArea;
