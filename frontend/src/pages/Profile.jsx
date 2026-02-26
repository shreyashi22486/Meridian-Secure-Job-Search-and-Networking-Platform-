import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { userApi, authApi } from '../api/client';

export default function Profile() {
    const { user, fetchUser } = useAuth();
    const [form, setForm] = useState({ full_name: '', headline: '', location: '', bio: '' });
    const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', totp_code: '' });
    const [qrCode, setQrCode] = useState(null);
    const [confirmCode, setConfirmCode] = useState('');
    const [msg, setMsg] = useState('');
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('profile');

    useEffect(() => {
        if (user) {
            setForm({
                full_name: user.full_name || '',
                headline: user.headline || '',
                location: user.location || '',
                bio: user.bio || '',
            });
        }
    }, [user]);

    const updateProfile = async (e) => {
        e.preventDefault();
        setError(''); setMsg('');
        try {
            await userApi.updateProfile(form);
            await fetchUser();
            setMsg('Profile updated!');
        } catch (err) { setError(err.response?.data?.detail || 'Update failed'); }
    };

    const changePassword = async (e) => {
        e.preventDefault();
        setError(''); setMsg('');
        try {
            const payload = {
                current_password: passwordForm.current_password,
                new_password: passwordForm.new_password,
            };
            if (passwordForm.totp_code) payload.totp_code = passwordForm.totp_code;
            await userApi.changePassword(payload);
            setMsg('Password changed! Other sessions have been revoked.');
            setPasswordForm({ current_password: '', new_password: '', totp_code: '' });
        } catch (err) { setError(err.response?.data?.detail || 'Password change failed'); }
    };

    const setup2FA = async () => {
        setError(''); setMsg('');
        try {
            const { data } = await authApi.setup2FA();
            setQrCode(data.qr_code_base64);
        } catch (err) { setError(err.response?.data?.detail || 'Failed to setup 2FA'); }
    };

    const confirm2FA = async () => {
        setError(''); setMsg('');
        try {
            await authApi.confirm2FA(confirmCode);
            setQrCode(null);
            setConfirmCode('');
            await fetchUser();
            setMsg('2FA enabled successfully!');
        } catch (err) { setError(err.response?.data?.detail || 'Failed to confirm 2FA'); }
    };

    return (
        <div className="page">
            <div className="page-header">
                <h1>Account Settings</h1>
            </div>

            <div className="tabs">
                {['profile', 'password', 'security'].map((tab) => (
                    <button key={tab} className={`tab ${activeTab === tab ? 'tab-active' : ''}`}
                        onClick={() => { setActiveTab(tab); setMsg(''); setError(''); }}>
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                ))}
            </div>

            {msg && <div className="alert alert-success">{msg}</div>}
            {error && <div className="alert alert-error">{error}</div>}

            {activeTab === 'profile' && (
                <form className="glass-card form-card" onSubmit={updateProfile}>
                    <div className="form-group">
                        <label>Full Name</label>
                        <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
                    </div>
                    <div className="form-group">
                        <label>Headline</label>
                        <input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })}
                            placeholder="e.g. Software Engineer" />
                    </div>
                    <div className="form-group">
                        <label>Location</label>
                        <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
                            placeholder="e.g. New Delhi, India" />
                    </div>
                    <div className="form-group">
                        <label>Bio</label>
                        <textarea rows={4} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })}
                            placeholder="Tell us about yourself..." />
                    </div>
                    <button type="submit" className="btn btn-primary">Save Changes</button>
                </form>
            )}

            {activeTab === 'password' && (
                <form className="glass-card form-card" onSubmit={changePassword}>
                    <div className="form-group">
                        <label>Current Password</label>
                        <input type="password" value={passwordForm.current_password}
                            onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })} required />
                    </div>
                    <div className="form-group">
                        <label>New Password</label>
                        <input type="password" value={passwordForm.new_password}
                            onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                            placeholder="Min 12 chars, mix case + digit + symbol" required />
                    </div>
                    {user?.is_totp_enabled && (
                        <div className="form-group">
                            <label>TOTP Code (required)</label>
                            <input value={passwordForm.totp_code} maxLength={6} placeholder="000000"
                                onChange={(e) => setPasswordForm({ ...passwordForm, totp_code: e.target.value })} />
                        </div>
                    )}
                    <button type="submit" className="btn btn-primary">Change Password</button>
                </form>
            )}

            {activeTab === 'security' && (
                <div className="glass-card form-card">
                    <h3>Two-Factor Authentication</h3>
                    {user?.is_totp_enabled ? (
                        <div className="security-status-active">
                            <span className="status-badge badge-success">✓ 2FA Active</span>
                            <p>Your account is protected with TOTP two-factor authentication.</p>
                        </div>
                    ) : qrCode ? (
                        <div className="totp-setup">
                            <p>Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.):</p>
                            <img src={`data:image/png;base64,${qrCode}`} alt="TOTP QR Code" className="qr-code" />
                            <div className="form-group">
                                <label>Enter the 6-digit code to confirm:</label>
                                <input value={confirmCode} onChange={(e) => setConfirmCode(e.target.value)}
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
