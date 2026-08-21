export interface SoftphoneDownload {
  id: 'linphone' | 'microsip' | 'zoiper';
  name: string;
  platforms: string;
  licence: string;
  description: string;
  url: string;
}

export const SOFTPHONE_DOWNLOADS: readonly SoftphoneDownload[] = Object.freeze([
  {
    id: 'linphone',
    name: 'Linphone',
    platforms: 'Windows · macOS · Linux · Android · iOS',
    licence: 'Open-Source-Projekt; jeweilige Paketbedingungen beachten',
    description: 'Plattformübergreifender SIP-Client und die bevorzugte neutrale Testoption.',
    url: 'https://www.linphone.org/en/download/',
  },
  {
    id: 'microsip',
    name: 'MicroSIP',
    platforms: 'Windows',
    licence: 'GNU GPL v2',
    description: 'Kompakter Windows-SIP-Client, auch als portable Variante erhältlich.',
    url: 'https://www.microsip.org/downloads',
  },
  {
    id: 'zoiper',
    name: 'Zoiper',
    platforms: 'Windows · macOS · Linux · Android · iOS',
    licence: 'Freemium/proprietär; kostenlose Nutzung ist lizenzabhängig',
    description: 'Breit verfügbarer SIP-Client mit separaten Hersteller- und Lizenzbedingungen.',
    url: 'https://www.zoiper.com/en/voip-softphone/download/current',
  },
]);

export const APPROVED_SOFTPHONE_HOSTS = Object.freeze([
  'www.linphone.org',
  'www.microsip.org',
  'www.zoiper.com',
]);

export function isApprovedSoftphoneUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && APPROVED_SOFTPHONE_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}
