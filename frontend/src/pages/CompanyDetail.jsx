import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { companyApi, jobApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/Icons';

export default function CompanyDetail() {
    const { id } = useParams();
    const { user } = useAuth();
    const [company, setCompany] = useState(null);
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Job creation form state
    const [showJobForm, setShowJobForm] = useState(false);
    const [jobForm, setJobForm] = useState({
        title: '', description: '', location: '', work_type: '', job_type: '',
        salary_min: '', salary_max: '', required_skills: '', application_deadline: '',
    });
    const [posting, setPosting] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({});

    const canEditCompany = user?.role?.toLowerCase() === 'admin' ||
        user?.role?.toLowerCase() === 'recruiter' ||
        (company && user?.id === company.created_by);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [compRes, jobsRes] = await Promise.all([
                    companyApi.get(id),
                    jobApi.search({ company_id: id, limit: 50, status: 'all' }),
                ]);
                setCompany(compRes.data);
                setJobs(jobsRes.data.jobs);
            } catch {
                setError('Company not found');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [id]);

    const handlePostJob = async (e) => {
        e.preventDefault();
        if (!jobForm.title.trim() || !jobForm.description.trim()) return;
        setPosting(true);
        setError('');
        try {
            const payload = {
                company_id: id,
                title: jobForm.title,
                description: jobForm.description,
                location: jobForm.location || null,
                work_type: jobForm.work_type || null,
                job_type: jobForm.job_type || null,
                salary_min: jobForm.salary_min ? Math.round(parseFloat(jobForm.salary_min) * 100000) : null,
                salary_max: jobForm.salary_max ? Math.round(parseFloat(jobForm.salary_max) * 100000) : null,
                required_skills: jobForm.required_skills ? jobForm.required_skills.split(',').map(s => s.trim()).filter(Boolean) : [],
                application_deadline: jobForm.application_deadline || null,
            };
            await jobApi.create(payload);
            setShowJobForm(false);
            setJobForm({ title: '', description: '', location: '', work_type: '', job_type: '', salary_min: '', salary_max: '', required_skills: '', application_deadline: '' });
            // Refresh jobs
            const { data } = await jobApi.search({ company_id: id, limit: 50, status: 'all' });
            setJobs(data.jobs);
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to create job posting');
        } finally {
            setPosting(false);
        }
    };

    const handleUpdateCompany = async (e) => {
        e.preventDefault();
        try {
            const { data } = await companyApi.update(id, editForm);
            setCompany(data);
            setIsEditing(false);
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to update company');
        }
    };

    const workTypeLabels = { remote: 'Remote', on_site: 'On-site', hybrid: 'Hybrid' };
    const jobTypeLabels = { full_time: 'Full-time', part_time: 'Part-time', internship: 'Internship', contract: 'Contract' };

    if (loading) return <div className="page"><div className="empty-state"><div className="spinner" /></div></div>;
    if (error && !company) return <div className="page"><div className="alert alert-error">{error}</div></div>;

    return (
        <div className="page">
            <div style={{ marginBottom: '1rem' }}>
                <Link to="/companies" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>← Back to Companies</Link>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            {/* Company Header */}
            <div className="glass-card" style={{ marginBottom: '1.5rem' }}>
                {isEditing ? (
                    <form onSubmit={handleUpdateCompany}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <div className="form-group">
                                <label>Name</label>
                                <input type="text" value={editForm.name || ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Location</label>
                                <input type="text" value={editForm.location || ''} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} />
                            </div>
                            <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                <label>Description</label>
                                <textarea rows="3" value={editForm.description || ''} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Website</label>
                                <input type="text" value={editForm.website || ''} onChange={(e) => setEditForm({ ...editForm, website: e.target.value })} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button type="submit" className="btn btn-primary btn-sm">Save</button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsEditing(false)}>Cancel</button>
                        </div>
                    </form>
                ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <div style={{
                                width: 56, height: 56, borderRadius: 'var(--radius-sm)',
                                background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontWeight: 700, fontSize: '1.4rem',
                            }}>
                                {company.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <h1>{company.name}</h1>
                                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.25rem' }}>
                                    {company.location && (
                                        <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                                            <Icon name="mapPin" size={13} /> {company.location}
                                        </span>
                                    )}
                                    {company.website && (
                                        <a href={company.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.85rem' }}>
                                            <Icon name="globe" size={13} /> Website
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                        {canEditCompany && (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="btn btn-ghost btn-sm" onClick={() => { setIsEditing(true); setEditForm({ name: company.name, description: company.description, location: company.location, website: company.website }); }}>
                                    <Icon name="edit" size={13} /> Edit
                                </button>
                                <button className="btn btn-primary btn-sm" onClick={() => setShowJobForm(!showJobForm)}>
                                    <Icon name="plus" size={14} /> Post Job
                                </button>
                            </div>
                        )}
                    </div>
                )}
                {company.description && !isEditing && (
                    <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>{company.description}</p>
                )}
            </div>

            {/* Job Posting Form */}
            {showJobForm && (
                <form onSubmit={handlePostJob} className="glass-card" style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>Post a New Job</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div className="form-group">
                            <label>Job Title *</label>
                            <input type="text" required value={jobForm.title} onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })} placeholder="e.g. Senior Software Engineer" />
                        </div>
                        <div className="form-group">
                            <label>Location</label>
                            <input type="text" value={jobForm.location} onChange={(e) => setJobForm({ ...jobForm, location: e.target.value })} placeholder="e.g. Bangalore" />
                        </div>
                        <div className="form-group" style={{ gridColumn: 'span 2' }}>
                            <label>Description *</label>
                            <textarea rows="5" required value={jobForm.description} onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })} placeholder="Describe the role, responsibilities, and qualifications..." />
                        </div>
                        <div className="form-group">
                            <label>Work Type</label>
                            <select value={jobForm.work_type} onChange={(e) => setJobForm({ ...jobForm, work_type: e.target.value })}>
                                <option value="">Select...</option>
                                <option value="remote">Remote</option>
                                <option value="on_site">On-site</option>
                                <option value="hybrid">Hybrid</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Job Type</label>
                            <select value={jobForm.job_type} onChange={(e) => setJobForm({ ...jobForm, job_type: e.target.value })}>
                                <option value="">Select...</option>
                                <option value="full_time">Full-time</option>
                                <option value="part_time">Part-time</option>
                                <option value="internship">Internship</option>
                                <option value="contract">Contract</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Min Salary (Lakhs LPA)</label>
                            <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>₹</span>
                                <input
                                    type="number" step="0.1"
                                    style={{ paddingLeft: '1.75rem' }}
                                    placeholder="e.g. 5.0"
                                    value={jobForm.salary_min}
                                    onChange={(e) => setJobForm({ ...jobForm, salary_min: e.target.value })}
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
                                    placeholder="e.g. 10.0"
                                    value={jobForm.salary_max}
                                    onChange={(e) => setJobForm({ ...jobForm, salary_max: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Required Skills (comma-separated)</label>
                            <input type="text" value={jobForm.required_skills} onChange={(e) => setJobForm({ ...jobForm, required_skills: e.target.value })} placeholder="Python, React, SQL" />
                        </div>
                        <div className="form-group">
                            <label>Application Deadline</label>
                            <input type="date" value={jobForm.application_deadline} onChange={(e) => setJobForm({ ...jobForm, application_deadline: e.target.value })} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button type="submit" className="btn btn-primary" disabled={posting}>
                            {posting ? 'Posting...' : 'Post Job'}
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={() => setShowJobForm(false)}>Cancel</button>
                    </div>
                </form>
            )}

            {/* Job Listings */}
            <h2 style={{ marginBottom: '1rem' }}>
                <Icon name="briefcase" size={18} /> Job Openings ({jobs.length})
            </h2>

            {jobs.length === 0 ? (
                <div className="glass-card empty-state">
                    <Icon name="briefcase" size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
                    <p className="text-muted">No job openings yet</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {jobs.map((job) => (
                        <Link key={job.id} to={`/jobs/${job.id}`} className="glass-card" style={{ textDecoration: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ color: 'var(--text-heading)', marginBottom: '0.25rem' }}>{job.title}</h3>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {job.location && <span className="badge badge-muted"><Icon name="mapPin" size={10} /> {job.location}</span>}
                                    {job.work_type && <span className="badge badge-action">{workTypeLabels[job.work_type]}</span>}
                                    {job.job_type && <span className="badge badge-success">{jobTypeLabels[job.job_type]}</span>}
                                    {!job.is_active && <span className="badge badge-danger">Closed</span>}
                                </div>
                                {job.required_skills?.length > 0 && (
                                    <div className="skill-tags" style={{ marginTop: '0.5rem' }}>
                                        {job.required_skills.slice(0, 5).map((skill, i) => (
                                            <span key={i} className="skill-tag" style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem' }}>{skill}</span>
                                        ))}
                                        {job.required_skills.length > 5 && <span className="text-muted" style={{ fontSize: '0.72rem' }}>+{job.required_skills.length - 5} more</span>}
                                    </div>
                                )}
                            </div>
                            <Icon name="chevronRight" size={16} style={{ color: 'var(--text-muted)' }} />
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
