import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/Icons';
import api from '../api/client';

export default function Network() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [tab, setTab] = useState('connections'); // connections | pending | discover
    const [connections, setConnections] = useState([]);
    const [pending, setPending] = useState([]);
    const [discover, setDiscover] = useState([]);
    const [searchQ, setSearchQ] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [sentRequests, setSentRequests] = useState(new Set());
    const [confirmRemove, setConfirmRemove] = useState(null); // { id, name }

    useEffect(() => {
        const fetch = async () => {
            try {
                const [connRes, pendRes] = await Promise.all([
                    api.get('/connections/me'),
                    api.get('/connections/pending'),
                ]);
                setConnections(connRes.data.connections);
                setPending(pendRes.data.connections);
            } catch {
                setError('Failed to load connections');
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, []);

    // Build sets of connected/pending user IDs for filtering
    const connectedIds = new Set(
        connections.map(c => {
            const other = c.sender_id === user?.id ? c.receiver_id : c.sender_id;
            return other;
        })
    );
    const pendingIds = new Set(
        pending.map(c => c.sender_id === user?.id ? c.receiver_id : c.sender_id)
    );

    const handleSearch = async (q) => {
        setSearchQ(q);
        if (q.length < 2) { setDiscover([]); return; }
        try {
            const { data } = await api.get('/users/search', { params: { q } });
            setDiscover(data.users || []);
        } catch { /* ignore */ }
    };

    const handleConnect = async (targetId) => {
        try {
            await api.post('/connections/request', { target_user_id: targetId });
            setSentRequests(prev => new Set(prev).add(targetId));
            setError('');
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to send request');
        }
    };

    const handleAccept = async (connId) => {
        try {
            await api.put(`/connections/${connId}/accept`);
            const accepted = pending.find(c => c.id === connId);
            setPending(pending.filter(c => c.id !== connId));
            if (accepted) setConnections(prev => [{ ...accepted, status: 'accepted' }, ...prev]);
        } catch {
            setError('Failed to accept');
        }
    };

    const handleReject = async (connId) => {
        try {
            await api.put(`/connections/${connId}/reject`);
            setPending(pending.filter(c => c.id !== connId));
        } catch {
            setError('Failed to reject');
        }
    };

    const handleRemove = async (connId) => {
        try {
            await api.delete(`/connections/${connId}`);
            setConnections(connections.filter(c => c.id !== connId));
            setConfirmRemove(null);
        } catch {
            setError('Failed to remove');
        }
    };

    const otherPerson = (conn) => {
        if (conn.sender_id === user?.id) return { id: conn.receiver_id, name: conn.receiver_name };
        return { id: conn.sender_id, name: conn.sender_name };
    };

    if (loading) return <div className="page"><div className="empty-state"><div className="spinner" /></div></div>;

    return (
        <div className="page">
            <div className="page-header">
                <h1><Icon name="users" size={24} /> My Network</h1>
                <p>{connections.length} connection{connections.length !== 1 ? 's' : ''}{pending.length > 0 ? ` · ${pending.length} pending` : ''}</p>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            {/* Tabs */}
            <div className="tabs" style={{ marginBottom: '1.25rem' }}>
                <button className={`tab ${tab === 'connections' ? 'tab-active' : ''}`} onClick={() => setTab('connections')}>
                    <Icon name="users" size={14} /> Connections ({connections.length})
                </button>
                <button className={`tab ${tab === 'pending' ? 'tab-active' : ''}`} onClick={() => setTab('pending')}>
                    <Icon name="clock" size={14} /> Pending
                    {pending.length > 0 && <span className="badge badge-action" style={{ marginLeft: '0.3rem', fontSize: '0.72rem' }}>{pending.length}</span>}
                </button>
                <button className={`tab ${tab === 'discover' ? 'tab-active' : ''}`} onClick={() => setTab('discover')}>
                    <Icon name="search" size={14} /> Discover
                </button>
            </div>

            {/* Connections Tab */}
            {tab === 'connections' && (
                connections.length === 0 ? (
                    <div className="glass-card empty-state">
                        <Icon name="users" size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                        <h3>No connections yet</h3>
                        <p className="text-muted">Search for people in the Discover tab to build your network.</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
                        {connections.map(conn => {
                            const other = otherPerson(conn);
                            return (
                                <div key={conn.id} className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{
                                        width: 44, height: 44, borderRadius: '50%',
                                        background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: '#fff', fontWeight: 700, fontSize: '1rem', flexShrink: 0,
                                    }}>
                                        {other.name?.charAt(0)?.toUpperCase() || '?'}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <strong style={{ color: 'var(--text-heading)', cursor: 'pointer' }} onClick={() => navigate(`/users/${other.id}`)}>{other.name}</strong>
                                        <div className="text-muted" style={{ fontSize: '0.78rem' }}>Connected</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                                        <button className="btn btn-ghost btn-xs" title="Message" onClick={() => navigate(`/messages?user=${other.id}`)}>
                                            <Icon name="mail" size={13} />
                                        </button>
                                        <button className="btn btn-ghost btn-xs" title="Remove" onClick={() => setConfirmRemove({ id: conn.id, name: other.name })}>
                                            <Icon name="x" size={13} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )
            )}

            {/* Pending Tab */}
            {tab === 'pending' && (
                pending.length === 0 ? (
                    <div className="glass-card empty-state">
                        <Icon name="clock" size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                        <h3>No pending requests</h3>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {pending.map(conn => (
                            <div key={conn.id} className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{
                                    width: 44, height: 44, borderRadius: '50%',
                                    background: 'linear-gradient(135deg, var(--warning), #f59e0b)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#fff', fontWeight: 700, fontSize: '1rem', flexShrink: 0,
                                }}>
                                    {conn.sender_name?.charAt(0)?.toUpperCase() || '?'}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <strong style={{ color: 'var(--text-heading)' }}>{conn.sender_name}</strong>
                                    <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                                        Wants to connect · {new Date(conn.created_at).toLocaleDateString()}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                    <button className="btn btn-primary btn-xs" onClick={() => handleAccept(conn.id)}>
                                        <Icon name="checkCircle" size={12} /> Accept
                                    </button>
                                    <button className="btn btn-ghost btn-xs" onClick={() => handleReject(conn.id)}>
                                        Decline
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            )}

            {/* Discover Tab */}
            {tab === 'discover' && (
                <div>
                    <div className="glass-card" style={{ marginBottom: '1rem', padding: '1rem' }}>
                        <div style={{ position: 'relative' }}>
                            <Icon name="search" size={18} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                            <input
                                type="text" value={searchQ} onChange={(e) => handleSearch(e.target.value)}
                                placeholder="Search people by name or email…"
                                style={{
                                    width: '100%', padding: '0.7rem 0.9rem 0.7rem 2.6rem',
                                    background: 'var(--input-bg)', border: '1px solid var(--border)',
                                    borderRadius: 'var(--radius)', color: 'var(--text)',
                                    fontSize: '0.92rem', transition: 'border-color 0.2s',
                                    outline: 'none',
                                }}
                                onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                                onBlur={e => e.target.style.borderColor = 'var(--border)'}
                            />
                        </div>
                        {!searchQ && (
                            <p className="text-muted" style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>Find professionals and grow your network</p>
                        )}
                    </div>
                    {discover.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
                            {discover.map(u => {
                                const isConnected = connectedIds.has(u.id);
                                const isPending = pendingIds.has(u.id);
                                return (
                                    <div key={u.id} className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{
                                            width: 44, height: 44, borderRadius: '50%',
                                            background: isConnected
                                                ? 'linear-gradient(135deg, var(--success), #10b981)'
                                                : 'linear-gradient(135deg, #6366f1, #a855f7)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: '#fff', fontWeight: 700, fontSize: '1rem', flexShrink: 0,
                                            cursor: 'pointer',
                                        }} onClick={() => navigate(`/users/${u.id}`)}>
                                            {u.full_name?.charAt(0)?.toUpperCase() || '?'}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <strong style={{ color: 'var(--text-heading)', cursor: 'pointer' }} onClick={() => navigate(`/users/${u.id}`)}>{u.full_name}</strong>
                                            <div className="text-muted" style={{ fontSize: '0.78rem' }}>{u.role}</div>
                                        </div>
                                        {isConnected ? (
                                            <span className="badge badge-success" style={{ fontSize: '0.78rem', padding: '0.35rem 0.7rem' }}>
                                                <Icon name="checkCircle" size={11} /> Connected
                                            </span>
                                        ) : isPending ? (
                                            <span className="badge badge-muted" style={{ fontSize: '0.78rem', padding: '0.35rem 0.7rem' }}>
                                                <Icon name="clock" size={11} /> Pending
                                            </span>
                                        ) : sentRequests.has(u.id) ? (
                                            <span className="badge badge-muted" style={{ fontSize: '0.78rem', padding: '0.35rem 0.7rem' }}>
                                                <Icon name="checkCircle" size={11} /> Request Sent
                                            </span>
                                        ) : (
                                            <button className="btn btn-primary btn-xs" onClick={() => handleConnect(u.id)}>
                                                <Icon name="plus" size={12} /> Connect
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {searchQ.length >= 2 && discover.length === 0 && (
                        <div className="text-muted" style={{ textAlign: 'center', padding: '2rem' }}>
                            No users found for "{searchQ}"
                        </div>
                    )}
                </div>
            )}
            {/* Remove Confirmation Modal */}
            {confirmRemove && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, animation: 'fadeIn 0.2s ease',
                }} onClick={() => setConfirmRemove(null)}>
                    <div className="glass-card" style={{
                        minWidth: 340, maxWidth: 400, padding: '1.5rem',
                        animation: 'slideUp 0.25s ease',
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                            <div style={{
                                width: 48, height: 48, borderRadius: '50%',
                                background: 'var(--danger-bg)', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 0.75rem',
                            }}>
                                <Icon name="users" size={22} style={{ color: 'var(--danger)' }} />
                            </div>
                            <h3 style={{ marginBottom: '0.35rem' }}>Remove Connection</h3>
                            <p className="text-muted" style={{ fontSize: '0.88rem' }}>
                                Are you sure you want to remove <strong style={{ color: 'var(--text-heading)' }}>{confirmRemove.name}</strong> from your network?
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmRemove(null)}>
                                Cancel
                            </button>
                            <button className="btn" style={{ flex: 1, background: 'var(--danger)', color: '#fff', border: 'none' }} onClick={() => handleRemove(confirmRemove.id)}>
                                <Icon name="x" size={14} /> Remove
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
