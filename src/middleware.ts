import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session – required for SSR to work correctly.
  // IMPORTANT: Do NOT add any logic between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // API routes that handle their own auth (admin secret, webhook secret, etc.)
  const publicApiRoutes = ['/api/admin/impersonate', '/api/webhooks/', '/api/guest-registration/', '/api/messages/cron', '/api/rechnungen/auto-generate', '/api/rechnungen/bulk-generate']

  // API routes exempt from payment check (auth-related, webhooks, payment flow)
  const paymentExemptApiRoutes = [
    '/api/admin/impersonate',
    '/api/webhooks/',
    '/api/payments/',
  ]

  // Protect API routes: return 401 JSON for unauthenticated requests
  if (!user && pathname.startsWith('/api/')) {
    const isPublic = publicApiRoutes.some((route) => pathname.startsWith(route))
    if (!isPublic) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }
  }

  // Payment guard for protected API routes:
  // Only enforce if user has properties (0 properties = free browse mode)
  if (user && pathname.startsWith('/api/')) {
    const isPaymentExempt = paymentExemptApiRoutes.some((route) =>
      pathname.startsWith(route)
    )
    if (!isPaymentExempt) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_paid')
        .eq('id', user.id)
        .single()

      if (!profile?.is_paid) {
        const { count } = await supabase
          .from('properties')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)

        if (count && count > 0) {
          return NextResponse.json(
            { error: 'Zahlung erforderlich' },
            { status: 403 }
          )
        }
      }
    }
  }

  // Redirect unauthenticated users away from /dashboard routes
  if (!user && pathname.startsWith('/dashboard')) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  // Redirect unauthenticated users away from /onboarding routes
  if (!user && pathname.startsWith('/onboarding')) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  // Payment Guard for /dashboard: only redirect if user has properties but hasn't paid
  if (user && pathname.startsWith('/dashboard')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_paid')
      .eq('id', user.id)
      .single()

    if (!profile?.is_paid) {
      const { count } = await supabase
        .from('properties')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)

      if (count && count > 0) {
        const paymentUrl = request.nextUrl.clone()
        paymentUrl.pathname = '/onboarding/payment'
        return NextResponse.redirect(paymentUrl)
      }
      // 0 properties → allow dashboard access (free browse mode)
    }
  }

  // Redirect paid users away from payment page
  if (user && pathname === '/onboarding/payment') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_paid')
      .eq('id', user.id)
      .single()

    if (profile?.is_paid) {
      const dashboardUrl = request.nextUrl.clone()
      dashboardUrl.pathname = '/dashboard'
      return NextResponse.redirect(dashboardUrl)
    }
  }

  // Redirect authenticated users away from auth pages
  if (user && (pathname === '/login' || pathname === '/register')) {
    const dashboardUrl = request.nextUrl.clone()
    dashboardUrl.pathname = '/dashboard'
    return NextResponse.redirect(dashboardUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
