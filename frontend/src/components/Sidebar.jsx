import React, { useState } from 'react';

const Sidebar = ({
    history,
    onNewChat,
    onLoadChat,
    onRenameChat,
    onDeleteChat,
    currentUser,
    onLoginClick,
    onLogoutClick,
    currentTheme,
    onThemeChange,
    isSidebarOpen,
    onToggleImageMode // passed function to toggle image mode
}) => {
    const [activeMenuId, setActiveMenuId] = useState(null);

    const toggleMenu = (e, id) => {
        e.stopPropagation();
        setActiveMenuId(activeMenuId === id ? null : id);
    };

    const handleThemeChange = (theme) => {
        onThemeChange(theme);
    };

    return (
        <div className={`sidebar ${isSidebarOpen ? 'active' : ''}`} id="sidebar">
            <div className="sidebar-top">
                <div className="new-chat-btn">
                    <button onClick={onNewChat}>
                        <i className="fas fa-plus"></i> New chat
                    </button>
                    <button id="image-studio-btn" style={{ marginTop: '10px' }} onClick={() => onToggleImageMode(true)}>
                        <i className="fas fa-palette"></i> Create Image
                    </button>
                </div>
                <div className="history-list" id="history-list">
                    {history.map((session) => (
                        <div
                            key={session.id}
                            className="history-item"
                            onClick={() => onLoadChat(session)}
                        >
                            <span className="title">{session.title}</span>
                            <i
                                className={`fas fa-ellipsis-h menu-btn ${activeMenuId === session.id ? 'active' : ''}`}
                                onClick={(e) => toggleMenu(e, session.id)}
                            ></i>

                            {activeMenuId === session.id && (
                                <div className="history-menu show" style={{ display: 'block' }}>
                                    <div className="menu-item" onClick={(e) => { e.stopPropagation(); onRenameChat(session.id); setActiveMenuId(null); }}>
                                        <i className="fas fa-edit"></i> Rename
                                    </div>
                                    <div className="menu-item delete" onClick={(e) => { e.stopPropagation(); onDeleteChat(session.id); setActiveMenuId(null); }}>
                                        <i className="fas fa-trash-alt"></i> Delete
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="sidebar-bottom">
                {currentUser ? (
                    <div className="user-profile" onClick={onLoginClick}>
                        <img className="avatar" src={currentUser.picture} alt="User Avatar" style={{ width: '30px', height: '30px', borderRadius: '2px' }} />
                        <div className="user-info">
                            <span style={{ fontWeight: 'bold', fontSize: '0.9rem', display: 'block' }}>{currentUser.name}</span>
                            <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>{currentUser.email}</span>
                        </div>
                    </div>
                ) : (
                    <button className="login-btn" onClick={onLoginClick}>
                        <i className="fas fa-user"></i> Log In
                    </button>
                )}

                <div className="theme-selector">
                    <span className="theme-label">Theme</span>
                    <div className="theme-options">
                        {['default', 'ocean', 'sunset', 'golden', 'galaxy', 'moonlight'].map(theme => (
                            <button
                                key={theme}
                                className={`theme-btn ${currentTheme === theme ? 'active' : ''}`}
                                data-theme-value={theme}
                                title={theme.charAt(0).toUpperCase() + theme.slice(1)}
                                onClick={() => handleThemeChange(theme)}
                            ></button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Sidebar;
