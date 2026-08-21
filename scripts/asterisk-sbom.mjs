import crypto from 'node:crypto';
import fs from 'node:fs';

const dockerfile = fs.readFileSync(new URL('../asterisk/Dockerfile', import.meta.url), 'utf8');

function dockerArg(name) {
  const match = dockerfile.match(new RegExp(`^ARG ${name}=([^\\s]+)$`, 'm'));
  if (!match) throw new Error(`Missing pinned Docker build argument: ${name}`);
  return match[1];
}

function sha256Component({ type = 'file', name, version, checksum, purl, url, properties = [] }) {
  if (!/^[0-9a-f]{64}$/.test(checksum)) throw new Error(`Invalid SHA-256 for ${name}`);
  return {
    type,
    'bom-ref': purl,
    name,
    version,
    hashes: [{ alg: 'SHA-256', content: checksum }],
    purl,
    externalReferences: [{ type: 'distribution', url }],
    properties,
  };
}

const asteriskVersion = dockerArg('ASTERISK_VERSION');
const pjprojectVersion = dockerArg('PJPROJECT_VERSION');
const pjprojectCommit = dockerArg('PJPROJECT_COMMIT');
const janssonVersion = dockerArg('JANSSON_VERSION');
const coreSoundsVersion = dockerArg('CORE_SOUNDS_VERSION');
const mohVersion = dockerArg('MOH_VERSION');
const ubuntuImageMatch = dockerfile.match(
  /^FROM (ubuntu:[^@\s]+@sha256:[0-9a-f]{64}) AS ubuntu-snapshot$/m,
);
if (!ubuntuImageMatch) throw new Error('Ubuntu snapshot stage must pin an exact sha256 digest.');
const ubuntuImage = ubuntuImageMatch[1];
const ubuntu = ubuntuImage.match(/^ubuntu:([^@]+)@sha256:([0-9a-f]{64})$/);
if (!ubuntu) throw new Error('Ubuntu base image must pin an exact sha256 digest.');

const rootRef = `pkg:oci/simple-calls-asterisk@${asteriskVersion}`;
const components = [
  sha256Component({
    type: 'operating-system',
    name: 'Ubuntu',
    version: ubuntu[1],
    checksum: ubuntu[2],
    purl: `pkg:oci/ubuntu@${ubuntu[1]}`,
    url: `https://hub.docker.com/_/ubuntu`,
    properties: [
      { name: 'simple-calls:oci-reference', value: ubuntuImage },
      { name: 'simple-calls:apt-snapshot', value: dockerArg('UBUNTU_APT_SNAPSHOT') },
    ],
  }),
  sha256Component({
    type: 'application',
    name: 'Asterisk',
    version: asteriskVersion,
    checksum: dockerArg('ASTERISK_SHA256'),
    purl: `pkg:generic/asterisk@${asteriskVersion}`,
    url: `https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-${asteriskVersion}.tar.gz`,
  }),
  sha256Component({
    type: 'library',
    name: 'PJProject',
    version: pjprojectVersion,
    checksum: dockerArg('PJPROJECT_SHA256'),
    purl: `pkg:generic/pjproject@${pjprojectVersion}`,
    url: `https://raw.githubusercontent.com/asterisk/third-party/${pjprojectCommit}/pjproject/${pjprojectVersion}/pjproject-${pjprojectVersion}.tar.bz2`,
    properties: [{ name: 'simple-calls:source-commit', value: pjprojectCommit }],
  }),
  sha256Component({
    type: 'library',
    name: 'Jansson',
    version: janssonVersion,
    checksum: dockerArg('JANSSON_SHA256'),
    purl: `pkg:generic/jansson@${janssonVersion}`,
    url: `https://raw.githubusercontent.com/asterisk/third-party/${pjprojectCommit}/jansson/${janssonVersion}/jansson-${janssonVersion}.tar.bz2`,
    properties: [{ name: 'simple-calls:source-commit', value: pjprojectCommit }],
  }),
  sha256Component({
    name: 'Asterisk English core sounds (GSM)',
    version: coreSoundsVersion,
    checksum: dockerArg('CORE_SOUNDS_SHA256'),
    purl: `pkg:generic/asterisk-core-sounds-en-gsm@${coreSoundsVersion}`,
    url: `https://downloads.asterisk.org/pub/telephony/sounds/releases/asterisk-core-sounds-en-gsm-${coreSoundsVersion}.tar.gz`,
  }),
  sha256Component({
    name: 'Asterisk Opsound music on hold (WAV)',
    version: mohVersion,
    checksum: dockerArg('MOH_SHA256'),
    purl: `pkg:generic/asterisk-moh-opsound-wav@${mohVersion}`,
    url: `https://downloads.asterisk.org/pub/telephony/sounds/releases/asterisk-moh-opsound-wav-${mohVersion}.tar.gz`,
  }),
];

const bom = {
  $schema: 'http://cyclonedx.org/schema/bom-1.5.schema.json',
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber: `urn:uuid:${crypto.randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: [{ vendor: 'itmitalles-de', name: 'simple-calls-asterisk-sbom', version: '1' }],
    component: {
      type: 'container',
      'bom-ref': rootRef,
      name: 'Simple Calls synthetic Asterisk runtime',
      version: asteriskVersion,
      purl: rootRef,
    },
  },
  components,
  dependencies: [{ ref: rootRef, dependsOn: components.map((component) => component['bom-ref']) }],
};

process.stdout.write(`${JSON.stringify(bom, null, 2)}\n`);
