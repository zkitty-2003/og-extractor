import React, { useState } from 'react';
import { exportChatToExcel } from '../utils/exportChat';

const ExportButton = ({ messages, chatId }) => {
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 500));
            exportChatToExcel(messages, chatId);
        } catch (error) {
            console.error('Export failed:', error);
            alert('Export failed. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <button
            type="button"
            className="export-btn-primary"
            onClick={handleExport}
            disabled={isExporting} // Only disable when exporting
            title="Export to Excel"
            style={{
                marginRight: '10px',
                display: 'flex',
                flexShrink: 0,
                alignItems: 'center',
                zIndex: 10
            }}
        >
            {isExporting ? (
                <i className="fas fa-spinner fa-spin" style={{ marginRight: '5px' }}></i>
            ) : (
                <i className="fas fa-file-excel" style={{ marginRight: '5px' }}></i>
            )}
            <span>Export Excel</span>
        </button>
    );
};

export default ExportButton;
