import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { exportChatToExcel, type ChatMessage } from '@/utils/exportChatToExcel';

interface ExportChatButtonProps {
    messages: ChatMessage[];
    chatId: string;
    variant?: 'default' | 'outline' | 'ghost' | 'secondary';
    size?: 'default' | 'sm' | 'lg' | 'icon';
    className?: string;
}

/**
 * ปุ่มส่งออกประวัติแชทเป็น Excel
 * 
 * @example
 * ```tsx
 * <ExportChatButton 
 *   messages={chatMessages}
 *   chatId="chat-123"
 *   variant="ghost"
 *   size="sm"
 * />
 * ```
 */
export function ExportChatButton({
    messages,
    chatId,
    variant = 'ghost',
    size = 'sm',
    className = ''
}: ExportChatButtonProps) {
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
        setIsExporting(true);

        try {
            // Simulate small delay for better UX
            await new Promise(resolve => setTimeout(resolve, 300));

            exportChatToExcel(messages, chatId);
        } catch (error) {
            console.error('Export failed:', error);
            alert('การส่งออกล้มเหลว / Export failed. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };

    const isDisabled = !messages || messages.length === 0 || isExporting;

    return (
        <Button
            variant={variant}
            size={size}
            onClick={handleExport}
            disabled={isDisabled}
            className={className}
            title={isDisabled ? 'ไม่มีข้อความให้ส่งออก' : 'ส่งออกเป็น Excel'}
        >
            {isExporting ? (
                <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span>กำลังส่งออก...</span>
                </>
            ) : (
                <>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    <span>Export to Excel</span>
                </>
            )}
        </Button>
    );
}
