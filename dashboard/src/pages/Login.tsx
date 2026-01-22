import { useState } from "react"
import { useAuth } from "@/auth/AuthContext"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input" // Assuming you might have/need this, or use standard input
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { AlertTriangle, Lock } from "lucide-react"
import axios from "axios"

export default function Login() {
    const [email, setEmail] = useState("")
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)
    const { login } = useAuth()
    const navigate = useNavigate()

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError("")

        try {
            const res = await axios.post('http://127.0.0.1:10001/api/auth/login', { email })
            const { user_id, role } = res.data

            login(user_id, role)

            // Redirect based on role
            if (role === 'admin') {
                navigate('/admin')
            } else {
                navigate('/app')
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            console.error(err)
            const msg = err.response?.data?.detail || err.message || "Login failed. Check backend connection."
            setError(`Error: ${msg}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
            <Card className="w-full max-w-md border-slate-200 shadow-xl">
                <CardHeader className="space-y-1 text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                        <Lock className="h-6 w-6 text-emerald-600" />
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">
                        Sign in to Dashboard
                    </CardTitle>
                    <p className="text-sm text-slate-500">
                        Enter your email to access your analytics
                    </p>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                            <Input
                                type="email"
                                placeholder="name@example.com"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 rounded-md bg-rose-50 p-3 text-sm text-rose-600">
                                <AlertTriangle className="h-4 w-4" />
                                {error}
                            </div>
                        )}

                        <Button
                            type="submit"
                            className="w-full bg-emerald-600 hover:bg-emerald-700"
                            disabled={loading}
                        >
                            {loading ? "Signing in..." : "Sign In"}
                        </Button>

                        <div className="mt-4 text-center text-xs text-slate-400">
                            <p>Demo Admin: admin@example.com</p>
                            <p>Demo User: user@example.com</p>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
