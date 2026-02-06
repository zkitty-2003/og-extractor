import React from 'react';

const OpenRouterSettingsCard = ({
    apiKey,
    setApiKey,
    showKey,
    setShowKey,
    models,
    selectedModel,
    setSelectedModel,
    modelSearch,
    setModelSearch,
    isLoadingModels,
    statusMsg,
    handleFetchModels,
    handleSaveSettings,
    handleClearSettings
}) => {
    const filteredModels = models.filter(m =>
        m.id.toLowerCase().includes(modelSearch.toLowerCase()) ||
        (m.name && m.name.toLowerCase().includes(modelSearch.toLowerCase()))
    );

    return (
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
    );
};

export default OpenRouterSettingsCard;
