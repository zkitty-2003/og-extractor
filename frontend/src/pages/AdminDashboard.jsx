import React, { useEffect, useMemo, useState } from "react";
import api from "../utils/api"; // ของเดิมที่มี baseURL: '/api'

function formatNumber(n) {
    return new Intl.NumberFormat().format(Number(n || 0));
}

function Badge({ value }) {
    const isUp = (value || 0) >= 0;
    return (
        <span
            style={{
                background: isUp ? "#E8F7EE" : "#FDECEC",
                color: isUp ? "#168A3A" : "#B42318",
                padding: "6px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                whiteSpace: "nowrap",
            }}
        >
            {isUp ? "+" : ""}
            {value}% from last week
        </span>
    );
}

function IconBox({ emoji }) {
    return (
        <div
            style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                background: "linear-gradient(135deg, #3B82F6, #60A5FA)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: 22,
                boxShadow: "0 10px 25px rgba(59,130,246,0.25)",
            }}
        >
            {emoji}
        </div>
    );
}

// Sparkline แบบไม่ต้องลง lib
function Sparkline({ series }) {
    const points = useMemo(() => {
        if (!series?.length) return "";
        const w = 260;
        const h = 60;
        const pad = 6;
        const max = Math.max(...series.map((s) => s.count), 1);
        const min = Math.min(...series.map((s) => s.count), 0);

        const scaleX = (i) => (i / (series.length - 1)) * (w - pad * 2) + pad;
        const scaleY = (v) => {
            const t = (v - min) / (max - min || 1);
            return h - (t * (h - pad * 2) + pad);
        };

        return series
            .map((s, i) => `${scaleX(i).toFixed(1)},${scaleY(s.count).toFixed(1)}`)
            .join(" ");
    }, [series]);

    return (
        <svg width="100%" height="70" viewBox="0 0 260 60" style={{ marginTop: 8 }}>
            <polyline
                fill="none"
                stroke="#3B82F6"
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={points}
            />
        </svg>
    );
}

function MetricCard({ title, value, badgeValue, emoji, subtitle, series }) {
    return (
        <div
            style={{
                background: "white",
                borderRadius: 22,
                padding: 22,
                boxShadow: "0 12px 30px rgba(0,0,0,0.08)",
                border: "1px solid rgba(15,23,42,0.06)",
                minWidth: 280,
            }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <IconBox emoji={emoji} />
                {typeof badgeValue === "number" ? <Badge value={badgeValue} /> : null}
            </div>

            <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 12, letterSpacing: 1, color: "#94A3B8", fontWeight: 800 }}>
                    {title.toUpperCase()}
                </div>
                <div style={{ fontSize: 36, fontWeight: 900, marginTop: 6, color: "#0F172A" }}>
                    {value}
                </div>
                {subtitle ? (
                    <div style={{ marginTop: 4, color: "#64748B", fontSize: 13 }}>{subtitle}</div>
                ) : null}
            </div>

            {series?.length ? <Sparkline series={series} /> : null}
        </div>
    );
}

export default function AdminDashboard() {
    const [loading, setLoading] = useState(true);
    const [metrics, setMetrics] = useState(null);
    const [series, setSeries] = useState([]);

    useEffect(() => {
        let alive = true;

        async function load() {
            try {
                setLoading(true);
                const [m, s] = await Promise.all([
                    api.get("/admin/metrics"),
                    api.get("/admin/messages_timeseries?days=7"),
                ]);

                if (!alive) return;
                setMetrics(m.data);
                setSeries(s.data?.series || []);
            } catch (e) {
                console.error("Load dashboard error:", e);
            } finally {
                if (alive) setLoading(false);
            }
        }

        load();
        return () => {
            alive = false;
        };
    }, []);

    const containerStyle = {
        fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
        padding: "28px 28px 60px",
        background: "#F6F8FC",
        minHeight: "100vh",
    };

    return (
        <div style={containerStyle}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 16 }}>
                <div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: "#0F172A" }}>AI Chat Dashboard</div>
                    <div style={{ marginTop: 6, color: "#64748B" }}>
                        Overview of usage & performance (ไม่รก, ดูง่าย, พร้อมโชว์พี่เลี้ยง)
                    </div>
                </div>

                <div
                    style={{
                        background: "white",
                        borderRadius: 14,
                        padding: "10px 12px",
                        border: "1px solid rgba(15,23,42,0.08)",
                        color: "#0F172A",
                        fontWeight: 700,
                    }}
                >
                    Last 7 days
                </div>
            </div>

            {/* Cards */}
            <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
                <MetricCard
                    title="Total Sessions"
                    value={loading ? "—" : formatNumber(metrics?.total_sessions)}
                    badgeValue={metrics?.growth_weekly_percent ?? 0}
                    emoji="💬"
                    subtitle="Unique session_id"
                />
                <MetricCard
                    title="Total Messages"
                    value={loading ? "—" : formatNumber(metrics?.total_messages)}
                    emoji="📩"
                    subtitle="All messages logged"
                    series={series}
                />
                <MetricCard
                    title="Active Users"
                    value={loading ? "—" : formatNumber(metrics?.active_users)}
                    emoji="👤"
                    subtitle="Unique user_id"
                />
                <MetricCard
                    title="Avg Latency"
                    value={loading ? "—" : `${formatNumber(metrics?.avg_latency_ms)} ms`}
                    emoji="⚡"
                    subtitle="Average response latency"
                />
            </div>

            {/* Simple section */}
            <div style={{ marginTop: 26 }}>
                <div style={{ fontWeight: 900, color: "#0F172A", fontSize: 18 }}>Messages Trend</div>
                <div style={{ color: "#64748B", marginTop: 6 }}>กราฟด้านล่างใช้ข้อมูลจาก /admin/messages_timeseries</div>

                <div
                    style={{
                        marginTop: 12,
                        background: "white",
                        borderRadius: 22,
                        padding: 18,
                        border: "1px solid rgba(15,23,42,0.06)",
                        boxShadow: "0 12px 30px rgba(0,0,0,0.06)",
                    }}
                >
                    {series?.length ? (
                        <>
                            <Sparkline series={series} />
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", color: "#64748B", fontSize: 12 }}>
                                {series.slice(-7).map((s) => (
                                    <div key={s.date} style={{ background: "#F1F5F9", padding: "6px 10px", borderRadius: 999 }}>
                                        {s.date}: <b style={{ color: "#0F172A" }}>{s.count}</b>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div style={{ padding: 18, color: "#64748B" }}>
                            ยังไม่มีข้อมูล series (ลองคุยในระบบ แล้วรอให้ backend log ลง OpenSearch)
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
