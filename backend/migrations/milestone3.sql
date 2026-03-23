-- Milestone 3: Add PKI signature and hash chain columns
-- Run with: psql -h localhost -U postgres -d secure_job_portal -f migrations/milestone3.sql

-- Resume signatures (PKI tamper detection)
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS signature TEXT;

-- Message signatures (PKI authenticity)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS signature TEXT;

-- Audit log hash chain (tamper-evident)
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS prev_hash VARCHAR(64);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entry_hash VARCHAR(64);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS signature TEXT;
