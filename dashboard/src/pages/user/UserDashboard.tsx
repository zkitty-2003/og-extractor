import { useEffect, useState, useCallback } from "react"
import { useAuth } from "@/auth/AuthContext"
import { KpiCard } from "@/components/KpiCard"
import { TimeRangeControl } from "@/components/TimeRangeControl"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Activity, AlertTriangle, RefreshCw, MessageSquare, Zap, LayoutDashboard, Calendar, BarChart3 } from "lucide-react"
import axios from "axios"
import { formatInt, formatMs } from "@/lib/utils"

interface UserSummary {
    total_messages: number
    sessions: number
    response_time_p50_ms: number
    error_count: number
    user_id: string
}

interface ActivityLog {
    timestamp: string
    session_id: string
    status: string
    response_time_ms: number
    model: string
}

export default function UserDashboard() {
    const { userId } = useAuth()
    const [timeRange, setTimeRange] = useState("24h")
    const [loading, setLoading] = useState(true)
    const [summary, setSummary] = useState<UserSummary | null>(null)
    const [activity, setActivity] = useState<ActivityLog[]>([])

    const fetchData = useCallback(async () => {
        if (!userId) {
            setLoading(false)
            return
        }

        setLoading(true)
        try {
            // Use user-scoped endpoints
            const config = {
                headers: { 'X-User-ID': userId },
                timeout: 5000 // 5 second timeout
            }

            const [sumRes, actRes] = await Promise.all([
                axios.get(`http://127.0.0.1:10001/api/user/summary?time_range=${timeRange}`, config),
                axios.get(`http://127.0.0.1:10001/api/user/activity?limit=10`, config)
            ])

            setSummary(sumRes.data)
            setActivity(actRes.data)
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }, [userId, timeRange])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const exportToCsv = useCallback(() => {
        if (!activity || activity.length === 0) return

        // Prepare CSV headers
        const headers = ['Timestamp', 'Session ID', 'Model', 'Status', 'Response Time (ms)']

        // Prepare CSV rows with proper null handling
        const rows = activity.map(log => [
            new Date(log.timestamp).toLocaleString(),
            log.session_id,
            log.model || 'Unknown',
            log.status,
            log.response_time_ms ?? 0
        ])

        // Create CSV content
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n')

        // Add UTF-8 BOM for Google Sheets compatibility
        const BOM = '\uFEFF'
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })

        // Generate filename with date
        const now = new Date()
        const dateStr = now.toISOString().split('T')[0]
        const filename = `my_activity_${dateStr}.csv`

        // Download
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(link.href)
    }, [activity])

    if (loading && !summary) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <RefreshCw className="h-8 w-8 animate-spin text-indigo-500" />
                    <p className="text-slate-500 font-medium">Loading your activity...</p>
                </div>
            </div>
        )
    }

    if (!summary) {
        return (
            <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
                <div className="rounded-full bg-slate-100 p-4">
                    <Activity className="h-8 w-8 text-slate-400" />
                </div>
                <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-slate-900">Unable to load dashboard</h3>
                    <p className="text-sm text-slate-500">We couldn't fetch your analytics data at this time.</p>
                    <p className="text-xs text-red-500 font-mono mt-2">Check console for API errors (Port 10001)</p>
                </div>
                <button
                    onClick={fetchData}
                    className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow transition-colors hover:bg-indigo-700"
                >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Retry Connection
                </button>
            </div>
        )
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">

            {/* User Hero */}
            <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 p-8 text-white shadow-lg">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-indigo-200">
                            <LayoutDashboard className="h-5 w-5" />
                            <span className="text-sm font-semibold uppercase tracking-wider">Personal Dashboard</span>
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight">Welcome back!</h1>
                        <p className="text-indigo-100/80">Here is your AI usage activity for the last {timeRange}.</p>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 backdrop-blur-sm border border-white/20">
                            <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></div>
                            <span className="text-xs font-bold uppercase tracking-wide">Connected</span>
                        </div>
                        <TimeRangeControl value={timeRange} onChange={setTimeRange} />
                        <button
                            onClick={exportToCsv}
                            disabled={!activity || activity.length === 0}
                            className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Export to CSV (Google Sheets)"
                        >
                            <BarChart3 className="h-3.5 w-3.5" />
                            <span className="text-xs font-bold uppercase tracking-wide">Export CSV</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* KPI Grid */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                    title="My Messages"
                    value={formatInt(summary.total_messages)}
                    icon={MessageSquare}
                    status="success"
                    subtext="Messages sent"
                />
                <KpiCard
                    title="Active Sessions"
                    value={formatInt(summary.sessions)}
                    icon={Activity}
                    status="default"
                    subtext="Unique conversations"
                />
                <KpiCard
                    title="Avg Speed"
                    value={formatMs(summary.response_time_p50_ms)}
                    icon={Zap}
                    status={summary.response_time_p50_ms < 2000 ? "success" : "warning"}
                    subtext="Response time (P50)"
                />
                <KpiCard
                    title="Total Errors"
                    value={formatInt(summary.error_count)}
                    icon={AlertTriangle}
                    status={summary.error_count === 0 ? "success" : "danger"}
                    subtext="Failed Interactions"
                />
            </div>

            {/* Recent Activity Table */}
            <Card className="border-slate-200 shadow-sm">
                <CardHeader className="border-b border-slate-50 bg-slate-50/50">
                    <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-slate-500" />
                        <CardTitle className="text-base font-bold text-slate-700">Recent Transactions</CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="relative w-full overflow-auto">
                        <table className="w-full caption-bottom text-sm text-left">
                            <thead className="[&_tr]:border-b">
                                <tr className="border-b transition-colors hover:bg-slate-50/50 data-[state=selected]:bg-slate-100">
                                    <th className="h-12 px-4 align-middle font-medium text-slate-500">Timestamp</th>
                                    <th className="h-12 px-4 align-middle font-medium text-slate-500">Session ID</th>
                                    <th className="h-12 px-4 align-middle font-medium text-slate-500">Model</th>
                                    <th className="h-12 px-4 align-middle font-medium text-slate-500">Status</th>
                                    <th className="h-12 px-4 align-middle font-medium text-slate-500 text-right">Latency</th>
                                </tr>
                            </thead>
                            <tbody className="[&_tr:last-child]:border-0">
                                {activity.map((log, i) => (
                                    <tr key={i} className="border-b border-slate-50 transition-colors hover:bg-slate-50">
                                        <td className="p-4 align-middle font-medium text-slate-700">
                                            {new Date(log.timestamp).toLocaleString()}
                                        </td>
                                        <td className="p-4 align-middle text-slate-500 font-mono text-xs">
                                            {log.session_id.substring(0, 8)}...
                                        </td>
                                        <td className="p-4 align-middle">
                                            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10">
                                                {log.model || "Unknown"}
                                            </span>
                                        </td>
                                        <td className="p-4 align-middle">
                                            {log.status === 'success' ? (
                                                <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Success</span>
                                            ) : (
                                                <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">Error</span>
                                            )}
                                        </td>
                                        <td className="p-4 align-middle text-right font-mono text-slate-600">
                                            {formatMs(log.response_time_ms)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {activity.length === 0 && (
                            <div className="p-8 text-center text-slate-500">
                                No recent activity found.
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

        </div>
    )
}
