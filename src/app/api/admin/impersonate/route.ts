import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase-server'

const bodySchema = z.object({
  user_id: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  // Validate admin secret header
  const secret = request.headers.get('x-admin-secret')
  const expectedSecret = process.env.ADMIN_SECRET

  if (
    !expectedSecret ||
    !secret ||
    secret.length !== expectedSecret.length ||
    !timingSafeEqual(Buffer.from(secret), Buffer.from(expectedSecret))
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Ungültige Daten', details: parsed.error.issues },
      { status: 400 }
    )
  }

  const { user_id } = parsed.data
  const supabase = createServiceClient()

  // Lookup user email
  const { data: userRecord, error: userError } = await supabase.auth.admin.getUserById(user_id)
  if (userError || !userRecord.user?.email) {
    return NextResponse.json({ error: 'Nutzer nicht gefunden' }, { status: 404 })
  }

  // Require NEXT_PUBLIC_SITE_URL in production to avoid relative-path magic links
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!siteUrl) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_SITE_URL ist nicht konfiguriert' },
      { status: 500 }
    )
  }

  // Audit log – best-effort, should not block magic link generation
  const { error: auditError } = await supabase.from('admin_audit_log').insert({
    action: 'impersonate',
    target_user_id: user_id,
    metadata: { timestamp: new Date().toISOString() },
  })
  if (auditError) {
    console.warn('Audit log write failed (non-blocking):', auditError.message)
  }

  // Generate magic link for impersonation
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: userRecord.user.email,
    options: { redirectTo: `${siteUrl}/dashboard` },
  })

  if (linkError || !linkData.properties?.action_link) {
    return NextResponse.json(
      { error: 'Magic-Link konnte nicht erstellt werden: ' + linkError?.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    magic_link: linkData.properties.action_link,
    user_id,
    expires_in: '1 hour',
  })
}
