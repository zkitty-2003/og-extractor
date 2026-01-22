import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TimeRangeControlProps {
    value: string;
    onChange: (value: string) => void;
}

export function TimeRangeControl({ value, onChange }: TimeRangeControlProps) {
    const ranges = [
        { label: '24h', value: '24h' },
        { label: '7d', value: '7d' },
        { label: '30d', value: '30d' },
    ];

    return (
        <div className="flex items-center gap-1 bg-slate-100/50 p-1 rounded-lg border border-slate-200/60">
            {ranges.map((range) => (
                <Button
                    key={range.value}
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange(range.value)}
                    className={cn(
                        "h-7 px-3 text-xs font-semibold transition-all rounded-md",
                        value === range.value
                            ? "bg-white text-slate-900 shadow-sm ring-1 ring-black/5"
                            : "text-slate-500 hover:text-slate-900 hover:bg-slate-200/50"
                    )}
                >
                    {range.label}
                </Button>
            ))}
        </div>
    );
}
