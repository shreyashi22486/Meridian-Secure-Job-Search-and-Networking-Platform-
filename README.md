# Meridian — Secure Job Search & Professional Networking Platform

> **CSE 345/545 Foundations of Computer Security** — Course Project  
> IIIT Delhi | February – April 2026

## Overview

**Meridian** is a full-stack secure job search and professional networking platform built with security as a first-class requirement. The platform provides encrypted resume storage, TOTP-based two-factor authentication, role-based access control, and comprehensive audit logging.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.11 / FastAPI |
| **Frontend** | React 18 / Vite |
| **Database** | PostgreSQL 16 |
| **Auth** | Argon2id + JWT (HttpOnly cookies) + TOTP 2FA |
| **Encryption** | Fernet (AES-128-CBC + HMAC-SHA256) |
| **CI/CD** | GitHub Actions → Docker → GHCR |
| **Web Server** | Nginx (reverse proxy + TLS) |

## Security Features

- **Password Hashing** — Argon2id (64 MB memory, 3 iterations)
- **Two-Factor Auth** — TOTP (RFC 6238) with QR code setup and replay prevention
- **Resume Encryption** — Fernet encryption at rest; decrypted in-memory on download
- **TOTP Secret Encryption** — Fernet-encrypted before database storage
- **Session Security** — Device fingerprinting, refresh token rotation with reuse detection
- **Input Sanitization** — HTML stripping via bleach on all text inputs (XSS prevention)
- **CSRF Protection** — Double-submit cookie pattern
- **SQL Injection Prevention** — SQLAlchemy ORM with parameterized queries
- **File Upload Security** — Extension, MIME, magic byte validation + PDF content scanning
- **RBAC** — User / Recruiter / Admin roles enforced via dependency injection
- **Audit Logging** — All security events logged with IP, timestamp, and contextual details
- **Security Headers** — X-Content-Type-Options, X-Frame-Options, HSTS, Referrer-Policy

## Project Structure

```
Secure-Job-Portal/
├── backend/
│   ├── app/
│   │   ├── routers/          # API endpoints (auth, users, resumes, admin, profile)
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── schemas/          # Pydantic schemas with sanitization
│   │   ├── security/         # Crypto primitives (password, JWT, TOTP, encryption, CSRF)
│   │   ├── dependencies.py   # Auth & RBAC dependency injection
│   │   └── config.py         # Environment-based configuration
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/            # Login, Register, Dashboard, Profile, Resumes, AdminPanel
│   │   ├── components/       # Navbar, Icons, Toast, ConfirmDialog
│   │   └── context/          # AuthContext, ThemeContext, ToastProvider
│   ├── Dockerfile
│   └── nginx.conf
├── docs/                     # LaTeX documentation
│   ├── main.tex              # Master document
│   └── sections/             # Modular sections (intro, requirements, architecture, etc.)
├── tests/
│   └── integration_test.sh   # Comprehensive API test suite
├── .github/workflows/        # CI/CD (lint, test, build, deploy)
├── docker-compose.yml
└── .env.example
```

## Milestones

| Phase | Deadline | Status | Deliverables |
|-------|----------|--------|-------------|
| **M1** | Feb 13 | ✅ Done | Tech stack, HTTPS, skeleton deployment |
| **M2** | Feb 27 | ✅ Done | Auth, TOTP 2FA, profiles, resume encryption, admin |
| **M3** | Mar 31 | 🔜 Next | Company pages, job postings, search, messaging |
| **M4** | Apr 30 | ⏳ Planned | PKI, virtual keyboard OTP, tamper-evident logs, attack demos |

## Quick Start

### Prerequisites
- Python 3.11+, Node.js 20+, PostgreSQL 16+

### Backend
```bash
cd backend
cp ../.env.example ../.env  # Configure environment variables
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Docker
```bash
docker compose up --build
```

## Documentation

Full project documentation (SRS, architecture, milestone reports, security analysis) is available in the `docs/` directory as a LaTeX project. To compile:

```bash
cd docs
pdflatex main.tex
pdflatex main.tex  # Run twice for TOC
```

## Team

| Member | GitHub |
|--------|--------|
| Angadjeet Singh | [@ANGADJEET](https://github.com/ANGADJEET) |
| Harsh Kumar | [@hrsh-kr](https://github.com/hrsh-kr) |

## License

This project is developed for academic purposes as part of CSE 345/545 at IIIT Delhi.
