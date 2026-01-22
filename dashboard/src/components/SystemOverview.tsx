import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, MessageSquare, Zap } from "lucide-react";
import { formatInt } from "@/lib/utils";

interface SystemOverviewProps {
    totalMessages: number;
    activeUsers: number;
    p50Latency: number;
}

export function SystemOverview({ totalMessages, activeUsers, p50Latency }: SystemOverviewProps) {
    // Severity Logic
    // const latencySeverity = p50Latency > 2000 ? 'text-amber-600 bg-amber-50 ring-amber-100' : 'text-emerald-600 bg-emerald-50 ring-emerald-100';

    return (
        <Card className="flex h-full flex-col justify-center border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3 pt-4 px-5 border-b border-slate-50">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-widest">System Status</CardTitle>
                    <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 ring-1 ring-emerald-100">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500"></div>
                        <span className="text-[10px] font-bold text-emerald-700">HEALTHY</span>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex items-center justify-between p-6">

                {/* Messages */}
                <div className="flex flex-col items-center gap-2">
                    <div className="rounded-full bg-blue-50 p-2.5 text-blue-600 ring-1 ring-inset ring-blue-100">
                        <MessageSquare className="h-5 w-5" />
                    </div>
                    <div className="text-center">
                        <p className="text-xl font-bold text-slate-900 leading-none">{formatInt(totalMessages)}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Messages</p>
                    </div>
                </div>

                <div className="h-10 w-px bg-slate-100"></div>

                {/* Users */}
                <div className="flex flex-col items-center gap-2">
                    <div className="rounded-full bg-indigo-50 p-2.5 text-indigo-600 ring-1 ring-inset ring-indigo-100">
                        <Users className="h-5 w-5" />
                    </div>
                    <div className="text-center">
                        <p className="text-xl font-bold text-slate-900 leading-none">{formatInt(activeUsers)}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Live Users</p>
                    </div>
                </div>

                <div className="h-10 w-px bg-slate-100"></div>

                {/* Latency */}
                <div className="flex flex-col items-center gap-2">
                    <div className="rounded-full bg-amber-50 p-2.5 text-amber-600 ring-1 ring-inset ring-amber-100">
                        <Zap className="h-5 w-5" />
                    </div>
                    <div className="text-center">
                        <div className="flex items-baseline gap-0.5">
                            <p className="text-xl font-bold text-slate-900 leading-none">{formatInt(p50Latency)}</p>
                            <span className="text-[10px] font-medium text-slate-400">ms</span>
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Latency</p>
                    </div>
                </div>

            </CardContent>
        </Card>
    );
}
