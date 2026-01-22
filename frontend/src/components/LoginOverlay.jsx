import React, { useEffect, useState } from 'react';
import { googleLogin, fetchOpenRouterModels } from '../utils/api';

const LoginOverlay = ({ isOpen, onClose, currentUser, onLogout, onLoginSuccess }) => {
    // OpenRouter State
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [models, setModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState('');
    const [modelSearch, setModelSearch] = useState('');
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');

    useEffect(() => {
        if (isOpen) {
            // Load saved settings
            const savedKey = localStorage.getItem('openrouter_api_key') || '';
            const savedModel = localStorage.getItem('openrouter_model') || '';
            setApiKey(savedKey);
            setSelectedModel(savedModel);

            // Re-render Google Button if needed
            if (!currentUser && window.google && window.google.accounts && window.google.accounts.id) {
                window.google.accounts.id.initialize({
                    client_id: "888682176364-95k6bep0ajble7a48romjeui850dptg0.apps.googleusercontent.com",
                    callback: handleCredentialResponse
                });
                // Ensure element exists before rendering
                const btnContainer = document.getElementById("google-login-container");
                if (btnContainer) {
                    window.google.accounts.id.renderButton(
                        btnContainer,
                        { theme: "outline", size: "large", width: 250 }
                    );
                }
            }

            // Auto-load models if key exists
            if (savedKey) {
                handleFetchModels(savedKey);
            }
        }
    }, [isOpen, currentUser]);

    const handleCredentialResponse = async (response) => {
        try {
            const res = await googleLogin(response.credential);
            if (res.data.success) {
                onLoginSuccess(res.data.user);
            }
        } catch (error) {
            console.error("Login failed", error);
            alert("Login failed");
        }
    };

    const handleFetchModels = async (key) => {
        if (!key) return;
        setIsLoadingModels(true);
        setStatusMsg('Loading models...');
        try {
            const res = await fetchOpenRouterModels(key);
            if (res.data && res.data.data) {
                const sorted = res.data.data.sort((a, b) => a.id.localeCompare(b.id));
                setModels(sorted);
                setStatusMsg('Models loaded success');
            }
        } catch (err) {
            console.error(err);
            setStatusMsg('Failed to load models. Check API Key.');
            setModels([]);
        } finally {
            setIsLoadingModels(false);
        }
    };

    const handleSaveSettings = () => {
        localStorage.setItem('openrouter_api_key', apiKey);
        localStorage.setItem('openrouter_model', selectedModel);
        setStatusMsg('Settings saved! Please reload chat.');

        // Auto-fetch if models are empty but key is present
        if (apiKey && models.length === 0) {
            handleFetchModels(apiKey);
        }

        // Hide success message after 3s
        setTimeout(() => setStatusMsg(''), 3000);
    };

    const handleClearSettings = () => {
        localStorage.removeItem('openrouter_api_key');
        localStorage.removeItem('openrouter_model');
        setApiKey('');
        setSelectedModel('');
        setModels([]);
        setStatusMsg('Settings cleared.');
        setTimeout(() => setStatusMsg(''), 3000);
    };

    const filteredModels = models.filter(m =>
        m.id.toLowerCase().includes(modelSearch.toLowerCase()) ||
        (m.name && m.name.toLowerCase().includes(modelSearch.toLowerCase()))
    );

    if (!isOpen) return null;

    return (
        <div className="login-overlay">
            <div className="login-header">
                <button id="back-to-chat-btn" onClick={onClose}>
                    <i className="fas fa-arrow-left"></i> Back to Chat
                </button>
            </div>

            <div className="login-content" style={{ overflowY: 'auto' }}>

                {/* === User Profile Section === */}
                {currentUser ? (
                    <div className="profile-section" style={{ marginBottom: '40px' }}>
                        <img src={currentUser.picture} className="profile-avatar-large" alt="Profile" />
                        <div className="profile-name-large">{currentUser.name}</div>
                        <div className="profile-email-large">{currentUser.email}</div>

                    </div>
                ) : (
                    <div className="login-section" style={{ marginBottom: '40px' }}>
                        <h1>Welcome to ABDUL Chat</h1>
                        <p>Sign in to your account to save your chat history and settings.</p>
                        <div id="google-login-container" style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}></div>
                    </div>
                )}

                {/* === OpenRouter Settings Section === */}
                <div className="settings-card">
                    <div className="settings-header">
                        <h2><i className="fas fa-robot"></i> OpenRouter Settings</h2>
                    </div>

                    {/* API Key Input */}
                    <div className="form-group">
                        <label className="form-label">API Key</label>
                        <div className="input-with-icon">
                            <input
                                type={showKey ? "text" : "password"}
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="sk-or-..."
                                className="settings-input"
                            />
                            <button
                                className="toggle-visibility-btn"
                                onClick={() => setShowKey(!showKey)}
                                title={showKey ? "Hide API Key" : "Show API Key"}
                            >
                                <i className={`fas fa-eye${showKey ? '-slash' : ''}`}></i>
                            </button>
                        </div>
                    </div>

                    {/* Load Models Button */}
                    <button
                        onClick={() => handleFetchModels(apiKey)}
                        disabled={!apiKey || isLoadingModels}
                        className={`action-btn ${isLoadingModels ? 'btn-secondary' : 'btn-secondary'}`}
                        style={{ marginBottom: '20px', justifyContent: 'center' }}
                    >
                        {isLoadingModels ? (
                            <><i className="fas fa-circle-notch fa-spin"></i> Loading Models...</>
                        ) : (
                            <><i className="fas fa-sync-alt"></i> Load Models from OpenRouter</>
                        )}
                    </button>

                    {/* Model Selection */}
                    {models.length > 0 && (
                        <div className="models-container">
                            <div className="form-group">
                                <label className="form-label">Select Model</label>

                                {/* Filter Input */}
                                <div className="input-with-icon" style={{ marginBottom: '10px' }}>
                                    <i className="fas fa-search input-icon-left"></i>
                                    <input
                                        type="text"
                                        placeholder="Filter models..."
                                        value={modelSearch}
                                        onChange={(e) => setModelSearch(e.target.value)}
                                        className="settings-input with-left-icon"
                                    />
                                </div>

                                {/* Select Dropdown */}
                                <select
                                    value={selectedModel}
                                    onChange={(e) => setSelectedModel(e.target.value)}
                                    className="settings-input"
                                    style={{ cursor: 'pointer' }}
                                >
                                    <option value="">-- Choose a Model --</option>
                                    {filteredModels.map(m => (
                                        <option key={m.id} value={m.id}>
                                            {m.id} ({m.pricing?.prompt === "0" ? 'Free' : 'Paid'})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: '15px', marginTop: '25px' }}>
                        <button
                            onClick={handleSaveSettings}
                            className="action-btn btn-primary"
                        >
                            <i className="fas fa-save"></i> Save
                        </button>
                        <button
                            onClick={handleClearSettings}
                            className="action-btn btn-danger"
                            style={{ width: 'auto', padding: '12px 20px' }}
                            title="Clear all settings"
                        >
                            <i className="fas fa-trash-alt"></i>
                        </button>
                    </div>

                    {/* Status Message */}
                    {statusMsg && (
                        <div style={{ textAlign: 'center' }}>
                            <div className={`status-badge ${statusMsg.includes('Failed') ? 'status-error' : 'status-success'}`}>
                                <i className={`fas ${statusMsg.includes('Failed') ? 'fa-exclamation-circle' : 'fa-check-circle'}`}></i>
                                {statusMsg}
                            </div>
                        </div>
                    )}
                </div>

                {/* Sign Out Button (Moved to Bottom) */}
                {currentUser && (
                    <button
                        className="sign-out-btn"
                        onClick={onLogout}
                        style={{ marginTop: '20px', width: '100%', maxWidth: '420px', backgroundColor: '#ef4444' }}
                    >
                        <i className="fas fa-sign-out-alt"></i> Sign Out
                    </button>
                )}

            </div>
        </div>
    );
};

export default LoginOverlay;
