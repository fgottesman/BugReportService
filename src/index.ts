import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bugReportRoutes from './routes/bugReportRoutes.js';
import { errorHandler } from './middleware/error.js';
import logger from './utils/logger.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/v1/bug-reports', bugReportRoutes);

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
    logger.info(`Bug Report Service running on port ${PORT}`);
});
