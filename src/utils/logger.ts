import winston from 'winston';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack, ...metadata }) => {
    const parts = [timestamp, `[${level}]`];
    parts.push(stack || message);

    if (Object.keys(metadata).length > 0) {
        parts.push(JSON.stringify(metadata));
    }

    return parts.join(' ');
});

const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        logFormat
    ),
    transports: [
        new winston.transports.Console({
            format: combine(
                colorize(),
                logFormat
            )
        })
    ]
});

// In production on platforms like Railway, logs go to stdout
// No file transports needed - Railway captures console output

export default logger;
