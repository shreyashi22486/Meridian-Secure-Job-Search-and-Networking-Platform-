import { useState, useEffect, useCallback } from 'react';
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
    const [status, setStatus] = useState('active'); // 'active', 'inactive', 'all'
    const [page, setPage] = useState(0);
    const limit = 12;

    // Recommended jobs
    const [recJobs, setRecJobs] = useState([]);
    const [recLoading, setRecLoading] = useState(false);
    const [userSkills, setUserSkills] = useState([]);

    const fetchJobs = useCallback(async (skip = 0) => {
        setLoading(true);
        try {
            const params = { skip, limit };
            if (keyword) params.keyword = keyword;
            if (location) params.location = location;
            if (workType) params.work_type = workType;
            if (jobType) params.job_type = jobType;
            if (minSalary) params.min_salary = parseInt(minSalary);
            if (status) params.status = status;
            const { data } = await jobApi.search(params);
            setJobs(data.jobs);
            setTotal(data.total);
        } catch {
            setError('Failed to load jobs');
        } finally {
            setLoading(false);
        }
    }, [keyword, location, workType, jobType, minSalary, status]);

    useEffect(() => { fetchJobs(page * limit); }, [page, fetchJobs]);

    // Fetch recommended jobs for logged-in users
    useEffect(() => {
        if (!user) return;
        const fetchRec = async () => {
            setRecLoading(true);
            try {
                const { data } = await jobApi.recommended();
                setRecJobs(data.jobs || []);
                setUserSkills(data.user_skills || []);
            } catch { /* ignore if not logged in */ }
            finally { setRecLoading(false); }
        };
        fetchRec();
    }, [user]);

    const handleSearch = (e) => {
        e.preventDefault();
        setPage(0);
        fetchJobs(0);
    };

    const clearFilters = () => {
        setKeyword(''); setLocation(''); setWorkType(''); setJobType(''); setMinSalary(''); setStatus('active');
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
                    <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>₹</span>
                        <input
                            type="number" placeholder="Min LPA"
                            value={minSalary} onChange={(e) => setMinSalary(e.target.value)}
                            className="role-select" style={{ padding: '0.5rem 0.75rem 0.5rem 1.4rem', width: '130px' }}
                        />
                    </div>
                    {(user?.role?.toLowerCase() === 'recruiter' || user?.role?.toLowerCase() === 'admin') && (
                        <select className="role-select" value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: '0.5rem 0.75rem' }}>
                            <option value="active">Active Only</option>
                            <option value="inactive">Inactive Only</option>
                            <option value="all">Show All</option>
                        </select>
                    )}
                    {(keyword || location || workType || jobType || minSalary || status !== 'active') && (
                        <button type="button" onClick={clearFilters} className="btn btn-ghost btn-xs">
                            <Icon name="x" size={12} /> Clear
                        </button>
                    )}
                </div>
            </form>

            {/* Recommended for You */}
            {user && recJobs.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <h2 style={{ margin: 0, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '1.2rem' }}>✨</span> Recommended for You
                            <span className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 400 }}>
                                Based on your resume skills
                            </span>
                        </h2>
                        {userSkills.length > 0 && (
                            <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                                {userSkills.length} skill{userSkills.length !== 1 ? 's' : ''} detected
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                        {recJobs.slice(0, 8).map((job) => (
                            <Link
                                key={job.id} to={`/jobs/${job.id}`}
                                className="glass-card"
                                style={{
                                    textDecoration: 'none', minWidth: '300px', maxWidth: '340px', flex: '0 0 auto',
                                    display: 'flex', flexDirection: 'column', gap: '0.5rem',
                                    borderColor: job.match_percent >= 70 ? 'rgba(80, 200, 120, 0.3)'
                                        : job.match_percent >= 40 ? 'rgba(255, 180, 50, 0.3)'
                                        : 'rgba(255, 255, 255, 0.06)',
                                    transition: 'transform 0.2s, border-color 0.2s',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <h3 style={{ marginBottom: '0.2rem', fontSize: '0.95rem', color: 'var(--text-heading)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.title}</h3>
                                        <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>
                                            <Icon name="building" size={12} /> {job.company_name}
                                        </p>
                                    </div>
                                    <span style={{
                                        padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700,
                                        whiteSpace: 'nowrap', marginLeft: '0.5rem',
                                        background: job.match_percent >= 70 ? 'rgba(80, 200, 120, 0.15)'
                                            : job.match_percent >= 40 ? 'rgba(255, 180, 50, 0.15)'
                                            : 'rgba(255, 100, 100, 0.15)',
                                        color: job.match_percent >= 70 ? '#50c878'
                                            : job.match_percent >= 40 ? '#ffb432'
                                            : '#ff6464',
                                    }}>
                                        {job.match_percent}% match
                                    </span>
                                </div>

                                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                    {(job.matched_skills || []).slice(0, 5).map((s, i) => (
                                        <span key={i} style={{
                                            padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.68rem',
                                            background: 'rgba(80, 200, 120, 0.12)', color: '#50c878', fontWeight: 500,
                                        }}>✓ {s}</span>
                                    ))}
                                    {(job.matched_skills || []).length > 5 && (
                                        <span className="text-muted" style={{ fontSize: '0.68rem' }}>+{job.matched_skills.length - 5}</span>
                                    )}
                                </div>

                                {formatSalary(job.salary_min, job.salary_max) && (
                                    <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--success)', margin: 0 }}>
                                        {formatSalary(job.salary_min, job.salary_max)}
                                    </p>
                                )}
                            </Link>
                        ))}
                    </div>
                </div>
            )}
            {user && recLoading && (
                <div className="glass-card" style={{ marginBottom: '1.5rem', textAlign: 'center', padding: '1rem' }}>
                    <div className="spinner" style={{ margin: '0 auto' }} />
                    <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Finding jobs matching your skills...</p>
                </div>
            )}

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
                                    <div className="skill-tags">
                                        {job.required_skills.slice(0, 4).map((s, i) => (
                                            <span key={i} className="skill-tag" style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem' }}>{s}</span>
                                        ))}
                                        {job.required_skills.length > 4 && (
                                            <span className="text-muted" style={{ fontSize: '0.72rem' }}>+{job.required_skills.length - 4} more</span>
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
