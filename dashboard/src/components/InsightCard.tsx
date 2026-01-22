import { cn } from "@/lib/utils";
import { TrendingUp, Activity, AlertCircle, Zap } from "lucide-react";

interface InsightCardProps {
    title: string;
    primaryMetric: React.ReactNode;
    secondaryMetric?: string;
    badgeStatus: "green" | "red" | "gray";
    insightText: string;
    icon?: React.ElementType; // Optional override
}

export function InsightCard({ title, primaryMetric, secondaryMetric, badgeStatus, insightText, icon: IconOverride }: InsightCardProps) {
    const statusConfig = {
        green: { color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100", icon: TrendingUp, badgeText: "Positive" },
        red: { color: "text-rose-600", bg: "bg-rose-50", border: "border-rose-100", icon: AlertCircle, badgeText: "Attention" },
        gray: { color: "text-slate-500", bg: "bg-slate-50", border: "border-slate-100", icon: Activity, badgeText: "Neutral" },
    };

    const config = statusConfig[badgeStatus];
    const Icon = IconOverride || config.icon;

    return (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all duration-200 group relative overflow-hidden">
            {/* Background Decoration */}
            <div className={cn("absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none", config.bg.replace("bg-", "bg-current"), config.color)} />

            <div className="flex justify-between items-start mb-3 relative z-10">
                <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">{title}</h3>
                <div className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border", config.bg, config.color, config.border)}>
                    <Icon size={12} />
                    <span>{config.badgeText}</span>
                </div>
            </div>

            <div className="mb-4 relative z-10">
                <div className="text-2xl font-bold text-slate-800 tracking-tight flex items-baseline gap-2">
                    {primaryMetric}
                </div>
                {secondaryMetric && (
                    <p className="text-xs font-medium text-slate-400 mt-1">{secondaryMetric}</p>
                )}
            </div>

            <div className={cn("text-xs font-medium px-3 py-2.5 rounded-lg border flex items-start gap-2 leading-relaxed bg-opacity-50", config.bg, config.color, config.border)}>
                <div className="mt-0.5 min-w-[14px]">
                    <Zap size={14} className={cn(config.color)} />
                </div>
                <span>{insightText}</span>
            </div>
        </div>
    );
}
