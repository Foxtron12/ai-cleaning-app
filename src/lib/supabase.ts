import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Client-side Supabase client (uses anon key, respects RLS)
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

// Server-side Supabase client (uses service role key, bypasses RLS)
// Only use in API routes and Server Actions – never expose to frontend
export function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })
}

/**
 * Verifies a Supabase JWT from an Authorization: Bearer <token> header.
 * Use in API routes to guard against unauthenticated requests.
 * Returns true if the token belongs to a valid user, false otherwise.
 */
export async function verifyAuth(authorizationHeader: string | null): Promise<boolean> {
  if (!authorizationHeader?.startsWith('Bearer ')) return false
  const token = authorizationHeader.slice(7)
  const client = createClient<Database>(supabaseUrl, supabaseAnonKey)
  const { data: { user } } = await client.auth.getUser(token)
  return user !== null
}
