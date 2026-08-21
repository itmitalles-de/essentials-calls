import { ReactNode, RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAccessibleLabel } from '@itmitalles-de/simple-business-design-system';
import {
  Headphones,
  History,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  PhoneCall,
  Search,
  Settings,
  Users,
  Waypoints,
  X,
} from 'lucide-react';
import { ThemePreference, ResolvedTheme } from '../theme';
import { ThemeSelector } from './ThemeSelector';

export type AppSection = 'callflow' | 'revisions' | 'softphones' | 'users';

interface NavItem {
  id: AppSection;
  label: string;
  Icon: typeof Waypoints;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'callflow', label: 'Callflow', Icon: Waypoints },
  { id: 'revisions', label: 'Revisionen', Icon: History },
  { id: 'softphones', label: 'Geräte & Softphones', Icon: Headphones },
  { id: 'users', label: 'Benutzer', Icon: Users, adminOnly: true },
];

const SIDEBAR_STORAGE_KEY = 'simple-calls:sidebar';

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => !element.hasAttribute('hidden') && element.getClientRects().length > 0);
}

function useFocusTrap(
  active: boolean,
  container: RefObject<HTMLElement>,
  onClose: () => void,
  initialFocus?: RefObject<HTMLElement>
) {
  useEffect(() => {
    if (!active || !container.current) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const target = initialFocus?.current ?? focusableElements(container.current)[0];
    target?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !container.current) return;
      const items = focusableElements(container.current);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [active, container, initialFocus, onClose]);
}

