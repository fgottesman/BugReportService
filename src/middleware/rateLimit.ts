import rateLimit from 'express-rate-limit';
import { AuthRequest } from './auth.js';

// Rate limit for bug report submissions
export const bugReportLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 5, // 5 bug reports per minute per device/IP
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too many bug reports submitted. Please wait a minute before submitting another.'
    },
    keyGenerator: (req) => {
        const authReq = req as AuthRequest;
        return authReq.user?.id || req.ip || 'anonymous';
    },
    validate: { xForwardedForHeader: false }
});
