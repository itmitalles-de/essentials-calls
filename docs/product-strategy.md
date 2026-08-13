# Essentials+ Calls – Produktstrategie

Stand: 2026-08-13  
Status: beschlossen, Umsetzung noch nicht produktionsreif  
Produktname: **Essentials+ Calls**  
Technischer Slug und Zielname des Repositorys: **`calls`**

## Entscheidung in einem Satz

Essentials+ Calls wird **keine weitere generische Cloud-Telefonanlage**, sondern
der verständliche, modular aktivierbare Telefonie-Baustein von Essentials+ für
kleine deutsche Betriebe: betreut eingeführt, providerunabhängig, offen
betrieben und eng mit den tatsächlichen Geschäftsabläufen des Kunden verbunden.

Der bisherige Name **Visual PBX** bezeichnet nur noch den technischen Prototyp,
aus dem Calls hervorgeht. Der visuelle Editor bleibt ein wichtiges Werkzeug,
ist aber weder der Produktname noch allein das Verkaufsargument.

## 1. Ausgangslage

Der vorhandene PoC beweist bereits die technisch riskanten Grundlagen:

- Callflows lassen sich als Graph modellieren und bearbeiten.
- Browser und Backend verwenden dieselbe Validierung.
- Aus der Topologie wird lesbare Asterisk-Konfiguration erzeugt.
- Asterisk wird kontrolliert über AMI neu geladen.
- Ansagen können aufgenommen oder hochgeladen werden.
- Endpunkt-, Gesprächs- und Queue-Status werden live angezeigt.

Er beweist noch **kein marktfähiges Telefonsystem**. Es fehlen insbesondere
Authentifizierung, sichere Secret-Verwaltung, Trunks und Rufnummern, externe
Rufziele, Öffnungszeiten und Feiertage, Versionshistorie, Rollback,
Mehrbenutzerbetrieb, Härtung, Backups und belastbare Betriebsprozesse.

### Belastbare Schlussfolgerung

Der PoC ist eine gute technische Keimzelle, aber ein schlechter fertiger
Produktzuschnitt. Eine reine Weiterentwicklung zu „PBX mit mehr Features“ würde
Calls direkt in einen reifen und preisaggressiven Markt stellen. Visuelle
Callflows, SIP-Trunks, Warteschlangen, Apps und Integrationen sind dort längst
Standard. Der Vorteil muss daher aus **Verständlichkeit, Integration,
Betreuung und sauberer Modularität** entstehen.

## 2. Zielgruppe und Kernproblem

### Primäre Zielgruppe

Lokale kleine Betriebe mit ungefähr 2 bis 30 regelmäßig telefonierenden
Personen, zunächst im bestehenden Netzwerk von IT mit alles:

- Handwerks- und Montagebetriebe
- Werkstätten und lokale Dienstleister
- kleine Händler und E-Commerce-Betriebe
- Praxen, Studios und Bürogemeinschaften ohne eigenes IT-Team
- Betriebe mit Büro, Mobiltelefonen und gegebenenfalls mehreren Standorten

Nicht die Anzahl der Mitarbeitenden ist das wichtigste Merkmal, sondern die
Situation: Telefonie ist geschäftskritisch, wird aber nebenbei verwaltet und
ist historisch gewachsen.

### Zu lösende Aufgaben

Der Kunde will nicht „eine PBX konfigurieren“. Er will:

1. dass Anrufe zuverlässig bei der richtigen Person landen,
2. dass Feierabend, Urlaub, Krankheit und Vertretung sauber funktionieren,
3. dass kein Auftrag verloren geht, nur weil gerade niemand abnimmt,
4. dass Änderungen verständlich und ohne Angst möglich sind,
5. dass vorhandene Rufnummern, Telefone und Anbieter möglichst weiterlaufen,
6. dass ein konkreter Ansprechpartner die Verantwortung für Einrichtung und
   Betrieb übernimmt.

### Produktversprechen

> **Ihre Geschäftsnummer funktioniert so, wie Ihr Betrieb tatsächlich arbeitet.**

Intern darf Calls technisch tief sein. Nach außen muss es die Sprache des
Betriebs sprechen: „Werkstatt“, „Büro“, „Notdienst“, „Vertretung“, „nach drei
Klingelversuchen“ statt „Dialplan Context“, „Endpoint“ und „GotoIfTime“.

