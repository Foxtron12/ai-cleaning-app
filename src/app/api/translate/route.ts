import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerUser } from '@/lib/supabase-server'

const translateSchema = z.object({
  text: z.string().min(1).max(5000),
  targetLang: z.enum(['de', 'en']),
})

/**
 * POST /api/translate
 * Translates text between DE and EN using Google Translate free API.
 * Preserves {{placeholder}} variables by replacing them before translation
 * and restoring them after.
 */
export async function POST(req: NextRequest) {
  try {
    // Auth check
    const { user } = await getServerUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = translateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Ungültige Eingabe', details: parsed.error.issues }, { status: 400 })
    }

    const { text, targetLang } = parsed.data

    // Extract {{...}} placeholders and replace with numbered tokens
    const placeholders: string[] = []
    const textWithTokens = text.replace(/\{\{[^}]+\}\}/g, (match: string) => {
      const idx = placeholders.length
      placeholders.push(match)
      return `__PH${idx}__`
    })

    const sourceLang = targetLang === 'de' ? 'en' : 'de'

    const url = new URL('https://translate.googleapis.com/translate_a/single')
    url.searchParams.set('client', 'gtx')
    url.searchParams.set('sl', sourceLang)
    url.searchParams.set('tl', targetLang)
    url.searchParams.set('dt', 't')
    url.searchParams.set('q', textWithTokens)

    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })

    if (!res.ok) {
      throw new Error(`Translation API returned ${res.status}`)
    }

    const data = await res.json()

    // data[0] is an array of [translatedSegment, originalSegment, ...]
    let translatedText = ''
    if (Array.isArray(data[0])) {
      for (const segment of data[0]) {
        if (Array.isArray(segment) && segment[0]) {
          translatedText += segment[0]
        }
      }
    }

    // Restore placeholders
    for (let i = 0; i < placeholders.length; i++) {
      // Google Translate may add spaces around tokens or change case
      const tokenPattern = new RegExp(`__PH${i}__`, 'gi')
      translatedText = translatedText.replace(tokenPattern, placeholders[i])
    }

    return NextResponse.json({ translatedText })
  } catch (err) {
    console.error('Translation error:', err)
    return NextResponse.json(
      { error: 'Übersetzung fehlgeschlagen' },
      { status: 500 }
    )
  }
}
