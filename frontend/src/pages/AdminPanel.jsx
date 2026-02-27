import { useState, useEffect } from 'react';
import { adminApi } from '../api/client';
import Icon from '../components/Icons';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';

export default function AdminPanel() {
    const [users, setUsers] = useState([]);
    const [logs, setLogs] = useState([]);
    const [activeTab, setActiveTab] = useState('users');
    const [totalUsers, setTotalUsers] = useState(0);
    const [totalLogs, setTotalLogs] = useState(0);
    const toast = useToast();
    const confirm = useConfirm();

    const fetchUsers = async () => {
        try {
            const { data } = await adminApi.listUsers({ limit: 50 });
            setUsers(data.users);
            setTotalUsers(data.total);
        } catch { toast.error('Failed to load users'); }
    };

    const fetchLogs = async () => {
        try {
            const { data } = await adminApi.auditLogs({ limit: 50 });
            setLogs(data.logs);
            setTotalLogs(data.total);
        } catch { toast.error('Failed to load audit logs'); }
    };

    useEffect(() => { fetchUsers(); fetchLogs(); }, []);

    const handleRoleChange = async (userId, currentRole, newRole) => {
        if (currentRole === newRole) return;
        const ok = await confirm({
            title: 'Change User Role',
            message: `Change this user's role from "${currentRole}" to "${newRole}"?`,
            confirmText: 'Change Role',
            icon: 'users',
        });
        if (!ok) return;
        try {
            const { data } = await adminApi.changeRole(userId, newRole);
            toast.success(data.message || 'Role updated');
            fetchUsers();
        } catch (err) { toast.error(err.response?.data?.detail || 'Role change failed'); }
    };

    const handleSuspend = async (userId, isSuspended) => {
        const action = isSuspended ? 'activate' : 'suspend';
        const ok = await confirm({
            title: isSuspended ? 'Activate User' : 'Suspend User',
            message: isSuspended
                ? 'This will restore the user\'s access to the platform.'
                : 'This user will be unable to log in or access the platform.',
            danger: !isSuspended,
            confirmText: isSuspended ? 'Activate' : 'Suspend',
        });
        if (!ok) return;
        try {
            const { data } = await adminApi.suspend(userId);
            toast.success(data.message || `User ${action}d`);
            fetchUsers();
        } catch (err) { toast.error(err.response?.data?.detail || 'Action failed'); }
    };

    const handleDelete = async (userId, name) => {
        const ok = await confirm({
            title: 'Delete User Permanently',
            message: `"${name}" and ALL their data (resumes, profile, skills) will be permanently deleted. This cannot be undone.`,
            danger: true,
            confirmText: 'Delete User',
        });
        if (!ok) return;
        try {
            const { data } = await adminApi.deleteUser(userId);
            toast.success(data.message || 'User deleted');
            setUsers(prev => prev.filter(u => u.id !== userId));
            setTotalUsers(prev => prev - 1);
        } catch (err) { toast.error(err.response?.data?.detail || 'Deletion failed'); }
    };

    return (
        <div className="page">
            <div className="page-header">
                <h1>Admin Panel</h1>
                <p className="text-muted">Manage users and view system activity</p>
            </div>

            <div className="admin-stats">
                <div className="admin-stat-card glass-card">
                    <Icon name="users" size={22} className="admin-stat-icon" />
                    <div>
                        <div className="stat-value">{totalUsers}</div>
                        <div className="stat-label">Total Users</div>
                    </div>
                </div>
                <div className="admin-stat-card glass-card">
                    <Icon name="activity" size={22} className="admin-stat-icon" />
                    <div>
                        <div className="stat-value">{totalLogs}</div>
                        <div className="stat-label">Audit Events</div>
                    </div>
                </div>
            </div>

            <div className="tabs">
                <button className={`tab ${activeTab === 'users' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('users')}>
                    <Icon name="users" size={15} /> Users
                </button>
                <button className={`tab ${activeTab === 'logs' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('logs')}>
                    <Icon name="activity" size={15} /> Audit Logs
                </button>
            </div>

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
                                    <td className="mono">{u.email}</td>
                                    <td>
                                        <select value={u.role} onChange={(e) => handleRoleChange(u.id, u.role, e.target.value)}
                                            className="role-select">
                                            <option value="user">User</option>
                                            <option value="recruiter">Recruiter</option>
                                            <option value="admin">Admin</option>
                                        </select>
                                    </td>
                                    <td>
                                        <span className={u.is_totp_enabled ? 'badge badge-success' : 'badge badge-muted'}>
                                            {u.is_totp_enabled ? <><Icon name="checkCircle" size={12} /> On</> : 'Off'}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={u.is_suspended ? 'badge badge-danger' : 'badge badge-success'}>
                                            {u.is_suspended ? 'Suspended' : 'Active'}
                                        </span>
                                    </td>
                                    <td className="action-cell">
                                        <button className="btn btn-ghost btn-xs" onClick={() => handleSuspend(u.id, u.is_suspended)}>
                                            {u.is_suspended ? 'Activate' : 'Suspend'}
                                        </button>
                                        <button className="btn btn-danger btn-xs" onClick={() => handleDelete(u.id, u.full_name)}>
                                            <Icon name="trash" size={12} />
                                        </button>
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
                                    <td className="mono">
                                        {new Date(log.created_at).toLocaleString('en-IN', {
                                            timeZone: 'Asia/Kolkata',
                                            dateStyle: 'short',
                                            timeStyle: 'medium'
                                        })}
                                    </td>
                                    <td><span className="badge badge-action">{log.action}</span></td>
                                    <td className="mono">{log.user_id ? log.user_id.slice(0, 8) + '…' : '—'}</td>
                                    <td className="mono">{log.ip_address || '—'}</td>
                                    <td className="details-cell">
                                        {log.details ? (
                                            <pre className="details-json">
                                                {JSON.stringify(log.details, null, 2)}
                                            </pre>
                                        ) : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