## 3. Positionierung

### Was Calls ist

- ein Essentials+-Modul für Geschäftstelefonie und Anrufsteuerung,
- ein verständliches Administrations- und Automatisierungswerkzeug,
- ein betreuter Dienst mit offenem, nachvollziehbarem technischen Unterbau,
- ein Integrationspunkt zwischen Rufnummer, Mitarbeitenden und
  Geschäftsprozessen,
- providerunabhängig, soweit der eingesetzte SIP-Trunk sauber standardisiert ist.

### Was Calls ausdrücklich nicht ist

- kein eigener Telefonanbieter und kein Wiederverkauf von Gesprächsminuten als
  Kernmodell,
- keine vollständige Unified-Communications-Suite für Chat, Meetings und Video,
- kein Enterprise-Contact-Center,
- kein eigener Desktop- oder Mobile-Softphone-Client in Version 1,
- kein gemeinsam genutzter Multi-Tenant-Asterisk für alle Kunden,
- keine KI-Rezeptionistin zum Produktstart,
- keine standardmäßig aktivierte Gesprächsaufzeichnung.

### Differenzierung

Der visuelle Editor ist ein Bestandteil, aber kein Burggraben. Calls soll sich
über folgende Kombination unterscheiden:

1. **Vorlagen statt leere Leinwand**  
   Startpunkte für Handwerk, Büro, Werkstatt, Hotline und Bereitschaft.

2. **Geschäftssprache statt Telefoniejargon**  
   Ein Assistent fragt nach Öffnungszeiten, Vertretung und Eskalation und
   erzeugt daraus den Callflow.

3. **Sicher veröffentlichen**  
   Entwurf, Validierung, Vorschau, Simulation, nachvollziehbarer Diff,
   atomische Veröffentlichung und Ein-Klick-Rollback.

4. **Essentials+-Kontext**  
   Später können Kontakte, Kunden, Aufträge, Angebote, Termine und
   Zuständigkeiten aus anderen Essentials+-Modulen genutzt werden.

5. **Betreuter Open-Source-Betrieb**  
   Kein Blackbox-Lock-in. Konfigurationen, Datenexporte und Providerzugänge
   bleiben nachvollziehbar und übertragbar.

6. **Modularität ohne Menüfriedhof**  
   Kunden sehen in der täglichen Navigation nur aktivierte Module. Ein zentraler
   Modulkatalog zeigt zusätzlich nur kompatible Erweiterungen, die bewusst
   aktiviert werden können.

## 4. Name und Produktarchitektur

### Verbindliche Namensebenen

| Ebene | Name |
|---|---|
| Dachmarke | Essentials+ |
| Produkt im Admin-Center und gegenüber Kunden | Essentials+ Calls |
| Kurzname in der Oberfläche | Calls |
| Repository | `calls` |
| URL-/Service-Slug | `calls` |
| Historischer Prototypname | Visual PBX |

Das Pluszeichen gehört in die Marke, nicht in technische Bezeichner. Neue
interne Paketnamen sollen bei einer separaten mechanischen Migration unter
einem stabilen Namespace wie `@itmitalles/calls-*` liegen. Die bestehenden
`@visual-pbx/*`-Paketnamen dürfen bis dahin weiterbestehen, damit Rebranding und
technische Paketmigration nicht unnötig miteinander verknotet werden.

### Rolle im Essentials+-Admin-Center

Essentials+ stellt zentral bereit:

- Identität, Organisationen und Benutzer,
- Rollen und Berechtigungen,
- Modul-Entitlements und Aktivierung,
- gemeinsame Navigation und Designsystem,
- Abrechnungsreferenzen und Vertragsstatus,
- Audit-Grundlagen und zentrale Benachrichtigungen.

Calls verantwortet:

- Rufnummern und Providerprofile,
- Nebenstellen, Geräte und Erreichbarkeit,
- Callflows, Zeitregeln, Gruppen und Queues,
- Asterisk-Konfiguration und Laufzeitstatus,
- Anrufprotokolle, Ansagen und telefoniespezifische Integrationen.

Die Sichtbarkeit eines Moduls in der UI ist nur Komfort. Die tatsächliche
Berechtigung muss immer serverseitig über Entitlements und Rollen geprüft
werden.

## 5. Modulmodell

