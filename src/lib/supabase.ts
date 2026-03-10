import { createClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// ─── Browser client (Client Components) ──────────────────────────────────────
// Cookie-based sessions, respects RLS. Use in 'use client' components.
export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
}

// Singleton for convenience in client components
export const supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)

// ─── Service-role client (API routes that need to bypass RLS) ─────────────────
// Never expose to browser. Only use in server-side code.
export function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })
}
