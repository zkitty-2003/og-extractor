import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

interface AuthState {
    userId: string | null;
    role: 'admin' | 'user' | null;
    isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
    login: (userId: string, role: 'admin' | 'user') => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [auth, setAuth] = useState<AuthState>(() => {
        const storedUser = localStorage.getItem('og_user_id');
        const storedRole = localStorage.getItem('og_role') as 'admin' | 'user';
        return (storedUser && storedRole)
            ? { userId: storedUser, role: storedRole, isAuthenticated: true }
            : { userId: null, role: null, isAuthenticated: false };
    });

    const login = (userId: string, role: 'admin' | 'user') => {
        localStorage.setItem('og_user_id', userId);
        localStorage.setItem('og_role', role);
        setAuth({ userId, role, isAuthenticated: true });
    };

    const logout = () => {
        localStorage.removeItem('og_user_id');
        localStorage.removeItem('og_role');
        setAuth({ userId: null, role: null, isAuthenticated: false });
    };

    return (
        <AuthContext.Provider value={{ ...auth, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
