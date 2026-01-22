import express from 'express';
import { BugReportController } from '../controllers/BugReportController.js';
import { wrapAsync } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { SubmitBugReportSchema, UpdateBugReportSchema, GetBugReportsSchema } from '../schemas/index.js';
import { optionalAuth } from '../middleware/optionalAuth.js';
import { authenticate } from '../middleware/auth.js';
import { bugReportLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

/**
 * Bug Report Routes - Multi-tenant support for ShakeReporter
 *
 * POST   /api/v1/bug-reports        - Submit bug report (auth optional, rate limited)
 * GET    /api/v1/bug-reports        - List bug reports for an app
 * GET    /api/v1/bug-reports/stats  - Get statistics for an app
 * GET    /api/v1/bug-reports/:id    - Get single bug report
 * PATCH  /api/v1/bug-reports/:id    - Update bug report status (auth required)
 * GET    /api/v1/bug-reports/:id/duplicates - Get duplicates
 */

// Submit bug report (auth optional - supports apps without user accounts)
router.post(
    '/',
    bugReportLimiter,
    optionalAuth,
    validate(SubmitBugReportSchema),
    wrapAsync(BugReportController.submitBugReport)
);

// Get bug reports for an app (no auth required)
router.get(
    '/',
    validate(GetBugReportsSchema),
    wrapAsync(BugReportController.getBugReports)
);

// Get statistics for an app (no auth required)
router.get(
    '/stats',
    wrapAsync(BugReportController.getStats)
);

// Get single bug report (no auth required)
router.get(
    '/:id',
    wrapAsync(BugReportController.getBugReport)
);

// Update bug report (requires auth - admin operations)
router.patch(
    '/:id',
    authenticate,
    validate(UpdateBugReportSchema),
    wrapAsync(BugReportController.updateBugReport)
);

// Get duplicates for a canonical report
router.get(
    '/:id/duplicates',
    wrapAsync(BugReportController.getDuplicates)
);

export default router;
