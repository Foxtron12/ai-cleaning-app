import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

/**
 * Validates the Authorization: Bearer <token> header against Supabase.
 * Returns the authenticated user or null if unauthenticated.
 */
export async function getAuthenticatedUser(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: { user } } = await supabase.auth.getUser(token)
  return user ?? null
}
