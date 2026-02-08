import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { supabase } from '../db/supabase.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';

/**
 * BugReportController - Multi-tenant bug reporting for ShakeReporter
 *
 * Supports both authenticated and anonymous bug reports.
 * Uses service role client since RLS allows inserts from anyone.
 */
export class BugReportController {
    /**
     * Generate a fingerprint for duplicate detection
     * Based on: appId + description (normalized) + screen
     */
    private static generateFingerprint(appId: string, description: string, screenName?: string): string {
        const normalized = description
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .trim()
            .substring(0, 200);

        const input = `${appId}:${normalized}:${screenName || ''}`;
        return crypto.createHash('sha256').update(input).digest('hex').substring(0, 64);
    }

    /**
     * Check for existing report with same fingerprint (within 7 days)
     */
    private static async findDuplicate(fingerprint: string, appId: string): Promise<string | null> {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const { data } = await supabase
            .from('ghp_bug_reports')
            .select('id')
            .eq('fingerprint', fingerprint)
            .eq('app_id', appId)
            .gte('created_at', sevenDaysAgo.toISOString())
            .is('canonical_id', null) // Only find canonical reports
            .order('created_at', { ascending: true })
            .limit(1)
            .single();

        return data?.id || null;
    }

    /**
     * POST /api/v1/bug-reports
     * Submit a new bug report
     *
     * Required: appId, description, priority
     * Optional: userId (from auth), screenshot, device metadata
     */
    static async submitBugReport(req: Request, res: Response) {
        let bugReportId: string | undefined;
        try {
            const {
                appId,
                description,
                priority,
                screenshotBase64,
                appVersion,
                buildNumber,
                iosVersion,
                deviceModel,
                screenName
            } = req.body;

            // Get userId from auth if present (optional)
            const userId = (req as AuthRequest).user?.id || null;

            // Validation
            if (!appId || typeof appId !== 'string') {
                return res.status(400).json({ error: 'appId is required' });
            }
            if (!description || typeof description !== 'string' || description.trim().length < 5) {
                return res.status(400).json({ error: 'description is required (min 5 characters)' });
            }
            if (!priority || !['low', 'medium', 'high'].includes(priority)) {
                return res.status(400).json({ error: 'priority must be low, medium, or high' });
            }

            // Generate fingerprint for duplicate detection
            const fingerprint = BugReportController.generateFingerprint(appId, description, screenName);

            // Check for duplicates
            const existingCanonicalId = await BugReportController.findDuplicate(fingerprint, appId);

            let screenshotUrl: string | null = null;

            // Handle screenshot upload if provided
            if (screenshotBase64) {
                try {
                    const buffer = Buffer.from(screenshotBase64, 'base64');
                    const fileName = `${appId}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.png`;

                    const { data: uploadData, error: uploadError } = await supabase
                        .storage
                        .from('bug-screenshots')
                        .upload(fileName, buffer, {
                            contentType: 'image/png',
                            upsert: false
                        });

                    if (uploadError) {
                        logger.warn('Screenshot upload failed', { error: uploadError.message });
                    } else {
                        const { data: urlData } = supabase
                            .storage
                            .from('bug-screenshots')
                            .getPublicUrl(fileName);
                        screenshotUrl = urlData.publicUrl;
                    }
                } catch (uploadErr: any) {
                    logger.warn('Screenshot processing failed', { error: uploadErr.message });
                }
            }

            // Insert bug report
            const { data, error } = await supabase
                .from('ghp_bug_reports')
                .insert({
                    app_id: appId,
                    user_id: userId,
                    description: description.trim(),
                    priority,
                    status: existingCanonicalId ? 'duplicate' : 'open',
                    screenshot_url: screenshotUrl,
                    app_version: appVersion || null,
                    build_number: buildNumber || null,
                    ios_version: iosVersion || null,
                    device_model: deviceModel || null,
                    screen_name: screenName || null,
                    fingerprint,
                    canonical_id: existingCanonicalId || null,
                    duplicate_count: existingCanonicalId ? 0 : 1
                })
                .select()
                .single();

            if (error) throw error;
            bugReportId = data.id;

            // If this is a duplicate, increment the canonical report's count
            if (existingCanonicalId) {
                await supabase.rpc('increment_bug_duplicate_count', {
                    p_canonical_id: existingCanonicalId
                });
                logger.info('Duplicate bug report submitted', {
                    bugReportId,
                    canonicalId: existingCanonicalId,
                    appId,
                    userId
                });
            } else {
                logger.info('Bug report submitted', {
                    bugReportId,
                    appId,
                    priority,
                    userId
                });
            }

            res.status(201).json({
                success: true,
                bugReport: {
                    id: data.id,
                    status: data.status,
                    isDuplicate: !!existingCanonicalId,
                    canonicalId: existingCanonicalId
                }
            });
        } catch (error: any) {
            logger.error(`Submit Bug Report Error: ${error.message}`, { bugReportId });
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * GET /api/v1/bug-reports
     * Get bug reports with filtering
     *
     * Query params: appId (required), status, priority, limit, offset
     */
    static async getBugReports(req: Request, res: Response) {
        try {
            const { appId, status, priority, limit = '50', offset = '0' } = req.query;

            if (!appId || typeof appId !== 'string') {
                return res.status(400).json({ error: 'appId query parameter is required' });
            }

            let query = supabase
                .from('ghp_bug_reports')
                .select('*')
                .eq('app_id', appId)
                .is('canonical_id', null) // Only return canonical reports (not duplicates)
                .order('created_at', { ascending: false })
                .range(Number(offset), Number(offset) + Number(limit) - 1);

            if (status && typeof status === 'string') {
                query = query.eq('status', status);
            }

            if (priority && typeof priority === 'string') {
                query = query.eq('priority', priority);
            }

            const { data, error, count } = await query;

            if (error) throw error;

            res.json({
                success: true,
                bugReports: data || [],
                pagination: {
                    limit: Number(limit),
                    offset: Number(offset),
                    hasMore: (data?.length || 0) === Number(limit)
                }
            });
        } catch (error: any) {
            logger.error(`Get Bug Reports Error: ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * GET /api/v1/bug-reports/:id
     * Get a single bug report by ID
     */
    static async getBugReport(req: Request, res: Response) {
        try {
            const { id } = req.params;

            const { data, error } = await supabase
                .from('ghp_bug_reports')
                .select('*')
                .eq('id', id)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    return res.status(404).json({ error: 'Bug report not found' });
                }
                throw error;
            }

            res.json({ success: true, bugReport: data });
        } catch (error: any) {
            logger.error(`Get Bug Report Error: ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * PATCH /api/v1/bug-reports/:id
     * Update bug report status
     */
    static async updateBugReport(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { status, fixStatus, suggestedFix, claudeAnalysis } = req.body;

            const updates: Record<string, any> = {};
            if (status) updates.status = status;
            if (fixStatus) updates.fix_status = fixStatus;
            if (suggestedFix !== undefined) updates.suggested_fix = suggestedFix;
            if (claudeAnalysis !== undefined) updates.claude_analysis = claudeAnalysis;

            if (Object.keys(updates).length === 0) {
                return res.status(400).json({ error: 'No valid fields to update' });
            }

            const { data, error } = await supabase
                .from('ghp_bug_reports')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    return res.status(404).json({ error: 'Bug report not found' });
                }
                throw error;
            }

            logger.info('Bug report updated', { bugReportId: id, updates });
            res.json({ success: true, bugReport: data });
        } catch (error: any) {
            logger.error(`Update Bug Report Error: ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * GET /api/v1/bug-reports/:id/duplicates
     * Get all duplicate reports for a canonical report
     */
    static async getDuplicates(req: Request, res: Response) {
        try {
            const { id } = req.params;

            const { data, error } = await supabase
                .from('ghp_bug_reports')
                .select('*')
                .eq('canonical_id', id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            res.json({
                success: true,
                duplicates: data || [],
                count: data?.length || 0
            });
        } catch (error: any) {
            logger.error(`Get Duplicates Error: ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * GET /api/v1/bug-reports/stats
     * Get bug report statistics for an app
     */
    static async getStats(req: Request, res: Response) {
        try {
            const { appId } = req.query;

            if (!appId || typeof appId !== 'string') {
                return res.status(400).json({ error: 'appId query parameter is required' });
            }

            // Get counts by status
            const { data: statusCounts, error: statusError } = await supabase
                .from('ghp_bug_reports')
                .select('status')
                .eq('app_id', appId)
                .is('canonical_id', null);

            if (statusError) throw statusError;

            // Get counts by priority
            const { data: priorityCounts, error: priorityError } = await supabase
                .from('ghp_bug_reports')
                .select('priority')
                .eq('app_id', appId)
                .is('canonical_id', null);

            if (priorityError) throw priorityError;

            // Aggregate counts
            const byStatus: Record<string, number> = {};
            const byPriority: Record<string, number> = {};

            statusCounts?.forEach(r => {
                byStatus[r.status] = (byStatus[r.status] || 0) + 1;
            });

            priorityCounts?.forEach(r => {
                byPriority[r.priority] = (byPriority[r.priority] || 0) + 1;
            });

            res.json({
                success: true,
                stats: {
                    total: statusCounts?.length || 0,
                    byStatus,
                    byPriority
                }
            });
        } catch (error: any) {
            logger.error(`Get Stats Error: ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    }
}
