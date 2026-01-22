// Copied from original App.tsx, but wrapped as a page component
import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { KpiCard } from "@/components/KpiCard"
import { ChartCard } from "@/components/ChartCard"
import { TimeRangeControl } from "@/components/TimeRangeControl"
import { HeroPanel } from "@/components/HeroPanel"
import { SystemOverview } from "@/components/SystemOverview"
import { TopUsersList } from "@/components/TopUsersList"
import { TokenUsageCard } from "@/components/TokenUsageCard"
import { InsightCard } from "@/components/InsightCard"
import { Button } from "@/components/ui/button"
import { Activity, Clock, AlertTriangle, RefreshCw, BarChart3, LogOut, Download, Users, MessageSquare, ClipboardList } from "lucide-react"
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'
import axios from "axios"
import * as htmlToImage from 'html-to-image'
import { jsPDF } from "jspdf"

import { formatInt, formatMs, formatPct } from "@/lib/utils"
import { useAuth } from "@/auth/AuthContext"

// Types
interface DashboardSummary {
    total_messages: number
    active_users: number
    sessions: number
    response_time_p50_ms: number
    response_time_p95_ms: number
    error_count: number
    error_rate_pct: number
    top_users: { name: string; count: number; is_anonymous?: boolean }[]
    top_models: { name: string; count: number }[]
    anonymous_messages: number
    anonymous_rate_pct: number
}

interface TimeseriesPoint {
    timestamp: string
    count?: number
    p50?: number
    p95?: number
    anonymous?: number
    authenticated?: number
    active_users?: number
}

interface DashboardTimeseries {
    messages_over_time: TimeseriesPoint[]
    response_time_over_time: TimeseriesPoint[]
    errors_over_time: TimeseriesPoint[]
}

interface TokenUsageData {
    total_tokens: number
    total_prompt_tokens: number
    total_completion_tokens: number
    total_cost: number
    avg_tokens_per_request: number
    total_requests: number
    tokens_by_model: { model: string; total_tokens: number; avg_tokens: number; requests: number }[]
    tokens_by_provider: { provider: string; total_tokens: number; requests: number }[]
}

interface InsightData {
    total_messages_today: number
    total_messages_yesterday: number
    unique_users_today: number
    unique_users_yesterday: number
    avg_latency_today_ms: number
    avg_latency_yesterday_ms: number
    msg_change_pct: number
    user_change_pct: number
    peak_hour_today: string
    peak_hour_users: number
    peak_hour_messages: number
    latency_anomaly: boolean
    latency_insight_text: string
    usage_insight_text: string
    peak_insight_text: string
    badges: {
        usage: "green" | "red" | "gray"
        latency: "green" | "red" | "gray"
        peak: "green" | "red" | "gray"
    }
}

