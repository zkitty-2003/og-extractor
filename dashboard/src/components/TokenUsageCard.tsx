// Token Usage Card Component
import { Coins, Zap, DollarSign } from "lucide-react"

interface TokenUsageCardProps {
    tokenUsage: {
        total_tokens: number
        total_prompt_tokens: number
        total_completion_tokens: number
        total_cost: number
        avg_tokens_per_request: number
        total_requests: number
        tokens_by_model: { model: string; total_tokens: number; avg_tokens: number; requests: number }[]
    } | null
}

export function TokenUsageCard({ tokenUsage }: TokenUsageCardProps) {
    if (!tokenUsage) return null

    return (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 p-4 opacity-5">
                <Coins className="w-32 h-32 text-slate-900" />
            </div>

            <div className="relative z-10">
                {/* Header */}
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 bg-amber-50 rounded-lg">
                        <Coins className="w-5 h-5 text-amber-600" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800">Token Usage</h3>
                </div>

                {/* Main Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Total Tokens</p>
                        <p className="font-bold text-2xl text-amber-600">{tokenUsage.total_tokens.toLocaleString()}</p>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Requests</p>
                        <p className="font-bold text-2xl text-slate-700">{tokenUsage.total_requests}</p>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Avg/Request</p>
                        <p className="font-bold text-2xl text-slate-700">{Math.round(tokenUsage.avg_tokens_per_request)}</p>
                    </div>
                </div>

                {/* Breakdown */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                        <div className="flex items-center gap-2 mb-1">
                            <Zap className="w-3.5 h-3.5 text-blue-600" />
                            <p className="text-[10px] uppercase tracking-wider font-bold text-blue-600">Prompt</p>
                        </div>
                        <p className="font-bold text-lg text-blue-700">{tokenUsage.total_prompt_tokens.toLocaleString()}</p>
                    </div>

                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                        <div className="flex items-center gap-2 mb-1">
                            <Zap className="w-3.5 h-3.5 text-emerald-600" />
                            <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-600">Completion</p>
                        </div>
                        <p className="font-bold text-lg text-emerald-700">{tokenUsage.total_completion_tokens.toLocaleString()}</p>
                    </div>
                </div>

                {/* Models List */}
                {tokenUsage.tokens_by_model && tokenUsage.tokens_by_model.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">By Model</p>
                        <div className="space-y-2">
                            {tokenUsage.tokens_by_model.map((model) => (
                                <div key={model.model} className="flex items-center justify-between text-sm">
                                    <span className="text-slate-600 truncate flex-1">{model.model}</span>
                                    <span className="font-bold text-amber-600 ml-2">{model.total_tokens.toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Cost (if > 0) */}
                {tokenUsage.total_cost > 0 && (
                    <div className="mt-4 p-3 bg-green-50 rounded-xl border border-green-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-green-600" />
                            <span className="text-sm font-bold text-green-700">Total Cost</span>
                        </div>
                        <span className="font-bold text-lg text-green-700">${tokenUsage.total_cost.toFixed(4)}</span>
                    </div>
                )}
            </div>
        </div>
    )
}
