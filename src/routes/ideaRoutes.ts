import express from 'express';
import { IdeaController } from '../controllers/IdeaController.js';
import { wrapAsync } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { SubmitIdeaSchema } from '../schemas/index.js';
import { ideaLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

// POST /api/v1/ideas - Submit an app idea (public, rate limited)
router.post(
    '/',
    ideaLimiter,
    validate(SubmitIdeaSchema),
    wrapAsync(IdeaController.submitIdea)
);

export default router;
