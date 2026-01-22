import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from '../db/supabase.js';
import { AuthRequest } from './auth.js';

/**
 * Optional Authentication Middleware
 *
 * If a valid Bearer token is provided, authenticates the user and attaches
 * user info to the request. If no token or invalid token, continues without
 * authentication (user will be null).
 */
export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            (req as AuthRequest).user = null as any;
            return next();
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
            (req as AuthRequest).user = null as any;
            return next();
        }

        (req as AuthRequest).user = data.user;
        (req as AuthRequest).supabase = userClient;

        next();
    } catch (err) {
        (req as AuthRequest).user = null as any;
        next();
    }
};
