import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { companyApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/Icons';

export default function Companies() {
    const { user } = useAuth();
    const [companies, setCompanies] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [error, setError] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({ name: '', description: '', location: '', website: '' });
    const limit = 12;

    const isRecruiterOrAdmin = user?.role?.toLowerCase() === 'recruiter' || user?.role?.toLowerCase() === 'admin';

    const fetchCompanies = async (skip = 0) => {
        setLoading(true);
        try {
            const params = { skip, limit };
            if (search) params.search = search;
            const { data } = await companyApi.list(params);
            setCompanies(data.companies);
            setTotal(data.total);
        } catch {
            setError('Failed to load companies');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchCompanies(page * limit); }, [page]);

    const handleSearch = (e) => {
        e.preventDefault();
        setPage(0);
        fetchCompanies(0);
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) return;
        setCreating(true);
        setError('');
        try {
            await companyApi.create(form);
            setShowCreate(false);
            setForm({ name: '', description: '', location: '', website: '' });
            fetchCompanies(0);
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to create company');
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="page">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1><Icon name="building" size={24} /> Companies</h1>
                    <p>{total} compan{total !== 1 ? 'ies' : 'y'} registered</p>
                </div>
                {isRecruiterOrAdmin && (
                    <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(!showCreate)}>
                        <Icon name="plus" size={14} /> New Company
                    </button>
                )}
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            {/* Create Company Form */}
            {showCreate && (
                <form onSubmit={handleCreate} className="glass-card" style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>Create Company</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div className="form-group">
                            <label>Company Name *</label>
                            <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Acme Corp" />
                        </div>
                        <div className="form-group">
                            <label>Location</label>
                            <input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Bangalore, India" />
                        </div>
                        <div className="form-group" style={{ gridColumn: 'span 2' }}>
                            <label>Description</label>
                            <textarea rows="3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What does this company do?" />
                        </div>
                        <div className="form-group">
                            <label>Website</label>
                            <input type="text" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://example.com" />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button type="submit" className="btn btn-primary" disabled={creating}>
                            {creating ? 'Creating...' : 'Create Company'}
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                    </div>
                </form>
            )}

            {/* Search */}
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <div style={{ position: 'relative' }}>
                        <Icon name="search" size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="text" placeholder="Search companies..."
                            value={search} onChange={(e) => setSearch(e.target.value)}
                            style={{ paddingLeft: '2.5rem' }}
                        />
                    </div>
                </div>
                <button type="submit" className="btn btn-glass"><Icon name="search" size={14} /></button>
            </form>

            {loading ? (
                <div className="empty-state"><div className="spinner" /></div>
            ) : companies.length === 0 ? (
                <div className="glass-card empty-state">
                    <Icon name="building" size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                    <h3>No companies found</h3>
                    <p className="text-muted">
                        {isRecruiterOrAdmin ? 'Create your first company to start posting jobs' : 'Companies will appear here once recruiters register them'}
                    </p>
                </div>
            ) : (
                <>
                    <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                        {companies.map((company) => (
                            <Link key={company.id} to={`/companies/${company.id}`} className="glass-card" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                    <div style={{
                                        width: 44, height: 44, borderRadius: 'var(--radius-sm)',
                                        background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: '#fff', fontWeight: 700, fontSize: '1.1rem',
                                    }}>
                                        {company.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 style={{ color: 'var(--text-heading)' }}>{company.name}</h3>
                                        {company.location && (
                                            <p className="text-muted" style={{ fontSize: '0.82rem' }}>
                                                <Icon name="mapPin" size={11} /> {company.location}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                {company.description && (
                                    <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                        {company.description}
                                    </p>
                                )}
                                <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                                    <span className="badge badge-action">
                                        <Icon name="briefcase" size={10} /> {company.job_count} job{company.job_count !== 1 ? 's' : ''}
                                    </span>
                                    {company.website && <span className="badge badge-muted"><Icon name="globe" size={10} /> Website</span>}
                                </div>
                            </Link>
                        ))}
                    </div>

                    {total > limit && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
                            <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Previous</button>
                            <span className="text-muted" style={{ padding: '0.4rem 0.75rem' }}>Page {page + 1} of {Math.ceil(total / limit)}</span>
                            <button className="btn btn-ghost btn-sm" disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)}>Next →</button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
