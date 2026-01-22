// ===================================================================
// ตัวอย่างการใช้งาน Export Chat to Excel
// Example Usage of Export Chat to Excel Feature
// ===================================================================

import { useState, useEffect } from 'react';
import { ExportChatButton } from '@/components/ExportChatButton';
import type { ChatMessage } from '@/utils/exportChatToExcel';

export default function ChatPage() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const chatId = 'chat-12345'; // จาก URL params หรือ state

    // ตัวอย่างข้อมูล / Example data
    useEffect(() => {
        setMessages([
            {
                role: 'user',
                content: 'สวัสดีครับ ช่วยอธิบาย React hooks ให้หน่อยได้ไหม',
                created_at: new Date('2026-01-09T10:00:00'),
                chat_id: chatId
            },
            {
                role: 'assistant',
                content: 'React Hooks เป็นฟีเจอร์ที่ช่วยให้คุณใช้ state และ lifecycle features ใน function components ได้ โดยไม่ต้องใช้ class components',
                created_at: new Date('2026-01-09T10:00:15'),
                chat_id: chatId
            },
            {
                role: 'user',
                content: 'ขอบคุณครับ แล้ว useState กับ useEffect ต่างกันอย่างไร',
                created_at: new Date('2026-01-09T10:01:00'),
                chat_id: chatId
            }
        ]);
    }, []);

    return (
        <div className="container mx-auto p-4">
            {/* Header with Export Button */}
            <div className="flex items-center justify-between mb-6 bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Chat History</h1>
                    <p className="text-sm text-slate-500">Chat ID: {chatId}</p>
                </div>

                {/* Export Button */}
                <ExportChatButton
                    messages={messages}
                    chatId={chatId}
                    variant="outline"
                    size="default"
                />
            </div>

            {/* Messages Display */}
            <div className="space-y-4">
                {messages.map((msg, idx) => (
                    <div
                        key={idx}
                        className={`p-4 rounded-lg ${msg.role === 'user'
                                ? 'bg-blue-50 border border-blue-100'
                                : 'bg-slate-50 border border-slate-100'
                            }`}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                {msg.role === 'user' ? 'User' : 'Assistant'}
                            </span>
                            <span className="text-xs text-slate-400">
                                {new Date(msg.created_at!).toLocaleString('th-TH')}
                            </span>
                        </div>
                        <p className="text-slate-700">{msg.content}</p>
                    </div>
                ))}
            </div>

            {/* สามารถใส่ Export Button ที่ footer ได้ด้วย */}
            <div className="mt-8 flex justify-center">
                <ExportChatButton
                    messages={messages}
                    chatId={chatId}
                    variant="ghost"
                    size="sm"
                    className="text-slate-500"
                />
            </div>
        </div>
    );
}

// ===================================================================
// หรือใช้แบบ Icon-only Button (สำหรับ toolbar)
// Or use as Icon-only Button (for toolbar)
// ===================================================================

export function ChatToolbar({ messages, chatId }: { messages: ChatMessage[], chatId: string }) {
    return (
        <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
            {/* ปุ่มอื่นๆ */}
            <button className="p-2 hover:bg-slate-100 rounded">
                {/* ... */}
            </button>

            {/* Export Button - Icon Only */}
            <ExportChatButton
                messages={messages}
                chatId={chatId}
                variant="ghost"
                size="icon"
            />
        </div>
    );
}
