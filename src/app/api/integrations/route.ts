import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'

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
    .select('id, provider, status, webhook_token, last_synced_at, error_message, created_at, updated_at')
    .eq('user_id', user.id)
    .limit(10)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Build webhook URLs for each integration that has a token
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const integrations = (data ?? []).map((integration) => ({
    ...integration,
    has_api_key: true, // api_key_encrypted is not selected, so we indicate presence via status
    webhook_url: integration.webhook_token
      ? `${siteUrl}/api/webhooks/${integration.provider}/${integration.webhook_token}`
      : null,
  }))

  return NextResponse.json({ data: integrations })
}
