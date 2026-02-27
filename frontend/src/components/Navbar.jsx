import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useConfirm } from './ConfirmDialog';
import Icon from './Icons';

export default function Navbar() {
    const { user, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const confirm = useConfirm();

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
