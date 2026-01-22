import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "@/auth/AuthContext"
import { Activity, LogOut, User } from "lucide-react"

export default function UserLayout() {
    const { isAuthenticated, role, logout, userId } = useAuth()

    if (!isAuthenticated) return <Navigate to="/" replace />
    if (role !== 'user') return <Navigate to="/admin" replace />

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
            {/* User Nav */}
            <header className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-sm">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
                            <Activity className="h-5 w-5" />
                        </div>
                        <span className="font-bold text-slate-900">My Analytics</span>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                            <User className="h-4 w-4 text-slate-400" />
                            <span className="text-sm font-medium text-slate-700">{userId}</span>
                        </div>
                        <button
                            onClick={logout}
                            className="text-sm font-medium text-slate-500 hover:text-slate-900 flex items-center gap-1"
                        >
                            <LogOut className="h-4 w-4" />
                            Sign out
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                <Outlet />
            </main>
        </div>
    )
}
