import { Request, Response } from 'express';
import { supabase } from '../db/supabase.js';
import logger from '../utils/logger.js';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

async function sendTelegram(text: string): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        logger.warn('Telegram not configured — skipping notification');
        return;
    }

    try {
        const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text,
                parse_mode: 'Markdown',
            }),
        });

        if (!res.ok) {
            logger.warn(`Telegram API returned ${res.status}`);
        }
    } catch (err) {
        logger.warn('Telegram notification failed', { error: (err as Error).message });
    }
}

export class IdeaController {
    static async submitIdea(req: Request, res: Response) {
        const { email, idea } = req.body;

        const { data, error } = await supabase
            .from('ghp_app_ideas')
            .insert({ email, idea })
            .select('id, created_at')
            .single();

        if (error) {
            logger.error('Failed to save idea', { error: error.message });
            res.status(500).json({ success: false, error: 'Failed to save idea' });
            return;
        }

        logger.info('App idea submitted', { id: data.id, email });

        // Fire-and-forget Telegram notification
        sendTelegram(
            `💡 *New app idea*\n\nFrom: ${email}\n\n${idea}`
        );

        res.status(201).json({
            success: true,
            message: 'Idea submitted! Thanks for sharing.',
            id: data.id,
        });
    }
}
