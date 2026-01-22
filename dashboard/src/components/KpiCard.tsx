import { Card, CardContent } from "@/components/ui/card"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown } from "lucide-react"

interface KpiCardProps {
    title: string
    value: string | number
    icon: LucideIcon
    subtext?: string
    status?: "default" | "success" | "warning" | "danger"
}

export function KpiCard({ title, value, icon: Icon, subtext, status = "default" }: KpiCardProps) {
    const statusConfig = {
        default: {
            cardBg: "bg-slate-50/50",
            iconBg: "bg-slate-100",
            iconColor: "text-slate-600",
            badgeBg: "bg-slate-100",
            badgeText: "text-slate-600"
        },
        success: {
            cardBg: "bg-emerald-50/30",
            iconBg: "bg-emerald-100",
            iconColor: "text-emerald-600",
            badgeBg: "bg-emerald-100",
            badgeText: "text-emerald-600"
        },
        warning: {
            cardBg: "bg-amber-50/30",
            iconBg: "bg-amber-100",
            iconColor: "text-amber-600",
            badgeBg: "bg-amber-100",
            badgeText: "text-amber-600"
        },
        danger: {
            cardBg: "bg-rose-50/30",
            iconBg: "bg-rose-100",
            iconColor: "text-rose-600",
            badgeBg: "bg-rose-100",
            badgeText: "text-rose-600"
        },
    }

    const currentStatus = statusConfig[status]

    // Parse value and unit if string "123 ms"
    let displayValue = value.toString();
    let unit = "";

    if (typeof value === 'string' && value.includes(' ')) {
        const parts = value.split(' ');
        displayValue = parts[0];
        unit = parts.slice(1).join(' ');
    }

    return (
        <Card className={cn(
            "relative overflow-hidden border-0 transition-all duration-300 hover:shadow-md",
            currentStatus.cardBg
        )}>
            <CardContent className="p-6">
                {/* Top Row: Icon + Badge */}
                <div className="flex items-start justify-between mb-8">
                    {/* Icon */}
                    <div className={cn(
                        "p-3 rounded-xl",
                        currentStatus.iconBg,
                        currentStatus.iconColor
                    )}>
                        <Icon className="h-6 w-6" />
                    </div>

                    {/* Badge/Indicator */}
                    {subtext && (
                        <div className={cn(
                            "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold",
                            currentStatus.badgeBg,
                            currentStatus.badgeText
                        )}>
                            {status === 'danger' && <TrendingUp className="h-3 w-3" />}
                            {status === 'success' && <TrendingDown className="h-3 w-3" />}
                            <span className="opacity-90">{subtext}</span>
                        </div>
                    )}
                </div>

                {/* Bottom: Title + Value */}
                <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-500">
                        {title}
                    </p>
                    <div className="flex items-baseline gap-1.5">
                        <h3 className="text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
                            {displayValue}
                        </h3>
                        {unit && <span className="text-base font-medium text-slate-500">{unit}</span>}
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
