import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { applicationApi, resumeApi } from '../api/client';
import Icon from '../components/Icons';

const statusConfig = {
    applied: { label: 'Applied', color: 'var(--primary)', bg: 'var(--primary-subtle)' },
    reviewed: { label: 'Reviewed', color: 'var(--warning)', bg: 'var(--warning-bg)' },
    interviewed: { label: 'Interviewed', color: '#6366f1', bg: 'rgba(99,102,241,0.1)' },
    rejected: { label: 'Rejected', color: 'var(--danger)', bg: 'var(--danger-bg)' },
    offer: { label: 'Offer', color: 'var(--success)', bg: 'var(--success-bg)' },
};

export default function Applicants() {
    const { jobId } = useParams();
    const [applicants, setApplicants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetch = async () => {
            try {
                const { data } = await applicationApi.listApplicants(jobId);
                setApplicants(data.applicants);
            } catch {
                setError('Failed to load applicants');
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [jobId]);

    const handleStatusChange = async (appId, newStatus) => {
        try {
            await applicationApi.updateStatus(appId, newStatus);
            setApplicants(applicants.map(a =>
                a.id === appId ? { ...a, status: newStatus } : a
            ));
        } catch {
            setError('Failed to update status');
        }
    };

    const handleNotesUpdate = async (appId, notes) => {
        try {
            await applicationApi.updateNotes(appId, notes);
            setApplicants(applicants.map(a =>
                a.id === appId ? { ...a, recruiter_notes: notes } : a
            ));
        } catch {
            setError('Failed to update notes');
        }
    };

    const handleDownloadResume = async (resumeId) => {
        try {
            const resp = await resumeApi.download(resumeId);
            const url = window.URL.createObjectURL(new Blob([resp.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'resume.pdf');
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            setError('Failed to download resume');
        }
    };

    if (loading) return <div className="page"><div className="empty-state"><div className="spinner" /></div></div>;

    return (
        <div className="page">
            <div style={{ marginBottom: '1rem' }}>
                <Link to={`/jobs/${jobId}`} style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>← Back to Job</Link>
            </div>

            <div className="page-header">
                <h1><Icon name="users" size={24} /> Applicants</h1>
                <p>{applicants.length} applicant{applicants.length !== 1 ? 's' : ''}</p>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            {applicants.length === 0 ? (
                <div className="glass-card empty-state">
                    <Icon name="users" size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                    <h3>No applicants yet</h3>
                    <p className="text-muted">Applicants will appear here when people apply to this job.</p>
                </div>
            ) : (
                <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Applicant</th>
                                    <th>Status</th>
                                    <th>Applied</th>
                                    <th>Resume</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {applicants.map((app) => {
                                    const sc = statusConfig[app.status] || statusConfig.applied;
                                    return (
                                        <tr key={app.id}>
                                            <td>
                                                <div>
                                                    <strong style={{ color: 'var(--text-heading)' }}>{app.applicant_name}</strong>
                                                    <br />
                                                    <span className="text-muted" style={{ fontSize: '0.8rem' }}>{app.applicant_email}</span>
                                                    {app.cover_note && (
                                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem', fontStyle: 'italic' }}>
                                                            "{app.cover_note.substring(0, 100)}{app.cover_note.length > 100 ? '...' : ''}"
                                                        </p>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <select
                                                    className="role-select"
                                                    value={app.status}
                                                    onChange={(e) => handleStatusChange(app.id, e.target.value)}
                                                    style={{ borderColor: sc.color, color: sc.color }}
                                                >
                                                    <option value="applied">Applied</option>
                                                    <option value="reviewed">Reviewed</option>
                                                    <option value="interviewed">Interviewed</option>
                                                    <option value="offer">Offer</option>
                                                    <option value="rejected">Rejected</option>
                                                </select>
                                            </td>
                                            <td className="text-muted" style={{ fontSize: '0.82rem' }}>
                                                {new Date(app.applied_at).toLocaleDateString()}
                                            </td>
                                            <td>
                                                {app.resume_id ? (
                                                    <button className="btn btn-ghost btn-xs" onClick={() => handleDownloadResume(app.resume_id)}>
                                                        <Icon name="download" size={12} /> Resume
                                                    </button>
                                                ) : (
                                                    <span className="text-muted" style={{ fontSize: '0.8rem' }}>None</span>
                                                )}
                                            </td>
                                            <td style={{ minWidth: '180px' }}>
                                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                    <Link to={`/messages?user=${app.user_id}`} className="btn btn-primary btn-xs">
                                                        <Icon name="mail" size={12} /> Message
                                                    </Link>
                                                    <NotesEditor
                                                        value={app.recruiter_notes || ''}
                                                        onSave={(notes) => handleNotesUpdate(app.id, notes)}
                                                    />
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

function NotesEditor({ value, onSave }) {
    const [editing, setEditing] = useState(false);
    const [notes, setNotes] = useState(value);

    if (!editing) {
        return (
            <button className="btn btn-ghost btn-xs" onClick={() => setEditing(true)}>
                <Icon name="edit" size={11} /> {value ? 'Edit Notes' : 'Add Notes'}
            </button>
        );
    }

    return (
        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
            <input
                type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Private notes..."
                style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', width: '150px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', color: 'var(--text)' }}
                autoFocus
            />
            <button className="btn btn-primary btn-xs" onClick={() => { onSave(notes); setEditing(false); }}>
                Save
            </button>
            <button className="btn btn-ghost btn-xs" onClick={() => { setNotes(value); setEditing(false); }}>
                ✕
            </button>
        </div>
    );
}
