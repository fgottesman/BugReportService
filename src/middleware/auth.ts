import { Request, Response, NextFunction } from 'express';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from '../db/supabase.js';

export interface AuthRequest extends Request {
    user: User;
    supabase: SupabaseClient;
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
        }

        const token = authHeader.split(' ')[1];

        const userClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        });

        const { data, error } = await userClient.auth.getUser();

        if (error || !data.user) {
            return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        }

        (req as AuthRequest).user = data.user;
        (req as AuthRequest).supabase = userClient;

        next();
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error during authentication' });
    }
};
