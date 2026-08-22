import { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, Headphones, LockKeyhole, Network, ShieldAlert } from 'lucide-react';
import { ExtensionNode } from '@visual-pbx/shared';
import { SipClientEndpoint } from '../api/client';
import { isApprovedSoftphoneUrl, SOFTPHONE_DOWNLOADS } from '../softphones';

const approvedDownloads = SOFTPHONE_DOWNLOADS.filter((softphone) => isApprovedSoftphoneUrl(softphone.url));

export function SoftphonesView({
  extensions,
  endpoint,
  onOpenExtension,
}: {
  extensions: ExtensionNode[];
  endpoint: SipClientEndpoint;
  onOpenExtension: (nodeId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(extensions[0]?.id ?? '');
  useEffect(() => {
    if (!extensions.some((extension) => extension.id === selectedId)) setSelectedId(extensions[0]?.id ?? '');
  }, [extensions, selectedId]);
  const selected = useMemo(() => extensions.find((extension) => extension.id === selectedId), [extensions, selectedId]);

  return (
    <div className="sb-page softphones-page">
      <header className="sb-page-header">
        <div>
          <p className="sb-eyebrow">Lokale Testgeräte</p>
          <h1 className="sb-title">Geräte &amp; Softphones</h1>
          <p className="sb-subtitle">Offizielle SIP-Clients herunterladen und eine vorhandene Extension für die isolierte Test-Runtime einrichten.</p>
        </div>
        <Headphones className="page-symbol" aria-hidden="true" />
      </header>

      <aside className="boundary-callout" role="note">
        <ShieldAlert className="sb-icon" aria-hidden="true" />
        <span><strong>Technischer PoC:</strong> keine produktive PBX, kein realer Trunk oder DID und keine Notruffunktion. Die Standard-Runtime ist ausschließlich an Loopback gebunden.</span>
      </aside>

      <section className="content-section" aria-labelledby="softphone-downloads-title">
        <div className="section-heading">
          <div>
            <p className="sb-eyebrow">Schritt 1</p>
            <h2 id="softphone-downloads-title">Softphone herunterladen</h2>
          </div>
          <p>Simple Calls spiegelt keine Installationsdateien. Jeder Link öffnet ausschließlich die offizielle Anbieter-Seite.</p>
        </div>
        <div className="softphone-grid">
          {approvedDownloads.map((softphone, index) => (
            <article className="softphone-card" key={softphone.id}>
              <div className="softphone-card-heading">
                <span className="softphone-symbol" aria-hidden="true"><Download className="sb-icon" /></span>
                <div><h3>{softphone.name}</h3><p>{softphone.platforms}</p></div>
              </div>
              <p>{softphone.description}</p>
              <p className="softphone-licence">{softphone.licence}</p>
              <a
                className={`sb-button${index === 0 ? ' sb-button-primary' : ''}`}
                href={softphone.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${softphone.name} – offizielle Download-Seite öffnen`}
              >
                <ExternalLink className="sb-icon" aria-hidden="true" />
                Offizielle Download-Seite
              </a>
            </article>
          ))}
        </div>
        <p className="third-party-note">Drittanbieter können eigene Funktionen wie Recording, Transkription oder KI anbieten. Diese gehören nicht zu Simple Calls und sind für diesen PoC nicht freigegeben.</p>
      </section>

      <section className="content-section" aria-labelledby="sip-setup-title">
        <div className="section-heading">
          <div>
            <p className="sb-eyebrow">Schritt 2</p>
            <h2 id="sip-setup-title">SIP-Konto einrichten</h2>
          </div>
          <p>Nur nicht-geheime Parameter werden angezeigt. Ein SIP-Secret kann vom Backend nicht wieder ausgelesen werden.</p>
        </div>

        {extensions.length === 0 ? (
          <div className="empty-state">
            <Network className="page-symbol" aria-hidden="true" />
            <h3>Noch keine Extension vorhanden</h3>
            <p>Lege im Callflow zuerst eine Extension an und speichere die Revision.</p>
            <button className="sb-button sb-button-primary" type="button" onClick={() => onOpenExtension('')}>Callflow öffnen</button>
          </div>
        ) : (
          <div className="provisioning-layout">
            <div className="provisioning-controls">
              <label htmlFor="softphone-extension">Extension</label>
              <select className="sb-select" id="softphone-extension" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
                {extensions.map((extension) => <option key={extension.id} value={extension.id}>{extension.label} · {extension.properties.number}</option>)}
              </select>
              {selected && <button className="sb-button" type="button" onClick={() => onOpenExtension(selected.id)}>Extension im Callflow öffnen</button>}
            </div>

            <dl className="provisioning-values" aria-label="SIP-Einrichtungsdaten">
              <div><dt>Registrar / Server</dt><dd><code>{endpoint.host}</code></dd></div>
              <div><dt>SIP-Port</dt><dd><code>{endpoint.port}</code></dd></div>
              <div><dt>Transport</dt><dd><code>{endpoint.transport.toUpperCase()}</code></dd></div>
              <div><dt>Benutzername</dt><dd><code>{selected?.properties.sipUser ?? '—'}</code></dd></div>
              <div><dt>Rufnummer</dt><dd><code>{selected?.properties.number ?? '—'}</code></dd></div>
              <div><dt>SIP-Secret</dt><dd className={selected?.properties.sipSecret?.configured ? 'configured' : 'not-configured'}>{selected?.properties.sipSecret?.configured ? 'Konfiguriert, wird nicht angezeigt' : 'Noch nicht konfiguriert'}</dd></div>
            </dl>
          </div>
        )}

        <div className="security-notes">
          <p><LockKeyhole className="sb-icon" aria-hidden="true" /><span><strong>Kein Secret-Download:</strong> Passwörter erscheinen weder in Konfigurationsdateien noch in QR-Codes, URLs oder Browser-Speicher.</span></p>
          <p><Network className="sb-icon" aria-hidden="true" /><span><strong>Loopback-Grenze:</strong> <code>{endpoint.host}:{endpoint.port}</code> funktioniert nur auf dem Runtime-Host. Andere Geräte benötigen erst ein ausdrücklich freigegebenes Netz-/Firewall-/NAT-Konzept.</span></p>
        </div>
      </section>
    </div>
  );
}
