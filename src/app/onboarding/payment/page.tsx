import { redirect } from "next/navigation"
import { getServerUser } from "@/lib/supabase-server"
import { ProductCard } from "@/components/payment/product-card"
import { DevModeNotice } from "@/components/payment/dev-mode-notice"

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

  const stripeEnabled = process.env.NEXT_PUBLIC_STRIPE_ENABLED === "true"
  const priceAmount = Number(process.env.STRIPE_PRICE_AMOUNT) || 19900
  const productName =
    process.env.STRIPE_PRODUCT_NAME ||
    "Vermieter Dashboard – Lebenslanger Zugang"

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-muted/30">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          Zugang freischalten
        </h1>
        <p className="text-muted-foreground mt-2">
          Schließe deine Registrierung ab und erhalte vollen Zugang.
        </p>
      </div>
      <ProductCard
        priceAmount={priceAmount}
        productName={productName}
        stripeEnabled={stripeEnabled}
      />
      {!stripeEnabled && (
        <div className="mt-6">
          <DevModeNotice />
        </div>
      )}
    </div>
  )
}
