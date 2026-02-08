-- Migration: Original bug_reports table for multi-tenant bug reporting
-- Created: 2026-01-22
-- Purpose: Supports reusable ShakeReporter Swift Package across multiple apps
--
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
-- DEPRECATED: This migration is HISTORICAL ONLY.
-- As of 2026-02-08, the `bug_reports` table was merged into the
-- unified `ghp_bug_reports` table in the shared GHP Labs Supabase
-- project. The old `bug_reports` table has been dropped.
--
-- The `ghp_bug_reports` schema is managed by the central GHP Labs
-- migration set. Do NOT run this migration on new environments.
--
-- Status values changed: 'new' -> 'open', 'investigating' removed.
-- Valid statuses: 'open', 'in_progress', 'resolved', 'wont_fix', 'duplicate'
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

-- ============================================
-- BUG REPORTS TABLE (Multi-tenant) — DEPRECATED, see note above
-- ============================================
CREATE TABLE IF NOT EXISTS public.bug_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Multi-tenant identifier (e.g., "sorted", "clipcook", "app3")
    app_id VARCHAR(100) NOT NULL,

    -- User who submitted (nullable for apps without auth)
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Report content
    description TEXT NOT NULL,
    priority VARCHAR(20) NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
    status VARCHAR(30) DEFAULT 'new' CHECK (status IN ('new', 'investigating', 'in_progress', 'resolved', 'wont_fix', 'duplicate')),

    -- Screenshot storage
    screenshot_url TEXT,

    -- Device/app metadata
    app_version VARCHAR(50),
    build_number VARCHAR(50),
    ios_version VARCHAR(50),
    device_model VARCHAR(100),
    screen_name VARCHAR(200),

    -- Duplicate detection
    fingerprint VARCHAR(64),
    canonical_id UUID REFERENCES public.bug_reports(id) ON DELETE SET NULL,
    duplicate_count INT DEFAULT 1,

    -- AI analysis (for future enhancement)
    claude_analysis JSONB,
    suggested_fix TEXT,
    fix_status VARCHAR(30) CHECK (fix_status IN ('pending', 'accepted', 'rejected', 'implemented')),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_bug_reports_app_id ON public.bug_reports(app_id);
CREATE INDEX IF NOT EXISTS idx_bug_reports_fingerprint ON public.bug_reports(fingerprint);
CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON public.bug_reports(status);
CREATE INDEX IF NOT EXISTS idx_bug_reports_user_id ON public.bug_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON public.bug_reports(created_at DESC);

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_bug_reports_app_status ON public.bug_reports(app_id, status);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert bug reports (supports anonymous and authenticated)
CREATE POLICY "Anyone can create bug reports" ON public.bug_reports
    FOR INSERT WITH CHECK (true);

-- Authenticated users can view their own reports
CREATE POLICY "Users can view own reports" ON public.bug_reports
    FOR SELECT USING (auth.uid() = user_id);

-- Anonymous reports can be viewed by anyone (user_id IS NULL)
CREATE POLICY "Anyone can view anonymous reports" ON public.bug_reports
    FOR SELECT USING (user_id IS NULL);

-- Service role has full access (for admin operations via backend)
CREATE POLICY "Service role full access" ON public.bug_reports
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- UPDATE TIMESTAMP TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION public.update_bug_report_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_bug_reports_timestamp'
    ) THEN
        CREATE TRIGGER update_bug_reports_timestamp
            BEFORE UPDATE ON public.bug_reports
            FOR EACH ROW EXECUTE FUNCTION public.update_bug_report_timestamp();
    END IF;
END $$;

-- ============================================
-- HELPER FUNCTION: Increment duplicate count
-- ============================================
CREATE OR REPLACE FUNCTION public.increment_bug_duplicate_count(p_canonical_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.bug_reports
    SET duplicate_count = duplicate_count + 1,
        updated_at = NOW()
    WHERE id = p_canonical_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- STORAGE BUCKET FOR SCREENSHOTS
-- ============================================
-- Note: Run this in Supabase SQL Editor or via Dashboard
-- Storage buckets are managed via storage schema

INSERT INTO storage.buckets (id, name, public)
VALUES ('bug-screenshots', 'bug-screenshots', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to upload screenshots (supports anonymous users)
CREATE POLICY "Anyone can upload bug screenshots"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'bug-screenshots');

-- Allow public read access to screenshots
CREATE POLICY "Public read access for bug screenshots"
ON storage.objects FOR SELECT
USING (bucket_id = 'bug-screenshots');

-- Allow service role to delete screenshots
CREATE POLICY "Service role can delete bug screenshots"
ON storage.objects FOR DELETE
USING (bucket_id = 'bug-screenshots' AND auth.role() = 'service_role');
