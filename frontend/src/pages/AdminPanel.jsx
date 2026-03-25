import { useState, useEffect } from 'react';
import { adminApi } from '../api/client';
import Icon from '../components/Icons';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import VirtualKeyboard from '../components/VirtualKeyboard';
import { useAuth } from '../context/AuthContext';

export default function AdminPanel() {
    const { user } = useAuth();
    const [users, setUsers] = useState([]);
    const [logs, setLogs] = useState([]);
    const [activeTab, setActiveTab] = useState('users');
    const [totalUsers, setTotalUsers] = useState(0);
    const [totalLogs, setTotalLogs] = useState(0);
    const [logPage, setLogPage] = useState(0);
    const [logLoading, setLogLoading] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [chainStatus, setChainStatus] = useState(null);
    const [verifying, setVerifying] = useState(false);
    const toast = useToast();
    const confirm = useConfirm();

    const fetchUsers = async () => {
        try {
            const { data } = await adminApi.listUsers({ limit: 50 });
            setUsers(data.users);
            setTotalUsers(data.total);
        } catch { toast.error('Failed to load users'); }
    };

    const LOG_LIMIT = 25;

    const fetchLogs = async (page = 0) => {
        setLogLoading(true);
        try {
            const { data } = await adminApi.auditLogs({ limit: LOG_LIMIT, skip: page * LOG_LIMIT });
            setLogs(data.logs);
            setTotalLogs(data.total);
            setLogPage(page);
        } catch { toast.error('Failed to load audit logs'); }
        finally { setLogLoading(false); }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            message: `"${name}" and ALL their data will be permanently deleted. OTP verification required.`,
            danger: true,
            confirmText: 'Continue to OTP',
        });
        if (!ok) return;
        if (!user?.is_totp_enabled) {
            toast.error('You must enable Two-Factor Authentication in your Profile before deleting users');
            return;
        }
        // Show VirtualKeyboard for OTP
        setDeleteTarget({ userId, name });
    };

    const handleDeleteOtp = async (otp) => {
        if (!deleteTarget) return;
        const { userId } = deleteTarget;
        setDeleteTarget(null);
        try {
            const { data } = await adminApi.deleteUser(userId, otp);
            toast.success(data.message || 'User deleted');
            setUsers(prev => prev.filter(u => u.id !== userId));
            setTotalUsers(prev => prev - 1);
        } catch (err) { toast.error(err.response?.data?.detail || 'Deletion failed'); }
    };

    const handleVerifyChain = async () => {
        setVerifying(true);
        try {
            const { data } = await adminApi.verifyAuditLogs();
            setChainStatus(data);
            toast[data.valid ? 'success' : 'error'](data.message);
        } catch {
            toast.error('Verification request failed');
        } finally {
            setVerifying(false);
        }
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
                <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Audit Log Chain</h3>
                            <span className="text-muted" style={{ fontSize: '0.8rem' }}>{totalLogs} total events</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            {chainStatus && (
                                <span className={`badge ${chainStatus.valid ? 'badge-success' : 'badge-danger'}`}>
                                    {chainStatus.valid
                                        ? `✓ Chain Valid (${chainStatus.total_entries} entries)`
                                        : `✗ Tamper Detected at #${chainStatus.broken_at}`}
                                </span>
                            )}
                            <button className="btn btn-primary btn-sm" onClick={handleVerifyChain} disabled={verifying}>
                                <Icon name="shield" size={14} />
                                {verifying ? 'Verifying…' : 'Verify Log Integrity'}
                            </button>
                        </div>
                    </div>

                    {logLoading ? (
                        <div className="empty-state"><div className="spinner" /></div>
                    ) : (
                        <table className="data-table" style={{ tableLayout: 'fixed', width: '100%', fontSize: '0.82rem' }}>
                            <colgroup>
                                <col style={{ width: '12%' }} />
                                <col style={{ width: '15%' }} />
                                <col style={{ width: '10%' }} />
                                <col style={{ width: '12%' }} />
                                <col style={{ width: '11%' }} />
                                <col style={{ width: '5%' }} />
                                <col style={{ width: '35%' }} />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Action</th>
                                    <th>User ID</th>
                                    <th>IP</th>
                                    <th>Hash</th>
                                    <th style={{ textAlign: 'center' }}>Sig</th>
                                    <th>Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log) => (
                                    <tr key={log.id}>
                                        <td className="mono" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {new Date(log.created_at).toLocaleString('en-IN', {
                                                timeZone: 'Asia/Kolkata',
                                                dateStyle: 'short',
                                                timeStyle: 'medium'
                                            })}
                                        </td>
                                        <td><span className="badge badge-action" style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{log.action}</span></td>
                                        <td>
                                            <div className="mono" style={{ fontSize: '0.72rem', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                                                {log.user_id || '—'}
                                            </div>
                                        </td>
                                        <td className="mono" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.ip_address || '—'}</td>
                                        <td>
                                            <div className="mono" style={{ fontSize: '0.65rem', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                                                {log.entry_hash || '—'}
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            {log.signature ? (
                                                <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>✓</span>
                                            ) : (
                                                <span className="badge badge-muted" style={{ fontSize: '0.65rem' }}>—</span>
                                            )}
                                        </td>
                                        <td>
                                            <div style={{ fontSize: '0.72rem', maxHeight: '3.5em', overflowY: 'auto', overflowX: 'auto', whiteSpace: 'pre' }}>
                                                {log.details ? Object.entries(log.details).map(([k, v]) =>
                                                    <span key={k} style={{ marginRight: '0.8rem' }}>
                                                        <span className="text-muted">{k}:</span> {String(v)}
                                                    </span>
                                                ) : '—'}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {/* Pagination */}
                    {totalLogs > LOG_LIMIT && (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                            <button
                                className="btn btn-ghost btn-sm"
                                disabled={logPage === 0}
                                onClick={() => fetchLogs(0)}
                            >« First</button>
                            <button
                                className="btn btn-ghost btn-sm"
                                disabled={logPage === 0}
                                onClick={() => fetchLogs(logPage - 1)}
                            >‹ Prev</button>
                            <span style={{ fontSize: '0.82rem', padding: '0 0.75rem' }}>
                                Page {logPage + 1} of {Math.ceil(totalLogs / LOG_LIMIT)}
                            </span>
                            <button
                                className="btn btn-ghost btn-sm"
                                disabled={(logPage + 1) * LOG_LIMIT >= totalLogs}
                                onClick={() => fetchLogs(logPage + 1)}
                            >Next ›</button>
                            <button
                                className="btn btn-ghost btn-sm"
                                disabled={(logPage + 1) * LOG_LIMIT >= totalLogs}
                                onClick={() => fetchLogs(Math.ceil(totalLogs / LOG_LIMIT) - 1)}
                            >Last »</button>
                        </div>
                    )}
                </div>
            )}

            {/* OTP Virtual Keyboard for user deletion */}
            {deleteTarget && (
                <VirtualKeyboard
                    length={6}
                    onComplete={handleDeleteOtp}
                    onClose={() => setDeleteTarget(null)}
                />
            )}
        </div>
    );
}
