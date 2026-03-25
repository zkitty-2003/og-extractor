import React from 'react';

const PollinationsSettingsCard = ({
    apiKey,
    setApiKey,
    showKey,
    setShowKey,
    handleSaveSettings,
    handleClearSettings,
    statusMsg
}) => {
    return (
        <div className="settings-card" style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
            <div className="settings-header">
                <h2><i className="fas fa-palette"></i> Pollinations Image Settings</h2>
            </div>

            <div className="form-group">
                <label className="form-label">Pollinations API Key (Optional)</label>
                <div className="input-with-icon">
                    <input
                        type={showKey ? "text" : "password"}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Leave empty for free mode"
                        className="settings-input"
                    />
                    <button
                        className="toggle-visibility-btn"
                        onClick={() => setShowKey(!showKey)}
                        title={showKey ? "Hide Key" : "Show Key"}
                    >
                        <i className={`fas fa-eye${showKey ? '-slash' : ''}`}></i>
                    </button>
                </div>
                <p style={{ fontSize: '0.75rem', marginTop: '5px', opacity: 0.7 }}>
                    Get your free key at <a href="https://pollinations.ai" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-color)' }}>pollinations.ai</a>
                </p>
            </div>

            <div style={{ display: 'flex', gap: '15px', marginTop: '20px' }}>
                <button
                    onClick={handleSaveSettings}
                    className="action-btn btn-primary"
                    style={{ backgroundColor: '#10b981' }}
                >
                    <i className="fas fa-save"></i> Save Pollinations Key
                </button>
            </div>
        </div>
    );
};

export default PollinationsSettingsCard;
