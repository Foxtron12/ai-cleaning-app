'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { MapPin, Save, X, Tag, ChevronsUpDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Property, CityTaxRule } from '@/lib/types'
import { CITY_TAX_RULES, findCityTaxRule, formatTaxRuleDescription, mapToDbTaxModel } from '@/lib/data/city-tax-rules'
import type { CityTaxRuleData } from '@/lib/data/city-tax-rules'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface PropertyForm {
  tax_enabled: boolean
  accommodation_tax_city: string
  accommodation_tax_model: string
  accommodation_tax_rate: string
  default_cleaning_fee: string
  tags: string[]
}

/** Simple city search/autocomplete component */
function CityCombobox({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (city: string, rule?: CityTaxRuleData) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return CITY_TAX_RULES
    const lower = search.toLowerCase()
    return CITY_TAX_RULES.filter((r) => r.city.toLowerCase().includes(lower))
  }, [search])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative">
      <div className="relative">
        <Input
          ref={inputRef}
          value={open ? search : value}
          onChange={(e) => {
            setSearch(e.target.value)
            if (!open) setOpen(true)
          }}
          onFocus={() => {
            setOpen(true)
            setSearch(value)
          }}
          placeholder={placeholder ?? 'Stadt suchen...'}
          className="h-8 text-sm pr-8"
        />
        <ChevronsUpDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      </div>
      {open && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full max-h-48 overflow-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {filtered.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              Keine Stadt gefunden. Du kannst den Namen manuell eingeben.
            </div>
          ) : (
            filtered.map((rule) => (
              <button
                key={rule.city}
                className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground ${
                  value === rule.city ? 'bg-accent' : ''
                }`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(rule.city, rule)
                  setOpen(false)
                  setSearch('')
                }}
              >
                <span className="font-medium">{rule.city}</span>
                <span className="text-muted-foreground ml-2 truncate">
                  {formatTaxRuleDescription(rule)}
                </span>
              </button>
            ))
          )}
          {search.trim() && !filtered.some((r) => r.city.toLowerCase() === search.toLowerCase().trim()) && (
            <button
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground border-t mt-1 pt-2"
              onMouseDown={(e) => {
                e.preventDefault()
                onChange(search.trim())
                setOpen(false)
                setSearch('')
              }}
            >
              &quot;{search.trim()}&quot; verwenden (manuell)
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([])
  const [cityRules, setCityRules] = useState<CityTaxRule[]>([])
  const [loading, setLoading] = useState(true)
  const [forms, setForms] = useState<Record<string, PropertyForm>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [tagInputs, setTagInputs] = useState<Record<string, string>>({})
  const [showTagInput, setShowTagInput] = useState<Record<string, boolean>>({})

  useEffect(() => {
    async function fetchData() {
      const [{ data: propData }, { data: rulesData }] = await Promise.all([
        supabase.from('properties').select('*').order('name'),
        supabase.from('city_tax_rules').select('*').order('city'),
      ])

      const props = (propData ?? []) as Property[]
      const rules = (rulesData ?? []) as CityTaxRule[]

      setProperties(props)
      setCityRules(rules)

      // Initialize forms from properties
      const initialForms: Record<string, PropertyForm> = {}
      for (const prop of props) {
        const hasTax = !!(prop.accommodation_tax_model || prop.accommodation_tax_rate)
        const matchingRule = rules.find(
          (r) => r.city === (prop.accommodation_tax_city ?? prop.city)
        )
        initialForms[prop.id] = {
          tax_enabled: hasTax,
          accommodation_tax_city: prop.accommodation_tax_city ?? prop.city ?? '',
          accommodation_tax_model: prop.accommodation_tax_model ?? matchingRule?.tax_model ?? '',
          accommodation_tax_rate: String(prop.accommodation_tax_rate ?? matchingRule?.tax_rate ?? ''),
          default_cleaning_fee: prop.default_cleaning_fee != null ? String(prop.default_cleaning_fee) : '',
          tags: prop.tags ?? [],
        }
      }
      setForms(initialForms)
      setLoading(false)
    }
    fetchData()
  }, [])

  // Build city→rule lookup (DB rules)
  const rulesByCity = useMemo(() => {
    const map = new Map<string, CityTaxRule>()
    cityRules.forEach((r) => map.set(r.city, r))
    return map
  }, [cityRules])

  function updateForm(propId: string, field: keyof PropertyForm, value: string | string[] | boolean) {
    setForms((prev) => ({
      ...prev,
      [propId]: { ...prev[propId], [field]: value },
    }))
  }

  function handleTaxToggle(propId: string, enabled: boolean) {
    const form = forms[propId]
    if (!form) return

    if (enabled) {
      // Try to auto-fill from static city rules based on property city
      const prop = properties.find((p) => p.id === propId)
      const cityName = prop?.city ?? ''
      const staticRule = findCityTaxRule(cityName)

      setForms((prev) => ({
        ...prev,
        [propId]: {
          ...prev[propId],
          tax_enabled: true,
          accommodation_tax_city: staticRule?.city ?? cityName,
          accommodation_tax_model: staticRule ? mapToDbTaxModel(staticRule.model) : '',
          accommodation_tax_rate: staticRule ? String(staticRule.rate) : '',
        },
      }))
    } else {
      setForms((prev) => ({
        ...prev,
        [propId]: {
          ...prev[propId],
          tax_enabled: false,
          accommodation_tax_city: '',
          accommodation_tax_model: '',
          accommodation_tax_rate: '',
        },
      }))
    }
  }

  function handleCitySelect(propId: string, city: string, staticRule?: CityTaxRuleData) {
    if (staticRule) {
      setForms((prev) => ({
        ...prev,
        [propId]: {
          ...prev[propId],
          accommodation_tax_city: city,
          accommodation_tax_model: mapToDbTaxModel(staticRule.model),
          accommodation_tax_rate: String(staticRule.rate),
        },
      }))
    } else {
      // Manual city entry – also check DB rules
      const dbRule = rulesByCity.get(city)
      if (dbRule) {
        setForms((prev) => ({
          ...prev,
          [propId]: {
            ...prev[propId],
            accommodation_tax_city: city,
            accommodation_tax_model: dbRule.tax_model,
            accommodation_tax_rate: String(dbRule.tax_rate),
          },
        }))
      } else {
        updateForm(propId, 'accommodation_tax_city', city)
      }
    }
  }

  async function saveProperty(propId: string) {
    const form = forms[propId]
    if (!form) return

    setSaving((prev) => ({ ...prev, [propId]: true }))
    try {
      const updates: Record<string, unknown> = {
        accommodation_tax_city: form.tax_enabled ? (form.accommodation_tax_city || null) : null,
        accommodation_tax_model: form.tax_enabled ? (form.accommodation_tax_model || null) : null,
        accommodation_tax_rate: form.tax_enabled && form.accommodation_tax_rate ? parseFloat(form.accommodation_tax_rate) : null,
        default_cleaning_fee: form.default_cleaning_fee ? parseFloat(form.default_cleaning_fee) : null,
        tags: form.tags.length > 0 ? form.tags : null,
        updated_at: new Date().toISOString(),
      }

      await supabase.from('properties').update(updates).eq('id', propId)

      // Update local state
      setProperties((prev) =>
        prev.map((p) =>
          p.id === propId
            ? {
                ...p,
                accommodation_tax_city: (updates.accommodation_tax_city as string) ?? null,
                accommodation_tax_model: (updates.accommodation_tax_model as string) ?? null,
                accommodation_tax_rate: (updates.accommodation_tax_rate as number) ?? null,
                tags: (updates.tags as string[]) ?? null,
              }
            : p
        )
      )
    } finally {
      setSaving((prev) => ({ ...prev, [propId]: false }))
    }
  }

  function addTag(propId: string) {
    const tag = (tagInputs[propId] ?? '').trim()
    if (!tag) return
    const form = forms[propId]
    if (!form) return
    const newTags = [...new Set([...form.tags, tag])]
    updateForm(propId, 'tags', newTags)
    setTagInputs((prev) => ({ ...prev, [propId]: '' }))
    setShowTagInput((prev) => ({ ...prev, [propId]: false }))
  }

  function removeTag(propId: string, tag: string) {
    const form = forms[propId]
    if (!form) return
    updateForm(propId, 'tags', form.tags.filter((t) => t !== tag))
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">Objekte</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <Skeleton key={j} className="h-8 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Objekte</h2>
        <p className="text-sm text-muted-foreground">{properties.length} Objekte aus Smoobu</p>
      </div>

      {properties.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Keine Objekte vorhanden. Bitte zuerst Smoobu-Sync ausführen.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {properties.map((prop) => {
            const form = forms[prop.id]
            if (!form) return null
            const staticRule = findCityTaxRule(form.accommodation_tax_city)

            return (
              <Card key={prop.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{prop.name}</CardTitle>
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3" />
                        {[prop.street, [prop.zip, prop.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || 'Keine Adresse'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {form.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                          <button
                            className="ml-1 hover:text-destructive"
                            onClick={() => removeTag(prop.id, tag)}
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </Badge>
                      ))}
                      {showTagInput[prop.id] ? (
                        <form
                          className="flex items-center gap-1"
                          onSubmit={(e) => {
                            e.preventDefault()
                            addTag(prop.id)
                          }}
                        >
                          <Input
                            autoFocus
                            className="h-6 w-24 text-xs"
                            value={tagInputs[prop.id] ?? ''}
                            onChange={(e) =>
                              setTagInputs((prev) => ({ ...prev, [prop.id]: e.target.value }))
                            }
                            placeholder="Tag..."
                            onBlur={() =>
                              setShowTagInput((prev) => ({ ...prev, [prop.id]: false }))
                            }
                          />
                        </form>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5"
                          onClick={() =>
                            setShowTagInput((prev) => ({ ...prev, [prop.id]: true }))
                          }
                        >
                          <Tag className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Steuereinstellungen */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium">Beherbergungssteuer</h4>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`tax-toggle-${prop.id}`} className="text-xs text-muted-foreground">
                          {form.tax_enabled ? 'Aktiv' : 'Keine'}
                        </Label>
                        <Switch
                          id={`tax-toggle-${prop.id}`}
                          checked={form.tax_enabled}
                          onCheckedChange={(checked) => handleTaxToggle(prop.id, checked)}
                        />
                      </div>
                    </div>

                    {form.tax_enabled && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5 col-span-2">
                            <Label className="text-xs">Stadt</Label>
                            <CityCombobox
                              value={form.accommodation_tax_city}
                              onChange={(city, rule) => handleCitySelect(prop.id, city, rule)}
                              placeholder={prop.city ?? 'Stadt suchen...'}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Berechnungsart</Label>
                            <Select
                              value={form.accommodation_tax_model}
                              onValueChange={(v) => updateForm(prop.id, 'accommodation_tax_model', v)}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Wählen..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="gross_percentage">Brutto %</SelectItem>
                                <SelectItem value="net_percentage">Netto %</SelectItem>
                                <SelectItem value="per_person_per_night">Pro Person/Nacht</SelectItem>
                                <SelectItem value="per_room_per_night">Pro Zimmer/Nacht</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">
                              Satz ({form.accommodation_tax_model?.includes('percentage') ? '%' : 'EUR'})
                            </Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={form.accommodation_tax_rate}
                              onChange={(e) => updateForm(prop.id, 'accommodation_tax_rate', e.target.value)}
                              className="h-8 text-sm"
                              placeholder="–"
                            />
                          </div>
                        </div>
                        {staticRule && (
                          <p className="text-xs text-muted-foreground">
                            {staticRule.city}: {formatTaxRuleDescription(staticRule)}
                            {staticRule.businessExempt && ' | Beruflich befreit'}
                            {staticRule.notes ? ` | ${staticRule.notes}` : ''}
                          </p>
                        )}
                      </div>
                    )}

                    {!form.tax_enabled && (
                      <p className="text-xs text-muted-foreground">
                        Keine Beherbergungssteuer für dieses Objekt. Schalte den Toggle ein, um Steuerregeln zu konfigurieren.
                      </p>
                    )}
                  </div>

                  <Separator />

                  {/* Reinigungsgebühr */}
                  <div>
                    <h4 className="text-sm font-medium mb-3">Preiseinstellungen</h4>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Standard-Reinigungsgebühr (EUR)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        value={form.default_cleaning_fee}
                        onChange={(e) => updateForm(prop.id, 'default_cleaning_fee', e.target.value)}
                        className="h-8 text-sm"
                        placeholder="z.B. 80"
                      />
                      <p className="text-xs text-muted-foreground">
                        Wird im Buchungs-Wizard automatisch vorausgefüllt.
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <Button
                    size="sm"
                    className="w-full"
                    disabled={saving[prop.id]}
                    onClick={() => saveProperty(prop.id)}
                  >
                    <Save className="mr-2 h-3 w-3" />
                    {saving[prop.id] ? 'Wird gespeichert...' : 'Speichern'}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
