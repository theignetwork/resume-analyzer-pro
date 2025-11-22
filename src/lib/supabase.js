import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Client for browser/public operations (with RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side client that bypasses RLS (for authenticated API routes)
// Only created on server-side where SUPABASE_SERVICE_ROLE_KEY is available
// This is safe because we do authentication checks in API routes
export const supabaseAdmin = supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : supabase; // Fallback to regular client if service key not available (shouldn't happen in production)
