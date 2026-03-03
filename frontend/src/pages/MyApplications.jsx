import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { applicationApi } from '../api/client';
import Icon from '../components/Icons';

const statusConfig = {
    applied: { label: 'Applied', color: 'var(--primary)', bg: 'var(--primary-subtle)', icon: 'clock' },
    reviewed: { label: 'Reviewed', color: 'var(--warning)', bg: 'var(--warning-bg)', icon: 'eye' },
    interviewed: { label: 'Interviewed', color: '#6366f1', bg: 'rgba(99,102,241,0.1)', icon: 'users' },
    rejected: { label: 'Rejected', color: 'var(--danger)', bg: 'var(--danger-bg)', icon: 'x' },
    offer: { label: 'Offer', color: 'var(--success)', bg: 'var(--success-bg)', icon: 'checkCircle' },
};

const statusOrder = ['applied', 'reviewed', 'interviewed', 'offer'];

export default function MyApplications() {
    const [apps, setApps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetch = async () => {
            try {
                const { data } = await applicationApi.myApplications();
                setApps(data.applications);
            } catch {
                setError('Failed to load applications');
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, []);

    const handleWithdraw = async (id) => {
        if (!window.confirm('Withdraw this application?')) return;
        try {
            await applicationApi.withdraw(id);
            setApps(apps.filter(a => a.id !== id));
        } catch {
            setError('Failed to withdraw application');
        }
    };

    if (loading) return <div className="page"><div className="empty-state"><div className="spinner" /></div></div>;

    return (
        <div className="page">
            <div className="page-header">
                <h1><Icon name="briefcase" size={24} /> My Applications</h1>
                <p>{apps.length} application{apps.length !== 1 ? 's' : ''}</p>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            {apps.length === 0 ? (
                <div className="glass-card empty-state">
                    <Icon name="briefcase" size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                    <h3>No applications yet</h3>
                    <p className="text-muted">Browse <Link to="/jobs">job openings</Link> and apply!</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {apps.map((app) => {
                        const sc = statusConfig[app.status] || statusConfig.applied;
                        const currentIdx = statusOrder.indexOf(app.status);
                        const isRejected = app.status === 'rejected';

                        return (
                            <div key={app.id} className="glass-card">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
                                    <div>
                                        <Link to={`/jobs/${app.job_id}`} style={{ textDecoration: 'none' }}>
                                            <h3 style={{ color: 'var(--text-heading)', marginBottom: '0.2rem' }}>{app.job_title}</h3>
                                        </Link>
                                        <p className="text-muted" style={{ fontSize: '0.84rem' }}>
                                            <Icon name="building" size={12} /> {app.company_name}
                                        </p>
                                    </div>
                                    <span className="badge" style={{ background: sc.bg, color: sc.color }}>
                                        <Icon name={sc.icon} size={11} /> {sc.label}
                                    </span>
                                </div>

                                {/* Status Timeline */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', margin: '0.75rem 0', padding: '0.5rem 0' }}>
                                    {statusOrder.map((s, i) => {
                                        const isActive = !isRejected && i <= currentIdx;
                                        const isCurrent = s === app.status;
                                        return (
                                            <div key={s} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                                                <div style={{
                                                    width: 24, height: 24, borderRadius: '50%',
                                                    background: isActive ? statusConfig[s].color : 'var(--border)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    transition: 'all 0.3s',
                                                    boxShadow: isCurrent ? `0 0 0 3px ${statusConfig[s].bg}` : 'none',
                                                }}>
                                                    {isActive && <Icon name="checkCircle" size={12} style={{ color: '#fff' }} />}
                                                </div>
                                                {i < statusOrder.length - 1 && (
                                                    <div style={{
                                                        flex: 1, height: 2, marginLeft: 4,
                                                        background: isActive && i < currentIdx ? statusConfig[statusOrder[i + 1]].color : 'var(--border)',
                                                        transition: 'all 0.3s',
                                                    }} />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                    {statusOrder.map(s => <span key={s}>{statusConfig[s].label}</span>)}
                                </div>

                                {isRejected && (
                                    <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-xs)', background: 'var(--danger-bg)', fontSize: '0.82rem', color: 'var(--danger)' }}>
                                        Unfortunately, your application was not successful.
                                    </div>
                                )}

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                                    <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                                        Applied {new Date(app.applied_at).toLocaleDateString()}
                                    </span>
                                    {app.status === 'applied' && (
                                        <button className="btn btn-ghost btn-xs" onClick={() => handleWithdraw(app.id)}>
                                            Withdraw
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
