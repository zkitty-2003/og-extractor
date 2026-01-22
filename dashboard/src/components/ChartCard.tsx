import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

interface ChartCardProps {
    title: string
    description?: string
    children: ReactNode
    className?: string
    headerAction?: ReactNode
}

export function ChartCard({ title, description, children, className, headerAction }: ChartCardProps) {
    return (
        <Card className={cn("border-slate-200 shadow-sm bg-white flex flex-col", className)}>
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-50 py-4 px-6 space-y-0">
                <div className="flex items-center gap-3">
                    <CardTitle className="text-base font-bold text-slate-800 tracking-tight">{title}</CardTitle>
                    {description && <div className="hidden md:block h-4 w-px bg-slate-200"></div>}
                    {description && <p className="hidden md:block text-xs font-semibold text-slate-400 uppercase tracking-wide">{description}</p>}
                </div>
                {headerAction && (
                    <div className="flex items-center gap-2">
                        {headerAction}
                    </div>
                )}
            </CardHeader>
            <CardContent className="p-6 flex-1 min-h-[300px]">
                {children}
            </CardContent>
        </Card>
    )
}
