import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { jobApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/Icons';

export default function Jobs() {
    const { user } = useAuth();
    const [jobs, setJobs] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Search / filter state
    const [keyword, setKeyword] = useState('');
    const [location, setLocation] = useState('');
    const [workType, setWorkType] = useState('');
    const [jobType, setJobType] = useState('');
    const [minSalary, setMinSalary] = useState('');
    const [page, setPage] = useState(0);
    const limit = 12;

    const fetchJobs = async (skip = 0) => {
        setLoading(true);
        try {
            const params = { skip, limit };
            if (keyword) params.keyword = keyword;
            if (location) params.location = location;
            if (workType) params.work_type = workType;
            if (jobType) params.job_type = jobType;
            if (minSalary) params.min_salary = parseInt(minSalary);
            const { data } = await jobApi.search(params);
            setJobs(data.jobs);
            setTotal(data.total);
        } catch {
            setError('Failed to load jobs');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchJobs(page * limit); }, [page]);

    const handleSearch = (e) => {
        e.preventDefault();
        setPage(0);
        fetchJobs(0);
    };

    const clearFilters = () => {
        setKeyword(''); setLocation(''); setWorkType(''); setJobType(''); setMinSalary('');
        setPage(0);
        setTimeout(() => fetchJobs(0), 0);
    };

    const formatSalary = (min, max) => {
        if (!min && !max) return null;
        const fmt = (n) => n >= 100000 ? `${(n / 100000).toFixed(1)}L` : `${(n / 1000).toFixed(0)}K`;
        if (min && max) return `₹${fmt(min)} – ₹${fmt(max)}`;
        if (min) return `From ₹${fmt(min)}`;
        return `Up to ₹${fmt(max)}`;
    };

    const workTypeLabels = { remote: 'Remote', on_site: 'On-site', hybrid: 'Hybrid' };
    const jobTypeLabels = { full_time: 'Full-time', part_time: 'Part-time', internship: 'Internship', contract: 'Contract' };

    return (
        <div className="page">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1><Icon name="briefcase" size={24} /> Job Openings</h1>
                    <p>{total} job{total !== 1 ? 's' : ''} available</p>
                </div>
                {user?.role?.toLowerCase() === 'recruiter' || user?.role?.toLowerCase() === 'admin' ? (
                    <Link to="/companies" className="btn btn-primary btn-sm">
                        <Icon name="building" size={14} /> Post a Job
                    </Link>
                ) : null}
            </div>

            {/* Search & Filters */}
            <form onSubmit={handleSearch} className="glass-card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                    <div className="form-group" style={{ flex: '2', marginBottom: 0, minWidth: '200px' }}>
                        <div style={{ position: 'relative' }}>
                            <Icon name="search" size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                type="text" placeholder="Search jobs by title or keyword..."
                                value={keyword} onChange={(e) => setKeyword(e.target.value)}
                                style={{ paddingLeft: '2.5rem' }}
                            />
                        </div>
                    </div>
                    <div className="form-group" style={{ flex: '1', marginBottom: 0, minWidth: '150px' }}>
                        <div style={{ position: 'relative' }}>
                            <Icon name="mapPin" size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                type="text" placeholder="Location..."
                                value={location} onChange={(e) => setLocation(e.target.value)}
                                style={{ paddingLeft: '2.5rem' }}
                            />
                        </div>
                    </div>
                    <button type="submit" className="btn btn-primary">
                        <Icon name="search" size={14} /> Search
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <select className="role-select" value={workType} onChange={(e) => setWorkType(e.target.value)} style={{ padding: '0.5rem 0.75rem' }}>
                        <option value="">All Work Types</option>
                        <option value="remote">Remote</option>
                        <option value="on_site">On-site</option>
                        <option value="hybrid">Hybrid</option>
                    </select>
                    <select className="role-select" value={jobType} onChange={(e) => setJobType(e.target.value)} style={{ padding: '0.5rem 0.75rem' }}>
                        <option value="">All Job Types</option>
                        <option value="full_time">Full-time</option>
                        <option value="part_time">Part-time</option>
                        <option value="internship">Internship</option>
                        <option value="contract">Contract</option>
                    </select>
                    <input
                        type="number" placeholder="Min Salary"
                        value={minSalary} onChange={(e) => setMinSalary(e.target.value)}
                        className="role-select" style={{ padding: '0.5rem 0.75rem', width: '130px' }}
                    />
                    {(keyword || location || workType || jobType || minSalary) && (
                        <button type="button" onClick={clearFilters} className="btn btn-ghost btn-xs">
                            <Icon name="x" size={12} /> Clear
                        </button>
                    )}
                </div>
            </form>

            {error && <div className="alert alert-error">{error}</div>}

            {loading ? (
                <div className="empty-state"><div className="spinner" /></div>
            ) : jobs.length === 0 ? (
                <div className="glass-card empty-state">
                    <Icon name="briefcase" size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                    <h3>No jobs found</h3>
                    <p className="text-muted">Try different search terms or filters</p>
                </div>
            ) : (
                <>
                    <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
                        {jobs.map((job) => (
                            <Link
                                key={job.id} to={`/jobs/${job.id}`}
                                className="glass-card" style={{ textDecoration: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.75rem', transition: 'transform 0.2s, border-color 0.2s' }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                    <div>
                                        <h3 style={{ marginBottom: '0.25rem', color: 'var(--text-heading)' }}>{job.title}</h3>
                                        <p className="text-muted" style={{ fontSize: '0.84rem' }}>
                                            <Icon name="building" size={13} /> {job.company_name}
                                        </p>
                                    </div>
                                    {!job.is_active && <span className="badge badge-danger">Closed</span>}
                                </div>

                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {job.description}
                                </p>

                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {job.location && (
                                        <span className="badge badge-muted">
                                            <Icon name="mapPin" size={10} /> {job.location}
                                        </span>
                                    )}
                                    {job.work_type && (
                                        <span className="badge badge-action">{workTypeLabels[job.work_type] || job.work_type}</span>
                                    )}
                                    {job.job_type && (
                                        <span className="badge badge-success">{jobTypeLabels[job.job_type] || job.job_type}</span>
                                    )}
                                </div>

                                {formatSalary(job.salary_min, job.salary_max) && (
                                    <p style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--success)' }}>
                                        {formatSalary(job.salary_min, job.salary_max)}
                                    </p>
                                )}

                                {job.required_skills?.length > 0 && (
                                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                        {job.required_skills.slice(0, 4).map((s, i) => (
                                            <span key={i} style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'var(--primary-subtle)', color: 'var(--primary)' }}>{s}</span>
                                        ))}
                                        {job.required_skills.length > 4 && (
                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>+{job.required_skills.length - 4}</span>
                                        )}
                                    </div>
                                )}
                            </Link>
                        ))}
                    </div>

                    {/* Pagination */}
                    {total > limit && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
                            <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Previous</button>
                            <span className="text-muted" style={{ padding: '0.4rem 0.75rem' }}>
                                Page {page + 1} of {Math.ceil(total / limit)}
                            </span>
                            <button className="btn btn-ghost btn-sm" disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)}>Next →</button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
