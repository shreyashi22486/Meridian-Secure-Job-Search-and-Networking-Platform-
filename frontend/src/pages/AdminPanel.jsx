import { useState, useEffect } from 'react';
import { adminApi } from '../api/client';

export default function AdminPanel() {
    const [users, setUsers] = useState([]);
    const [logs, setLogs] = useState([]);
    const [activeTab, setActiveTab] = useState('users');
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [totalUsers, setTotalUsers] = useState(0);
    const [totalLogs, setTotalLogs] = useState(0);

    const fetchUsers = async () => {
        try {
            const { data } = await adminApi.listUsers({ limit: 50 });
            setUsers(data.users);
            setTotalUsers(data.total);
        } catch { setError('Failed to load users'); }
    };

    const fetchLogs = async () => {
        try {
            const { data } = await adminApi.auditLogs({ limit: 50 });
            setLogs(data.logs);
            setTotalLogs(data.total);
        } catch { setError('Failed to load audit logs'); }
    };

    useEffect(() => {
        fetchUsers();
        fetchLogs();
    }, []);

    const handleRoleChange = async (userId, newRole) => {
        setError(''); setMsg('');
        try {
            const { data } = await adminApi.changeRole(userId, newRole);
            setMsg(data.message);
            fetchUsers();
        } catch (err) { setError(err.response?.data?.detail || 'Role change failed'); }
    };

    const handleSuspend = async (userId) => {
        setError(''); setMsg('');
        try {
            const { data } = await adminApi.suspend(userId);
            setMsg(data.message);
            fetchUsers();
        } catch (err) { setError(err.response?.data?.detail || 'Action failed'); }
    };

    const handleDelete = async (userId) => {
        if (!window.confirm('Permanently delete this user and all their data?')) return;
        setError(''); setMsg('');
        try {
            const { data } = await adminApi.deleteUser(userId);
            setMsg(data.message);
            fetchUsers();
        } catch (err) { setError(err.response?.data?.detail || 'Deletion failed'); }
    };

    return (
        <div className="page">
            <div className="page-header">
                <h1>Admin Panel</h1>
                <p className="text-muted">Manage users and view audit logs</p>
            </div>

            <div className="card-grid">
                <div className="stat-card glass-card">
                    <div className="stat-icon">👥</div>
                    <div className="stat-value">{totalUsers}</div>
                    <div className="stat-label">Total Users</div>
                </div>
                <div className="stat-card glass-card">
                    <div className="stat-icon">📊</div>
                    <div className="stat-value">{totalLogs}</div>
                    <div className="stat-label">Audit Events</div>
                </div>
            </div>

            <div className="tabs">
                <button className={`tab ${activeTab === 'users' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('users')}>Users</button>
                <button className={`tab ${activeTab === 'logs' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('logs')}>Audit Logs</button>
            </div>

            {msg && <div className="alert alert-success">{msg}</div>}
            {error && <div className="alert alert-error">{error}</div>}

            {activeTab === 'users' && (
                <div className="table-container glass-card">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Name</th><th>Email</th><th>Role</th><th>2FA</th><th>Status</th><th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((u) => (
                                <tr key={u.id}>
                                    <td>{u.full_name}</td>
                                    <td>{u.email}</td>
                                    <td>
                                        <select value={u.role} onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                            className="role-select">
                                            <option value="user">User</option>
                                            <option value="recruiter">Recruiter</option>
                                            <option value="admin">Admin</option>
                                        </select>
                                    </td>
                                    <td><span className={u.is_totp_enabled ? 'badge badge-success' : 'badge badge-muted'}>
                                        {u.is_totp_enabled ? '✓' : '—'}</span></td>
                                    <td><span className={u.is_suspended ? 'badge badge-danger' : 'badge badge-success'}>
                                        {u.is_suspended ? 'Suspended' : 'Active'}</span></td>
                                    <td className="action-cell">
                                        <button className="btn btn-ghost btn-xs" onClick={() => handleSuspend(u.id)}>
                                            {u.is_suspended ? 'Unsuspend' : 'Suspend'}
                                        </button>
                                        <button className="btn btn-danger btn-xs" onClick={() => handleDelete(u.id)}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'logs' && (
                <div className="table-container glass-card">
                    <table className="data-table">
                        <thead>
                            <tr><th>Time</th><th>Action</th><th>User ID</th><th>IP</th><th>Details</th></tr>
                        </thead>
                        <tbody>
                            {logs.map((log) => (
                                <tr key={log.id}>
                                    <td className="mono">{new Date(log.created_at).toLocaleString()}</td>
                                    <td><span className="badge badge-action">{log.action}</span></td>
                                    <td className="mono">{log.user_id ? log.user_id.slice(0, 8) + '...' : '—'}</td>
                                    <td className="mono">{log.ip_address || '—'}</td>
                                    <td className="mono">{log.details ? JSON.stringify(log.details).slice(0, 60) : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
