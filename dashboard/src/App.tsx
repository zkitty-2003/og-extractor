import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider, useAuth } from "@/auth/AuthContext"
import { ErrorBoundary } from '@/components/ErrorBoundary'

// Pages
import Login from "@/pages/Login"
import AdminDashboard from "@/pages/admin/AdminDashboard"
import UserDashboard from "@/pages/user/UserDashboard"
import UserLayout from "@/layouts/UserLayout"

// Layouts 
// (For Admin, we can just use the AdminDashboard directly or wrap it if we had a navigation sidebar)
const AdminRoute = ({ children }: { children: JSX.Element }) => {
    const { role, isAuthenticated } = useAuth()
    // Fix: Redirect to login if not authenticated, otherwise we get a loop if / redirects to /admin
    if (!isAuthenticated) return <Navigate to="/login" replace />
    if (role !== 'admin') return <Navigate to="/app" replace />
    return children
}

export default function App() {
    return (
        <ErrorBoundary>
            <AuthProvider>
                <BrowserRouter>
                    <Routes>
                        {/* Default to Admin Dashboard */}
                        <Route path="/" element={<Navigate to="/admin" replace />} />

                        <Route path="/login" element={<Login />} />

                        {/* Admin Routes */}
                        <Route
                            path="/admin"
                            element={
                                <AdminRoute>
                                    <AdminDashboard />
                                </AdminRoute>
                            }
                        />

                        {/* User Routes */}
                        <Route path="/app" element={<UserLayout />}>
                            <Route index element={<UserDashboard />} />
                        </Route>

                        {/* Note: Chat routes removed to separate Dashboard from Chat App */}

                        {/* Catch all */}
                        <Route path="*" element={<Navigate to="/login" replace />} />
                    </Routes>
                </BrowserRouter>
            </AuthProvider>
        </ErrorBoundary>
    )
}
