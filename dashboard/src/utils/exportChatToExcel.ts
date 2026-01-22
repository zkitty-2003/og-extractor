import * as XLSX from 'xlsx';

/**
 * Interface สำหรับข้อความแชท
 */
export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    created_at?: string | Date;
    chat_id?: string;
}

/**
 * ส่งออกประวัติแชทเป็นไฟล์ Excel (.xlsx)
 * 
 * @param messages - Array ของข้อความแชท
 * @param chatId - Chat ID (ใช้สำหรับชื่อไฟล์)
 * 
 * @example
 * ```tsx
 * import { export ChatToExcel } from '@/utils/exportChatToExcel';
 * 
 * const handleExport = () => {
 *   exportChatToExcel(messages, 'chat-123');
 * };
 * ```
 */
export function exportChatToExcel(messages: ChatMessage[], chatId: string = 'unknown'): void {
    if (!messages || messages.length === 0) {
        alert('ไม่มีข้อความให้ส่งออก / No messages to export');
        return;
    }

    // แปลงข้อมูลเป็นรูปแบบสำหรับ Excel
    const data = messages.map((msg, index) => ({
        'Index': index + 1,
        'Timestamp': formatTimestamp(msg.created_at),
        'Role': msg.role,
        'Message': msg.content || '',
        'Chat ID': msg.chat_id || chatId
    }));

    // สร้าง worksheet
    const worksheet = XLSX.utils.json_to_sheet(data);

    // ปรับความกว้างคอลัมน์อัตโนมัติ
    const columnWidths = [
        { wch: 10 },  // Index
        { wch: 20 },  // Timestamp
        { wch: 15 },  // Role
        { wch: 80 },  // Content (กว้างพอสำหรับข้อความยาว)
        { wch: 20 }   // Chat ID
    ];
    worksheet['!cols'] = columnWidths;

    // สร้าง workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Chat History');

    // สร้างชื่อไฟล์
    const sanitizedChatId = sanitizeFilename(chatId);
    const filename = `chat-history-${sanitizedChatId}.xlsx`;

    // ส่งออกไฟล์
    XLSX.writeFile(workbook, filename, {
        bookType: 'xlsx',
        type: 'binary',
        compression: true
    });
}

/**
 * จัดรูปแบบ timestamp ให้อ่านง่าย
 */
function formatTimestamp(timestamp?: string | Date): string {
    if (!timestamp) {
        return new Date().toLocaleString('th-TH', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    }

    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;

    if (isNaN(date.getTime())) {
        return 'Invalid Date';
    }

    // Format: YYYY-MM-DD HH:mm:ss (รูปแบบมาตรฐานที่อ่านง่าย)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * ทำความสะอาดชื่อไฟล์ (เอา characters ที่ไม่ถูกต้องออก)
 */
function sanitizeFilename(filename: string): string {
    return filename
        .replace(/[^a-zA-Z0-9-_]/g, '-')  // แทนที่ characters พิเศษด้วย dash
        .replace(/-+/g, '-')               // ลด dash ที่ซ้ำกัน
        .substring(0, 50);                 // จำกัดความยาว
}
