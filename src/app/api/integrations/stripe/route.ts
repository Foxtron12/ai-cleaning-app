import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import Stripe from 'stripe'
import { getServerUser } from '@/lib/supabase-server'
import { encrypt, decrypt, generateWebhookToken } from '@/lib/encryption'

const saveStripeSchema = z.object({
  api_key: z.string().min(1, 'API-Key darf nicht leer sein').max(500),
})

/**
 * POST /api/integrations/stripe
 * Save (or update) the user's Stripe Secret Key (encrypted).
 * Automatically creates a webhook endpoint in the user's Stripe account.
 */
export async function POST(request: NextRequest) {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  // Validate input
  let body: z.infer<typeof saveStripeSchema>
  try {
    const raw = await request.json()
    body = saveStripeSchema.parse(raw)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Ungültige Eingabe', details: err.issues },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 })
  }

  // Test the API key by fetching account info
  const stripe = new Stripe(body.api_key, { apiVersion: '2026-02-25.clover' })

  try {
    await stripe.accounts.retrieve()
  } catch {
    return NextResponse.json(
      {
        error: 'Ungültiger Stripe API-Key. Bitte prüfe den Key in deinem Stripe-Dashboard.',
        status: 'error',
      },
      { status: 400 }
    )
  }

  // Check if integration already exists
  const { data: existing } = await supabase
    .from('integrations')
    .select('id, webhook_token, webhook_secret_encrypted')
    .eq('user_id', user.id)
    .eq('provider', 'stripe')
    .single()

  const webhookToken = existing?.webhook_token ?? generateWebhookToken()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const webhookUrl = `${siteUrl}/api/webhooks/stripe/booking/${webhookToken}`

  // Delete old webhook endpoint from Stripe if updating
  if (existing?.webhook_secret_encrypted) {
    try {
      // List and delete existing webhook endpoints pointing to our URL
      const endpoints = await stripe.webhookEndpoints.list({ limit: 100 })
      for (const ep of endpoints.data) {
        if (ep.url === webhookUrl) {
          await stripe.webhookEndpoints.del(ep.id)
        }
      }
    } catch {
      // Ignore errors when cleaning up old webhooks
    }
  }

  // Create webhook endpoint in the user's Stripe account
  let webhookSecret: string
  try {
    const endpoint = await stripe.webhookEndpoints.create({
      url: webhookUrl,
      enabled_events: [
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
        'checkout.session.async_payment_failed',
      ],
      description: 'Booking payment webhook (auto-configured)',
    })
    webhookSecret = endpoint.secret!
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook konnte nicht erstellt werden'
    return NextResponse.json(
      { error: `Stripe-Verbindung OK, aber Webhook konnte nicht erstellt werden: ${message}` },
      { status: 500 }
    )
  }

  // Encrypt keys
  const apiKeyEncrypted = encrypt(body.api_key)
  const webhookSecretEncrypted = encrypt(webhookSecret)

  if (existing) {
    const { error } = await supabase
      .from('integrations')
      .update({
        api_key_encrypted: apiKeyEncrypted,
        webhook_secret_encrypted: webhookSecretEncrypted,
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
    const { error } = await supabase
      .from('integrations')
      .insert({
        user_id: user.id,
        provider: 'stripe',
        api_key_encrypted: apiKeyEncrypted,
        webhook_secret_encrypted: webhookSecretEncrypted,
        webhook_token: webhookToken,
        status: 'connected',
      })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({
    success: true,
    status: 'connected',
    message: 'Stripe-Verbindung erfolgreich! Webhook wurde automatisch eingerichtet.',
  })
}

/**
 * DELETE /api/integrations/stripe
 * Remove the user's Stripe integration and delete the webhook endpoint from Stripe.
 */
export async function DELETE() {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  // Load integration to clean up Stripe webhook
  const { data: integration } = await supabase
    .from('integrations')
    .select('id, api_key_encrypted, webhook_token')
    .eq('user_id', user.id)
    .eq('provider', 'stripe')
    .single()

  if (integration?.api_key_encrypted) {
    try {
      const { plaintext: apiKey } = decrypt(integration.api_key_encrypted)
      const stripe = new Stripe(apiKey, { apiVersion: '2026-02-25.clover' })
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
      const webhookUrl = `${siteUrl}/api/webhooks/stripe/booking/${integration.webhook_token}`

      const endpoints = await stripe.webhookEndpoints.list({ limit: 100 })
      for (const ep of endpoints.data) {
        if (ep.url === webhookUrl) {
          await stripe.webhookEndpoints.del(ep.id)
        }
      }
    } catch {
      // Best effort: continue even if Stripe cleanup fails
    }
  }

  const { error } = await supabase
    .from('integrations')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', 'stripe')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: 'Stripe-Integration wurde entfernt.' })
}