export default function AdminDashboard() {
    const [timeRange, setTimeRange] = useState("24h")
    const [loading, setLoading] = useState(true)
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
    const [summary, setSummary] = useState<DashboardSummary | null>(null)
    const [timeseries, setTimeseries] = useState<DashboardTimeseries | null>(null)
    const [tokenUsage, setTokenUsage] = useState<TokenUsageData | null>(null)
    const [insights, setInsights] = useState<InsightData | null>(null)
    const [error, setError] = useState<string | null>(null)
    const { logout } = useAuth()

    const fetchData = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const API_BASE = "http://127.0.0.1:10001/api/dashboard"

            const [sumRes, tsRes, tokenRes, insightRes] = await Promise.all([
                axios.get(`${API_BASE}/summary?time_range=${timeRange}`, { timeout: 5000 }),
                axios.get(`${API_BASE}/timeseries?time_range=${timeRange}`, { timeout: 5000 }),
                axios.get(`${API_BASE}/token-usage?time_range=${timeRange}`, { timeout: 5000 }),
                axios.get(`${API_BASE}/insights`, { timeout: 5000 })
            ])

            setSummary(sumRes.data)
            setTimeseries(tsRes.data)
            setTokenUsage(tokenRes.data)
            setInsights(insightRes.data)
            setLastUpdated(new Date())
        } catch (err) {
            console.error(err)
            setError("Failed to fetch dashboard data. Make sure backend is running.")
        } finally {
            setLoading(false)
        }
    }, [timeRange])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    // Formatter for charts - Backend now sends "HH:00" string
    const formatTime = (iso: string) => iso

    // Ref for the entire dashboard
    const dashboardExportRef = useRef<HTMLDivElement>(null)

    const exportToPng = useCallback(async () => {
        if (!dashboardExportRef.current) return

        const node = dashboardExportRef.current
        const summaryNode = document.getElementById('dashboard-summary-panel')

        const originalHeight = node.style.height
        const originalOverflow = node.style.overflow

        try {
            // 1. Unhide summary to include it in calculation
            if (summaryNode) summaryNode.classList.remove('hidden')

            // 2. Expand height to fit everything (including now-visible summary)
            node.style.height = 'auto' // Reset to allow full expansion
            const fullHeight = node.scrollHeight // Measure total height
            node.style.height = `${fullHeight}px`
            node.style.overflow = 'visible'

            const dataUrl = await htmlToImage.toPng(node, {
                backgroundColor: '#f8fafc',
                cacheBust: true,
                width: node.scrollWidth,
                height: fullHeight,
                pixelRatio: 2
            })

            const now = new Date()
            const dateStr = now.toISOString().split('T')[0]
            const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-')
            const filename = `admin-dashboard_${dateStr}_${timeStr.slice(0, 5)}.png`

            const link = document.createElement('a')
            link.download = filename
            link.href = dataUrl
            link.click()
        } catch (err) {
            console.error('Failed to export dashboard', err)
            // Ideally notify user here
        } finally {
            // Restore original styles
            node.style.height = originalHeight
            node.style.overflow = originalOverflow
            if (summaryNode) summaryNode.classList.add('hidden')
        }
    }, [])

    const exportToPdf = useCallback(async () => {
        if (!dashboardExportRef.current) return

        const node = dashboardExportRef.current
        const summaryNode = document.getElementById('dashboard-summary-panel')

        const originalHeight = node.style.height
        const originalOverflow = node.style.overflow

        try {
            // 1. Unhide summary
            if (summaryNode) summaryNode.classList.remove('hidden')

            // 2. Expand height
            node.style.height = 'auto'
            const fullHeight = node.scrollHeight
            node.style.height = `${fullHeight}px`
            node.style.overflow = 'visible'

            const dataUrl = await htmlToImage.toPng(node, {
                backgroundColor: '#f8fafc',
                cacheBust: true,
                width: node.scrollWidth,
                height: fullHeight,
                pixelRatio: 2
            })

            // Calculate PDF dimensions
            const imgWidth = node.scrollWidth
            const imgHeight = fullHeight

            // Create PDF with custom size matching the content
            const pdf = new jsPDF({
                orientation: imgWidth > imgHeight ? 'l' : 'p',
                unit: 'px',
                format: [imgWidth, imgHeight]
            })

            pdf.addImage(dataUrl, 'PNG', 0, 0, imgWidth, imgHeight)

            const now = new Date()
            const dateStr = now.toISOString().split('T')[0]
            const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-')
            pdf.save(`admin-dashboard_${dateStr}_${timeStr.slice(0, 5)}.pdf`)

        } catch (err) {
            console.error('Failed to export dashboard PDF', err)
        } finally {
            node.style.height = originalHeight
            node.style.overflow = originalOverflow
            if (summaryNode) summaryNode.classList.add('hidden')
        }
    }, [])

    const exportToCsv = useCallback(() => {
        if (!timeseries?.messages_over_time) return

        // Prepare CSV headers
        const headers = ['Timestamp', 'Active Users', 'Messages', 'Anonymous', 'Authenticated']

        // Prepare CSV rows with proper null handling
        // Filter to only include rows with actual activity
        const rows = timeseries.messages_over_time
            .filter(pt => (pt.active_users ?? 0) > 0 || (pt.count ?? 0) > 0)
            .map(pt => [
                pt.timestamp || '',
                pt.active_users ?? 0,
                pt.count ?? 0,
                pt.anonymous ?? 0,
                pt.authenticated ?? 0
            ])

        // If no data, show alert
        if (rows.length === 0) {
            alert('No activity data to export for the selected time range.')
            return
        }

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
        const filename = `activity_${dateStr}.csv`

        // Download
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(link.href)
    }, [timeseries])




    // Calculate Peaks for Summary
    const summaryMetrics = useMemo(() => {
        if (!summary || !timeseries) return null

        const userPeak = timeseries.messages_over_time?.reduce((max, curr) => (curr.active_users || 0) > (max.active_users || 0) ? curr : max, { active_users: 0, timestamp: '' } as any)
        const msgPeak = timeseries.messages_over_time?.reduce((max, curr) => (curr.count || 0) > (max.count || 0) ? curr : max, { count: 0, timestamp: '' } as any)

        const topUser = summary.top_users?.[0]

        return {
            userPeak,
            msgPeak,
            topUser
        }
    }, [summary, timeseries])

    // Reuse calculated peaks for charts if needed, or rely on the memo above
    const userPeak = summaryMetrics?.userPeak
    const msgPeak = summaryMetrics?.msgPeak

    if (loading && !summary) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-6">
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-lg ring-1 ring-slate-100">
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 animate-pulse" />
                        <Activity className="h-8 w-8 text-emerald-500 animate-bounce" />
                    </div>
                    <div className="text-center space-y-2">
                        <p className="text-sm font-bold text-slate-800 tracking-tight">INITIALIZING ADMIN DASHBOARD</p>
                        <p className="text-xs text-slate-400">Connecting to OpenSearch...</p>
                    </div>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-4 bg-white p-8 rounded-2xl border border-rose-100 shadow-xl max-w-md text-center">
                    <div className="rounded-full bg-rose-50 p-3">
                        <AlertTriangle className="h-8 w-8 text-rose-500" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800">Connection Failed</h3>
                    <p className="text-sm text-slate-500">{error}</p>
                    <Button onClick={fetchData} variant="outline" className="mt-2 text-rose-600 border-rose-200 hover:bg-rose-50">Try Again</Button>
                </div>
            </div>
        )
    }

    if (!summary || !timeseries) return null

    return (
        <div ref={dashboardExportRef} className="min-h-screen bg-slate-50 p-6 md:p-8 space-y-8 font-sans text-slate-900 pb-20 relative">
            {/* Subtle Page Background Texture */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.4]" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>
            <div className="absolute inset-0 bg-gradient-to-b from-slate-50/80 via-white/50 to-slate-50/80 pointer-events-none"></div>

            {/* Main Content Helper Wrapper */}
            <div className="relative z-10 space-y-8 max-w-[1600px] mx-auto">

                {/* Top Header & Controls */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-slate-200 shadow-sm transition-transform hover:scale-105">
                            <BarChart3 className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Admin</span>
                            <span className="text-slate-300">/</span>
                            <span className="text-xs font-bold text-slate-800 uppercase tracking-widest">System Overview</span>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm ring-1 ring-slate-100">
                        <span className="pl-3 pr-2 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                            Updated {lastUpdated.toLocaleTimeString()}
                        </span>
                        <div className="h-4 w-px bg-slate-100"></div>
                        <Button variant="ghost" size="icon" onClick={fetchData} className="h-7 w-7 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-emerald-600 transition-colors">
                            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button onClick={exportToPng} variant="ghost" size="icon" title="Export PNG" className="h-7 w-7 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-emerald-600">
                            <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button onClick={exportToPdf} variant="ghost" size="icon" title="Export PDF" className="h-7 w-7 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-emerald-600">
                            <span className="text-[10px] font-bold">PDF</span>
                        </Button>
                        <div className="h-4 w-px bg-slate-100"></div>
                        <TimeRangeControl value={timeRange} onChange={setTimeRange} />
                        <div className="h-4 w-px bg-slate-100"></div>
                        <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" onClick={exportToCsv} title="Export to CSV (Google Sheets)" className="h-7 w-7 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-emerald-600">
                                <BarChart3 className="h-3.5 w-3.5" />
                            </Button>

                        </div>
                        <div className="h-4 w-px bg-slate-100"></div>
                        <Button variant="ghost" size="icon" onClick={logout} className="h-7 w-7 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600">
                            <LogOut className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>

                {/* Dashboard Summary Panel (Hidden in UI, Visible in Export) */}
                {summaryMetrics && (
                    <div id="dashboard-summary-panel" className="hidden bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden mb-6">
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                            <ClipboardList className="w-24 h-24 text-slate-900" />
                        </div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="p-2 bg-indigo-50 rounded-lg">
                                    <ClipboardList className="w-5 h-5 text-indigo-600" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-800">สรุปภาพรวมระบบ</h3>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Total Msgs</p>
                                    <p className="font-bold text-blue-600">{formatInt(summary.total_messages)}</p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Unique Users</p>
                                    <p className="font-bold text-slate-700">{formatInt(summary.active_users)}</p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Sessions</p>
                                    <p className="font-bold text-slate-700">{formatInt(summary.sessions)}</p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Error Rate</p>
                                    <p className="font-bold text-rose-600">{formatPct(summary.error_rate_pct)}</p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">P50 Latency</p>
                                    <p className="font-bold text-slate-700">{formatMs(summary.response_time_p50_ms)}</p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">P95 Latency</p>
                                    <p className="font-bold text-slate-700">{formatMs(summary.response_time_p95_ms)}</p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Peak Users Hour</p>
                                    <p className="font-bold text-violet-600">{summaryMetrics.userPeak?.timestamp} <span className="text-xs text-slate-400">({summaryMetrics.userPeak?.active_users})</span></p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Peak Msgs Hour</p>
                                    <p className="font-bold text-indigo-600">{summaryMetrics.msgPeak?.timestamp} <span className="text-xs text-slate-400">({summaryMetrics.msgPeak?.count})</span></p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 col-span-2">
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Top Active User</p>
                                    <p className="font-bold text-slate-700 truncate" title={summaryMetrics.topUser?.name}>
                                        {summaryMetrics.topUser ? (
                                            <>
                                                {summaryMetrics.topUser.name} <span className="text-xs text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full ml-2">{formatInt(summaryMetrics.topUser.count)} msgs</span>
                                            </>
                                        ) : 'N/A'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}



                {/* AI Insights Section */}
                {insights && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 px-1">
                            <div className="h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
                            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">AI Daily Insights (Today vs Yesterday)</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <InsightCard
                                title="Usage Change"
                                primaryMetric={
                                    <div className="flex items-baseline gap-2">
                                        <span>{formatInt(insights.total_messages_today)}</span>
                                        <span className="text-sm text-slate-400 font-normal">msgs</span>
                                    </div>
                                }
                                secondaryMetric={`${insights.msg_change_pct > 0 ? '+' : ''}${insights.msg_change_pct}% vs yesterday`}
                                badgeStatus={insights.badges.usage}
                                insightText={insights.usage_insight_text}
                            />

                            <InsightCard
                                title="Peak Usage Hour"
                                primaryMetric={
                                    <div className="flex items-baseline gap-2">
                                        <span>{insights.peak_hour_today}</span>
                                    </div>
                                }
                                secondaryMetric={`${insights.peak_hour_users} users • ${insights.peak_hour_messages} msgs`}
                                badgeStatus={insights.badges.peak}
                                insightText={insights.peak_insight_text}
                            />


                        </div>
                    </div>
                )}

                {/* Hero Section Grid */}
                <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-4">
                    <div className="md:col-span-2 lg:col-span-3">
                        <HeroPanel status={summary.active_users > 0 ? 'active' : 'idle'} />
                    </div>
                    <div className="md:col-span-1 lg:col-span-1">
                        <SystemOverview
                            totalMessages={summary.total_messages}
                            activeUsers={summary.active_users}
                            p50Latency={summary.response_time_p50_ms}
                        />
                    </div>
                </div>

                {/* Detailed KPI Grid */}
                <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4">
                    <KpiCard
                        title="Total Sessions"
                        value={formatInt(summary.sessions)}
                        icon={Activity}
                        status="default"
                        subtext="Active unique sessions"
                    />

                    <KpiCard
                        title="User Experience Latency"
                        value={`${Math.round(summary.response_time_p95_ms / 1000)} s`}
                        icon={Clock}
                        status={
                            summary.response_time_p95_ms >= 5000
                                ? "danger"
                                : summary.response_time_p95_ms >= 2000
                                    ? "warning"
                                    : "success"
                        }
                        subtext="Response time for the slowest 5% of requests"
                    />
                    <KpiCard
                        title="Error Rate"
                        value={formatPct(summary.error_rate_pct)}
                        icon={AlertTriangle}
                        status={summary.error_rate_pct > 0 ? (summary.error_rate_pct > 5 ? "danger" : "warning") : "success"}
                        subtext={`${summary.error_count} recorded errors`}
                    />

                    {/* Token Usage Card */}
                    <div className="lg:col-span-1">
                        <TokenUsageCard tokenUsage={tokenUsage} />
                    </div>
                </div>

                {/* Charts Section */}
                <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-3">
                    {/* Left Column: Charts */}
                    <div className="col-span-1 lg:col-span-2 space-y-6">
                        {/* User Activity Chart (Hours) */}
                        <ChartCard
                            title="User Activity"
                            description="Unique active users by hour (00:00 - 23:00)"
                            headerAction={
                                <div className="flex items-center gap-3">
                                    {userPeak && userPeak.active_users > 0 && (
                                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-violet-50 border border-violet-100">
                                            <div className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse"></div>
                                            <span className="text-[10px] font-bold text-violet-700 uppercase tracking-wider">
                                                Peak: {userPeak.timestamp} ({userPeak.active_users})
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-violet-50 border border-violet-100">
                                        <Users className="h-3 w-3 text-violet-500" />
                                        <span className="text-[10px] font-bold text-violet-700 uppercase tracking-wider">Users</span>
                                    </div>
                                </div>
                            }
                        >
                            <div className="h-[300px] w-full" id="user-activity-chart">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={timeseries.messages_over_time} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis
                                            dataKey="timestamp"
                                            tickFormatter={formatTime}
                                            tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
                                            axisLine={false}
                                            tickLine={false}
                                            dy={10}
                                            padding={{ left: 10, right: 10 }}
                                        />
                                        <YAxis
                                            tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
                                            axisLine={false}
                                            tickLine={false}
                                            tickFormatter={(val) => `${formatInt(val)}`}
                                            dx={-10}
                                            allowDecimals={false}
                                            domain={[0, 'auto']}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                borderRadius: '12px',
                                                border: 'none',
                                                boxShadow: '0 10px 40px -10px rgb(0 0 0 / 0.15)',
                                                padding: '12px 16px',
                                                backgroundColor: 'rgba(255, 255, 255, 0.98)'
                                            }}
                                            itemStyle={{ fontSize: '13px', fontWeight: 600, padding: '2px 0' }}
                                            labelStyle={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px', fontWeight: 500 }}
                                            cursor={{ stroke: '#e2e8f0', strokeWidth: 2 }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="active_users"
                                            stroke="#8b5cf6"
                                            strokeWidth={2.5}
                                            fill="url(#colorUsers)"
                                            name="Active Users"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </ChartCard>

                        {/* Message Volume Chart (Hours) */}
                        <ChartCard
                            title="Message Volume"
                            description="Message traffic by hour (00:00 - 23:00)"
                            headerAction={
                                <div className="flex items-center gap-3">
                                    {msgPeak && msgPeak.count > 0 && (
                                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 border border-blue-100">
                                            <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                                            <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                                                Peak: {msgPeak.timestamp} ({msgPeak.count})
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 border border-blue-100">
                                        <MessageSquare className="h-3 w-3 text-blue-500" />
                                        <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Msgs</span>
                                    </div>
                                </div>
                            }
                        >
                            <div className="h-[300px] w-full" id="message-volume-chart">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={timeseries.messages_over_time} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis
                                            dataKey="timestamp"
                                            tickFormatter={formatTime}
                                            tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
                                            axisLine={false}
                                            tickLine={false}
                                            dy={10}
                                            padding={{ left: 10, right: 10 }}
                                        />
                                        <YAxis
                                            tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
                                            axisLine={false}
                                            tickLine={false}
                                            tickFormatter={(val) => `${formatInt(val)}`}
                                            dx={-10}
                                            allowDecimals={false}
                                            domain={[0, 'auto']}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                borderRadius: '12px',
                                                border: 'none',
                                                boxShadow: '0 10px 40px -10px rgb(0 0 0 / 0.15)',
                                                padding: '12px 16px',
                                                backgroundColor: 'rgba(255, 255, 255, 0.98)'
                                            }}
                                            itemStyle={{ fontSize: '13px', fontWeight: 600, padding: '2px 0' }}
                                            labelStyle={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px', fontWeight: 500 }}
                                            cursor={{ stroke: '#e2e8f0', strokeWidth: 2 }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="count"
                                            stroke="#3b82f6"
                                            strokeWidth={2.5}
                                            fill="url(#colorMessages)"
                                            name="Messages"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </ChartCard>
                    </div>

                    {/* Top Users List */}
                    <div className="col-span-1 h-full">
                        <TopUsersList users={summary.top_users} />
                    </div>
                </div>



            </div>
        </div>
    )
}
