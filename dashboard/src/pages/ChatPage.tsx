import { useState, useRef, useEffect } from 'react';
import { ExportChatButton } from '@/components/ExportChatButton';
import type { ChatMessage } from '@/utils/exportChatToExcel';
import { Send, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ChatPage() {
    const navigate = useNavigate();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const chatId = `chat-${Date.now()}`;

    // Auto-scroll to bottom when new message arrives
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage: ChatMessage = {
            role: 'user',
            content: input.trim(),
            created_at: new Date(),
            chat_id: chatId
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        // Simulate AI response (replace with actual API call)
        setTimeout(() => {
            const aiMessage: ChatMessage = {
                role: 'assistant',
                content: 'สวัสดีครับ! นี่คือตัวอย่างการตอบกลับจาก AI\n\nข้อความของคุณ: "' + userMessage.content + '"',
                created_at: new Date(),
                chat_id: chatId
            };
            setMessages(prev => [...prev, aiMessage]);
            setIsLoading(false);
        }, 1000);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex flex-col h-screen bg-slate-50">
            {/* Header with Export Button */}
            <div className="flex items-center justify-between bg-white border-b border-slate-200 p-4 shadow-sm">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <ArrowLeft className="h-5 w-5 text-slate-600" />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">ABDUL Chat</h1>
                        <p className="text-xs text-slate-500">Chat ID: {chatId.substring(0, 20)}...</p>
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

            {/* Chat Messages */}
            <div
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto p-4 space-y-4"
            >
                {messages.length === 0 && (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center text-slate-400">
                            <div className="text-6xl mb-4">💬</div>
                            <p className="text-lg font-medium">สวัสดีครับ มีอะไรให้ช่วยไหม</p>
                            <p className="text-sm mt-2">เริ่มพิมพ์ข้อความด้านล่างเพื่อเริ่มการสนทนา</p>
                        </div>
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <div
                        key={idx}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-[70%] rounded-2xl p-4 ${msg.role === 'user'
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-white border border-slate-200 text-slate-800'
                                }`}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold opacity-70">
                                    {msg.role === 'user' ? '👤 You' : '🤖 AI'}
                                </span>
                                <span className="text-xs opacity-50">
                                    {new Date(msg.created_at!).toLocaleTimeString('th-TH')}
                                </span>
                            </div>
                            <div className="whitespace-pre-line">{msg.content}</div>
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-white border border-slate-200 rounded-2xl p-4">
                            <div className="flex items-center gap-2 text-slate-500">
                                <div className="animate-pulse">●</div>
                                <div className="animate-pulse animation-delay-200">●</div>
                                <div className="animate-pulse animation-delay-400">●</div>
                                <span className="ml-2 text-sm">AI กำลังพิมพ์...</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="bg-white border-t border-slate-200 p-4">
                <div className="max-w-4xl mx-auto flex items-end gap-3">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="พิมพ์ข้อความ..."
                        className="flex-1 resize-none rounded-2xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        rows={1}
                        style={{ maxHeight: '120px' }}
                        disabled={isLoading}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className="bg-blue-500 text-white p-3 rounded-full hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Send className="h-5 w-5" />
                    </button>
                </div>
                <p className="text-xs text-slate-400 text-center mt-2">
                    ABDUL Chat may produce inaccurate information
                </p>
            </div>
        </div>
    );
}