### Calls Core

Für jede aktive Calls-Installation erforderlich:

- Rufnummern und eingehendes Routing
- Nebenstellen und externe Ziele
- Öffnungszeiten, Feiertage und Ausnahmen
- Ringgruppen und einfache Warteschlangen
- IVR und Ansagen
- Mailbox und Voicemail-Benachrichtigung
- ausgehende Regeln und Anrufernummern
- Callflow-Entwürfe, Versionen, Veröffentlichung und Rollback
- Anrufliste und technischer Gesundheitsstatus
- Backup, Wiederherstellung und Audit-Protokoll

### Optionale Module

| Modul | Nutzen | Zeitpunkt |
|---|---|---|
| Calls Queues & Analytics | Wartezeiten, Abbrüche, Agentenstatus, Queue-Berichte | nach stabilen Piloten |
| Calls Integrations | Kontakte, CRM, Aufträge, Termine, Webhooks, Click-to-Call | nach Essentials+-SSO |
| Calls Recording & Transcription | Aufzeichnung, Transkription, Zusammenfassung, Aufbewahrung | spät, compliance-gated |
| Calls Multi-Site | mehrere Standorte, standortabhängige Regeln, Failover | nach Betriebsstandardisierung |
| Calls Advanced Routing | Bereitschaft, Prioritäten, dynamische Ziele, API-gesteuerte Regeln | bei nachgewiesenem Bedarf |

Fax, SMS, WhatsApp, eigene Softphones und KI-Agenten werden nicht vorsorglich in
den Kern gezogen. Sie bekommen erst ein Modul, wenn reale Kunden einen klaren
Anwendungsfall und Zahlungsbereitschaft zeigen.

## 6. Pilotfähiger Kernumfang

Ein echter Pilot darf erst starten, wenn folgende Funktionen belastbar vorhanden
sind:

1. Authentifizierung und Rollen mindestens für Administrator und Bearbeiter
2. verschlüsselte oder versiegelte Speicherung von Trunk- und SIP-Secrets
3. maskierte Secrets in API und Oberfläche
4. ein produktiv getestetes SIP-Trunk-Profil mit DID, ein- und ausgehend
5. Notruf- und Standortkonzept für ausgehende Telefonie
6. Öffnungszeiten, Feiertage und temporäre Ausnahmen
7. Ringgruppen, Queue-Grundfunktion, externe Weiterleitung und Mailbox
8. unveränderliche Revisionen, Diff, atomischer Deploy und Rollback
9. Audit-Protokoll für Konfigurationsänderungen
10. Anrufprotokolle und verständliche Gesundheitsanzeige
11. HTTPS, Netzwerksegmentierung, Rate-Limits und sichere Standardwerte
12. automatische, getestete Sicherung und dokumentierte Wiederherstellung
13. Upgrade von Asterisk 18 auf eine unterstützte LTS-Version
14. Betriebs-Runbook mit Update-, Störungs- und Wiederanlaufverfahren

### Bewusste Minimalvariante

Für die ersten zwei bis drei Kunden wird **pro Kunde beziehungsweise Standort
eine isolierte Calls-Laufzeit** betrieben. Der vorhandene dateibasierte Ansatz
kann dafür vorläufig bleiben, wenn atomare Writes, Sperre, Revisions-Snapshots
und Backups ergänzt werden. Eine gemeinsame Multi-Tenant-Datenbank und ein
zentraler Media-Cluster sind noch nicht nötig.

Damit bleibt der Blast Radius klein, Datenschutz und Fehlersuche werden
überschaubar und die Architektur wächst erst, wenn echte Nutzung sie erzwingt.

## 7. Bedienkonzept

### Startseite

Nicht der Graph ist die Startseite, sondern ein Betriebsüberblick:

- „Telefonie läuft“ oder konkrete Störung
- aktive Geschäftszeitenregel
- heutige Anrufe, verpasst, beantwortet, Mailbox
- aktuelle Weiterleitungen und Vertretungen
- letzte veröffentlichte Änderung mit Rückgängig-Option

### Einrichtung

Ein geführter Assistent fragt:

1. Welche Rufnummern gibt es?
2. Wer soll wann klingeln?
3. Was passiert, wenn niemand antwortet?
4. Was passiert außerhalb der Öffnungszeiten?
5. Gibt es Notdienst, Vertretung oder Urlaub?
6. Welche Ansage soll der Anrufer hören?

