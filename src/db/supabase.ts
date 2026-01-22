import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

export const supabaseUrl = process.env.SUPABASE_URL || '';
export const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
export const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.warn('Missing Supabase environment variables.');
}

// Service role client for administrative tasks (bypasses RLS)
export const supabase = createClient(
    supabaseUrl,
    supabaseServiceRoleKey || supabaseAnonKey
);
