import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createServiceClient } from "@/lib/supabase-server"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-02-25.clover",
  })
}

async function markUserPaid(
  userId: string,
  stripeCustomerId: string | null,
  stripeSubscriptionId: string | null
) {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from("profiles")
    .update({
      is_paid: true,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
    })
    .eq("id", userId)

  if (error) {
    console.error("Stripe webhook: failed to update profile:", error)
    return false
  }
  console.log(`Stripe webhook: user ${userId} marked as paid`)
  return true
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

  // ── Checkout completed (initial subscription or one-time payment) ──
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session

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

    const ok = await markUserPaid(
      userId,
      session.customer as string | null,
      session.subscription as string | null
    )
    if (!ok) {
      return NextResponse.json(
        { error: "Profil-Update fehlgeschlagen" },
        { status: 500 }
      )
    }
  }

  // ── Recurring invoice paid (subscription renewal) ──
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice
    if (invoice.billing_reason === "subscription_cycle") {
      const customerId =
        typeof invoice.customer === "string"
          ? invoice.customer
          : invoice.customer?.id
      if (customerId) {
        const supabase = createServiceClient()
        const { error } = await supabase
          .from("profiles")
          .update({ is_paid: true })
          .eq("stripe_customer_id", customerId)

        if (error) {
          console.error("Stripe webhook: renewal update failed:", error)
        } else {
          console.log(
            `Stripe webhook: subscription renewed for customer ${customerId}`
          )
        }
      }
    }
  }

  // ── Subscription cancelled or expired ──
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id

    if (customerId) {
      const supabase = createServiceClient()
      // Only revoke access for users linked via Stripe (not manually set)
      const { error } = await supabase
        .from("profiles")
        .update({ is_paid: false, stripe_subscription_id: null })
        .eq("stripe_customer_id", customerId)

      if (error) {
        console.error("Stripe webhook: subscription revoke failed:", error)
      } else {
        console.log(
          `Stripe webhook: access revoked for customer ${customerId}`
        )
      }
    }
  }

  // ── Failed async payment (SEPA debit) ──
  if (event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object as Stripe.Checkout.Session
    console.error(
      `Stripe webhook: async payment failed for session ${session.id}, user ${session.client_reference_id}`
    )
  }

  return NextResponse.json({ received: true })
}
