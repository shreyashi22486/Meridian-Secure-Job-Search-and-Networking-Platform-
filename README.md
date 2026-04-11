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
│   │   ├── security/         # Crypto (password, JWT, TOTP, encryption, CSRF)
│   │   ├── dependencies.py   # Auth & RBAC dependency injection
│   │   └── config.py         # Environment-based configuration
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/            # Login, Register, Dashboard, Profile, Resumes, Admin
│   │   ├── components/       # Navbar, Icons, Toast, ConfirmDialog
│   │   └── context/          # AuthContext, ThemeContext, ToastProvider
│   ├── Dockerfile
│   └── nginx.conf
├── docs/
│   ├── report/               # Full project report
│   │   ├── main.tex          # Master document (compiles to full report)
│   │   ├── main.pdf          # Compiled PDF
│   │   ├── sections/         # Modular sections (.tex files)
│   │   └── figures/          # Screenshots and diagrams
│   └── milestones/           # Standalone per-milestone reports
│       ├── m1/
│       │   ├── milestone1_report.tex
│       │   └── milestone1_report.pdf
│       └── m2/
│           ├── milestone2_report.tex
│           └── milestone2_report.pdf
├── tests/
│   └── integration_test.sh   # API test suite (30+ tests)
├── .github/workflows/        # CI/CD (lint, test, build, deploy)
├── docker-compose.yml
└── .env.example
```

## Milestones

| Phase | Deadline | Status | Deliverables |
|-------|----------|--------|-------------|
| **M1** | Feb 13 | ✅ Done | Tech stack, HTTPS, skeleton deployment |
| **M2** | Feb 27 | ✅ Done | Auth, TOTP 2FA, profiles, resume encryption, admin |
| **M3** | Mar 31 | ✅ Done | Company pages, job postings, search, messaging |
| **M4** | Apr 30 | ✅ Done | PKI, virtual keyboard OTP, tamper-evident logs, attack demos |

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

The `docs/` directory contains two types of LaTeX reports:

- **`docs/report/`** — Full project report (all milestones, architecture, security analysis)
- **`docs/milestones/m2/`** — Standalone Milestone 2 submission report

To compile either:
```bash
cd docs/report          # or docs/milestones/m2
pdflatex main.tex       # or milestone2_report.tex
pdflatex main.tex       # Run twice for TOC
```

## Team

| Member | GitHub |
|--------|--------|
| Aniket Gupta | [@aniket-3001](https://github.com/aniket-3001) |
| Angadjeet Singh | [@ANGADJEET](https://github.com/ANGADJEET) |
| Harsh Kumar | [@hrsh-kr](https://github.com/hrsh-kr) |

## License

This project is developed for academic purposes as part of CSE 345/545 at IIIT Delhi.
