import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { autoGenerateInvoices } from '@/lib/auto-generate-invoices'

export async function POST() {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  try {
    const result = await autoGenerateInvoices(user.id, supabase)
    return NextResponse.json({ success: true, created: result.created })
  } catch (error) {
    console.error('Auto-generate invoices route error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Auto-generation failed' },
      { status: 500 }
    )
  }
}
