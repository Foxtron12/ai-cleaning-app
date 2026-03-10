import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { generateWebhookToken } from '@/lib/encryption'

/**
 * POST /api/integrations/smoobu/regenerate-token
 * Generate a new webhook token, invalidating the old one immediately.
 * The user must update the webhook URL in their Smoobu settings.
 */
export async function POST() {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  // Check that integration exists
  const { data: existing } = await supabase
    .from('integrations')
    .select('id')
    .eq('user_id', user.id)
    .eq('provider', 'smoobu')
    .single()

  if (!existing) {
    return NextResponse.json(
      { error: 'Keine Smoobu-Integration gefunden.' },
      { status: 404 }
    )
  }

  const newToken = generateWebhookToken()

  const { error } = await supabase
    .from('integrations')
    .update({
      webhook_token: newToken,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  return NextResponse.json({
    success: true,
    webhook_url: `${siteUrl}/api/webhooks/smoobu/${newToken}`,
    message: 'Webhook-Token wurde erneuert. Bitte die neue URL in Smoobu eintragen.',
  })
}
