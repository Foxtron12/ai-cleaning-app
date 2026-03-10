import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// ─── Service-role client (bypasses RLS – server-side only) ───────────────────
export function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { persistSession: false } }
  )
}

// ─── Server client (Server Components, API Routes) ────────────────────────────
// Reads session from cookies. Use in Server Components and API Route handlers.
// NEVER import this in 'use client' components.
export async function createServerSupabaseClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // setAll called from a Server Component – cookies can't be set there.
          // Middleware handles session refresh, so this is safe to ignore.
        }
      },
    },
  })
}

// ─── Auth helper: get current user from server context ───────────────────────
// Returns { user, supabase } or { user: null, supabase } if not authenticated.
export async function getServerUser() {
  const client = await createServerSupabaseClient()
  const { data: { user } } = await client.auth.getUser()
  return { user, supabase: client }
}
