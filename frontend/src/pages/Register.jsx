import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/Icons';

export default function Register() {
    const { register } = useAuth();

    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (password !== confirm) {
            setError('Passwords do not match');
            return;
        }

        setLoading(true);
        try {
            await register(email, password, fullName);
            window.location.href = '/dashboard';
        } catch (err) {
            setError(err.response?.data?.detail || 'Registration failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-card glass-card">
                <div className="auth-header">
                    <div className="auth-avatar">
                        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="28" cy="28" r="28" fill="url(#reg-grad)" />
                            <circle cx="28" cy="22" r="9" fill="rgba(255,255,255,0.85)" />
                            <path d="M12 44.5C12 37.5 19.2 32 28 32C36.8 32 44 37.5 44 44.5" fill="rgba(255,255,255,0.85)" />
                            <line x1="40" y1="14" x2="40" y2="24" stroke="rgba(255,255,255,0.85)" strokeWidth="2.5" strokeLinecap="round" />
                            <line x1="35" y1="19" x2="45" y2="19" stroke="rgba(255,255,255,0.85)" strokeWidth="2.5" strokeLinecap="round" />
                            <defs>
                                <linearGradient id="reg-grad" x1="0" y1="0" x2="56" y2="56">
                                    <stop stopColor="var(--primary)" />
                                    <stop offset="1" stopColor="var(--accent)" />
                                </linearGradient>
                            </defs>
                        </svg>
                    </div>
                    <h1>Create Account</h1>
                    <p>Join the secure recruitment platform</p>
                </div>
                <form onSubmit={handleSubmit}>
                    {error && <div className="alert alert-error">{error}</div>}
                    <div className="form-group">
                        <label htmlFor="fullName">Full Name</label>
                        <input id="fullName" type="text" value={fullName}
                            onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" required />
                    </div>
                    <div className="form-group">
                        <label htmlFor="email">Email Address</label>
                        <input id="email" type="email" value={email}
                            onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
                    </div>
                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <div className="password-input-wrapper">
                            <input id="password" type={showPassword ? 'text' : 'password'} value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Min 8 chars, mix case + digit + symbol" required />
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
                    <div className="form-group">
                        <label htmlFor="confirm">Confirm Password</label>
                        <div className="password-input-wrapper">
                            <input id="confirm" type={showConfirm ? 'text' : 'password'} value={confirm}
                                onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" required />
                            <button
                                type="button"
                                className="password-toggle-btn"
                                onClick={() => setShowConfirm(!showConfirm)}
                                aria-label={showConfirm ? 'Hide password' : 'Show password'}
                            >
                                <Icon name={showConfirm ? 'eyeOff' : 'eye'} size={18} />
                            </button>
                        </div>
                    </div>
                    <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                        {loading ? 'Creating account…' : 'Create Account'}
                    </button>
                </form>
                <p className="auth-footer">
                    Already have an account? <Link to="/login">Sign In</Link>
                </p>
            </div>
        </div>
    );
}
