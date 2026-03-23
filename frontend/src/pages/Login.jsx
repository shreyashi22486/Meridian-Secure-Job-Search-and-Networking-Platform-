import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/Icons';
import VirtualKeyboard from '../components/VirtualKeyboard';

export default function Login() {
    const { login, verify2FA } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
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
                window.location.href = '/dashboard';
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
            window.location.href = '/dashboard';
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
                        <div className="auth-avatar">
                            <Icon name="key" size={28} />
                        </div>
                        <h1>Two-Factor Verification</h1>
                        <p>Use the virtual keyboard to enter your 6-digit code</p>
                    </div>
                    {error && <div className="alert alert-error">{error}</div>}
                    <VirtualKeyboard
                        length={6}
                        onComplete={(otp) => {
                            setOtpCode(otp);
                            // Auto-submit when OTP is complete
                            setLoading(true);
                            verify2FA(otp, tempToken)
                                .then(() => { window.location.href = '/dashboard'; })
                                .catch((err) => {
                                    setError(err.response?.data?.detail || 'Invalid OTP code');
                                    setLoading(false);
                                });
                        }}
                        onClose={() => setTempToken(null)}
                    />
                    {loading && <p style={{ marginTop: '1rem', opacity: 0.7 }}>Verifying…</p>}
                </div>
            </div>
        );
    }

    return (
        <div className="auth-page">
            <div className="auth-card glass-card">
                <div className="auth-header">
                    <div className="auth-avatar">
                        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="28" cy="28" r="28" fill="url(#avatar-grad)" />
                            <circle cx="28" cy="22" r="9" fill="rgba(255,255,255,0.85)" />
                            <path d="M12 44.5C12 37.5 19.2 32 28 32C36.8 32 44 37.5 44 44.5" fill="rgba(255,255,255,0.85)" />
                            <defs>
                                <linearGradient id="avatar-grad" x1="0" y1="0" x2="56" y2="56">
                                    <stop stopColor="var(--primary)" />
                                    <stop offset="1" stopColor="var(--accent)" />
                                </linearGradient>
                            </defs>
                        </svg>
                    </div>
                    <h1>Welcome Back</h1>
                    <p>Sign in to your account</p>
                </div>
                <form onSubmit={handleLogin}>
                    {error && <div className="alert alert-error">{error}</div>}
                    <div className="form-group">
                        <label htmlFor="email">Email Address</label>
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
                        <div className="password-input-wrapper">
                            <input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                            />
                            <button
                                type="button"
                                className="password-toggle-btn"
                                onClick={() => setShowPassword(!showPassword)}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                <Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} />
                            </button>
                        </div>
                    </div>
                    <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                        {loading ? 'Signing in…' : 'Sign In'}
                    </button>
                </form>
                <p className="auth-footer">
                    Don&apos;t have an account? <Link to="/register">Create one</Link>
                </p>
            </div>
        </div>
    );
}
