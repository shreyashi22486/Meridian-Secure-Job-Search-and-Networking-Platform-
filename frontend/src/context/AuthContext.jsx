import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi, userApi } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchUser = useCallback(async () => {
        try {
            const { data } = await userApi.me();
            setUser(data);
            return data;
        } catch {
            setUser(null);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // Fetch CSRF token on mount
        authApi.getCSRF().then(({ data }) => {
            localStorage.setItem('csrf_token', data.csrf_token);
        }).catch(() => { });
        fetchUser();
    }, [fetchUser]);

    const login = async (email, password) => {
        const { data } = await authApi.login({ email, password });
        if (data.requires_2fa) return data;
        const userData = await fetchUser();
        if (!userData) throw new Error('Failed to fetch user after login');
        return data;
    };

    const verify2FA = async (code, tempToken) => {
        await authApi.verify2FA({ code, temp_token: tempToken });
        await fetchUser();
    };

    const register = async (email, password, fullName) => {
        await authApi.register({ email, password, full_name: fullName });
        await fetchUser();
    };

    const logout = async () => {
        try { await authApi.logout(); } catch { /* ignore */ }
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, register, logout, verify2FA, fetchUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);


