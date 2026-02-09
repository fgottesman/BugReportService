-- Migration: Add screenshot_urls array column for multiple screenshots
-- Created: 2026-02-08
-- Author: Jet
-- Purpose: Support multiple screenshots per bug report
--
-- Apply this to the shared GHP Labs Supabase project (ghp_bug_reports table)

-- Add screenshot_urls column (TEXT array) for storing multiple screenshot URLs
ALTER TABLE public.ghp_bug_reports
ADD COLUMN IF NOT EXISTS screenshot_urls TEXT[];

-- Add comment for documentation
COMMENT ON COLUMN public.ghp_bug_reports.screenshot_urls IS 'Array of screenshot URLs for this bug report. First URL is also stored in screenshot_url for backward compatibility.';

-- Index for performance when querying reports with screenshots
CREATE INDEX IF NOT EXISTS idx_ghp_bug_reports_has_screenshots 
ON public.ghp_bug_reports ((screenshot_urls IS NOT NULL));
