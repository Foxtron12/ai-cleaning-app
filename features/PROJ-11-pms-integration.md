# PROJ-11: Self-Service PMS Integration

## Status: Planned
**Created:** 2026-03-05
**Last Updated:** 2026-03-05

## Dependencies
- PROJ-10 (User Authentication & Multi-Tenancy) – API-Keys werden pro Nutzer gespeichert
- PROJ-7 (Smoobu API-Integration) – bestehende Smoobu-Logik wird in dieses Framework integriert

## Beschreibung
Nutzer können ihre eigenen PMS-Anbindungen (Property Management Systeme) selbst konfigurieren.
Im MVP: Smoobu via API-Key + automatisch generierter Webhook-URL.
Apaleo und Mews werden als UI-Platzhalter vorbereitet (Datenmodell, Settings-Seite, "Coming Soon"-State).

Die Webhook-URL ist pro Nutzer eindeutig und nimmt Echtzeit-Events vom PMS entgegen,
um Buchungen direkt in Supabase zu synchronisieren – ohne manuellen Sync-Button.

## User Stories
- Als Nutzer möchte ich meinen Smoobu API-Key in den Einstellungen eintragen, damit die App automatisch meine Buchungen synchronisiert.
- Als Nutzer möchte ich eine eindeutige Webhook-URL erhalten, die ich bei Smoobu eintragen kann, damit neue Buchungen sofort in meinem Dashboard erscheinen.
- Als Nutzer möchte ich den Verbindungsstatus meiner PMS-Anbindung sehen (verbunden / Fehler / nicht konfiguriert).
- Als Nutzer möchte ich meine gespeicherten API-Keys einsehen und löschen können.
- Als Nutzer sehe ich in den Einstellungen, welche weiteren Integrationen (Apaleo, Mews) geplant sind, auch wenn sie noch nicht verfügbar sind.
- Als App, möchte ich bei eingehenden Webhook-Events die Authentizität prüfen und nur autorisierte Events verarbeiten.

## Acceptance Criteria

### Smoobu Integration (MVP)
- [ ] Einstellungs-Seite zeigt "Integrationen"-Bereich mit Kacheln pro PMS
- [ ] Smoobu-Kachel: Formular für API-Key eingeben (masked Input, Passwort-Feld)
- [ ] API-Key wird verschlüsselt in Supabase gespeichert (niemals im Klartext in Logs/UI)
- [ ] Nach Speichern: sofortiger Test-Call an Smoobu API – Status wird angezeigt ("Verbunden" / "Ungültiger Key")
- [ ] Webhook-URL wird automatisch generiert: `https://<domain>/api/webhooks/smoobu/<user_webhook_token>`
- [ ] Webhook-Token ist pro Nutzer einmalig, zufällig (UUID oder 32-char hex), in DB gespeichert
- [ ] Webhook-URL wird in der UI als kopierbarer Text angezeigt (Copy-Button)
- [ ] Webhook-Endpoint (`/api/webhooks/smoobu/[token]`) verarbeitet POST-Requests von Smoobu
- [ ] Eingehende Events: `new_reservation`, `modified_reservation`, `cancelled_reservation` werden in Supabase gespeichert/aktualisiert
- [ ] Unbekannte oder ungültige Tokens werden mit HTTP 401 abgewiesen
- [ ] Manueller "Jetzt synchronisieren"-Button bleibt weiterhin verfügbar (Pull-Sync)

### Apaleo & Mews (Vorbereitung)
- [ ] Datenmodell (`integrations`-Tabelle) ist erweiterbar für mehrere PMS-Typen (provider: 'smoobu' | 'apaleo' | 'mews')
- [ ] Apaleo- und Mews-Kacheln sind in der UI sichtbar mit "Demnächst verfügbar"-Badge
- [ ] Kein funktionierender Code für Apaleo/Mews – nur UI-Scaffold und Typ-Definitionen

### Sicherheit
- [ ] API-Keys werden vor dem Speichern serverseitig verschlüsselt (AES-256 oder Supabase Vault)
- [ ] API-Keys sind über RLS nur für den jeweiligen Nutzer lesbar
- [ ] Webhook-Token kann vom Nutzer neu generiert werden (invalidiert alten Token sofort)
- [ ] Rate Limiting auf dem Webhook-Endpoint (max. 100 Requests/min pro Token)

## Edge Cases
- Was passiert, wenn ein ungültiger Smoobu API-Key eingetragen wird? → Test-Call schlägt fehl, Fehlermeldung mit Hinweis auf Smoobu API-Key-Einstellungen
- Was passiert, wenn Smoobu einen Webhook sendet, den Token aber der Nutzer inzwischen erneuert hat? → Alter Token ist ungültig, 401-Antwort, Smoobu wird zukünftig neue URL benötigen
- Was passiert bei doppelten Webhook-Events (Smoobu sendet manchmal mehrfach)? → Idempotente Verarbeitung: anhand Buchungs-ID prüfen ob bereits vorhanden (UPSERT)
- Was passiert, wenn der Webhook-Endpoint nicht erreichbar ist (Deploy-Pause)? → Smoobu wiederholt Events; beim nächsten manuellen Sync werden fehlende Daten nachgeholt
- Was passiert, wenn ein Nutzer seinen API-Key löscht? → Sync stoppt, bestehende Buchungen in DB bleiben erhalten, Webhook-URL wird deaktiviert
- Was passiert, wenn Smoobu eine nicht bekannte Event-Struktur sendet? → Logging des unbekannten Events, keine DB-Änderung, kein Absturz (graceful ignore)
- Was passiert, wenn ein Angreifer die Webhook-URL errät? → Token ist 32-char zufällig (2^128 Entropie), praktisch nicht erratbar; zusätzlich Rate Limiting

## Technische Anforderungen
- Neue DB-Tabelle: `integrations` (id, user_id, provider, api_key_encrypted, webhook_token, status, last_synced_at, created_at)
- API-Key Verschlüsselung: Supabase Vault (pgcrypto) oder serverseitiges AES-256 via `crypto` Modul
- Webhook-Endpoint: `/api/webhooks/smoobu/[token]` – öffentlich zugänglich (kein Auth-Header nötig), aber Token-basiert abgesichert
- Erweiterbarkeit: Provider-Typ als Enum – neue PMS einfach ergänzbar
- UI: Einstellungs-Seite `/dashboard/einstellungen/integrationen` mit PMS-Kacheln

## Unterstützte PMS (Roadmap)
| PMS | Status | Auth-Methode | Webhook-Support |
|-----|--------|--------------|-----------------|
| Smoobu | MVP | API-Key | Ja (JSON POST) |
| Apaleo | Geplant | OAuth 2.0 | Ja (Event Subscriptions) |
| Mews | Geplant | API-Token | Ja (Webhooks) |

---

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
