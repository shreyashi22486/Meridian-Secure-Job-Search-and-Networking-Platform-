import { Link } from 'react-router-dom';
import Icon from '../components/Icons';

export default function Landing() {
    return (
        <div className="landing">
            {/* Hero Section */}
            <section className="hero">
                <div className="hero-bg-effects">
                    <div className="hero-orb hero-orb-1"></div>
                    <div className="hero-orb hero-orb-2"></div>
                    <div className="hero-orb hero-orb-3"></div>
                    <div className="hero-grid"></div>
                </div>
                <div className="hero-content">
                    <div className="hero-badge">
                        <Icon name="shieldCheck" size={14} /> Trusted & Secure Platform
                    </div>
                    <h1 className="hero-title">
                        Where Talent Meets<br />
                        <span className="gradient-text">Opportunity</span>
                    </h1>
                    <p className="hero-subtitle">
                        Meridian connects professionals with top companies through a
                        recruitment platform built on privacy, trust, and seamless experience.
                    </p>
                    <div className="hero-actions">
                        <Link to="/register" className="btn btn-primary btn-lg">
                            Get Started Free <Icon name="arrowRight" size={18} />
                        </Link>
                        <Link to="/login" className="btn btn-glass btn-lg">
                            Sign In
                        </Link>
                    </div>
                    <div className="hero-stats">
                        <div className="hero-stat">
                            <span className="hero-stat-value">End-to-End</span>
                            <span className="hero-stat-label">Encrypted Data</span>
                        </div>
                        <div className="hero-stat-divider"></div>
                        <div className="hero-stat">
                            <span className="hero-stat-value">2FA</span>
                            <span className="hero-stat-label">Protected Accounts</span>
                        </div>
                        <div className="hero-stat-divider"></div>
                        <div className="hero-stat">
                            <span className="hero-stat-value">100%</span>
                            <span className="hero-stat-label">Privacy Focused</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Value Proposition */}
            <section className="features-section">
                <div className="section-container">
                    <div className="section-header-landing">
                        <span className="section-tag">How It Works</span>
                        <h2 className="section-title-landing">Your Career, Simplified</h2>
                        <p className="section-desc">From building your profile to landing offers — every step is streamlined and secure.</p>
                    </div>
                    <div className="features-grid">
                        <div className="feature-card">
                            <div className="feature-icon-wrap"><Icon name="user" size={24} /></div>
                            <h3>Build Your Profile</h3>
                            <p>Showcase your education, experience, and skills with a professional profile that stands out to recruiters.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon-wrap"><Icon name="upload" size={24} /></div>
                            <h3>Upload Securely</h3>
                            <p>Your resumes are encrypted at rest with military-grade encryption. Only you and authorized recruiters can access them.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon-wrap"><Icon name="briefcase" size={24} /></div>
                            <h3>Get Discovered</h3>
                            <p>Recruiters find talent through our platform. Your data stays private until you choose to share it.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon-wrap"><Icon name="shieldCheck" size={24} /></div>
                            <h3>Stay Protected</h3>
                            <p>Two-factor authentication, session management, and audit logging keep your account safe at every moment.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Trust Bar */}
            <section className="trust-section">
                <div className="section-container">
                    <div className="trust-bar">
                        <div className="trust-item">
                            <Icon name="lock" size={20} />
                            <span>AES-256 Encryption</span>
                        </div>
                        <div className="trust-item">
                            <Icon name="fingerprint" size={20} />
                            <span>TOTP Two-Factor</span>
                        </div>
                        <div className="trust-item">
                            <Icon name="shield" size={20} />
                            <span>Zero Trust Architecture</span>
                        </div>
                        <div className="trust-item">
                            <Icon name="activity" size={20} />
                            <span>Full Audit Trail</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="cta-section">
                <div className="section-container">
                    <div className="cta-card glass-card">
                        <h2>Ready to Take the Next Step?</h2>
                        <p>Join thousands of professionals building their careers on a platform they can trust.</p>
                        <Link to="/register" className="btn btn-primary btn-lg">
                            Create Your Account <Icon name="arrowRight" size={18} />
                        </Link>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="landing-footer">
                <div className="section-container">
                    <div className="footer-content">
                        <div className="footer-brand">
                            <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
                                <rect width="32" height="32" rx="8" fill="url(#mf-grad)" />
                                <path d="M8 22V10l8 7 8-7v12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                                <defs><linearGradient id="mf-grad" x1="0" y1="0" x2="32" y2="32"><stop stopColor="#6366f1" /><stop offset="1" stopColor="#a78bfa" /></linearGradient></defs>
                            </svg> Meridian
                        </div>
                        <p className="footer-text">The Secure Recruitment Platform</p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