Daraus entsteht eine Vorlage, die anschließend visuell angepasst werden kann.

### Drei Ebenen statt zwei getrennte Produkte

- **Geführt:** Fragen, Vorlagen und klare Fachbegriffe
- **Visuell:** Callflow als Graph für normale Anpassungen
- **Erweitert:** Tabellen, technische Eigenschaften, Validierungsdetails und
  generierter Diff für Experten

Alle Ebenen bearbeiten dasselbe Modell. Es darf keine auseinanderlaufenden
„einfachen“ und „professionellen“ Konfigurationen geben.

### Sicheres Veröffentlichungsmodell

`Entwurf -> Validierung -> Simulation/Testanruf -> Diff -> Veröffentlichen ->
Überwachung -> optional Rollback`

Ein Speichern darf nie automatisch die laufende Telefonie verändern. Die UI
muss klar zwischen Entwurf und aktiver Version unterscheiden.

## 8. Technische Zielarchitektur

### Kurzfristig beibehalten

Die folgenden PoC-Entscheidungen sind sinnvoll und bleiben zunächst:

- gemeinsames Domainmodell und gemeinsamer Validator,
- lesbare generierte Asterisk-Dateien,
- expliziter Deploy mit AMI-Reload,
- Status getrennt von der persistierten Topologie,
- Browser-Konvertierung von Ansagen,
- Docker-basierte, reproduzierbare Laufzeit.

### Vor dem Pilot ändern

- Asterisk 18 durch Asterisk 22 LTS oder die dann aktuell unterstützte LTS-Serie
  ersetzen.
- Secrets aus der Topologie lösen und über eine eigene Secret-Schicht injizieren.
- Deploys mit Revisions-ID, Prüfsumme, atomischem Dateitausch und automatischem
  Fallback versehen.
- AMI-Ereignisse abonnieren statt den gesamten Status dauerhaft zu pollen.
- Providerprofile als Adapter modellieren, nicht als Sonderfälle im Dialplan.
- Telemetrie für Registrierung, Trunkstatus, Queue, Deploy und Fehler schaffen.
- Medien-, Konfigurations- und Auditdaten mit getrennten Aufbewahrungsregeln
  behandeln.

### Spätere Essentials+-Integration

```text
Essentials+ Control Plane
  Identität | Tenants | Rollen | Entitlements | Modulnavigation
                    |
                    v
Calls Control Plane
  Nummern | Flows | Revisionen | Audit | Providerprofile | CDR-Metadaten
                    |
          signierte Deployment-Bundles
                    v
Isolierte Calls Runtime je Kunde/Standort
  Asterisk | Runtime-Agent | lokale Secrets | Sounds | Health
                    |
                    v
                 SIP-Trunk
```

Die Runtime soll auch bei einem Ausfall des zentralen Admin-Centers weiter
telefonieren. Der Control Plane darf Änderungen verwalten, aber nicht zum
Single Point of Failure für laufende Gespräche werden.

## 9. Sicherheit, Datenschutz und rechtliche Produktgrenzen

### Nicht verhandelbare Regeln

- Keine direkte öffentliche Freigabe des aktuellen PoC.
- Keine Secrets in API-Antworten, Logs, Git oder Topologie-Exporten.
- Least-Privilege-Rollen und nachvollziehbare Änderungen.
- TLS für Administration und Providerverbindungen, soweit unterstützt.
- Standardmäßig minimale Aufbewahrung von Anrufmetadaten.
- Aufzeichnungen und Transkripte getrennt verschlüsseln und zeitlich begrenzen.
- Wiederherstellung regelmäßig testen, nicht nur Backups erzeugen.

### Gesprächsaufzeichnung

Recording und Transkription sind standardmäßig deaktiviert. Eine Aktivierung
braucht einen expliziten Zweck, eine dokumentierte Rechtsgrundlage, transparente
Hinweise beziehungsweise erforderliche Einwilligungen, definierte
Aufbewahrungsfristen und restriktive Zugriffe. Calls darf dies nicht als
harmlosen Schalter behandeln.

### Notrufe und ausgehende Telefonie

