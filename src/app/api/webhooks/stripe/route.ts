import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createServiceClient } from "@/lib/supabase-server"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-02-25.clover",
  })
}

export async function POST(request: NextRequest) {
  const stripe = getStripe()
  const body = await request.text()
  const signature = request.headers.get("stripe-signature")

  if (!signature) {
    return NextResponse.json(
      { error: "Keine Stripe-Signatur" },
      { status: 400 }
    )
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err)
    return NextResponse.json(
      { error: "Ungültige Signatur" },
      { status: 400 }
    )
  }

  // Handle both immediate payments (card) and async payments (SEPA debit)
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session

    // BUG-1 fix: Only grant access when payment_status is 'paid'
    // SEPA debit may have payment_status 'unpaid' at checkout.session.completed
    if (session.payment_status !== "paid") {
      console.log(
        `Stripe webhook: session ${session.id} payment_status is '${session.payment_status}', waiting for async payment`
      )
      return NextResponse.json({ received: true })
    }

    const userId = session.client_reference_id
    if (!userId) {
      console.error("Stripe webhook: missing client_reference_id")
      return NextResponse.json(
        { error: "Keine User-ID in Session" },
        { status: 400 }
      )
    }

    // Use service client to bypass RLS
    const supabase = createServiceClient()

    const { error } = await supabase
      .from("profiles")
      .update({
        is_paid: true,
        stripe_customer_id: session.customer as string | null,
      })
      .eq("id", userId)

    if (error) {
      console.error("Stripe webhook: failed to update profile:", error)
      return NextResponse.json(
        { error: "Profil-Update fehlgeschlagen" },
        { status: 500 }
      )
    }

    console.log(`Stripe webhook: user ${userId} marked as paid`)
  }

  // Handle failed async payments (e.g. SEPA debit failure)
  if (event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object as Stripe.Checkout.Session
    console.error(
      `Stripe webhook: async payment failed for session ${session.id}, user ${session.client_reference_id}`
    )
    // No action needed: is_paid was never set to true for pending payments
  }

  return NextResponse.json({ received: true })
}
