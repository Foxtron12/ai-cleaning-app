import { redirect } from "next/navigation"
import Stripe from "stripe"
import { getServerUser } from "@/lib/supabase-server"
import { ProductCard } from "@/components/payment/product-card"
import { DevModeNotice } from "@/components/payment/dev-mode-notice"

async function getStripeProduct() {
  const priceId = process.env.STRIPE_PRICE_ID
  if (!priceId || !process.env.STRIPE_SECRET_KEY) {
    return null
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-02-25.clover",
    })
    const price = await stripe.prices.retrieve(priceId, {
      expand: ["product"],
    })
    const product = price.product as Stripe.Product
    return {
      priceAmount: price.unit_amount ?? 0,
      productName: product.name,
      interval: price.recurring?.interval ?? null,
    }
  } catch {
    return null
  }
}

export default async function PaymentPage() {
  const { user, supabase } = await getServerUser()

  if (!user) {
    redirect("/login")
  }

  // Check if already paid → redirect to dashboard
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_paid")
    .eq("id", user.id)
    .single()

  if (profile?.is_paid) {
    redirect("/dashboard")
  }

  // Count user's properties for quantity display
  const { count: propertyCount } = await supabase
    .from("properties")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)

  const quantity = Math.max(1, propertyCount ?? 0)

  const stripeEnabled = process.env.NEXT_PUBLIC_STRIPE_ENABLED === "true"

  // Fetch product info from Stripe, fallback to defaults
  const stripeProduct = stripeEnabled ? await getStripeProduct() : null
  const priceAmount = stripeProduct?.priceAmount ?? 19900
  const productName =
    stripeProduct?.productName ?? "Vermieter Dashboard"
  const interval = stripeProduct?.interval ?? null

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-muted/30">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          Abo abschließen
        </h1>
        <p className="text-muted-foreground mt-2">
          {quantity} Standort{quantity > 1 ? "e" : ""} verbunden – jetzt Zugang freischalten.
        </p>
      </div>
      <ProductCard
        priceAmount={priceAmount}
        productName={productName}
        stripeEnabled={stripeEnabled}
        interval={interval}
        quantity={quantity}
      />
      {!stripeEnabled && (
        <div className="mt-6">
          <DevModeNotice />
        </div>
      )}
    </div>
  )
}
