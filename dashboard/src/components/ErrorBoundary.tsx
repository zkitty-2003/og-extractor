import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ error, errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="flex h-screen flex-col items-center justify-center bg-slate-50 p-6 text-slate-900">
                    <div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 shadow-xl border border-rose-100">
                        <div className="mb-4 flex items-center gap-3 text-rose-600">
                            <AlertTriangle className="h-10 w-10" />
                            <h1 className="text-2xl font-bold">Something went wrong</h1>
                        </div>
                        <p className="mb-4 text-slate-600">
                            The dashboard encountered a critical error and could not load.
                        </p>
                        <div className="mb-6 overflow-hidden rounded-lg bg-slate-900 p-4">
                            <code className="block whitespace-pre-wrap text-sm font-mono text-red-300">
                                {this.state.error && this.state.error.toString()}
                            </code>
                            <div className="mt-2 border-t border-slate-800 pt-2">
                                <p className="text-xs text-slate-500">Stack Trace:</p>
                                <code className="block whitespace-pre-wrap text-xs text-slate-500">
                                    {this.state.errorInfo?.componentStack}
                                </code>
                            </div>
                        </div>
                        <button
                            className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800"
                            onClick={() => window.location.reload()}
                        >
                            Reload Dashboard
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
