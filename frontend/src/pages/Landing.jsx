import { Link } from 'react-router-dom';

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
                    <div className="hero-badge">🔒 Enterprise-Grade Security</div>
                    <h1 className="hero-title">
                        The Future of <br />
                        <span className="gradient-text">Secure Hiring</span>
                    </h1>
                    <p className="hero-subtitle">
                        Nexora protects every step of your recruitment journey with
                        military-grade encryption, multi-factor authentication, and
                        zero-trust architecture.
                    </p>
                    <div className="hero-actions">
                        <Link to="/register" className="btn btn-primary btn-lg">
                            Get Started Free →
                        </Link>
                        <Link to="/login" className="btn btn-glass btn-lg">
                            Sign In
                        </Link>
                    </div>
                    <div className="hero-stats">
                        <div className="hero-stat">
                            <span className="hero-stat-value">256-bit</span>
                            <span className="hero-stat-label">AES Encryption</span>
                        </div>
                        <div className="hero-stat-divider"></div>
                        <div className="hero-stat">
                            <span className="hero-stat-value">TOTP</span>
                            <span className="hero-stat-label">2FA Protection</span>
                        </div>
                        <div className="hero-stat-divider"></div>
                        <div className="hero-stat">
                            <span className="hero-stat-value">Zero</span>
                            <span className="hero-stat-label">Data Leaks</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section className="features-section">
                <div className="section-container">
                    <div className="section-header">
                        <span className="section-tag">Features</span>
                        <h2 className="section-title">Security Without Compromise</h2>
                        <p className="section-desc">Built from the ground up with OWASP Top 10 mitigation, defense-in-depth architecture, and privacy by design.</p>
                    </div>
                    <div className="features-grid">
                        <div className="feature-card">
                            <div className="feature-icon">🛡️</div>
                            <h3>Argon2id Hashing</h3>
                            <p>Passwords hashed with the winner of the Password Hashing Competition. Memory-hard, GPU-resistant, and future-proof.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">🔑</div>
                            <h3>TOTP Two-Factor</h3>
                            <p>Time-based one-time passwords with encrypted secret storage. Works offline — no SMS or email required.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">📄</div>
                            <h3>Encrypted Resumes</h3>
                            <p>Every document encrypted at rest with Fernet (AES-128-CBC + HMAC-SHA256). Multi-layer file validation prevents malicious uploads.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">🔄</div>
                            <h3>Token Rotation</h3>
                            <p>Refresh tokens rotate on every use with reuse detection. Stolen tokens are immediately invalidated across all sessions.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">🧹</div>
                            <h3>XSS Prevention</h3>
                            <p>All inputs sanitized with server-side bleach filtering. Content Security Policy headers block injection attacks.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">📊</div>
                            <h3>Audit Logging</h3>
                            <p>Every security event tracked with IP, user agent, and timestamp. Full accountability for compliance and forensics.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Architecture Section */}
            <section className="arch-section">
                <div className="section-container">
                    <div className="section-header">
                        <span className="section-tag">Architecture</span>
                        <h2 className="section-title">Defense in Depth</h2>
                        <p className="section-desc">Multiple independent security layers ensure that no single point of failure compromises your data.</p>
                    </div>
                    <div className="arch-layers">
                        <div className="arch-layer">
                            <div className="arch-layer-number">01</div>
                            <div className="arch-layer-content">
                                <h3>Network Layer</h3>
                                <p>Rate limiting, CORS policies, and security headers (HSTS, CSP, X-Frame-Options) stop attacks before they reach application logic.</p>
                            </div>
                        </div>
                        <div className="arch-layer">
                            <div className="arch-layer-number">02</div>
                            <div className="arch-layer-content">
                                <h3>Authentication Layer</h3>
                                <p>JWT with device fingerprinting, session binding, CSRF double-submit cookies, and account lockout after failed attempts.</p>
                            </div>
                        </div>
                        <div className="arch-layer">
                            <div className="arch-layer-number">03</div>
                            <div className="arch-layer-content">
                                <h3>Authorization Layer</h3>
                                <p>Role-based access control (RBAC) with privilege escalation prevention. Admins cannot modify their own roles.</p>
                            </div>
                        </div>
                        <div className="arch-layer">
                            <div className="arch-layer-number">04</div>
                            <div className="arch-layer-content">
                                <h3>Data Layer</h3>
                                <p>Fernet encryption at rest, UUID-based identifiers prevent enumeration, and parameterized queries block SQL injection.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="cta-section">
                <div className="section-container">
                    <div className="cta-card glass-card">
                        <h2>Ready to Secure Your Hiring?</h2>
                        <p>Join Nexora and experience recruitment built on trust, privacy, and uncompromising security.</p>
                        <Link to="/register" className="btn btn-primary btn-lg">
                            Create Your Account →
                        </Link>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="landing-footer">
                <div className="section-container">
                    <div className="footer-content">
                        <div className="footer-brand">
                            <span className="brand-icon">◆</span> Nexora
                        </div>
                        <p className="footer-text">Secure Job Portal — Built with FastAPI, React, and PostgreSQL</p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