Sobald Calls ausgehende öffentliche Telefonie ermöglicht, müssen Standort,
Rufnummernübermittlung, Providerverantwortung und Erreichbarkeit von 110/112 vor
dem Go-live geklärt und getestet sein. Calls positioniert sich zunächst als
Software- und Betriebsdienst über einem regulierten SIP-Provider, nicht selbst
als öffentlicher Telekommunikationsanbieter.

Das ist eine Produkt- und Betriebsgrenze, keine abschließende Rechtsberatung.
Vor einem standardisierten öffentlichen Angebot ist eine fachkundige Prüfung
der konkreten Vertrags- und Anbieterrolle erforderlich.

## 10. Markteinführung

### Vertriebsmodell der ersten Phase

Kein öffentlicher Self-Service-Launch. Calls startet als **produktisierte
Dienstleistung** für bestehende oder gut erreichbare Kunden:

1. Telefonie-Check und Ist-Aufnahme
2. feste Einführung mit Rufnummern- und Ablaufmigration
3. Abnahme mit dokumentierten Testszenarien
4. monatlich betreuter Betrieb und Änderungen
5. Providervertrag möglichst direkt zwischen Kunde und SIP-Provider

So entsteht früh Umsatz, während reale Randfälle gesammelt werden. Ein
Self-Service-Produkt vor stabilen Betriebsprozessen würde vor allem einen
Supportautomaten mit eingebautem Feueralarm erzeugen.

### Erlöslogik

- einmalige Einrichtung und Migration,
- monatliche Grundgebühr pro Standort beziehungsweise Calls-Runtime,
- ergänzende Staffel nach aktiven Benutzern oder Nebenstellen,
- optionale Modulpreise,
- individuelle Integrationen als Projekt oder klar abgegrenztes Paket,
- Gesprächs- und Providertarife getrennt ausweisen.

Konkrete Listenpreise werden erst nach zwei bis drei Piloten festgelegt. Vorher
sind Supportaufwand, Providerstreuung, Hardwarebedarf und Änderungsfrequenz zu
unsicher.

### Geeignete Pilotkunden

- vorhandene Beziehung und kurze Entscheidungswege,
- maximal ein bis zwei Standorte,
- überschaubare Rufnummernstruktur,
- echte Schmerzen bei Erreichbarkeit oder Vertretung,
- Bereitschaft, Abläufe gemeinsam sauber zu dokumentieren,
- kein 24/7-Notrufbetrieb und kein hochreguliertes Contact-Center als erster Fall.

## 11. Roadmap und Entscheidungstore

### Phase 0: Identität und Fokus

- Produktname Essentials+ Calls durchgängig verwenden.
- Repository auf `calls` umbenennen.
- Strategie, Grenzen und Migrationsregeln dokumentieren.
- Visual PBX nur noch als historischen Prototypnamen führen.

**Exit:** Name und Zielbild sind im Repo eindeutig; keine Featurearbeit ohne
Bezug zum Pilotkern.

### Phase 1: Produktionsgrundlage

- Asterisk-LTS-Upgrade
- Authentifizierung, Rollen und Secrets
- Revisionen, Diff, atomischer Deploy und Rollback
- Trunk/DID, ausgehende Regeln und Providerprofil
- Öffnungszeiten, Feiertage, externe Ziele
- Audit, Backups, Restore und Health

**Exit:** Ein interner Teststand übersteht Deployfehler, Neustart, Trunkausfall
und Restore ohne manuelle Datenrettung.

### Phase 2: Betreute Piloten

- zwei bis drei Kunden
- zunächst ein bevorzugter Provider und ein kleiner Satz getesteter Telefone
- dokumentierte Migration und Abnahme
- Supportaufwand, Fehlerbilder und Änderungswünsche messen

**Exit:** Mindestens mehrere Wochen stabiler Betrieb, reproduzierbares
Onboarding und keine ungeklärten kritischen Betriebsrisiken.

### Phase 3: Essentials+-Einbindung

- gemeinsames Login und Organisationen
- serverseitige Entitlements
- gemeinsame Navigation und Modulverwaltung
- standardisierte Provisionierung einer isolierten Runtime
- zentrale Benachrichtigungen und Betriebsübersicht

**Exit:** Ein Calls-Modul kann für einen Tenant reproduzierbar aktiviert,
provisioniert, eingeschränkt und deaktiviert werden.

### Phase 4: Nachgewiesene Erweiterungen

