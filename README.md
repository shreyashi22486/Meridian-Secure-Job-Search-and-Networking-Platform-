<p align="center">
  <h1 align="center">🚀 Nexora — Secure Job Portal</h1>
  <p align="center">
    A full-stack job portal with enterprise-grade security built with FastAPI & React
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11-blue?logo=python" alt="Python" />
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker" alt="Docker" />
</p>

---

## 🏗 Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Backend    │────▶│  PostgreSQL  │
│  React/Vite  │     │   FastAPI    │     │     16       │
│  (Nginx)     │◀────│  (Uvicorn)   │◀────│              │
│   :80        │     │   :8000      │     │   :5432      │
└─────────────┘     └──────────────┘     └──────────────┘
```

## 🔒 Security Features

| Feature | Implementation |
|---------|---------------|
| Password Hashing | Argon2id with salt |
| Token Auth | JWT in HttpOnly cookies |
| 2FA | TOTP with encrypted secret storage |
| CSRF Protection | Double-submit cookie pattern |
| File Encryption | Fernet symmetric encryption at rest |
| Input Sanitization | Bleach-based XSS prevention |
| Rate Limiting | Per-IP sliding window |
| Security Headers | CSP, HSTS, X-Frame-Options |
| SQL Injection | SQLAlchemy ORM (parameterized queries) |

## 📁 Project Structure

```
Secure-Job-Portal/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entry point
│   │   ├── config.py            # Pydantic settings
│   │   ├── database.py          # SQLAlchemy engine & session
│   │   ├── dependencies.py      # DI: get_db, get_current_user
│   │   ├── models/              # SQLAlchemy ORM models
│   │   ├── schemas/             # Pydantic request/response schemas
│   │   ├── routers/             # API route handlers
│   │   └── security/            # Security modules
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api/client.js        # Axios instance + interceptors
│   │   ├── context/             # AuthContext, ThemeContext
│   │   ├── components/          # Shared UI components
│   │   └── pages/               # Route pages
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── docker-compose.yml
├── .github/workflows/
│   ├── ci.yml                   # Lint & test on PR
│   └── cd.yml                   # Build & push images on merge
├── .gitignore
└── test_milestone2.sh           # Integration test script
```

## 🚀 Quick Start

### Prerequisites

- **Python 3.11+** and **pip**
- **Node.js 20+** and **npm**
- **PostgreSQL 16+**
- **Docker & Docker Compose** (optional)

---

### Option 1: Local Development

**1. Clone & set up backend**

```bash
git clone https://github.com/YOUR_USERNAME/Secure-Job-Portal.git
cd Secure-Job-Portal

# Set up Python virtual environment
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your database credentials and generate Fernet keys:
# python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

**2. Set up PostgreSQL**

```bash
# Create the database
createdb secure_job_portal
# Or via psql:
# psql -U postgres -c "CREATE DATABASE secure_job_portal;"
```

**3. Start the backend**

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

**4. Set up & start the frontend**

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

---

### Option 2: Docker Compose (recommended)

```bash
# Copy and edit environment file
cp .env.example .env
# Edit .env with real secrets

# Build and start all services
docker compose up --build

# Open http://localhost
```

| Service    | URL                        |
|------------|----------------------------|
| Frontend   | http://localhost            |
| Backend    | http://localhost:8000       |
| API Docs   | http://localhost:8000/api/docs (debug mode only) |
| PostgreSQL | localhost:5432              |

## ⚙️ Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `JWT_SECRET` | JWT signing secret (64+ chars) | ✅ |
| `JWT_ALGORITHM` | JWT algorithm (default: HS256) | ❌ |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token TTL (default: 15) | ❌ |
| `REFRESH_TOKEN_EXPIRE_MINUTES` | Refresh token TTL (default: 1440) | ❌ |
| `TOTP_ENCRYPTION_KEY` | Fernet key for TOTP secrets | ✅ |
| `FILE_ENCRYPTION_KEY` | Fernet key for resume files | ✅ |
| `UPLOAD_DIR` | Resume upload directory | ❌ |
| `MAX_UPLOAD_SIZE` | Max upload size in bytes | ❌ |
| `CORS_ORIGINS` | Comma-separated allowed origins | ❌ |
| `DEBUG` | Enable debug mode | ❌ |

> **Generate Fernet keys:**
> ```bash
> python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
> ```

## 🔄 CI/CD

### Continuous Integration (on every PR)

- **Backend**: Python 3.11 → Install deps → Ruff lint → Pytest (with PostgreSQL service)
- **Frontend**: Node 20 → npm ci → ESLint → Vite build

### Continuous Deployment (on merge to main)

- Builds Docker images for backend and frontend
- Pushes to GitHub Container Registry (`ghcr.io`)
- Tagged with commit SHA and `latest`

### GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `TOTP_ENCRYPTION_KEY_TEST` | Fernet key for CI test environment |
| `FILE_ENCRYPTION_KEY_TEST` | Fernet key for CI test environment |

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/my-feature`
3. **Commit** your changes: `git commit -m "feat: add my feature"`
4. **Push** to the branch: `git push origin feature/my-feature`
5. **Open** a Pull Request against `main`

### Code Style

- **Backend**: Linted with [Ruff](https://github.com/astral-sh/ruff)
- **Frontend**: Linted with [ESLint](https://eslint.org/) (React + Hooks rules)

### Running Tests

```bash
# Backend
cd backend && source venv/bin/activate
pytest -v

# Frontend
cd frontend
npm run lint
npm run build

# Integration tests (requires running backend + PostgreSQL)
bash test_milestone2.sh
```

## 📄 License

This project is for educational purposes as part of the IIITD curriculum.
