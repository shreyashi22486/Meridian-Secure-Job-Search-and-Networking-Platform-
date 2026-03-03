import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { userApi, authApi } from '../api/client';
import Icon from '../components/Icons';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import SKILLS_DATA from '../data/skills';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const Avatar = ({ src, name, size = 96 }) => {
    const initials = name
        ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : '?';
    return src ? (
        <img src={src} alt={name} className="avatar-img" style={{ width: size, height: size }} />
    ) : (
        <div className="avatar-initials" style={{ width: size, height: size, fontSize: size * 0.35 }}>
            {initials}
        </div>
    );
};

const yearOptions = (minYear = 1970) => {
    const current = new Date().getFullYear();
    const years = [];
    for (let y = current + 4; y >= minYear; y--) years.push(y);
    return years;
};

// ─── Profile Header Card ──────────────────────────────────────────────────────

function ProfileHeaderCard({ user, onAvatarChange, formData, setFormData, onSave, saving }) {
    const avatarInputRef = useRef(null);
    const [avatarPreview, setAvatarPreview] = useState(null);
    const [avatarFile, setAvatarFile] = useState(null);
    const [loadingAvatar, setLoadingAvatar] = useState(false);
    const toast = useToast();

    useEffect(() => {
        if (user?.avatar_url) {
            userApi.getMyAvatarBlob()
                .then(url => setAvatarPreview(url))
                .catch(() => setAvatarPreview(null));
        }
    }, [user?.avatar_url]);

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setAvatarFile(file);
        setAvatarPreview(URL.createObjectURL(file));
    };

    const handleAvatarUpload = async () => {
        if (!avatarFile) return;
        setLoadingAvatar(true);
        try {
            await userApi.avatarUpload(avatarFile);
            setAvatarFile(null);
            const url = await userApi.getMyAvatarBlob();
            setAvatarPreview(url);
            onAvatarChange();
            toast.success('Profile photo updated!');
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Avatar upload failed');
        } finally {
            setLoadingAvatar(false);
        }
    };

    return (
        <div className="profile-header-card glass-card">
            <div className="profile-header-inner">
                <div className="avatar-wrapper">
                    <div className="avatar-circle" onClick={() => avatarInputRef.current?.click()} title="Click to change photo">
                        <Avatar src={avatarPreview} name={user?.full_name} size={96} />
                        <div className="avatar-overlay">
                            <Icon name="camera" size={22} />
                        </div>
                    </div>
                    <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/jpeg,image/png"
                        style={{ display: 'none' }}
                        onChange={handleFileChange}
                    />
                    {avatarFile && (
                        <button
                            className="btn btn-primary btn-sm avatar-upload-btn"
                            onClick={handleAvatarUpload}
                            disabled={loadingAvatar}
                        >
                            {loadingAvatar ? 'Uploading…' : '✓ Save Photo'}
                        </button>
                    )}
                </div>
                <div className="profile-info-col">
                    <div className="form-row-2">
                        <div className="form-group">
                            <label>Full Name</label>
                            <input
                                value={formData.full_name}
                                onChange={e => setFormData(d => ({ ...d, full_name: e.target.value }))}
                                placeholder="Your full name"
                            />
                        </div>
                        <div className="form-group">
                            <label>Location</label>
                            <input
                                value={formData.location}
                                onChange={e => setFormData(d => ({ ...d, location: e.target.value }))}
                                placeholder="e.g. New Delhi, India"
                            />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Headline</label>
                        <input
                            value={formData.headline}
                            onChange={e => setFormData(d => ({ ...d, headline: e.target.value }))}
                            placeholder="e.g. Software Engineer · Open to work"
                        />
                    </div>
                    <div className="form-group">
                        <label>Bio</label>
                        <textarea
                            rows={3}
                            value={formData.bio}
                            onChange={e => setFormData(d => ({ ...d, bio: e.target.value }))}
                            placeholder="Tell recruiters about yourself…"
                        />
                    </div>
                    <button className="btn btn-primary" onClick={onSave} disabled={saving}>
                        {saving ? 'Saving…' : '✓ Save Profile'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Education Section ────────────────────────────────────────────────────────

const EMPTY_EDU = { institution: '', degree: '', field_of_study: '', start_year: '', end_year: '' };

function EducationSection({ items, onAdded, onUpdated, onDeleted }) {
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState(EMPTY_EDU);
    const [saving, setSaving] = useState(false);
    const toast = useToast();
    const confirm = useConfirm();

    const openAdd = () => { setForm(EMPTY_EDU); setEditId(null); setShowForm(true); };
    const openEdit = (item) => {
        setForm({
            institution: item.institution || '',
            degree: item.degree || '',
            field_of_study: item.field_of_study || '',
            start_year: item.start_year || '',
            end_year: item.end_year || '',
        });
        setEditId(item.id);
        setShowForm(true);
    };

    const handleSave = async () => {
        if (!form.institution.trim()) { toast.error('Institution is required'); return; }
        setSaving(true);
        try {
            const payload = {
                institution: form.institution,
                degree: form.degree || null,
                field_of_study: form.field_of_study || null,
                start_year: form.start_year ? parseInt(form.start_year) : null,
                end_year: form.end_year ? parseInt(form.end_year) : null,
            };
            if (editId) {
                const { data } = await userApi.updateEducation(editId, payload);
                onUpdated(data);
                toast.success('Education updated');
            } else {
                const { data } = await userApi.addEducation(payload);
                onAdded(data);
                toast.success('Education added');
            }
            setShowForm(false);
            setEditId(null);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to save education');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        const ok = await confirm({
            title: 'Remove Education',
            message: 'This education entry will be permanently deleted.',
            danger: true,
            confirmText: 'Remove',
        });
        if (!ok) return;
        try {
            await userApi.deleteEducation(id);
            onDeleted(id);
            toast.success('Education removed');
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Delete failed');
        }
    };

    // Year options: end year depends on start year
    const startYears = yearOptions();
    const endYears = form.start_year ? yearOptions(parseInt(form.start_year)) : yearOptions();

    return (
        <div className="section-card glass-card">
            <div className="section-header">
                <div className="section-title-row">
                    <Icon name="graduationCap" size={18} className="section-icon-svg" />
                    <h2>Education</h2>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={openAdd}>+ Add</button>
            </div>

            {items.length === 0 && !showForm && (
                <p className="section-empty">No education entries yet.</p>
            )}

            <div className="section-items">
                {items.map(item => (
                    <div key={item.id} className="section-item">
                        <div className="item-icon-col"><Icon name="building" size={18} /></div>
                        <div className="item-body">
                            <div className="item-title">{item.institution}</div>
                            {item.degree && (
                                <div className="item-subtitle">
                                    {item.degree}{item.field_of_study ? ` · ${item.field_of_study}` : ''}
                                </div>
                            )}
                            <div className="item-meta">
                                {item.start_year && <span>{item.start_year}</span>}
                                {item.start_year && <span> – </span>}
                                <span>{item.end_year || 'Present'}</span>
                            </div>
                        </div>
                        <div className="item-actions">
                            <button className="btn btn-ghost btn-xs" onClick={() => openEdit(item)}><Icon name="edit" size={14} /></button>
                            <button className="btn btn-ghost btn-xs danger-hover" onClick={() => handleDelete(item.id)}><Icon name="trash" size={14} /></button>
                        </div>
                    </div>
                ))}
            </div>

            {showForm && (
                <div className="inline-form">
                    <div className="form-row-2">
                        <div className="form-group">
                            <label>Institution *</label>
                            <input value={form.institution} onChange={e => setForm(f => ({ ...f, institution: e.target.value }))} placeholder="e.g. IIT Delhi" autoFocus />
                        </div>
                        <div className="form-group">
                            <label>Degree</label>
                            <input value={form.degree} onChange={e => setForm(f => ({ ...f, degree: e.target.value }))} placeholder="e.g. B.Tech" />
                        </div>
                    </div>
                    <div className="form-row-3">
                        <div className="form-group">
                            <label>Field of Study</label>
                            <input value={form.field_of_study} onChange={e => setForm(f => ({ ...f, field_of_study: e.target.value }))} placeholder="e.g. Computer Science" />
                        </div>
                        <div className="form-group">
                            <label>Start Year</label>
                            <select value={form.start_year} onChange={e => setForm(f => ({ ...f, start_year: e.target.value }))}>
                                <option value="">— Select —</option>
                                {startYears.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>End Year</label>
                            <select value={form.end_year} onChange={e => setForm(f => ({ ...f, end_year: e.target.value }))}>
                                <option value="">Present</option>
                                {endYears.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="form-actions">
                        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                            {saving ? 'Saving…' : editId ? 'Update' : 'Add Entry'}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setShowForm(false); setEditId(null); }}>Cancel</button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Experience Section ───────────────────────────────────────────────────────

const EMPTY_EXP = { company: '', title: '', start_date: '', end_date: '', description: '' };

function ExperienceSection({ items, onAdded, onUpdated, onDeleted }) {
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState(EMPTY_EXP);
    const [saving, setSaving] = useState(false);
    const toast = useToast();
    const confirm = useConfirm();

    const openAdd = () => { setForm(EMPTY_EXP); setEditId(null); setShowForm(true); };
    const openEdit = (item) => {
        setForm({
            company: item.company || '',
            title: item.title || '',
            start_date: item.start_date || '',
            end_date: item.end_date || '',
            description: item.description || '',
        });
        setEditId(item.id);
        setShowForm(true);
    };

    const handleSave = async () => {
        if (!form.company.trim() || !form.title.trim()) { toast.error('Company and Title are required'); return; }
        setSaving(true);
        try {
            const payload = {
                company: form.company,
                title: form.title,
                start_date: form.start_date || null,
                end_date: form.end_date || null,
                description: form.description || null,
            };
            if (editId) {
                const { data } = await userApi.updateExperience(editId, payload);
                onUpdated(data);
                toast.success('Experience updated');
            } else {
                const { data } = await userApi.addExperience(payload);
                onAdded(data);
                toast.success('Experience added');
            }
            setShowForm(false);
            setEditId(null);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to save experience');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        const ok = await confirm({
            title: 'Remove Experience',
            message: 'This experience entry will be permanently deleted.',
            danger: true,
            confirmText: 'Remove',
        });
        if (!ok) return;
        try {
            await userApi.deleteExperience(id);
            onDeleted(id);
            toast.success('Experience removed');
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Delete failed');
        }
    };

    return (
        <div className="section-card glass-card">
            <div className="section-header">
                <div className="section-title-row">
                    <Icon name="briefcase" size={18} className="section-icon-svg" />
                    <h2>Experience</h2>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={openAdd}>+ Add</button>
            </div>

            {items.length === 0 && !showForm && (
                <p className="section-empty">No experience entries yet.</p>
            )}

            <div className="section-items">
                {items.map(item => (
                    <div key={item.id} className="section-item">
                        <div className="item-icon-col"><Icon name="building" size={18} /></div>
                        <div className="item-body">
                            <div className="item-title">{item.title}</div>
                            <div className="item-subtitle">{item.company}</div>
                            <div className="item-meta">
                                {item.start_date && <span>{item.start_date}</span>}
                                {item.start_date && <span> – </span>}
                                <span>{item.end_date || 'Present'}</span>
                            </div>
                            {item.description && <p className="item-desc">{item.description}</p>}
                        </div>
                        <div className="item-actions">
                            <button className="btn btn-ghost btn-xs" onClick={() => openEdit(item)}><Icon name="edit" size={14} /></button>
                            <button className="btn btn-ghost btn-xs danger-hover" onClick={() => handleDelete(item.id)}><Icon name="trash" size={14} /></button>
                        </div>
                    </div>
                ))}
            </div>

            {showForm && (
                <div className="inline-form">
                    <div className="form-row-2">
                        <div className="form-group">
                            <label>Company *</label>
                            <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="e.g. Google" autoFocus />
                        </div>
                        <div className="form-group">
                            <label>Title *</label>
                            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Software Engineer" />
                        </div>
                    </div>
                    <div className="form-row-2">
                        <div className="form-group">
                            <label>Start Date</label>
                            <input value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} placeholder="e.g. Jan 2022" />
                        </div>
                        <div className="form-group">
                            <label>End Date</label>
                            <input value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} placeholder="Blank = Present" />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Description</label>
                        <textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Key responsibilities and achievements…" />
                    </div>
                    <div className="form-actions">
                        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                            {saving ? 'Saving…' : editId ? 'Update' : 'Add Entry'}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setShowForm(false); setEditId(null); }}>Cancel</button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Skills Section (Autocomplete Dropdown) ───────────────────────────────────

function SkillsSection({ items, onAdded, onDeleted }) {
    const [inputVal, setInputVal] = useState('');
    const [saving, setSaving] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [highlightIdx, setHighlightIdx] = useState(-1);
    const inputRef = useRef(null);
    const dropdownRef = useRef(null);
    const toast = useToast();
    const confirm = useConfirm();

    // Filter skills: exclude already-added, match input
    const existingNames = new Set(items.map(s => s.name.toLowerCase()));
    const suggestions = inputVal.trim().length > 0
        ? SKILLS_DATA.filter(s =>
            s.toLowerCase().includes(inputVal.toLowerCase()) &&
            !existingNames.has(s.toLowerCase())
        ).slice(0, 8)
        : [];

    const addSkill = async (name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        if (existingNames.has(trimmed.toLowerCase())) {
            toast.error(`"${trimmed}" is already added`);
            return;
        }
        setSaving(true);
        try {
            const { data } = await userApi.addSkill({ name: trimmed });
            onAdded(data);
            setInputVal('');
            setShowSuggestions(false);
            toast.success(`Added "${trimmed}"`);
        } catch (err) {
            const msg = err.response?.data?.detail || 'Failed to add skill';
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIdx(prev => Math.min(prev + 1, suggestions.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIdx(prev => Math.max(prev - 1, -1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightIdx >= 0 && highlightIdx < suggestions.length) {
                addSkill(suggestions[highlightIdx]);
            } else {
                addSkill(inputVal.replace(',', ''));
            }
        } else if (e.key === ',') {
            e.preventDefault();
            addSkill(inputVal.replace(',', ''));
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    };

    const handleDelete = async (id, name) => {
        const ok = await confirm({
            title: 'Remove Skill',
            message: `Remove "${name}" from your skills?`,
            danger: true,
            confirmText: 'Remove',
        });
        if (!ok) return;
        try {
            await userApi.deleteSkill(id);
            onDeleted(id);
            toast.success(`Removed "${name}"`);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Delete failed');
        }
    };

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div className="section-card glass-card">
            <div className="section-header">
                <div className="section-title-row">
                    <Icon name="zap" size={18} className="section-icon-svg" />
                    <h2>Skills</h2>
                </div>
            </div>
            <div className="skill-tags">
                {items.map(skill => (
                    <span key={skill.id} className="skill-tag">
                        {skill.name}
                        <button className="skill-tag-close" onClick={() => handleDelete(skill.id, skill.name)} title="Remove skill">×</button>
                    </span>
                ))}
            </div>
            <div className="skill-input-wrap" ref={dropdownRef}>
                <Icon name="search" size={16} className="skill-search-icon" />
                <input
                    ref={inputRef}
                    className="skill-input-autocomplete"
                    value={inputVal}
                    onChange={e => { setInputVal(e.target.value); setShowSuggestions(true); setHighlightIdx(-1); }}
                    onFocus={() => inputVal.trim() && setShowSuggestions(true)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search skills or type your own…"
                    disabled={saving}
                />
                {showSuggestions && suggestions.length > 0 && (
                    <div className="skill-dropdown">
                        {suggestions.map((s, i) => (
                            <button
                                key={s}
                                className={`skill-dropdown-item ${i === highlightIdx ? 'skill-dropdown-active' : ''}`}
                                onClick={() => addSkill(s)}
                                onMouseEnter={() => setHighlightIdx(i)}
                            >
                                <Icon name="plus" size={14} /> {s}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <p className="skill-hint">
                Select from suggestions or type custom skills · Press <kbd>Enter</kbd> or <kbd>,</kbd> to add
            </p>
        </div>
    );
}

// ─── Main Profile Page ────────────────────────────────────────────────────────

export default function Profile() {
    const { user, fetchUser } = useAuth();
    const toast = useToast();
    const [formData, setFormData] = useState({ full_name: '', headline: '', location: '', bio: '' });
    const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', totp_code: '' });
    const [qrCode, setQrCode] = useState(null);
    const [confirmCode, setConfirmCode] = useState('');
    const [activeTab, setActiveTab] = useState('profile');
    const [saving, setSaving] = useState(false);

    const [education, setEducation] = useState([]);
    const [experience, setExperience] = useState([]);
    const [skills, setSkills] = useState([]);

    // Privacy state
    const [privacySettings, setPrivacySettings] = useState(null);
    const [showProfileViews, setShowProfileViews] = useState(true);
    const [viewers, setViewers] = useState(null);
    const [privacySaving, setPrivacySaving] = useState(false);

    useEffect(() => {
        if (user) {
            setFormData({
                full_name: user.full_name || '',
                headline: user.headline || '',
                location: user.location || '',
                bio: user.bio || '',
            });
            setEducation(user.education || []);
            setExperience(user.experience || []);
            setSkills(user.skills || []);
        }
    }, [user]);

    // Load privacy settings and viewers when Privacy tab is selected
    useEffect(() => {
        if (activeTab === 'privacy' && !privacySettings) {
            userApi.getPrivacy().then(({ data }) => {
                setPrivacySettings(data.privacy_settings);
                setShowProfileViews(data.show_profile_views);
            }).catch(() => { });
            userApi.getViewers().then(({ data }) => {
                setViewers(data);
            }).catch(() => { });
        }
    }, [activeTab]);

    const saveProfile = async () => {
        setSaving(true);
        try {
            await userApi.updateProfile(formData);
            await fetchUser();
            toast.success('Profile saved successfully!');
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Update failed');
        } finally {
            setSaving(false);
        }
    };

    const changePassword = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                current_password: passwordForm.current_password,
                new_password: passwordForm.new_password,
            };
            if (passwordForm.totp_code) payload.totp_code = passwordForm.totp_code;
            await userApi.changePassword(payload);
            toast.success('Password changed! Other sessions have been revoked.');
            setPasswordForm({ current_password: '', new_password: '', totp_code: '' });
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Password change failed');
        }
    };

    const setup2FA = async () => {
        try {
            const { data } = await authApi.setup2FA();
            setQrCode(data.qr_code_base64);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to setup 2FA');
        }
    };

    const confirm2FA = async () => {
        try {
            await authApi.confirm2FA(confirmCode);
            setQrCode(null);
            setConfirmCode('');
            await fetchUser();
            toast.success('2FA enabled successfully!');
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to confirm 2FA');
        }
    };

    const savePrivacy = async () => {
        setPrivacySaving(true);
        try {
            const { data } = await userApi.updatePrivacy({
                privacy_settings: privacySettings,
                show_profile_views: showProfileViews,
            });
            setPrivacySettings(data.privacy_settings);
            setShowProfileViews(data.show_profile_views);

            // Refresh viewers list to reflect new privacy state
            const viewersRes = await userApi.getViewers();
            setViewers(viewersRes.data);

            toast.success('Privacy settings saved!');
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to save privacy');
        } finally {
            setPrivacySaving(false);
        }
    };

    return (
        <div className="page">
            <div className="page-header">
                <h1>My Profile</h1>
                <p>Manage your professional identity and account settings</p>
            </div>

            <div className="tabs">
                {['profile', 'privacy', 'password', 'security'].map((tab) => (
                    <button
                        key={tab}
                        className={`tab ${activeTab === tab ? 'tab-active' : ''}`}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab === 'profile' ? <><Icon name="user" size={15} /> Profile</>
                            : tab === 'privacy' ? <><Icon name="eye" size={15} /> Privacy</>
                                : tab === 'password' ? <><Icon name="key" size={15} /> Password</>
                                    : <><Icon name="shield" size={15} /> Security</>}
                    </button>
                ))}
            </div>

            {activeTab === 'profile' && (
                <div className="profile-sections">
                    <ProfileHeaderCard
                        user={user}
                        onAvatarChange={fetchUser}
                        formData={formData}
                        setFormData={setFormData}
                        onSave={saveProfile}
                        saving={saving}
                    />
                    <EducationSection
                        items={education}
                        onAdded={item => setEducation(prev => [...prev, item])}
                        onUpdated={item => setEducation(prev => prev.map(e => e.id === item.id ? item : e))}
                        onDeleted={id => setEducation(prev => prev.filter(e => e.id !== id))}
                    />
                    <ExperienceSection
                        items={experience}
                        onAdded={item => setExperience(prev => [...prev, item])}
                        onUpdated={item => setExperience(prev => prev.map(e => e.id === item.id ? item : e))}
                        onDeleted={id => setExperience(prev => prev.filter(e => e.id !== id))}
                    />
                    <SkillsSection
                        items={skills}
                        onAdded={item => setSkills(prev => [...prev, item])}
                        onDeleted={id => setSkills(prev => prev.filter(s => s.id !== id))}
                    />
                </div>
            )}

            {activeTab === 'password' && (
                <form className="glass-card form-card" onSubmit={changePassword}>
                    <div className="form-group">
                        <label>Current Password</label>
                        <input type="password" value={passwordForm.current_password}
                            onChange={e => setPasswordForm({ ...passwordForm, current_password: e.target.value })} required />
                    </div>
                    <div className="form-group">
                        <label>New Password</label>
                        <input type="password" value={passwordForm.new_password}
                            onChange={e => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                            placeholder="Min 12 chars, mix case + digit + symbol" required />
                    </div>
                    {user?.is_totp_enabled && (
                        <div className="form-group">
                            <label>TOTP Code (required)</label>
                            <input value={passwordForm.totp_code} maxLength={6} placeholder="000000"
                                onChange={e => setPasswordForm({ ...passwordForm, totp_code: e.target.value })} />
                        </div>
                    )}
                    <button type="submit" className="btn btn-primary">Change Password</button>
                </form>
            )}

            {activeTab === 'privacy' && (
                <div className="profile-sections">
                    {/* Field-level Privacy */}
                    <div className="glass-card form-card">
                        <h3><Icon name="eye" size={16} /> Field Visibility</h3>
                        <p className="text-muted" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>Control who can see each section of your profile.</p>
                        {privacySettings ? (
                            <>
                                {[
                                    { key: 'headline', label: 'Headline', icon: 'edit' },
                                    { key: 'location', label: 'Location', icon: 'mapPin' },
                                    { key: 'bio', label: 'Bio', icon: 'fileText' },
                                    { key: 'email', label: 'Email Address', icon: 'mail' },
                                    { key: 'education', label: 'Education', icon: 'graduationCap' },
                                    { key: 'experience', label: 'Experience', icon: 'briefcase' },
                                    { key: 'skills', label: 'Skills', icon: 'zap' },
                                ].map(({ key, label, icon }) => (
                                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0', borderBottom: '1px solid var(--border)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Icon name={icon} size={15} />
                                            <span style={{ fontWeight: 500 }}>{label}</span>
                                        </div>
                                        <select
                                            value={privacySettings[key] || 'public'}
                                            onChange={e => setPrivacySettings(prev => ({ ...prev, [key]: e.target.value }))}
                                            style={{
                                                width: 180, padding: '0.4rem 0.6rem', fontSize: '0.82rem',
                                                background: 'var(--input-bg)', color: 'var(--text)',
                                                border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)',
                                                cursor: 'pointer', fontFamily: 'inherit',
                                                appearance: 'none', WebkitAppearance: 'none',
                                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                                                backgroundRepeat: 'no-repeat',
                                                backgroundPosition: 'right 0.5rem center',
                                                paddingRight: '1.8rem',
                                            }}
                                        >
                                            <option value="public">🌐 Public</option>
                                            <option value="connections_only">🔗 Connections Only</option>
                                            <option value="private">🔒 Private</option>
                                        </select>
                                    </div>
                                ))}
                            </>
                        ) : (
                            <div className="spinner" />
                        )}
                    </div>

                    {/* Profile Viewers Toggle */}
                    <div className="glass-card form-card">
                        <h3><Icon name="users" size={16} /> Profile Viewers</h3>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid var(--border)' }}>
                            <div>
                                <div style={{ fontWeight: 500 }}>Show me in viewers lists</div>
                                <div className="text-muted" style={{ fontSize: '0.82rem' }}>When you view someone's profile, they can see you visited</div>
                            </div>
                            <label style={{ position: 'relative', display: 'inline-block', width: 48, height: 26, cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={showProfileViews}
                                    onChange={e => { setShowProfileViews(e.target.checked); }}
                                    style={{ opacity: 0, width: 0, height: 0 }}
                                />
                                <span style={{
                                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                    borderRadius: 26, transition: 'background 0.3s',
                                    background: showProfileViews ? 'var(--primary)' : 'var(--border)',
                                }}>
                                    <span style={{
                                        position: 'absolute', top: 3, left: showProfileViews ? 25 : 3,
                                        width: 20, height: 20, borderRadius: '50%',
                                        background: '#fff', transition: 'left 0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                    }} />
                                </span>
                            </label>
                        </div>
                    </div>

                    {/* Viewer Analytics */}
                    {viewers && (
                        <div className="glass-card form-card">
                            <h3><Icon name="eye" size={16} /> Who Viewed Your Profile</h3>
                            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '0.5rem' }}>
                                {viewers.total_views}
                                <span style={{ fontSize: '0.85rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '0.5rem' }}>total views</span>
                            </div>

                            {!viewers.is_enabled ? (
                                <div style={{
                                    padding: '1.5rem', background: 'rgba(255,255,255,0.03)',
                                    borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border)',
                                    textAlign: 'center'
                                }}>
                                    <Icon name="eyeOff" size={24} style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }} />
                                    <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>Recent Viewers Hidden</div>
                                    <p className="text-muted" style={{ fontSize: '0.82rem' }}>
                                        To see who viewed your profile, you must first enable "Show me in viewers lists" above.
                                    </p>
                                </div>
                            ) : viewers.recent_viewers.length === 0 ? (
                                <p className="text-muted">No profile views yet.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {viewers.recent_viewers.map(v => (
                                        <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4rem 0' }}>
                                            <div style={{
                                                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                                                background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: '#fff', fontWeight: 600, fontSize: '0.82rem',
                                            }}>
                                                {v.full_name?.charAt(0)?.toUpperCase() || '?'}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 500, color: 'var(--text-heading)', fontSize: '0.88rem' }}>{v.full_name}</div>
                                                {v.headline && <div className="text-muted" style={{ fontSize: '0.78rem' }}>{v.headline}</div>}
                                            </div>
                                            <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                                                {new Date(v.viewed_at).toLocaleDateString()}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.5rem" }}>
                        <button className="btn btn-primary" onClick={savePrivacy} disabled={privacySaving}>
                            {privacySaving ? "Saving…" : "✓ Save All Privacy Settings"}
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'security' && (
                <div className="glass-card form-card">
                    <h3>Two-Factor Authentication</h3>
                    {user?.is_totp_enabled ? (
                        <div className="security-status-active">
                            <span className="status-badge badge-success">
                                <Icon name="checkCircle" size={14} /> 2FA Active
                            </span>
                            <p>Your account is protected with TOTP two-factor authentication.</p>
                        </div>
                    ) : qrCode ? (
                        <div className="totp-setup">
                            <p>Scan this QR code with your authenticator app:</p>
                            <img src={`data:image/png;base64,${qrCode}`} alt="TOTP QR Code" className="qr-code" />
                            <div className="form-group">
                                <label>Enter the 6-digit code to confirm:</label>
                                <input value={confirmCode} onChange={e => setConfirmCode(e.target.value)}
                                    maxLength={6} placeholder="000000" className="input-otp" />
                            </div>
                            <button className="btn btn-primary" onClick={confirm2FA}>Confirm & Enable 2FA</button>
                        </div>
                    ) : (
                        <div>
                            <p>Add an extra layer of security to your account.</p>
                            <button className="btn btn-primary" onClick={setup2FA}>Set Up 2FA</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
