import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { userApi } from '../api/client';
import api from '../api/client';
import Icon from '../components/Icons';

export default function UserProfile() {
    const { id } = useParams();
    const { user: me } = useAuth();
    const navigate = useNavigate();
    const [profile, setProfile] = useState(null);
    const [avatarUrl, setAvatarUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const load = async () => {
            try {
                const { data } = await userApi.getUser(id);
                setProfile(data);
                if (data.avatar_url) {
                    const blob = await userApi.getUserAvatarBlob(id);
                    setAvatarUrl(blob);
                }
            } catch (err) {
                setError(err.response?.data?.detail || 'Failed to load profile');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [id]);

    if (loading) return <div className="page"><div className="empty-state"><div className="spinner" /></div></div>;
    if (error) return <div className="page"><div className="alert alert-error">{error}</div></div>;
    if (!profile) return null;

    const isSelf = profile.connection_status === 'self';
    const isConnected = profile.connection_status === 'accepted';
    const isPending = profile.connection_status === 'pending';
    const hiddenFields = profile.privacy || {};

    const handleConnect = async () => {
        try {
            await api.post('/connections/request', { target_user_id: id });
            setProfile(p => ({ ...p, connection_status: 'pending' }));
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to send request');
        }
    };

    const PrivacyBadge = ({ field }) => {
        const level = hiddenFields[field];
        if (!level) return null;
        return (
            <div style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                color: 'var(--text-muted)', fontSize: '0.82rem', fontStyle: 'italic',
                padding: '0.5rem 0',
            }}>
                <Icon name="lock" size={13} />
                {level === 'connections_only' ? 'Visible to connections only' : 'Private'}
            </div>
        );
    };

    return (
        <div className="page" style={{ maxWidth: 800, margin: '0 auto' }}>
            {/* Header Card */}
            <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start' }}>
                    {/* Avatar */}
                    <div style={{
                        width: 96, height: 96, borderRadius: '50%', flexShrink: 0,
                        background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontWeight: 700, fontSize: '2rem',
                        overflow: 'hidden',
                    }}>
                        {avatarUrl
                            ? <img src={avatarUrl} alt={profile.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : profile.full_name?.charAt(0)?.toUpperCase() || '?'
                        }
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1 }}>
                        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>{profile.full_name}</h1>

                        {profile.headline ? (
                            <p style={{ color: 'var(--text-muted)', margin: '0.2rem 0 0', fontSize: '0.95rem' }}>{profile.headline}</p>
                        ) : hiddenFields.headline ? <PrivacyBadge field="headline" /> : null}

                        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                            {profile.location && (
                                <span><Icon name="mapPin" size={13} /> {profile.location}</span>
                            )}
                            {!profile.location && hiddenFields.location && <PrivacyBadge field="location" />}

                            {profile.email && (
                                <span><Icon name="mail" size={13} /> {profile.email}</span>
                            )}
                            {!profile.email && hiddenFields.email && (
                                <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>
                                    <Icon name="lock" size={11} /> Email hidden
                                </span>
                            )}

                            <span><Icon name="clock" size={13} /> Joined {new Date(profile.created_at).toLocaleDateString()}</span>
                        </div>

                        {/* Action buttons */}
                        {!isSelf && (
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                                {isConnected ? (
                                    <>
                                        <span className="badge badge-success" style={{ padding: '0.35rem 0.7rem' }}>
                                            <Icon name="checkCircle" size={12} /> Connected
                                        </span>
                                        <button className="btn btn-primary btn-sm" onClick={() => navigate(`/messages?user=${id}`)}>
                                            <Icon name="mail" size={13} /> Message
                                        </button>
                                    </>
                                ) : isPending ? (
                                    <span className="badge badge-muted" style={{ padding: '0.35rem 0.7rem' }}>
                                        <Icon name="clock" size={12} /> Request Pending
                                    </span>
                                ) : (
                                    <button className="btn btn-primary btn-sm" onClick={handleConnect}>
                                        <Icon name="plus" size={13} /> Connect
                                    </button>
                                )}
                            </div>
                        )}

                        {isSelf && (
                            <button className="btn btn-ghost btn-sm" style={{ marginTop: '0.5rem' }} onClick={() => navigate('/profile')}>
                                <Icon name="edit" size={13} /> Edit My Profile
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Bio */}
            {profile.bio ? (
                <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
                    <h3><Icon name="fileText" size={16} /> About</h3>
                    <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--text)' }}>{profile.bio}</p>
                </div>
            ) : hiddenFields.bio ? (
                <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1rem', opacity: 0.6 }}>
                    <h3><Icon name="fileText" size={16} /> About</h3>
                    <PrivacyBadge field="bio" />
                </div>
            ) : null}

            {/* Experience */}
            {profile.experience ? (
                profile.experience.length > 0 && (
                    <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
                        <h3><Icon name="briefcase" size={16} /> Experience</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {profile.experience.map(exp => (
                                <div key={exp.id} style={{ borderLeft: '3px solid var(--primary)', paddingLeft: '0.75rem' }}>
                                    <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{exp.title}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>{exp.company}</div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                        {exp.start_date} – {exp.end_date || 'Present'}
                                    </div>
                                    {exp.description && <p style={{ fontSize: '0.85rem', marginTop: '0.3rem' }}>{exp.description}</p>}
                                </div>
                            ))}
                        </div>
                    </div>
                )
            ) : hiddenFields.experience ? (
                <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1rem', opacity: 0.6 }}>
                    <h3><Icon name="briefcase" size={16} /> Experience</h3>
                    <PrivacyBadge field="experience" />
                </div>
            ) : null}

            {/* Education */}
            {profile.education ? (
                profile.education.length > 0 && (
                    <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
                        <h3><Icon name="graduationCap" size={16} /> Education</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {profile.education.map(edu => (
                                <div key={edu.id} style={{ borderLeft: '3px solid var(--accent)', paddingLeft: '0.75rem' }}>
                                    <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{edu.institution}</div>
                                    {edu.degree && (
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                                            {edu.degree}{edu.field_of_study ? ` · ${edu.field_of_study}` : ''}
                                        </div>
                                    )}
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                        {edu.start_year} – {edu.end_year || 'Present'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            ) : hiddenFields.education ? (
                <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1rem', opacity: 0.6 }}>
                    <h3><Icon name="graduationCap" size={16} /> Education</h3>
                    <PrivacyBadge field="education" />
                </div>
            ) : null}

            {/* Skills */}
            {profile.skills ? (
                profile.skills.length > 0 && (
                    <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
                        <h3><Icon name="zap" size={16} /> Skills</h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                            {profile.skills.map(s => (
                                <span key={s.id} className="skill-tag">{s.name}</span>
                            ))}
                        </div>
                    </div>
                )
            ) : hiddenFields.skills ? (
                <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1rem', opacity: 0.6 }}>
                    <h3><Icon name="zap" size={16} /> Skills</h3>
                    <PrivacyBadge field="skills" />
                </div>
            ) : null}
        </div>
    );
}
