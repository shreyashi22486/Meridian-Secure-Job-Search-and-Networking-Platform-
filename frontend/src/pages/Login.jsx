import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
    const { login, verify2FA } = useAuth();
    const navigate = useNavigate();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [tempToken, setTempToken] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const data = await login(email, password);
            if (data.requires_2fa) {
                setTempToken(data.temp_token);
            } else {
                navigate('/dashboard');
            }
        } catch (err) {
            setError(err.response?.data?.detail || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    const handle2FA = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await verify2FA(otpCode, tempToken);
            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.detail || 'Invalid OTP code');
        } finally {
            setLoading(false);
        }
    };

    if (tempToken) {
        return (
            <div className="auth-page">
                <div className="auth-card glass-card">
                    <div className="auth-header">
                        <span className="auth-icon">🔑</span>
                        <h1>Two-Factor Authentication</h1>
                        <p>Enter the 6-digit code from your authenticator app</p>
                    </div>
                    <form onSubmit={handle2FA}>
                        {error && <div className="alert alert-error">{error}</div>}
                        <div className="form-group">
                            <label htmlFor="otp">Verification Code</label>
                            <input
                                id="otp"
                                type="text"
                                value={otpCode}
                                onChange={(e) => setOtpCode(e.target.value)}
                                placeholder="000000"
                                maxLength={6}
                                className="input-otp"
                                autoFocus
                            />
                        </div>
                        <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                            {loading ? 'Verifying...' : 'Verify'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="auth-page">
            <div className="auth-card glass-card">
                <div className="auth-header">
                    <span className="auth-icon">🔐</span>
                    <h1>Welcome Back</h1>
                    <p>Sign in to your secure account</p>
                </div>
                <form onSubmit={handleLogin}>
                    {error && <div className="alert alert-error">{error}</div>}
                    <div className="form-group">
                        <label htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>
                    <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>
                </form>
                <p className="auth-footer">
                    Don&apos;t have an account? <Link to="/register">Register</Link>
                </p>
            </div>
        </div>
    );
}