function initials(username: string): string {
  return username
    .split(/[._\-\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'SC';
}

export function SimpleAppShell({
  section,
  onSectionChange,
  username,
  role,
  isAdmin,
  theme,
  onLogout,
  children,
}: {
  section: AppSection;
  onSectionChange: (section: AppSection) => void;
  username: string;
  role: string;
  isAdmin: boolean;
  theme: {
    preference: ThemePreference;
    resolved: ResolvedTheme;
    setPreference: (preference: ThemePreference) => void;
  };
  onLogout: () => Promise<void>;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'collapsed';
    } catch {
      return false;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<'appearance' | 'boundary'>('appearance');
  const [query, setQuery] = useState('');
  const sidebarRef = useRef<HTMLElement>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useRef<HTMLElement>(null);
  const settingsCloseRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  useFocusTrap(drawerOpen, sidebarRef, closeDrawer, mobileCloseRef);
  useFocusTrap(settingsOpen, settingsRef, closeSettings, settingsCloseRef);

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('de');
    return NAV_ITEMS.filter((item) => (!item.adminOnly || isAdmin) && (!normalized || item.label.toLocaleLowerCase('de').includes(normalized)));
  }, [isAdmin, query]);
  const currentLabel = NAV_ITEMS.find((item) => item.id === section)?.label ?? 'Callflow';

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? 'collapsed' : 'expanded');
    } catch {
      // The shell still works when browser storage is unavailable.
    }
  };

  const focusSearch = () => {
    if (collapsed) setCollapsed(false);
    window.setTimeout(() => searchRef.current?.focus(), 0);
  };

  const chooseSection = (next: AppSection) => {
    onSectionChange(next);
    closeDrawer();
  };

  return (
    <div className="sb-root simple-calls-root" data-sb-theme={theme.resolved} data-sb-concept="3">
      <div className="sb-shell simple-calls-shell" data-sidebar={collapsed ? 'collapsed' : 'expanded'} data-drawer={drawerOpen ? 'open' : 'closed'}>
        <aside className="sb-sidebar" aria-label="Hauptnavigation" ref={sidebarRef}>
          <div className="sb-brand-row">
            <button className="sb-product-identity product-identity-button" type="button" onClick={() => chooseSection('callflow')} aria-label="Simple Calls – Callflow öffnen">
              <span className="sb-product-symbol" aria-hidden="true">C</span>
              <span className="sb-product-copy">
                <span className="sb-wordmark">simple</span>
                <span className="sb-product-name">Calls</span>
              </span>
            </button>
            <button
              className="sb-icon-button sb-panel-button sidebar-desktop-toggle"
              type="button"
              onClick={toggleCollapsed}
              aria-label={getAccessibleLabel(collapsed ? 'sidebar.expand' : 'sidebar.collapse', 'de')}
              title={getAccessibleLabel(collapsed ? 'sidebar.expand' : 'sidebar.collapse', 'de')}
            >
              {collapsed ? <PanelLeftOpen className="sb-icon" aria-hidden="true" /> : <PanelLeftClose className="sb-icon" aria-hidden="true" />}
            </button>
            <button
              className="sb-icon-button sb-panel-button sidebar-mobile-close"
              type="button"
              onClick={closeDrawer}
              ref={mobileCloseRef}
              aria-label={getAccessibleLabel('navigation.close', 'de')}
              title={getAccessibleLabel('navigation.close', 'de')}
            >
              <PanelLeftClose className="sb-icon" aria-hidden="true" />
            </button>
            <button className="sb-icon-button sb-search-action" type="button" onClick={focusSearch} aria-label="Navigation durchsuchen" title="Navigation durchsuchen">
              <Search className="sb-icon" aria-hidden="true" />
            </button>
          </div>

          <div className="sb-product-switcher product-switcher-static" aria-label="Aktives Produkt">
            <span>Simple Business · Calls</span>
            <PhoneCall className="sb-icon" aria-hidden="true" />
          </div>

          <div className="sidebar-search-wrap">
            <label>
              <span className="sb-visually-hidden">Navigation filtern</span>
              <input
                className="sb-field sidebar-search"
                ref={searchRef}
                type="search"
                placeholder="Navigation suchen"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>

          <div className="sb-sidebar-scroll">
            <p className="sb-section-label">Arbeitsbereich</p>
            <nav className="sb-navigation" aria-label="Primär">
              {visibleItems.map(({ id, label, Icon }) => (
                <button
                  className="sb-nav-link"
                  type="button"
                  key={id}
                  aria-current={section === id ? 'page' : undefined}
                  aria-label={label}
                  title={collapsed ? label : undefined}
                  onClick={() => chooseSection(id)}
                >
                  <Icon className="sb-icon" aria-hidden="true" />
                  <span className="sb-nav-label">{label}</span>
                </button>
              ))}
              {visibleItems.length === 0 && <p className="sidebar-empty">Keine Navigation gefunden.</p>}
            </nav>

            <p className="sb-section-label">Produkt</p>
            <nav className="sb-navigation" aria-label="Sekundär">
              <button className="sb-nav-link" type="button" onClick={() => setSettingsOpen(true)} aria-label="Einstellungen" title={collapsed ? 'Einstellungen' : undefined}>
                <Settings className="sb-icon" aria-hidden="true" />
                <span className="sb-nav-label">Einstellungen</span>
              </button>
            </nav>
          </div>

          <div className="sb-account-area">
            <div className="sb-account">
              <span className="sb-avatar" aria-hidden="true">{initials(username)}</span>
              <span className="sb-account-copy">Angemeldet als {username}<br /><small>{role}</small></span>
              <button className="sb-icon-button account-logout" type="button" onClick={() => void onLogout()} aria-label="Abmelden" title="Abmelden">
                <LogOut className="sb-icon" aria-hidden="true" />
              </button>
            </div>
          </div>
        </aside>

        <button className="sb-drawer-scrim" type="button" onClick={closeDrawer} aria-label="Navigation schließen" />

        <main className="sb-main simple-calls-main">
          <div className="sb-context-bar sb-mobile-context">
            <button
              className="sb-icon-button sb-panel-button"
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label={getAccessibleLabel('navigation.open', 'de')}
              title={getAccessibleLabel('navigation.open', 'de')}
            >
              <PanelLeftOpen className="sb-icon" aria-hidden="true" />
            </button>
            <strong>{currentLabel}</strong>
            <button className="sb-icon-button" type="button" onClick={() => setSettingsOpen(true)} aria-label="Einstellungen" title="Einstellungen">
              <Settings className="sb-icon" aria-hidden="true" />
            </button>
          </div>
          {children}
        </main>
      </div>

      {settingsOpen && (
        <div className="sb-settings-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeSettings(); }}>
          <section className="sb-settings" role="dialog" aria-modal="true" aria-labelledby="settings-title" ref={settingsRef}>
            <aside className="sb-settings-nav" aria-label="Einstellungskategorien">
              <label>
                <span className="sb-visually-hidden">Einstellungen durchsuchen</span>
                <input className="sb-field sb-settings-search" type="search" placeholder="Suchen" />
              </label>
              <p className="sb-section-label">Einstellungen</p>
              <nav className="sb-navigation">
                <button className="sb-nav-link" type="button" aria-current={settingsCategory === 'appearance' ? 'page' : undefined} onClick={() => setSettingsCategory('appearance')}>
                  <Settings className="sb-icon" aria-hidden="true" /><span>Darstellung</span>
                </button>
                <button className="sb-nav-link" type="button" aria-current={settingsCategory === 'boundary' ? 'page' : undefined} onClick={() => setSettingsCategory('boundary')}>
                  <PhoneCall className="sb-icon" aria-hidden="true" /><span>Telefoniegrenze</span>
                </button>
              </nav>
            </aside>
            <div className="sb-settings-main">
              <button className="sb-icon-button sb-settings-close" type="button" onClick={closeSettings} ref={settingsCloseRef} aria-label="Einstellungen schließen" title="Einstellungen schließen">
                <X className="sb-icon" aria-hidden="true" />
              </button>
              {settingsCategory === 'appearance' ? (
                <section className="sb-settings-section">
                  <h2 className="sb-settings-heading" id="settings-title">Darstellung</h2>
                  <div className="sb-setting-row">
                    <span className="sb-setting-copy"><strong>Farbschema</strong><span className="sb-helper">Systemvorgabe übernehmen oder dauerhaft Hell/Dunkel wählen.</span></span>
                    <ThemeSelector preference={theme.preference} onChange={theme.setPreference} />
                  </div>
                  <div className="sb-setting-row">
                    <span className="sb-setting-copy"><strong>Designvertrag</strong><span className="sb-helper">Simple Business, Release 0.1.1 · Konzept „Klares Signal“.</span></span>
                    <span className="settings-value">RAL 5015</span>
                  </div>
                </section>
              ) : (
                <section className="sb-settings-section">
                  <h2 className="sb-settings-heading" id="settings-title">Telefoniegrenze</h2>
                  <div className="sb-setting-row">
                    <span className="sb-setting-copy"><strong>Runtime</strong><span className="sb-helper">Lokale oder streng isolierte synthetische Asterisk-Runtime.</span></span>
                    <span className="settings-value">Technischer PoC</span>
                  </div>
                  <div className="sb-setting-row">
                    <span className="sb-setting-copy"><strong>Öffentliches Telefonnetz</strong><span className="sb-helper">Keine realen Trunks, DIDs, Carrierabnahme oder automatische Amtsleitung.</span></span>
                    <span className="settings-value settings-value-warning">Nicht unterstützt</span>
                  </div>
                  <div className="sb-setting-row">
                    <span className="sb-setting-copy"><strong>Notruf</strong><span className="sb-helper">Keine Erreichbarkeitszusage für 110, 112 oder andere Notrufziele.</span></span>
                    <span className="settings-value settings-value-warning">Nicht unterstützt</span>
                  </div>
                </section>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
