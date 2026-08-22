import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const failures = [];

function readFiles(directory, predicate) {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'artifacts') {
      return [];
    }

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return readFiles(absolutePath, predicate);
    return predicate(entry.name) ? [absolutePath] : [];
  });
}

function relative(file) {
  return path.relative(repositoryRoot, file);
}

const workflowDirectory = path.join(repositoryRoot, '.github', 'workflows');
for (const file of readFiles(workflowDirectory, (name) => /\.ya?ml$/u.test(name))) {
  const source = fs.readFileSync(file, 'utf8');

  for (const match of source.matchAll(/^\s*-\s+uses:\s*([^\s#]+)/gmu)) {
    const reference = match[1];
    if (!reference.startsWith('./') && !/^[^@\s]+@[0-9a-f]{40}$/u.test(reference)) {
      failures.push(`${relative(file)}: action is not pinned to a full commit SHA: ${reference}`);
    }
  }

  for (const match of source.matchAll(/^\s*runs-on:\s*([^\s#]+)/gmu)) {
    if (match[1].endsWith('-latest')) {
      failures.push(`${relative(file)}: mutable runner label is forbidden: ${match[1]}`);
    }
  }
}

for (const file of readFiles(repositoryRoot, (name) => name === 'Dockerfile' || name.startsWith('Dockerfile.'))) {
  const source = fs.readFileSync(file, 'utf8');
  const argumentsByName = new Map();
  const stages = new Set();

  for (const [index, line] of source.split(/\r?\n/u).entries()) {
    const argument = line.match(/^\s*ARG\s+([A-Za-z_][A-Za-z0-9_]*)=(\S+)\s*$/u);
    if (argument) argumentsByName.set(argument[1], argument[2]);

    const from = line.match(/^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?\s*$/iu);
    if (!from) continue;

    const rawReference = from[1];
    const reference = rawReference.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (_whole, name) => {
      return argumentsByName.get(name) ?? `UNRESOLVED:${name}`;
    });

    if (
      reference !== 'scratch'
      && !stages.has(reference)
      && !/^[^@\s]+@sha256:[0-9a-f]{64}$/u.test(reference)
    ) {
      failures.push(`${relative(file)}:${index + 1}: base image is not digest-pinned: ${rawReference}`);
    }

    if (/:latest(?:@|$)/u.test(reference)) {
      failures.push(`${relative(file)}:${index + 1}: latest image tag is forbidden: ${rawReference}`);
    }

    if (from[2]) stages.add(from[2]);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Supply-chain pin policy passed: actions use full SHAs, runners are explicit, and base images use digests.');
