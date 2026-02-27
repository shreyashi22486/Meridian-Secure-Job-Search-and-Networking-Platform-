import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/Icons';

export default function Dashboard() {
    const { user } = useAuth();

    // Calculate profile completeness
    const fields = [
        user?.full_name,
        user?.headline,
        user?.location,
        user?.bio,
        user?.avatar_url,
        user?.education?.length > 0,
        user?.experience?.length > 0,
        user?.skills?.length > 0,
    ];
    const filled = fields.filter(Boolean).length;
    const completeness = Math.round((filled / fields.length) * 100);
    const greeting = () => {
        const h = new Date().getHours();
        if (h < 12) return 'Good morning';
        if (h < 17) return 'Good afternoon';
        return 'Good evening';
    };

    return (
        <div className="page">
            {/* Welcome header */}
            <div className="dash-welcome">
                <div>
                    <h1>{greeting()}, {user?.full_name?.split(' ')[0]}</h1>
                    <p className="text-muted">Here's an overview of your account</p>
                </div>
                <span className={`badge ${user?.role === 'admin' ? 'badge-action' : 'badge-muted'}`}>
                    {user?.role?.toUpperCase()}
                </span>
            </div>

            {/* Profile completeness */}
            <div className="dash-completion glass-card">
                <div className="completion-header">
                    <div className="completion-info">
                        <h3>Profile Completeness</h3>
                        <p className="text-muted">
                            {completeness >= 100
                                ? 'Your profile is complete!'
                                : 'Complete your profile to stand out to recruiters'}
                        </p>
                    </div>
                    <span className="completion-pct">{completeness}%</span>
                </div>
                <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${completeness}%` }}></div>
                </div>
                {completeness < 100 && (
                    <div className="completion-hints">
                        {!user?.headline && <Link to="/profile" className="hint-link"><Icon name="edit" size={14} /> Add a headline</Link>}
                        {!user?.bio && <Link to="/profile" className="hint-link"><Icon name="edit" size={14} /> Write a bio</Link>}
                        {!user?.avatar_url && <Link to="/profile" className="hint-link"><Icon name="camera" size={14} /> Upload a photo</Link>}
                        {(!user?.education || user.education.length === 0) && <Link to="/profile" className="hint-link"><Icon name="graduationCap" size={14} /> Add education</Link>}
                        {(!user?.experience || user.experience.length === 0) && <Link to="/profile" className="hint-link"><Icon name="briefcase" size={14} /> Add experience</Link>}
                        {(!user?.skills || user.skills.length === 0) && <Link to="/profile" className="hint-link"><Icon name="zap" size={14} /> Add skills</Link>}
                    </div>
                )}
            </div>

            {/* Quick Actions */}
            <div className="dash-actions">
                <Link to="/profile" className="action-card glass-card">
                    <div className="action-icon"><Icon name="user" size={22} /></div>
                    <div>
                        <h3>Edit Profile</h3>
                        <p>Update your info, photo & skills</p>
                    </div>
                    <Icon name="chevronRight" size={18} className="action-arrow" />
                </Link>
                <Link to="/resumes" className="action-card glass-card">
                    <div className="action-icon"><Icon name="fileText" size={22} /></div>
                    <div>
                        <h3>My Resumes</h3>
                        <p>Upload & manage encrypted PDFs</p>
                    </div>
                    <Icon name="chevronRight" size={18} className="action-arrow" />
                </Link>
                <Link to="/profile" className="action-card glass-card" onClick={() => setTimeout(() => document.querySelector('.tab:nth-child(3)')?.click(), 100)}>
                    <div className="action-icon"><Icon name="shield" size={22} /></div>
                    <div>
                        <h3>Security</h3>
                        <p>{user?.is_totp_enabled ? '2FA is active' : 'Set up two-factor auth'}</p>
                    </div>
                    <Icon name="chevronRight" size={18} className="action-arrow" />
                </Link>
            </div>

            {/* Account Info Mini */}
            <div className="dash-info glass-card">
                <div className="info-row">
                    <Icon name="mail" size={16} /> <span className="text-muted">Email</span>
                    <span>{user?.email}</span>
                </div>
                <div className="info-row">
                    <Icon name="shieldCheck" size={16} /> <span className="text-muted">2FA</span>
                    <span className={user?.is_totp_enabled ? 'text-success' : 'text-warning'}>
                        {user?.is_totp_enabled ? 'Active' : 'Not configured'}
                    </span>
                </div>
                <div className="info-row">
                    <Icon name="clock" size={16} /> <span className="text-muted">Member since</span>
                    <span>{user?.created_at ? new Date(user.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</span>
                </div>
            </div>
        </div>
    );
}
