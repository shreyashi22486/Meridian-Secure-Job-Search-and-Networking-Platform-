import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
    const { user } = useAuth();

    const securityTips = [
        { icon: '🔑', title: 'Two-Factor Auth', desc: user?.is_totp_enabled ? 'Enabled ✓' : 'Set up in Profile', status: user?.is_totp_enabled },
        { icon: '🔒', title: 'Encrypted Resumes', desc: 'Files encrypted at rest with Fernet', status: true },
        { icon: '🛡️', title: 'Session Security', desc: 'Device-bound tokens with rotation', status: true },
        { icon: '📋', title: 'Audit Logging', desc: 'All actions are tracked', status: true },
    ];

    return (
        <div className="page">
            <div className="page-header">
                <h1>Welcome, {user?.full_name}!</h1>
                <p className="text-muted">Your secure dashboard</p>
            </div>

            <div className="card-grid">
                <div className="stat-card glass-card">
                    <div className="stat-icon">👤</div>
                    <div className="stat-label">Role</div>
                    <div className="stat-value">{user?.role?.toUpperCase()}</div>
                </div>
                <div className="stat-card glass-card">
                    <div className="stat-icon">📧</div>
                    <div className="stat-label">Email</div>
                    <div className="stat-value">{user?.email}</div>
                </div>
                <div className="stat-card glass-card">
                    <div className="stat-icon">🔐</div>
                    <div className="stat-label">2FA Status</div>
                    <div className={`stat-value ${user?.is_totp_enabled ? 'text-success' : 'text-warning'}`}>
                        {user?.is_totp_enabled ? 'Active' : 'Not Set Up'}
                    </div>
                </div>
            </div>

            <h2 className="section-title">Security Posture</h2>
            <div className="security-grid">
                {securityTips.map((tip, i) => (
                    <div key={i} className={`security-card glass-card ${tip.status ? 'security-ok' : 'security-warn'}`}>
                        <span className="security-icon">{tip.icon}</span>
                        <div>
                            <strong>{tip.title}</strong>
                            <p>{tip.desc}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
