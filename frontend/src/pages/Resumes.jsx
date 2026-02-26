import { useState, useEffect } from 'react';
import { resumeApi } from '../api/client';

export default function Resumes() {
    const [resumes, setResumes] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');

    const fetchResumes = async () => {
        try {
            const { data } = await resumeApi.list();
            setResumes(data.resumes);
        } catch { setError('Failed to load resumes'); }
    };

    useEffect(() => { fetchResumes(); }, []);

    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setError(''); setMsg('');
        setUploading(true);
        try {
            await resumeApi.upload(file);
            setMsg('Resume uploaded and encrypted successfully!');
            fetchResumes();
        } catch (err) {
            setError(err.response?.data?.detail || 'Upload failed');
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const handleDownload = async (resume) => {
        try {
            const { data } = await resumeApi.download(resume.id);
            const url = window.URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = resume.original_filename;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch { setError('Download failed'); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this resume permanently?')) return;
        try {
            await resumeApi.remove(id);
            setMsg('Resume deleted.');
            fetchResumes();
        } catch { setError('Delete failed'); }
    };

    const formatSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    };

    return (
        <div className="page">
            <div className="page-header">
                <h1>My Resumes</h1>
                <p className="text-muted">Upload, manage, and download your encrypted resumes</p>
            </div>

            {msg && <div className="alert alert-success">{msg}</div>}
            {error && <div className="alert alert-error">{error}</div>}

            <div className="upload-area glass-card">
                <div className="upload-icon">📄</div>
                <p>Upload a PDF resume (max 2 MB)</p>
                <label className="btn btn-primary upload-btn">
                    {uploading ? 'Encrypting & Uploading...' : 'Choose PDF File'}
                    <input type="file" accept=".pdf" onChange={handleUpload} hidden disabled={uploading} />
                </label>
                <span className="upload-note">🔒 Files are validated and encrypted before storage</span>
            </div>

            {resumes.length > 0 ? (
                <div className="resume-list">
                    {resumes.map((r) => (
                        <div key={r.id} className="resume-item glass-card">
                            <div className="resume-info">
                                <span className="resume-icon">📎</span>
                                <div>
                                    <strong>{r.original_filename}</strong>
                                    <small>{formatSize(r.file_size)} • {new Date(r.uploaded_at).toLocaleDateString()}</small>
                                </div>
                            </div>
                            <div className="resume-actions">
                                <button className="btn btn-ghost btn-sm" onClick={() => handleDownload(r)}>⬇ Download</button>
                                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r.id)}>✕ Delete</button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="empty-state glass-card">
                    <p>No resumes uploaded yet. Upload your first PDF to get started!</p>
                </div>
            )}
        </div>
    );
}
