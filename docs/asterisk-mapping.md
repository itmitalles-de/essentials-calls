# Abbildung auf Asterisk

Quelle: `backend/src/asterisk/configGenerator.ts`.

## Erzeugte Dateien

| Datei | Inhalt | eingebunden aus |
|---|---|---|
| `pjsip_generated.conf` | AOR, Auth und Endpoint je Extension | `pjsip.conf` |
| `extensions_generated.conf` | Kontexte `internal`, `entrypoints`, `callflow`, `ivr_*` | `extensions.conf` |
| `queues_generated.conf` | Queues samt Mitgliedern | `queues.conf` |
| `voicemail_generated.conf` | Mailboxen | `voicemail.conf`, innerhalb `[default]` |

Alle vier werden per `#include` gezogen. Die statischen Basisdateien im Image
enthalten das, was der Generator nicht anfasst (Transport, Codecs, Logger).

## Namensgebung

| Objekt | Name | Beispiel |
|---|---|---|
| PJSIP-Endpoint/AOR/Auth | **SIP-User**, bereinigt | `101` |
| Callflow-Sprungziel | `node_` + Node-ID, bereinigt | `node_ivr_welcome` |
| IVR-Kontext | `ivr_` + Node-ID | `ivr_ivr_welcome` |
| Queue | Node-ID, bereinigt | `q_sales` |

Bereinigt heißt: alles außer `A-Za-z0-9_` wird zu `_`.

Dass Endpoints nach dem **SIP-User** heißen und nicht nach der Node-ID, ist
keine Stilfrage — Asterisk gleicht eingehende Registrierungen gegen den
Endpoint-Namen ab. Details in [asterisk-notes.md](asterisk-notes.md).

## Dialplan-Struktur

```
[internal]      ← Kontext der Endpoints: interne Rufnummern, bindet entrypoints ein
[entrypoints]   ← Testnummern 600, 601, … je ein Node
[callflow]      ← eine Extension je Node, Sprungziel aller Kanten
[ivr_<id>]      ← je IVR ein eigener Kontext mit Ziffern-, t- und i-Extension
```

Der Callflow-Kontext ist der Kern: Jeder Node bekommt dort eine Extension, und
jede Kante wird zu einem `Goto` dorthin. Dadurch bleibt der generierte Dialplan
eine direkte Übersetzung des Graphen.

Auszug aus dem laufenden System:

```
[internal]
include => entrypoints
exten => 101,1,NoOp(Calling Alice)
 same => n,Dial(PJSIP/101,20)
 same => n,VoiceMail(101@default,u)
 same => n,Hangup()

[entrypoints]
exten => 600,1,Goto(callflow,node_ext_101,1)  ; extension "Alice"
exten => 603,1,Goto(callflow,node_ivr_welcome,1)  ; ivr "Willkommens-IVR"

[callflow]
exten => node_ivr_welcome,1,NoOp(Enter IVR Willkommens-IVR)
 same => n,Goto(ivr_ivr_welcome,s,1)
```

## Node-Typ → Dialplan

### extension

```
exten => node_<id>,1,NoOp(Route to extension <label>)
 same => n,Dial(PJSIP/<sipUser>,20)
 same => n,<Fallback-Goto oder VoiceMail>
 same => n,Hangup()
```

Ohne Fallback-Kante, aber mit aktiver Voicemail, landet der Anruf in der
Mailbox. Ohne beides wird aufgelegt.

### ivr

Ein eigener Kontext:

```
[ivr_<id>]
exten => s,1,NoOp(IVR <label>)
 same => n,Set(RETRY_<id>=0)
 same => n(menu),Background(<greeting>)
 same => n,WaitExten(<timeout>)
exten => 1,1,Goto(callflow,node_<ziel>,1)      ← je digit-Kante
exten => t,1,NoOp(IVR timeout)
 same => n,Goto(callflow,node_<ziel>,1)        ← timeout-Kante, sonst Hangup
exten => i,1,Set(RETRY_<id>=$[0${RETRY_<id>} + 1])
 same => n,Playback(invalid)
 same => n,GotoIf($[0${RETRY_<id>} >= <retries>]?<invalid-Ziel oder giveup>)
 same => n,Goto(ivr_<id>,s,menu)
exten => giveup,1,Hangup()
```

Zwei Feinheiten, die beide aus echten Fehlern stammen: Der Zähler wird beim
Eintritt gesetzt, und der erneute Prompt springt auf das Label `menu` statt auf
Priorität 1 — sonst würde der Zähler bei jeder Fehleingabe zurückgesetzt und die
Schleife liefe endlos. Das `0`-Präfix im Ausdruck hält die Arithmetik auch dann
gültig, wenn die Variable nicht gesetzt ist.

### ringgroup

`ringall` klingelt parallel:

```
 same => n,Dial(PJSIP/101&PJSIP/102,<ringTimeout>)
```

Alle anderen Strategien werden als sequentielle Kette in Membership-Reihenfolge
angenähert, weil `Dial()` keine Reihenfolge kennt:

```
 same => n,Dial(PJSIP/101,<ringTimeout>)
 same => n,Dial(PJSIP/102,<ringTimeout>)
```

Das ist eine Näherung, keine echte Umsetzung: Über mehrere Anrufe hinweg gibt es
kein Gedächtnis, echtes Round-Robin bräuchte `app_queue`. Der Validator lehnt
mitgliederlose Gruppen ab; der Generator gibt in dem Fall trotzdem ein `NoOp`
statt eines kaputten `Dial()` aus.

### queue

```
exten => node_<id>,1,NoOp(Queue <label>)
 same => n,Queue(<id>,,,,<maxWaitTime>)
```

Das fünfte Argument ist die Gesamtwartezeit. Das `timeout` in `queues.conf` ist
nur die Klingeldauer pro Agent — beides zu verwechseln ist ein klassischer
Fehler.

In `queues.conf`:

```
[<id>]
musiconhold=default
strategy=<strategy>      ; roundrobin wird zu rrmemory übersetzt
timeout=<timeout>
maxlen=0
joinempty=<joinEmpty>
leavewhenempty=<leaveWhenEmpty>
member => PJSIP/<sipUser>,0,<label>
```

### voicemail

```
exten => node_<id>,1,NoOp(Voicemail <label>)
 same => n,VoiceMail(<mailbox>@default,u)
 same => n,Hangup()
```

## Test-Entry-Points

Ohne Trunk gäbe es keinen Weg, einen Callflow anzurufen. Der Generator legt
deshalb ab `600` je Node eine Nummer an, in Reihenfolge der Node-Liste, und
bindet den Kontext in `internal` ein. Die Zuordnung steht als Kommentar in der
generierten Datei:

```bash
docker compose exec asterisk asterisk -rx "dialplan show entrypoints"
```

Eine Extension mit einer Nummer aus diesem Bereich verdeckt den Entry-Point —
der Validator warnt mit `entrypoint-collision`.

## Reload

Nach dem Schreiben führt das Backend über AMI aus:

```
dialplan reload
pjsip reload
queue reload all
voicemail reload
```

Schlägt der Reload fehl, meldet die API `deployed: false` mit `reloadError`, aber
`configsWritten: true` — die Dateien liegen dann korrekt vor und werden beim
nächsten Asterisk-Start gelesen.
