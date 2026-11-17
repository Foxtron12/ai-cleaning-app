import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { decrypt } from '@/lib/encryption'
import { decodeSmoobuCredential } from '@/lib/smoobu'

/**
 * GET /api/integrations
 * Load the current user's integrations (without exposing decrypted API keys).
 */
export async function GET() {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('integrations')
    .select('id, provider, status, webhook_token, last_synced_at, error_message, created_at, updated_at, api_key_encrypted')
    .eq('user_id', user.id)
    .limit(10)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Smoobu: report whether the stored credential uses the new HMAC auth.
  // Only the mode leaves the server, never the key itself.
  function smoobuAuthMode(encrypted: string | null): 'hmac' | 'legacy' | null {
    if (!encrypted) return null
    try {
      const { plaintext } = decrypt(encrypted)
      return decodeSmoobuCredential(plaintext).apiSecret ? 'hmac' : 'legacy'
    } catch {
      return null
    }
  }

  // Build webhook URLs for each integration that has a token
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const integrations = (data ?? []).map(({ api_key_encrypted, ...integration }) => ({
    ...integration,
    has_api_key: !!api_key_encrypted,
    auth_mode: integration.provider === 'smoobu' ? smoobuAuthMode(api_key_encrypted) : null,
    webhook_url: integration.webhook_token
      ? integration.provider === 'stripe'
        ? `${siteUrl}/api/webhooks/stripe/booking/${integration.webhook_token}`
        : `${siteUrl}/api/webhooks/${integration.provider}/${integration.webhook_token}`
      : null,
  }))

  return NextResponse.json({ data: integrations })
}
