import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const Message = ({ message, currentUser }) => {
    const { role, content, images } = message;
    const isUser = role === 'user';

    // Parse Thinking Process
    const parseContent = (text) => {
        if (!text) return { thinking: null, mainText: '' };
        const thinkingMatch = text.match(/<thought>([\s\S]*?)<\/thought>/);
        if (thinkingMatch) {
            return {
                thinking: thinkingMatch[1].trim(),
                mainText: text.replace(thinkingMatch[0], '').trim()
            };
        }
        return { thinking: null, mainText: text };
    };

    const { thinking, mainText } = !isUser ? parseContent(content) : { thinking: null, mainText: content };
    const [imgError, setImgError] = useState(false);

    // Reset error if user or picture changes
    React.useEffect(() => {
        setImgError(false);
    }, [currentUser?.picture]);


    return (
        <div className={`message ${isUser ? 'user-message' : 'ai-message'}`}>
            <div className="avatar">
                {isUser ? (
                    currentUser && currentUser.picture && !imgError ? (
                        <img
                            src={currentUser.picture}
                            style={{ width: '100%', height: '100%', borderRadius: '50%' }}
                            alt="User"
                            onError={() => setImgError(true)}
                        />
                    ) : (
                        <div className="avatar-placeholder">
                            {currentUser && currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
                        </div>
                    )
                ) : (
                    <img src={`${import.meta.env.BASE_URL}cat_avatar.png`} alt="AI" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                )}
            </div>

            <div className={`bubble ${message.isThinking ? 'thinking-bubble' : ''}`}>
                <div className="content">
                    {message.isThinking ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span className="thinking-text">Ai is thinking</span>
                            <div className="typing-indicator">
                                <div className="typing-dot"></div>
                                <div className="typing-dot"></div>
                                <div className="typing-dot"></div>
                            </div>
                        </div>
                    ) : (
                        <>
                            {thinking && (
                                <div className="thinking-process">
                                    <details open>
                                        <summary>Thinking Process</summary>
                                        <p style={{ whiteSpace: 'pre-wrap' }}>{thinking}</p>
                                    </details>
                                </div>
                            )}

                            {isUser ? (
                                <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>
                            ) : (
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        table: ({ ...props }) => <div style={{ overflowX: 'auto' }}><table {...props} /></div>
                                    }}
                                >
                                    {mainText}
                                </ReactMarkdown>
                            )}
                        </>
                    )}

                    {images && images.length > 0 && images.map((img, i) => (
                        <img
                            key={i}
                            src={img}
                            className="ai-image"
                            alt="Generated"
                            onClick={() => window.open(img, '_blank')}
                        />
                    ))}
                </div>
            </div>
        </div >
    );
};

export default Message;
