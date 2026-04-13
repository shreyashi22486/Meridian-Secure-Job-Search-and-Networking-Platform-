-- Migration: Add updated_at column to sessions table
-- Required for: A1.4 — Refresh token race condition grace period
-- The updated_at column tracks when the refresh token JTI was last rotated,
-- enabling a 5-second grace period for concurrent tab refresh requests.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;
