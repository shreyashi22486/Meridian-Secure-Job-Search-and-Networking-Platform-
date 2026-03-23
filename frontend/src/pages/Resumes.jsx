import { useState, useEffect } from 'react';
import { resumeApi } from '../api/client';
import Icon from '../components/Icons';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import VirtualKeyboard from '../components/VirtualKeyboard';
import { useAuth } from '../context/AuthContext';

export default function Resumes() {
    const { user } = useAuth();
    const [resumes, setResumes] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [otpTarget, setOtpTarget] = useState(null); // resume being downloaded
    const [verifyStatus, setVerifyStatus] = useState({}); // { resumeId: { verified, message } }
    const toast = useToast();
    const confirm = useConfirm();

    const fetchResumes = async () => {
        try {
            const { data } = await resumeApi.list();
            setResumes(data.resumes);
        } catch {
            toast.error('Failed to load resumes');
        }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { fetchResumes(); }, []);

    const uploadFile = async (file) => {
        if (!file) return;
        setUploading(true);
        try {
            await resumeApi.upload(file);
            toast.success('Resume uploaded, encrypted & signed!');
            fetchResumes();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const handleUpload = (e) => {
        uploadFile(e.target.files[0]);
        e.target.value = '';
    };

    const handleDrop = (e) => {
        e.preventDefault(); setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/pdf') uploadFile(file);
        else toast.error('Only PDF files are accepted');
    };

    const doDownload = async (resume, otpCode) => {
        try {
            const { data } = await resumeApi.download(resume.id, otpCode || undefined);
            const url = window.URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = resume.original_filename;
            a.click();
            window.URL.revokeObjectURL(url);
            toast.success('Download started');
        } catch (err) {
            const detail = err.response?.data;
            // Blob error responses need parsing
            if (detail instanceof Blob) {
                const text = await detail.text();
                try { toast.error(JSON.parse(text).detail); } catch { toast.error('Download failed'); }
            } else {
                toast.error(detail?.detail || 'Download failed');
            }
        }
    };

    const handleDownload = (resume) => {
        if (!user?.is_totp_enabled) {
            toast.error('You must enable Two-Factor Authentication in your Profile before downloading resumes');
            return;
        }
        // Show VirtualKeyboard for OTP (high-risk action)
        setOtpTarget(resume);
    };

    const handleOtpComplete = async (otp) => {
        if (!otpTarget) return;
        setOtpTarget(null);
        await doDownload(otpTarget, otp);
    };

    const handleVerify = async (resumeId) => {
        try {
            const { data } = await resumeApi.verify(resumeId);
            setVerifyStatus(prev => ({ ...prev, [resumeId]: data }));
            toast[data.verified ? 'success' : 'error'](data.message);
        } catch {
            toast.error('Verification failed');
        }
    };

    const handleDelete = async (id, filename) => {
        const ok = await confirm({
            title: 'Delete Resume',
            message: `"${filename}" will be permanently deleted. This cannot be undone.`,
            danger: true,
            confirmText: 'Delete Resume',
        });
        if (!ok) return;
        try {
            await resumeApi.remove(id);
            toast.success('Resume deleted');
            setResumes(prev => prev.filter(r => r.id !== id));
        } catch {
            toast.error('Delete failed');
        }
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

            <div
                className={`upload-area glass-card ${dragOver ? 'upload-area-active' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
            >
                <div className="upload-icon-wrap">
                    <Icon name="upload" size={32} />
                </div>
                <p className="upload-title">{uploading ? 'Encrypting & Uploading…' : 'Drag & drop your PDF here'}</p>
                <p className="upload-sub">or</p>
                <label className="btn btn-primary upload-btn">
                    Browse Files
                    <input type="file" accept=".pdf" onChange={handleUpload} hidden disabled={uploading} />
                </label>
                <span className="upload-note">
                    <Icon name="lock" size={12} /> Max 2 MB · PDF only · Encrypted & PKI signed
                </span>
            </div>

            {resumes.length > 0 ? (
                <div className="resume-list">
                    {resumes.map((r) => (
                        <div key={r.id} className="resume-item glass-card">
                            <div className="resume-info">
                                <div className="resume-icon-wrap">
                                    <Icon name="fileText" size={20} />
                                </div>
                                <div>
                                    <strong>{r.original_filename}</strong>
                                    <small>{formatSize(r.file_size)} · {new Date(r.uploaded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</small>
                                    {verifyStatus[r.id] && (
                                        <span className={`badge ${verifyStatus[r.id].verified ? 'badge-success' : 'badge-danger'}`} style={{ marginLeft: 8, fontSize: '0.7rem' }}>
                                            {verifyStatus[r.id].verified ? '✓ Verified' : '✗ Tampered'}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="resume-actions">
                                <button className="btn btn-ghost btn-sm" onClick={() => handleVerify(r.id)} title="Verify PKI signature">
                                    <Icon name="shield" size={14} /> Verify
                                </button>
                                <button className="btn btn-ghost btn-sm" onClick={() => handleDownload(r)}>
                                    <Icon name="download" size={14} /> Download
                                </button>
                                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r.id, r.original_filename)}>
                                    <Icon name="trash" size={14} /> Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="empty-state glass-card">
                    <Icon name="fileText" size={40} className="empty-icon" />
                    <p>No resumes uploaded yet</p>
                    <span className="text-muted">Upload your first PDF to get started</span>
                </div>
            )}

            {/* OTP Virtual Keyboard for resume download */}
            {otpTarget && (
                <VirtualKeyboard
                    length={6}
                    onComplete={handleOtpComplete}
                    onClose={() => setOtpTarget(null)}
                />
            )}
        </div>
    );
}
