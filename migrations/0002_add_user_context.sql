-- Migration number: 0002
-- Date: 2025-11-03
-- Purpose: Add WordPress user context and session management

-- Step 1: Add wp_user_id to resumes table
ALTER TABLE resumes
ADD COLUMN IF NOT EXISTS wp_user_id INTEGER,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_resumes_wp_user ON resumes(wp_user_id);

-- Step 2: Add wp_user_id to analyses table
ALTER TABLE analyses
ADD COLUMN IF NOT EXISTS wp_user_id INTEGER,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_analyses_wp_user ON analyses(wp_user_id);

-- Step 3: Create analysis_sessions table for multi-resume tracking
CREATE TABLE IF NOT EXISTS analysis_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wp_user_id INTEGER NOT NULL,

  -- Job details (persistent across re-uploads)
  job_title TEXT NOT NULL,
  job_description TEXT,
  company_name TEXT,
  session_name TEXT,

  -- Session state
  is_active BOOLEAN DEFAULT true,

  -- Tracking metrics
  total_uploads INTEGER DEFAULT 0,
  best_score INTEGER DEFAULT 0,
  latest_score INTEGER,
  score_history JSONB DEFAULT '[]'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_upload_at TIMESTAMPTZ
);

-- Add indexes for session queries
CREATE INDEX IF NOT EXISTS idx_sessions_wp_user_active ON analysis_sessions(wp_user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_sessions_wp_user_updated ON analysis_sessions(wp_user_id, updated_at DESC);

-- Step 4: Link resumes to sessions
ALTER TABLE resumes
ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES analysis_sessions(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS version_number INTEGER DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_resumes_session_id ON resumes(session_id);
CREATE INDEX IF NOT EXISTS idx_resumes_session_version ON resumes(session_id, version_number);

-- Step 5: Create trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to resumes table
DROP TRIGGER IF EXISTS update_resumes_updated_at ON resumes;
CREATE TRIGGER update_resumes_updated_at
    BEFORE UPDATE ON resumes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to analysis_sessions table
DROP TRIGGER IF EXISTS update_sessions_updated_at ON analysis_sessions;
CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON analysis_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Step 6: Optional - Create WordPress users tracking table (for analytics)
CREATE TABLE IF NOT EXISTS wordpress_users (
  wp_user_id INTEGER PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT,
  membership_level TEXT CHECK (membership_level IN ('free', 'basic', 'pro', 'enterprise')),
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  total_resumes_analyzed INTEGER DEFAULT 0,
  total_sessions INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_wp_users_email ON wordpress_users(email);
CREATE INDEX IF NOT EXISTS idx_wp_users_membership ON wordpress_users(membership_level);

-- Migration complete
-- Note: Run this SQL in your Supabase dashboard SQL editor
