import { NextResponse } from "next/server"
import Stripe from "stripe"
import { createServerSupabaseClient } from "@/lib/supabase-server"

// BUG-3 fix: Simple in-memory rate limiting per user
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX = 5 // max requests per window
const RATE_LIMIT_WINDOW_MS = 60_000 // 1 minute

function isRateLimited(userId: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(userId)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return false
  }

  entry.count++
  return entry.count > RATE_LIMIT_MAX
}

export async function POST() {
  try {
    // 1. Verify authentication
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      )
    }

    // BUG-3 fix: Rate limit check
    if (isRateLimited(user.id)) {
      return NextResponse.json(
        { error: "Zu viele Anfragen. Bitte warten Sie einen Moment." },
        { status: 429 }
      )
    }

    // 2. Check if Stripe is enabled
    if (process.env.NEXT_PUBLIC_STRIPE_ENABLED !== "true") {
      return NextResponse.json(
        { error: "Stripe ist nicht aktiviert" },
        { status: 400 }
      )
    }

    // 3. Check if already paid (has active subscription)
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_paid, stripe_customer_id")
      .eq("id", user.id)
      .single()

    if (profile?.is_paid) {
      return NextResponse.json(
        { error: "Abo bereits aktiv" },
        { status: 400 }
      )
    }

    // 4. Count user's properties for subscription quantity
    const { count: propertyCount } = await supabase
      .from("properties")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)

    const quantity = Math.max(1, propertyCount ?? 0)

    // 5. Create Stripe Checkout Session
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-02-25.clover",
    })

    const priceId = process.env.STRIPE_PRICE_ID
    if (!priceId) {
      return NextResponse.json(
        { error: "STRIPE_PRICE_ID ist nicht konfiguriert" },
        { status: 500 }
      )
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      payment_method_types: ["card", "sepa_debit"],
      line_items: [
        {
          price: priceId,
          quantity,
        },
      ],
      success_url: `${siteUrl}/dashboard?payment=success`,
      cancel_url: `${siteUrl}/onboarding/payment?payment=cancelled`,
      client_reference_id: user.id,
      customer_email: user.email,
    }

    // Reuse existing Stripe customer if available
    if (profile?.stripe_customer_id) {
      sessionParams.customer = profile.stripe_customer_id
      delete sessionParams.customer_email
    }

    const session = await stripe.checkout.sessions.create(sessionParams)

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error("Stripe checkout error:", err)
    return NextResponse.json(
      { error: "Checkout-Session konnte nicht erstellt werden" },
      { status: 500 }
    )
  }
}
