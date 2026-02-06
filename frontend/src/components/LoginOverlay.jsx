import React, { useEffect, useState } from 'react';
import { googleLogin, fetchOpenRouterModels } from '../utils/api';
import OpenRouterSettingsCard from './OpenRouterSettingsCard';

const LoginOverlay = ({ isOpen, onClose, currentUser, onLogout, onLoginSuccess }) => {
    // OpenRouter State
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [models, setModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState('');
    const [modelSearch, setModelSearch] = useState('');
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');

    // Collapsible Settings State
    const [showSettings, setShowSettings] = useState(false);

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
                    <div className="profile-section" style={{ marginBottom: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <img src={currentUser.picture} className="profile-avatar-large" alt="Profile" />
                        <div className="profile-name-large">{currentUser.name}</div>
                        <div className="profile-email-large">{currentUser.email}</div>

                        {/* Toggle Buttons */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '420px', marginTop: '20px' }}>
                            <button
                                className="toggle-settings-btn"
                                onClick={() => setShowSettings(!showSettings)}
                            >
                                <i className={`fas ${showSettings ? 'fa-times' : 'fa-cog'}`}></i>
                                {showSettings ? 'Close Settings' : 'OpenRouter Settings'}
                            </button>
                            <button
                                className="sign-out-btn"
                                onClick={onLogout}
                                style={{ width: '100%', backgroundColor: '#ef4444' }}
                            >
                                <i className="fas fa-sign-out-alt"></i> Sign Out
                            </button>
                        </div>

                        {/* Collapsible Settings */}
                        <div className={`settings-collapsible ${showSettings ? 'open' : ''}`}>
                            <OpenRouterSettingsCard
                                apiKey={apiKey}
                                setApiKey={setApiKey}
                                showKey={showKey}
                                setShowKey={setShowKey}
                                models={models}
                                selectedModel={selectedModel}
                                setSelectedModel={setSelectedModel}
                                modelSearch={modelSearch}
                                setModelSearch={setModelSearch}
                                isLoadingModels={isLoadingModels}
                                statusMsg={statusMsg}
                                handleFetchModels={handleFetchModels}
                                handleSaveSettings={handleSaveSettings}
                                handleClearSettings={handleClearSettings}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="login-section" style={{ marginBottom: '40px' }}>
                        <h1>Welcome to ABDUL Chat</h1>
                        <p>Sign in to your account to save your chat history and settings.</p>
                        <div id="google-login-container" style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}></div>
                    </div>
                )}



            </div>
        </div>
    );
};

export default LoginOverlay;
