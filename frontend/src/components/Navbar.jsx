import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function Navbar() {
    const { user, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    return (
        <nav className="navbar">
            <div className="navbar-inner">
                <Link to="/" className="nav-brand">
                    <span className="brand-icon">◆</span>
                    <span className="brand-text">Nexora</span>
                </Link>
                <div className="nav-links">
                    <button
                        onClick={toggleTheme}
                        className="theme-toggle"
                        aria-label="Toggle theme"
                        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    >
                        {theme === 'dark' ? '☀️' : '🌙'}
                    </button>
                    {user ? (
                        <>
                            <Link to="/dashboard" className="nav-link">Dashboard</Link>
                            <Link to="/resumes" className="nav-link">Resumes</Link>
                            <Link to="/profile" className="nav-link">Profile</Link>
                            {user.role?.toLowerCase() === 'admin' && (
                                <Link to="/admin" className="nav-link nav-link-admin">Admin</Link>
                            )}
                            <button onClick={handleLogout} className="btn btn-ghost btn-sm">Logout</button>
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
