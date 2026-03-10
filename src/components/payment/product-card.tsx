"use client"

import { Check } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckoutButton } from "./checkout-button"

const features = [
  "Unbegrenzter Zugang zum Dashboard",
  "Automatische Meldebescheinigungen",
  "Finanzberichte & Steuer-Export",
  "Smoobu-Integration mit Live-Daten",
]

const intervalLabels: Record<string, string> = {
  month: "/ Monat",
  year: "/ Jahr",
  week: "/ Woche",
  day: "/ Tag",
}

interface ProductCardProps {
  priceAmount: number // in cents, per unit
  productName: string
  stripeEnabled: boolean
  interval?: string | null
  quantity?: number
}

export function ProductCard({
  priceAmount,
  productName,
  stripeEnabled,
  interval,
  quantity = 1,
}: ProductCardProps) {
  const totalAmount = priceAmount * quantity
  const totalEur = (totalAmount / 100).toFixed(2).replace(".", ",")
  const unitEur = (priceAmount / 100).toFixed(2).replace(".", ",")
  const intervalLabel = interval ? intervalLabels[interval] ?? "" : ""

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <Badge variant="secondary" className="w-fit mx-auto mb-2">
          {interval ? "Abo" : "Einmalzahlung"}
        </Badge>
        <CardTitle className="text-2xl">{productName}</CardTitle>
        <CardDescription>
          {interval
            ? "Jederzeit kündbar. Voller Zugang ab sofort."
            : "Einmal zahlen, lebenslang nutzen. Kein Abo."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-center">
          <span className="text-4xl font-bold">{totalEur} €</span>
          <p className="text-sm text-muted-foreground mt-1">
            {quantity > 1 && `${quantity} × ${unitEur} € · `}
            inkl. MwSt.{intervalLabel && ` · ${intervalLabel}`}
          </p>
          {quantity > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {unitEur} € pro Standort{intervalLabel && ` ${intervalLabel}`}
            </p>
          )}
        </div>
        <ul className="space-y-3">
          {features.map((feature) => (
            <li key={feature} className="flex items-center gap-3">
              <Check className="h-5 w-5 text-green-600 shrink-0" />
              <span className="text-sm">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <CheckoutButton stripeEnabled={stripeEnabled} />
      </CardFooter>
    </Card>
  )
}
