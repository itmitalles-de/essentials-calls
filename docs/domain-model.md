# Domain-Modell

Quelle: `shared/src/types.ts`. Der Validator dazu: `shared/src/validator.ts`.

## Topology

```ts
interface Topology {
  id: string;
  name: string;
  description?: string;
  nodes: PbxNode[];
  edges: Edge[];
  memberships: Membership[];
}
```

Drei bewusste Trennungen:

- **Telefonie vs. Darstellung** — `position` und `label` betreffen nur den
  Editor, `properties` nur die Anlage.
- **Relationen vs. Eigenschaften** — Wer in einer Gruppe ist, steht in
  `memberships`, nicht in der Gruppe. So kann eine Extension in mehreren Gruppen
  sein, und die Rolle (`member`/`agent`) hängt an der Beziehung.
- **Zustand vs. Konfiguration** — Der Status ist ein eigenes Modell und wird nie
  persistiert.

## Node-Typen

```ts
type NodeType = 'extension' | 'ivr' | 'ringgroup' | 'queue' | 'voicemail'
              | 'trunk'      // reserviert, im PoC deaktiviert
              | 'external';  // reserviert, im PoC deaktiviert
```

Jeder Node hat `id`, `type`, `label`, optional `position` und `metadata`, sowie
ein typspezifisches `properties`-Objekt.

### extension

| Feld | Bedeutung |
|---|---|
| `number` | Interne Rufnummer, wird im Dialplan-Kontext `internal` angelegt |
| `sipUser` | Anmeldename des Geräts — **wird zum Namen des PJSIP-Endpoints** |
| `sipPassword` | Digest-Passwort |
| `callerIdName` | optional, sonst wird `label` verwendet |
| `voicemail` | `{ enabled, mailbox, pin?, email? }` |

`sipUser` ist nicht kosmetisch: Asterisk ordnet eine eingehende Registrierung
über den Endpoint-Namen zu. Deshalb muss er eindeutig sein — siehe
[asterisk-notes.md](asterisk-notes.md).

### ivr

| Feld | Bedeutung |
|---|---|
| `greeting` | Prompt-Name, z. B. `hello-world` oder `custom/willkommen` |
| `timeout` | Sekunden, die auf eine Eingabe gewartet wird |
| `invalidRetries` | Fehleingaben, bevor der `invalid`-Zweig greift |

Die Ziffernauswahl steht nicht hier, sondern in den Kanten.

### ringgroup

`strategy` (`ringall` | `roundrobin` | `leastrecent` | `fewestcalls` | `random`)
und `ringTimeout`. Nur `ringall` klingelt parallel; die übrigen werden als
sequentielle Kette angenähert.

### queue

`strategy` (wie oben plus `rrmemory`), `timeout` (Klingeldauer pro Agent),
`maxWaitTime` (Gesamtwartezeit), `joinEmpty`, `leaveWhenEmpty`.

### voicemail

Eigenständige Mailbox mit `mailbox`, `pin?`, `email?`, `attachAudio`. Für den
Normalfall reicht die in die Extension eingebettete Voicemail; dieser Node ist
für gemeinsame Mailboxen gedacht.

## Edges

```ts
type EdgeCondition =
  | { type: 'digit'; value: string }   // "0"-"9", "*", "#"
  | { type: 'timeout' }
  | { type: 'invalid' }
  | { type: 'unconditional' };
```

Eine Kante beschreibt, wohin ein Anruf weitergeht, und unter welcher Bedingung.
`digit` und `invalid` ergeben nur an einem IVR Sinn. Für Extension, RingGroup
und Queue ist genau **eine** ausgehende Kante erlaubt: der Fallback, wenn
niemand abnimmt.

### Erlaubte Übergänge

| von \ nach | extension | ivr | ringgroup | queue | voicemail |
|---|---|---|---|---|---|
| **extension** | – | ✅ | ✅ | ✅ | ✅ |
| **ivr** | ✅ | – | ✅ | ✅ | ✅ |
| **ringgroup** | ✅ | ✅ | – | ✅ | ✅ |
| **queue** | ✅ | ✅ | – | – | ✅ |
| **voicemail** | – | – | – | – | – |

Voicemail ist eine Sackgasse. `queue → queue` ist im PoC ausgeschlossen.
Selbstbezüge sind generell verboten.

## Memberships

