import { NextResponse } from "next/server"
import Stripe from "stripe"
import { createServerSupabaseClient } from "@/lib/supabase-server"

export async function POST() {
  try {
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

    // Get profile with subscription info
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_subscription_id, stripe_customer_id")
      .eq("id", user.id)
      .single()

    if (!profile?.stripe_subscription_id) {
      return NextResponse.json(
        { error: "Kein aktives Abo gefunden" },
        { status: 400 }
      )
    }

    // Count current properties
    const { count: propertyCount } = await supabase
      .from("properties")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)

    const newQuantity = Math.max(1, propertyCount ?? 0)

    // Update subscription quantity at Stripe
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-02-25.clover",
    })

    const subscription = await stripe.subscriptions.retrieve(
      profile.stripe_subscription_id
    )

    const subscriptionItem = subscription.items.data[0]
    if (!subscriptionItem) {
      return NextResponse.json(
        { error: "Kein Abo-Item gefunden" },
        { status: 500 }
      )
    }

    // Only update if quantity actually changed
    if (subscriptionItem.quantity === newQuantity) {
      return NextResponse.json({
        updated: false,
        quantity: newQuantity,
        message: "Anzahl unverändert",
      })
    }

    await stripe.subscriptions.update(profile.stripe_subscription_id, {
      items: [
        {
          id: subscriptionItem.id,
          quantity: newQuantity,
        },
      ],
      proration_behavior: "create_prorations",
    })

    console.log(
      `Subscription ${profile.stripe_subscription_id} updated: quantity ${subscriptionItem.quantity} → ${newQuantity}`
    )

    return NextResponse.json({
      updated: true,
      quantity: newQuantity,
      message: `Abo auf ${newQuantity} Standort${newQuantity > 1 ? "e" : ""} aktualisiert`,
    })
  } catch (err) {
    console.error("Sync subscription error:", err)
    return NextResponse.json(
      { error: "Abo-Aktualisierung fehlgeschlagen" },
      { status: 500 }
    )
  }
}
