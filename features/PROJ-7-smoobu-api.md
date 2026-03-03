# PROJ-7: Smoobu API-Integration

## Status: Planned
**Created:** 2026-03-03
**Last Updated:** 2026-03-03

## Dependencies
- Requires: PROJ-1 (Dashboard-Übersicht) - Bestehende Dashboard-Struktur
- Requires: PROJ-2 (Buchungsmanagement) - Buchungsdaten-Modell (identisch zur API-Struktur)
- Requires: PROJ-3 (Financial Reporting) - Reporting muss Live-Daten unterstützen

## Beschreibung
Anbindung der Smoobu API um alle Buchungs- und Gastdaten live zu synchronisieren. Ersetzt die Demo-Daten durch echte Daten aus Smoobu. Implementiert Webhook-Empfang für Echtzeit-Updates und regelmäßiges Polling als Fallback.

## Smoobu API-Fakten (recherchiert)
- **Auth:** API Key im Header `Api-Key: {key}`
- **Base URL:** `https://login.smoobu.com/api/`
- **Rate Limit:** ~60 Requests/Minute
- **Kein Sandbox:** Testing gegen Live-Account
- **Webhooks:** Neue Buchung, Änderung, Stornierung (KEIN separates Check-in/Check-out-Event)
- **Verfügbare Daten:** Apartments, Reservations (inkl. Gastdaten, Finanzdaten, Kanal), Rates, Availability, Messages

## Verfügbare Gastdaten aus API
- firstname, lastname, email, phone
- address, city, zip, country, nationality
- adults, children, notice/guestNote

## Verfügbare Finanzdaten aus API
- price (Brutto), pricePerNight
- commission (kanalabhängig)
- cleaningFee, extraFees, deposit
- currency
- prepayment, balance
- hostPayout (kanalabhängig)

**Wichtig:** Airbnb liefert Host-Payout, aber keine explizite Provisionsrate. Booking.com liefert evtl. nur Bruttobetrag ohne Provision. Provisionen müssen teilweise berechnet werden.

## User Stories
- Als Vermieter möchte ich meinen Smoobu API-Key einmalig eingeben, damit das Dashboard live mit Smoobu synchronisiert.
- Als Vermieter möchte ich, dass neue Buchungen aus Smoobu automatisch im Dashboard erscheinen, ohne dass ich etwas tun muss.
- Als Vermieter möchte ich sehen, wann zuletzt synchronisiert wurde, damit ich weiß ob die Daten aktuell sind.
- Als Vermieter möchte ich eine manuelle "Jetzt synchronisieren"-Funktion, falls etwas nicht automatisch aktualisiert wurde.
- Als Vermieter möchte ich, dass alle historischen Buchungen beim ersten Setup importiert werden.

## Acceptance Criteria
- [ ] Settings-Seite für API-Key-Eingabe (verschlüsselt gespeichert in Supabase, nie im Frontend exponiert)
- [ ] Test-Verbindung-Button: validiert API-Key und zeigt Anzahl der Properties
- [ ] Initial-Import: alle Buchungen der letzten 12 Monate werden beim ersten Setup importiert
- [ ] Webhook-Endpoint unter `/api/webhooks/smoobu` empfängt neue Buchungen
- [ ] Polling-Fallback: alle 15 Minuten auf neue Buchungen prüfen (via Cron oder Supabase Edge Function)
- [ ] Synchronisierungs-Status in der UI: "Zuletzt synchronisiert: vor 2 Minuten"
- [ ] Manueller Sync-Button
- [ ] Fehlerbehandlung: wenn API nicht erreichbar → Fehler in UI anzeigen, letzte gespeicherte Daten nutzen
- [ ] Rate-Limit-Handling: max. 50 Requests/Minute, bei 429 → exponentielles Backoff
- [ ] Buchungsdaten werden in Supabase gespeichert (offline-fähig)

## Daten-Mapping (Smoobu → App-Datenmodell)
```
Smoobu Reservation → App Booking
  - id → booking_id (external_id)
  - channel.name → channel
  - firstname + lastname → guest_name
  - arrivalDate → check_in
  - departureDate → check_out
  - adults + children → adults, children
  - price → amount_gross
  - hostPayout oder price - commission → amount_net
  - commission → commission_amount
  - cleaningFee → cleaning_fee
  - email → guest_email
  - phone → guest_phone
  - address + city + zip + country → guest_address
  - nationality → guest_nationality
```

## Edge Cases
- API-Key ungültig oder abgelaufen: klare Fehlermeldung, Aufforderung zum Update
- Smoobu API nicht erreichbar: Dashboard zeigt gecachte Daten mit Timestamp
- Buchung in Smoobu geändert: bestehende Buchung in DB aktualisieren (nicht duplizieren)
- Buchung in Smoobu storniert: Status auf "storniert" setzen, nicht löschen
- Doppelte Buchungen bei Initial-Import + Webhooks: Deduplication via booking_id
- Rate-Limit erreicht: Queue für Requests implementieren

---

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