```ts
interface Membership {
  id: string;
  groupId: string;   // RingGroup oder Queue
  memberId: string;  // Extension
  role: 'member' | 'agent';
  position?: number; // Reihenfolge bei geordneten Strategien
  paused?: boolean;
}
```

## Statusmodell

```ts
interface NodeStatus {
  nodeId: string;
  availability: 'online' | 'offline' | 'unknown';
  activity: 'idle' | 'ringing' | 'in_call' | 'busy';
  metrics?: { waitingCalls?: number; activeCalls?: number; talkTime?: number };
  callerId?: string;
  queuePosition?: number;
}
```

Wird nur über WebSocket verteilt, nie gespeichert.

## Validierungsregeln

`validateTopology()` läuft zuerst `validateTopologyShape()` — die API nimmt
beliebiges JSON entgegen, deshalb muss die Struktur bewiesen sein, bevor Regeln
auf Felder zugreifen.

### Struktur

`malformed-topology`, `malformed-node`, `malformed-edge`, `malformed-membership`
— fehlende oder falsch typisierte Pflichtfelder.

### Fehler (blockieren den Deploy)

| Code | Bedeutung |
|---|---|
| `duplicate-node-id` / `duplicate-edge-id` / `duplicate-membership-id` | ID mehrfach vergeben |
| `duplicate-membership` | Extension zweimal in derselben Gruppe |
| `disabled-node-type` | `trunk`/`external` im PoC nicht nutzbar |
| `invalid-extension-number` | Nummer fehlt oder enthält keine reinen Ziffern |
| `duplicate-extension-number` | zwei Extensions auf derselben Nummer |
| `missing-sip-user` / `duplicate-sip-user` | SIP-User fehlt oder kollidiert — wäre derselbe PJSIP-Endpoint |
| `missing-mailbox` / `duplicate-mailbox` | Voicemail ohne bzw. mit doppelter Mailbox |
| `ivr-missing-greeting` / `ivr-invalid-retries` | IVR unvollständig |
| `edge-unknown-source` / `edge-unknown-target` | Kante zeigt ins Leere |
| `self-loop` | Kante auf denselben Node |
| `invalid-transition` | Übergang laut Tabelle nicht erlaubt |
| `voicemail-outgoing-edge` | Voicemail hat keine Nachfolger |
| `invalid-digit-condition` | keine gültige Taste |
| `duplicate-digit-condition` | zwei Kanten auf derselben Taste |
| `duplicate-condition` | zwei `timeout`- bzw. `invalid`-Kanten am selben Node |
| `digit-condition-on-non-ivr` / `invalid-condition-on-non-ivr` | Bedingung passt nicht zum Node-Typ |
| `ambiguous-fallback` | Extension/RingGroup/Queue mit mehr als einer ausgehenden Kante |
| `group-without-members` | RingGroup/Queue ohne Mitglieder |
| `membership-invalid-group` / `membership-invalid-member` | Membership zeigt auf falschen Node-Typ |
| `infinite-cycle` | Zyklus ohne Exit-Bedingung |

### Warnungen (blockieren nicht)

| Code | Bedeutung |
|---|---|
| `missing-sip-password` | Gerät könnte sich nicht registrieren |
| `ivr-without-options` | IVR ohne Ziffernauswahl, nur Timeout erreichbar |
| `entrypoint-collision` | Nummer überschneidet sich mit den Test-Entry-Points ab 600 |
| `cycle-check-truncated` | Graph zu stark verflochten, Zyklusprüfung abgebrochen |

### Zyklusregel

Zyklen sind erlaubt, solange sie einen Ausgang haben — „IVR → Queue → (Timeout)
→ IVR" ist ein legitimer Wiederholungsmechanismus. Verlangt wird: **jeder**
Zyklus enthält mindestens eine Kante mit `timeout` oder `invalid`.

Die Prüfung zählt echte einfache Zyklen auf, statt sich auf Rückwärtskanten
einer Tiefensuche zu verlassen. Der Unterschied ist nicht theoretisch: Bei
`a→b→a` (mit Timeout) und `a→c→a` (ohne) findet eine Rückwärtskanten-Suche
je nach Reihenfolge nur den harmlosen Zyklus und meldet den kaputten nicht.
Ein Test in `shared/test/validator.test.ts` hält genau diesen Fall fest.

Gegen entartete Graphen bricht die Aufzählung nach 5000 Zyklen ab und meldet
`cycle-check-truncated`, statt den Request hängen zu lassen.