Nur auf Basis von Pilotdaten:

- Integrationen und Click-to-Call
- Queue-Analytics
- Multi-Site und Failover
- Recording/Transcription mit Compliance-Workflow
- API-gesteuerte dynamische Callflows

## 12. Messgrößen

Nicht Vanity-Metriken wie Anzahl der Nodes zählen, sondern Betriebsnutzen:

- Zeit von Auftrag bis abgenommener Erreichbarkeit
- Anteil beantworteter, verpasster und erfolgreich weitergeleiteter Anrufe
- Zahl fehlgeschlagener Veröffentlichungen und benötigter Rollbacks
- Zeit zur Diagnose bei Störungen
- Supportminuten pro Kunde und Monat
- Anteil der Änderungen, die der Kunde ohne Eingriff durchführen kann
- Restore-Erfolgsquote und Alter des letzten getesteten Backups
- Anzahl kundenspezifischer Sonderfälle außerhalb des Produktmodells

Die letzte Kennzahl ist besonders wichtig: Wenn jede Installation eigene
Dialplan-Sonderlocken braucht, ist das Produkt noch keine Plattform, sondern ein
Beratungsprojekt mit hübscher Oberfläche.

## 13. Fakten, Schlussfolgerungen und Hypothesen

### Fakten

- Der vorhandene Code ist ein funktionsfähiger, gegen Asterisk 18 geprüfter PoC.
- Er besitzt keinen produktiven Trunk, keine Authentifizierung und keine sichere
  Mehrbenutzer- oder Secret-Architektur.
- Der Markt enthält bereits ausgereifte Cloud-PBX-, Callflow- und
  Queue-Produkte.
- Asterisk 18 hat das Supportende erreicht; eine unterstützte LTS-Version ist
  Voraussetzung für einen neuen Produktbetrieb.

### Belastbare Schlussfolgerungen

- „Visueller Callflow“ allein trägt keine eigenständige Positionierung.
- Ein betreuter, isolierter Start reduziert Risiko und liefert schneller echte
  Produktdaten als sofortiger Multi-Tenant-SaaS-Bau.
- Trunk und Gesprächstarif sollten zunächst beim spezialisierten Provider
  bleiben.
- Änderungsverlauf, Rollback und Restore sind für ein Telefonsystem wichtiger
  als frühe KI-Funktionen.

### Zu validierende Hypothesen

- Kleine Betriebe zahlen eher für zuverlässig abgebildete Abläufe und einen
  Ansprechpartner als für eine lange Featureliste.
- Vorlagen für Handwerk und lokale Dienstleister verkürzen Einrichtung und
  Support deutlich.
- Die Integration mit Essentials+-Kontakten, Aufträgen und Terminen wird später
  stärker differenzieren als reine Telefoniefunktionen.
- Ein bevorzugter Provider deckt genug frühe Kunden ab, ohne sofort eine breite
  Adaptermatrix zu benötigen.

### Validierung

- fünf strukturierte Gespräche mit potenziellen Kunden,
- zwei echte Pilotinstallationen,
- jede Supportinteraktion kategorisieren,
- nach vier bis acht Wochen prüfen, welche Module tatsächlich benutzt wurden,
- erst danach Preisstaffel und nächste Integrationen festlegen.

## 14. Repository-Migration

Die GitHub-Einstellung wird von `visual-pbx` auf **`calls`** geändert. Danach:

1. lokale Remotes auf `itmitalles-de/calls` umstellen,
2. CI, Deployments, Webhooks, Container-Registry und Secrets prüfen,
3. Dokumentationslinks und Badges aktualisieren,
4. erst in einem separaten mechanischen PR Paketnamen von `@visual-pbx/*` auf
   `@itmitalles/calls-*` umstellen,
5. Docker-Volumes, Persistenzpfade und bestehende Installationen nicht blind
   umbenennen; dafür eine explizite Datenmigration liefern,
6. GitHubs Weiterleitung vom alten Repository-Namen nicht als einzigen
   dauerhaften Migrationsmechanismus behandeln.

Produkt-Rebranding, Repository-Umbenennung und interne Daten-/Paketmigration
sind drei verschiedene Vorgänge. Sie werden bewusst getrennt, damit aus einem
Namenswechsel kein unnötiges Produktionsrisiko entsteht.
