import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { jobApi, applicationApi, resumeApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/Icons';

export default function JobDetail() {
    const { id } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();
    const [job, setJob] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Apply state
    const [showApply, setShowApply] = useState(false);
    const [resumes, setResumes] = useState([]);
    const [applyForm, setApplyForm] = useState({ resume_id: '', cover_note: '' });
    const [applying, setApplying] = useState(false);
    const [applied, setApplied] = useState(false);

    const isAdmin = user?.role?.toLowerCase() === 'admin';
    const isRecruiter = user?.role?.toLowerCase() === 'recruiter' || isAdmin;
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [updating, setUpdating] = useState(false);

    // Only the person who posted the job can edit it
    const isJobPoster = job && user && user.id === job.posted_by;
    const canEditJob = isJobPoster;

    // Check if application deadline has passed
    const deadlinePassed = job?.application_deadline && new Date(job.application_deadline) < new Date();

    useEffect(() => {
        const fetchJob = async () => {
            try {
                const { data } = await jobApi.get(id);
                setJob(data);
            } catch {
                setError('Job not found');
            } finally {
                setLoading(false);
            }
        };
        fetchJob();
    }, [id]);

    // Check if already applied
    useEffect(() => {
        if (!user) return;
        const check = async () => {
            try {
                const { data } = await applicationApi.myApplications();
                setApplied(data.applications.some(a => a.job_id === id));
            } catch { /* ignore */ }
        };
        check();
    }, [user, id]);

    const handleOpenApply = async () => {
        setShowApply(true);
        try {
            const { data } = await resumeApi.list();
            setResumes(data.resumes || []);
        } catch { /* ignore */ }
    };

    const handleUpdateJob = async (e) => {
        e.preventDefault();
        setUpdating(true);
        setError('');
        try {
            const payload = {
                ...editForm,
                salary_min: editForm.salary_min ? parseInt(editForm.salary_min) : null,
                salary_max: editForm.salary_max ? parseInt(editForm.salary_max) : null,
                required_skills: typeof editForm.required_skills === 'string'
                    ? editForm.required_skills.split(',').map(s => s.trim()).filter(Boolean)
                    : editForm.required_skills
            };
            const { data } = await jobApi.update(id, payload);
            setJob(data);
            setIsEditing(false);
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to update job');
        } finally {
            setUpdating(false);
        }
    };

    const handleApply = async (e) => {
        e.preventDefault();
        setApplying(true);
        setError('');
        try {
            await applicationApi.apply({
                job_id: id,
                resume_id: applyForm.resume_id || null,
                cover_note: applyForm.cover_note || null,
            });
            setApplied(true);
            setShowApply(false);
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to apply');
        } finally {
            setApplying(false);
        }
    };

    const workTypeLabels = { remote: 'Remote', on_site: 'On-site', hybrid: 'Hybrid' };
    const jobTypeLabels = { full_time: 'Full-time', part_time: 'Part-time', internship: 'Internship', contract: 'Contract' };

    const formatSalary = (min, max) => {
        if (!min && !max) return null;
        const fmt = (n) => n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : `₹${(n / 1000).toFixed(0)}K`;
        if (min && max) return `${fmt(min)} – ${fmt(max)}`;
        if (min) return `From ${fmt(min)}`;
        return `Up to ${fmt(max)}`;
    };

    if (loading) return <div className="page"><div className="empty-state"><div className="spinner" /></div></div>;
    if (error && !job) return <div className="page"><div className="alert alert-error">{error || 'Job not found'}</div></div>;

    return (
        <div className="page">
            <div style={{ marginBottom: '1rem' }}>
                <Link to="/jobs" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>← Back to Jobs</Link>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem', alignItems: 'start' }}>
                {/* Main Content */}
                <div className="glass-card">
                    {isEditing ? (
                        <form onSubmit={handleUpdateJob}>
                            <h2 style={{ marginBottom: '1.25rem' }}>Edit Job Posting</h2>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                    <label>Job Title</label>
                                    <input type="text" value={editForm.title || ''} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} required />
                                </div>
                                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                    <label>Description</label>
                                    <textarea rows="8" value={editForm.description || ''} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label>Location</label>
                                    <input type="text" value={editForm.location || ''} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Work Type</label>
                                    <select value={editForm.work_type || ''} onChange={(e) => setEditForm({ ...editForm, work_type: e.target.value })}>
                                        <option value="">Select...</option>
                                        {Object.entries(workTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Job Type</label>
                                    <select value={editForm.job_type || ''} onChange={(e) => setEditForm({ ...editForm, job_type: e.target.value })}>
                                        <option value="">Select...</option>
                                        {Object.entries(jobTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Status</label>
                                    <select value={editForm.is_active === false ? 'inactive' : 'active'} onChange={(e) => setEditForm({ ...editForm, is_active: e.target.value === 'active' })}>
                                        <option value="active">Active (Open)</option>
                                        <option value="inactive">Inactive (Closed)</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Min Salary (Lakhs LPA)</label>
                                    <div style={{ position: 'relative' }}>
                                        <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>₹</span>
                                        <input
                                            type="number" step="0.1"
                                            style={{ paddingLeft: '1.75rem' }}
                                            value={editForm.salary_min ? (editForm.salary_min / 100000).toFixed(1) : ''}
                                            onChange={(e) => setEditForm({ ...editForm, salary_min: e.target.value ? Math.round(parseFloat(e.target.value) * 100000) : null })}
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Max Salary (Lakhs LPA)</label>
                                    <div style={{ position: 'relative' }}>
                                        <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>₹</span>
                                        <input
                                            type="number" step="0.1"
                                            style={{ paddingLeft: '1.75rem' }}
                                            value={editForm.salary_max ? (editForm.salary_max / 100000).toFixed(1) : ''}
                                            onChange={(e) => setEditForm({ ...editForm, salary_max: e.target.value ? Math.round(parseFloat(e.target.value) * 100000) : null })}
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Application Deadline</label>
                                    <input
                                        type="date"
                                        value={editForm.application_deadline ? editForm.application_deadline.substring(0, 10) : ''}
                                        onChange={(e) => setEditForm({ ...editForm, application_deadline: e.target.value })}
                                    />
                                </div>
                                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                    <label>Required Skills (comma-separated)</label>
                                    <input type="text" value={editForm.required_skills || ''} onChange={(e) => setEditForm({ ...editForm, required_skills: e.target.value })} placeholder="e.g. Python, React, SQL" />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem' }}>
                                <button type="submit" className="btn btn-primary" disabled={updating}>
                                    {updating ? 'Saving...' : 'Save Changes'}
                                </button>
                                <button type="button" className="btn btn-ghost" onClick={() => setIsEditing(false)}>Cancel</button>
                            </div>
                        </form>
                    ) : (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                                <div>
                                    <h1 style={{ marginBottom: '0.25rem' }}>{job.title}</h1>
                                    <Link to={`/companies/${job.company_id}`} style={{ fontSize: '0.9rem' }}>
                                        <Icon name="building" size={14} /> {job.company_name}
                                    </Link>
                                </div>
                                {!job.is_active && <span className="badge badge-danger" style={{ fontSize: '0.85rem' }}>Closed</span>}
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                                {job.location && <span className="badge badge-muted"><Icon name="mapPin" size={11} /> {job.location}</span>}
                                {job.work_type && <span className="badge badge-action">{workTypeLabels[job.work_type]}</span>}
                                {job.job_type && <span className="badge badge-success">{jobTypeLabels[job.job_type]}</span>}
                                {formatSalary(job.salary_min, job.salary_max) && (
                                    <span className="badge badge-success" style={{ fontWeight: 600 }}>
                                        {formatSalary(job.salary_min, job.salary_max)}
                                    </span>
                                )}
                            </div>

                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
                                <h2 style={{ marginBottom: '0.75rem' }}>Job Description</h2>
                                <div style={{ fontSize: '0.9rem', lineHeight: 1.8, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                                    {job.description}
                                </div>
                            </div>

                            {job.required_skills?.length > 0 && (
                                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem', marginTop: '1.25rem' }}>
                                    <h2 style={{ marginBottom: '0.75rem' }}>Required Skills</h2>
                                    <div className="skill-tags">
                                        {job.required_skills.map((skill, i) => (
                                            <span key={i} className="skill-tag">{skill}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Sidebar */}
                <div>
                    <div className="glass-card" style={{ marginBottom: '1rem' }}>
                        {applied ? (
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✓</div>
                                <p style={{ fontWeight: 600, color: 'var(--success)', marginBottom: '0.25rem' }}>Applied!</p>
                                <Link to="/applications" style={{ fontSize: '0.85rem' }}>Track your application →</Link>
                            </div>
                        ) : user && job.is_active && !deadlinePassed && user.id !== job.posted_by ? (
                            <button className="btn btn-primary btn-full btn-lg" onClick={handleOpenApply}>
                                <Icon name="arrowRight" size={16} /> Apply Now
                            </button>
                        ) : !user ? (
                            <Link to="/login" className="btn btn-primary btn-full btn-lg" style={{ textDecoration: 'none' }}>
                                <Icon name="lock" size={16} /> Sign in to Apply
                            </Link>
                        ) : job.is_active && user.id === job.posted_by ? (
                            <div className="text-muted" style={{ textAlign: 'center', fontSize: '0.85rem', padding: '0.5rem' }}>
                                You posted this job
                            </div>
                        ) : deadlinePassed && job.is_active ? (
                            <button className="btn btn-ghost btn-full" disabled>
                                <Icon name="clock" size={14} /> Deadline Passed
                            </button>
                        ) : (
                            <button className="btn btn-ghost btn-full" disabled>Applications Closed</button>
                        )}

                        {canEditJob && !isEditing && (
                            <button
                                className="btn btn-ghost btn-full"
                                style={{ marginTop: '0.5rem' }}
                                onClick={() => {
                                    setIsEditing(true);
                                    setEditForm({
                                        title: job.title,
                                        description: job.description,
                                        location: job.location,
                                        work_type: job.work_type,
                                        job_type: job.job_type,
                                        salary_min: job.salary_min,
                                        salary_max: job.salary_max,
                                        required_skills: job.required_skills?.join(', '),
                                        is_active: job.is_active
                                    });
                                }}
                            >
                                <Icon name="edit" size={14} /> Edit Job
                            </button>
                        )}

                        {isJobPoster && job.is_active && (
                            <button
                                className="btn btn-ghost btn-full"
                                style={{ marginTop: '0.5rem', color: 'var(--warning)' }}
                                onClick={async () => {
                                    if (!window.confirm('Close this job? No new applications will be accepted.')) return;
                                    try {
                                        const { data } = await jobApi.update(id, { is_active: false });
                                        setJob(data);
                                    } catch (err) {
                                        setError(err.response?.data?.detail || 'Failed to close job');
                                    }
                                }}
                            >
                                <Icon name="lock" size={14} /> Close Job
                            </button>
                        )}

                        {isJobPoster && !job.is_active && (
                            <button
                                className="btn btn-ghost btn-full"
                                style={{ marginTop: '0.5rem', color: 'var(--success)' }}
                                onClick={async () => {
                                    try {
                                        const { data } = await jobApi.update(id, { is_active: true });
                                        setJob(data);
                                    } catch (err) {
                                        setError(err.response?.data?.detail || 'Failed to reopen job');
                                    }
                                }}
                            >
                                <Icon name="arrowRight" size={14} /> Reopen Job
                            </button>
                        )}

                        {isJobPoster && (
                            <Link to={`/jobs/${id}/applicants`} className="btn btn-glass btn-full" style={{ marginTop: '0.5rem', textDecoration: 'none' }}>
                                <Icon name="users" size={14} /> View Applicants
                            </Link>
                        )}

                        {isAdmin && (
                            <button
                                className="btn btn-danger btn-full"
                                style={{ marginTop: '0.5rem' }}
                                onClick={async () => {
                                    if (!window.confirm('Are you sure you want to delete this job posting? This action cannot be undone.')) return;
                                    try {
                                        await jobApi.remove(id);
                                        navigate('/jobs');
                                    } catch (err) {
                                        setError(err.response?.data?.detail || 'Failed to delete job');
                                    }
                                }}
                            >
                                <Icon name="trash" size={14} /> Delete Job
                            </button>
                        )}
                    </div>

                    {/* Apply Modal (inline) */}
                    {showApply && (
                        <form onSubmit={handleApply} className="glass-card" style={{ marginBottom: '1rem' }}>
                            <h3 style={{ marginBottom: '0.75rem' }}>Submit Application</h3>
                            <div className="form-group">
                                <label>Attach Resume (optional)</label>
                                <select value={applyForm.resume_id} onChange={(e) => setApplyForm({ ...applyForm, resume_id: e.target.value })}>
                                    <option value="">No resume</option>
                                    {resumes.map(r => (
                                        <option key={r.id} value={r.id}>{r.original_filename || 'Resume'}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Cover Note (optional)</label>
                                <textarea
                                    rows="3" value={applyForm.cover_note}
                                    onChange={(e) => setApplyForm({ ...applyForm, cover_note: e.target.value })}
                                    placeholder="Why are you a great fit for this role?"
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button type="submit" className="btn btn-primary" disabled={applying}>
                                    {applying ? 'Submitting...' : 'Submit Application'}
                                </button>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowApply(false)}>Cancel</button>
                            </div>
                        </form>
                    )}

                    <div className="glass-card">
                        <h3 style={{ marginBottom: '0.75rem' }}>Job Details</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.85rem' }}>
                            {job.location && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Icon name="mapPin" size={14} style={{ color: 'var(--text-muted)' }} />
                                    <span>{job.location}</span>
                                </div>
                            )}
                            {job.work_type && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Icon name="globe" size={14} style={{ color: 'var(--text-muted)' }} />
                                    <span>{workTypeLabels[job.work_type]}</span>
                                </div>
                            )}
                            {job.job_type && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Icon name="briefcase" size={14} style={{ color: 'var(--text-muted)' }} />
                                    <span>{jobTypeLabels[job.job_type]}</span>
                                </div>
                            )}
                            {formatSalary(job.salary_min, job.salary_max) && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Icon name="trendingUp" size={14} style={{ color: 'var(--success)' }} />
                                    <span style={{ color: 'var(--success)', fontWeight: 600 }}>{formatSalary(job.salary_min, job.salary_max)}</span>
                                </div>
                            )}
                            {job.application_deadline && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Icon name="clock" size={14} style={{ color: 'var(--warning)' }} />
                                    <span>Deadline: {new Date(job.application_deadline).toLocaleDateString()}</span>
                                </div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                                <Icon name="clock" size={14} />
                                <span>Posted {new Date(job.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
