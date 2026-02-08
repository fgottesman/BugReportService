import { z } from 'zod';

// Bug Report Schemas (ShakeReporter)
const BugReportPriorityEnum = z.enum(['low', 'medium', 'high']);
const BugReportStatusEnum = z.enum(['open', 'in_progress', 'resolved', 'wont_fix', 'duplicate']);
const FixStatusEnum = z.enum(['pending', 'accepted', 'rejected', 'implemented']);

export const SubmitBugReportSchema = z.object({
    body: z.object({
        appId: z.string().min(1, 'appId is required').max(100),
        description: z.string().min(5, 'Description must be at least 5 characters').max(5000),
        priority: BugReportPriorityEnum,
        // Max 5MB image = ~6.67MB base64 string
        screenshotBase64: z.string().max(7000000, 'Screenshot too large (max 5MB)').optional(),
        appVersion: z.string().max(50).optional(),
        buildNumber: z.string().max(50).optional(),
        iosVersion: z.string().max(50).optional(),
        deviceModel: z.string().max(100).optional(),
        screenName: z.string().max(200).optional()
    })
});

export const GetBugReportsSchema = z.object({
    query: z.object({
        appId: z.string().min(1, 'appId query parameter is required'),
        status: BugReportStatusEnum.optional(),
        priority: BugReportPriorityEnum.optional(),
        limit: z.string().regex(/^\d+$/).optional(),
        offset: z.string().regex(/^\d+$/).optional()
    })
});

export const UpdateBugReportSchema = z.object({
    params: z.object({
        id: z.string().uuid('Invalid bug report ID')
    }),
    body: z.object({
        status: BugReportStatusEnum.optional(),
        fixStatus: FixStatusEnum.optional(),
        suggestedFix: z.string().max(5000).optional(),
        claudeAnalysis: z.record(z.string(), z.any()).optional()
    })
});
