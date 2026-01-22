import { useState } from 'react';
import { ExportChatButton } from '@/components/ExportChatButton';
import type { ChatMessage } from '@/utils/exportChatToExcel';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ChatDemoPage() {
    const navigate = useNavigate();
    const chatId = 'demo-chat-123';

    // Mock chat messages
    const [messages] = useState<ChatMessage[]>([
        {
            role: 'user',
            content: 'สวัสดีครับ ช่วยอธิบาย React hooks ให้หน่อยได้ไหม',
            created_at: new Date('2026-01-09T10:00:00'),
            chat_id: chatId
        },
        {
            role: 'assistant',
            content: 'สวัสดีครับ! React Hooks เป็นฟีเจอร์ที่ช่วยให้คุณใช้ state และ lifecycle features ใน function components ได้ โดยไม่ต้องใช้ class components\n\nตัวอย่าง hooks ที่ใช้บ่อย:\n- useState: จัดการ state\n- useEffect: ทำงานกับ side effects\n- useContext: เข้าถึง context\n- useMemo: cache ค่าที่คำนวณแล้ว',
            created_at: new Date('2026-01-09T10:00:15'),
            chat_id: chatId
        },
        {
            role: 'user',
            content: 'ขอบคุณครับ แล้ว useState กับ useEffect ต่างกันอย่างไร',
            created_at: new Date('2026-01-09T10:01:00'),
            chat_id: chatId
        },
        {
            role: 'assistant',
            content: 'ต่างกันดังนี้ครับ:\n\n**useState:**\n- ใช้สำหรับเก็บและอัพเดทข้อมูล state\n- เมื่อ state เปลี่ยน component จะ re-render\n- ตัวอย่าง: `const [count, setCount] = useState(0)`\n\n**useEffect:**\n- ใช้สำหรับทำงานที่มี side effects เช่น fetch data, subscribe events\n- รันหลังจาก component render เสร็จ\n- สามารถ cleanup ได้เมื่อ component unmount\n- ตัวอย่าง: `useEffect(() => { fetchData() }, [])`',
            created_at: new Date('2026-01-09T10:01:30'),
            chat_id: chatId
        }
    ]);

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-4xl mx-auto space-y-6">
                {/* Header with Export Button */}
                <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate(-1)}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            <ArrowLeft className="h-5 w-5 text-slate-600" />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800">Chat Demo</h1>
                            <p className="text-sm text-slate-500">Chat ID: {chatId}</p>
                        </div>
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
                                    ? 'bg-blue-50 border border-blue-100 ml-12'
                                    : 'bg-slate-50 border border-slate-100 mr-12'
                                }`}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    {msg.role === 'user' ? '👤 User' : '🤖 Assistant'}
                                </span>
                                <span className="text-xs text-slate-400">
                                    {new Date(msg.created_at!).toLocaleString('th-TH')}
                                </span>
                            </div>
                            <div className="text-slate-700 whitespace-pre-line">{msg.content}</div>
                        </div>
                    ))}
                </div>

                {/* Footer with another Export Button */}
                <div className="flex justify-center pt-4">
                    <ExportChatButton
                        messages={messages}
                        chatId={chatId}
                        variant="ghost"
                        size="sm"
                        className="text-slate-500"
                    />
                </div>
            </div>
        </div>
    );
}
