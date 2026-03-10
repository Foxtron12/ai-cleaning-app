import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerUser } from '@/lib/supabase-server'
import { encrypt } from '@/lib/encryption'
import { generateWebhookToken } from '@/lib/encryption'
import { SmoobuClient } from '@/lib/smoobu'

const saveSmoobuSchema = z.object({
  api_key: z.string().min(1, 'API-Key darf nicht leer sein').max(500),
})

/**
 * POST /api/integrations/smoobu
 * Save (or update) the user's Smoobu API key (encrypted) and test the connection.
 * Generates a webhook token if none exists.
 */
export async function POST(request: NextRequest) {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  // Validate input
  let body: z.infer<typeof saveSmoobuSchema>
  try {
    const raw = await request.json()
    body = saveSmoobuSchema.parse(raw)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Ungültige Eingabe', details: err.issues },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 })
  }

  // Test the API key before saving
  const smoobu = new SmoobuClient({ apiKey: body.api_key })
  const testResult = await smoobu.testConnection()

  if (!testResult.success) {
    return NextResponse.json(
      {
        error: 'Ungültiger Smoobu API-Key. Bitte prüfe den Key in deinem Smoobu-Konto.',
        status: 'error',
      },
      { status: 400 }
    )
  }

  // Encrypt the API key
  const apiKeyEncrypted = encrypt(body.api_key)

  // Check if integration already exists
  const { data: existing } = await supabase
    .from('integrations')
    .select('id, webhook_token')
    .eq('user_id', user.id)
    .eq('provider', 'smoobu')
    .single()

  const webhookToken = existing?.webhook_token ?? generateWebhookToken()

  if (existing) {
    // Update existing integration
    const { error } = await supabase
      .from('integrations')
      .update({
        api_key_encrypted: apiKeyEncrypted,
        status: 'connected',
        webhook_token: webhookToken,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else {
    // Insert new integration
    const { error } = await supabase
      .from('integrations')
      .insert({
        user_id: user.id,
        provider: 'smoobu',
        api_key_encrypted: apiKeyEncrypted,
        webhook_token: webhookToken,
        status: 'connected',
      })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  return NextResponse.json({
    success: true,
    status: 'connected',
    apartmentCount: testResult.apartmentCount,
    webhook_url: `${siteUrl}/api/webhooks/smoobu/${webhookToken}`,
    message: `Verbindung erfolgreich! ${testResult.apartmentCount} Objekt(e) gefunden.`,
  })
}

/**
 * DELETE /api/integrations/smoobu
 * Remove the user's Smoobu integration. Webhook token becomes invalid immediately.
 * Existing synced bookings are NOT deleted.
 */
export async function DELETE() {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  const { error } = await supabase
    .from('integrations')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', 'smoobu')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: 'Smoobu-Integration wurde entfernt.' })
}
