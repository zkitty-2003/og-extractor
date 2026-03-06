import * as XLSX from 'xlsx';

// Polyfill/Shim check if needed for some environments
const getXLSX = () => {
    if (typeof XLSX !== 'undefined') return XLSX;
    // Fallback if imported as default
    if (window.XLSX) return window.XLSX;
    return null;
};

/**
 * Chat Message Format
 * @typedef {Object} ChatMessage
 * @property {string} role - 'user' or 'assistant'
 * @property {string} content - Message content
 * @property {string|number|Date} [timestamp] - Timestamp of the message
 */

/**
 * Export chat history to Excel (.xlsx)
 * 
 * @param {ChatMessage[]} messages - Array of chat messages
 * @param {string} chatId - Chat ID for filename
 */
export function exportChatToExcel(messages, chatId = 'unknown') {
    if (!messages || messages.length === 0) {
        alert('ไม่มีข้อความให้ส่งออก / No messages to export');
        return;
    }

    // Prepare data for Excel
    const data = messages.map((msg, index) => ({
        'Index': index + 1,
        'Timestamp': formatTimestamp(msg.timestamp || new Date()),
        'Role': msg.role === 'user' ? 'User' : 'Assistant',
        'Message': msg.content || '',
        'Chat ID': chatId
    }));

    const lib = getXLSX();
    if (!lib) {
        console.error('XLSX library not found. Make sure "xlsx" is installed.');
        alert('ระบบ Excel ขัดข้อง: ไม่พบไลบรารีส่งออก');
        return;
    }

    // Create worksheet
    const worksheet = lib.utils.json_to_sheet(data);

    // Set column widths
    const columnWidths = [
        { wch: 10 },  // Index
        { wch: 20 },  // Timestamp
        { wch: 15 },  // Role
        { wch: 80 },  // Message
        { wch: 20 }   // Chat ID
    ];
    worksheet['!cols'] = columnWidths;

    // Create workbook
    const workbook = lib.utils.book_new();
    lib.utils.book_append_sheet(workbook, worksheet, 'Chat History');

    // Generate filename
    const sanitizedChatId = (chatId || 'chat').replace(/[^a-zA-Z0-9-_]/g, '-').substring(0, 50);
    const filename = `chat-history-${sanitizedChatId}.xlsx`;

    console.log('Generating Excel file:', filename);

    // Write file
    try {
        lib.writeFile(workbook, filename, {
            bookType: 'xlsx',
            type: 'binary',
            compression: true
        });
    } catch (writeErr) {
        console.error('XLSX.writeFile failed:', writeErr);
        // Fallback to simpler call if compression/options fail
        lib.writeFile(workbook, filename);
    }
}

function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
