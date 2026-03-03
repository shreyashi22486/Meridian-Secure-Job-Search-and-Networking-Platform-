import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useConfirm } from './ConfirmDialog';
import Icon from './Icons';
import api from '../api/client';

export default function Navbar() {
    const { user, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const confirm = useConfirm();
    const [unread, setUnread] = useState(0);
    const pollRef = useRef(null);

    // Poll for unread messages
    useEffect(() => {
        if (!user) return;
        const fetchUnread = async () => {
            try {
                const { data } = await api.get('/messages/unread-count');
                setUnread(data.unread_count || 0);
            } catch { /* ignore */ }
        };
        fetchUnread();
        pollRef.current = setInterval(fetchUnread, 10000); // every 10s
        return () => clearInterval(pollRef.current);
    }, [user]);

    const handleLogout = async () => {
        const ok = await confirm({
            title: 'Sign Out',
            message: 'Are you sure you want to sign out of your account?',
            confirmText: 'Sign Out',
            icon: 'logout',
        });
        if (!ok) return;
        await logout();
        navigate('/login');
    };

    return (
        <nav className="navbar">
            <div className="navbar-inner">
                <Link to="/" className="nav-brand">
                    <svg className="brand-logo" width="24" height="24" viewBox="0 0 32 32" fill="none">
                        <rect width="32" height="32" rx="8" fill="url(#m-grad)" />
                        <path d="M8 22V10l8 7 8-7v12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        <defs>
                            <linearGradient id="m-grad" x1="0" y1="0" x2="32" y2="32">
                                <stop stopColor="#6366f1" />
                                <stop offset="1" stopColor="#a78bfa" />
                            </linearGradient>
                        </defs>
                    </svg>
                    <span className="brand-text">Meridian</span>
                </Link>
                <div className="nav-links">
                    <button
                        onClick={toggleTheme}
                        className="theme-toggle"
                        aria-label="Toggle theme"
                        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    >
                        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
                    </button>
                    {user ? (
                        <>
                            <Link to="/dashboard" className="nav-link">
                                <Icon name="home" size={16} /> Dashboard
                            </Link>
                            <Link to="/jobs" className="nav-link">
                                <Icon name="briefcase" size={16} /> Jobs
                            </Link>
                            <Link to="/companies" className="nav-link">
                                <Icon name="building" size={16} /> Companies
                            </Link>
                            <Link to="/messages" className="nav-link" style={{ position: 'relative' }}>
                                <Icon name="mail" size={16} /> Messages
                                {unread > 0 && (
                                    <span style={{
                                        position: 'absolute', top: -4, right: -8,
                                        background: '#ef4444', color: '#fff',
                                        borderRadius: '10px', padding: '0.05rem 0.35rem',
                                        fontSize: '0.65rem', fontWeight: 700,
                                        minWidth: 16, textAlign: 'center',
                                        lineHeight: 1.4, border: '2px solid var(--bg)',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                    }}>
                                        {unread > 99 ? '99+' : unread}
                                    </span>
                                )}
                            </Link>
                            <Link to="/network" className="nav-link">
                                <Icon name="users" size={16} /> Network
                            </Link>
                            <Link to="/resumes" className="nav-link">
                                <Icon name="fileText" size={16} /> Resumes
                            </Link>
                            <Link to="/profile" className="nav-link">
                                <Icon name="user" size={16} /> Profile
                            </Link>
                            {user.role?.toLowerCase() === 'admin' && (
                                <Link to="/admin" className="nav-link nav-link-admin">
                                    <Icon name="settings" size={16} /> Admin
                                </Link>
                            )}
                            <button onClick={handleLogout} className="btn btn-ghost btn-sm">
                                <Icon name="logout" size={14} /> Logout
                            </button>
                        </>
                    ) : (
                        <>
                            <Link to="/login" className="nav-link">Sign In</Link>
                            <Link to="/register" className="btn btn-primary btn-sm">Get Started</Link>
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
}
