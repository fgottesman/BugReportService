import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

export const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
// JWT tokens should never contain whitespace - strip all of it (handles newlines pasted mid-token)
export const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || '').replace(/\s/g, '');
export const supabaseServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/\s/g, '');

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.warn('Missing Supabase environment variables.');
}

// Service role client for administrative tasks (bypasses RLS)
export const supabase = createClient(
    supabaseUrl,
    supabaseServiceRoleKey || supabaseAnonKey
);
