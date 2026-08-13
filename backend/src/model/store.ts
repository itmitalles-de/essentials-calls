import path from 'node:path';
import { PbxDatabase } from './database';
import { loadSecretCipher } from '../security/crypto';

let database: PbxDatabase | undefined;

export function getDatabase(): PbxDatabase {
  if (!database) {
    const dataDir = process.env.DATA_DIR ?? path.join(__dirname, '..', '..', 'data');
    database = new PbxDatabase(dataDir, loadSecretCipher());
  }
  return database;
}

/** Test-only dependency reset; production code keeps one WAL-enabled handle. */
export function setDatabaseForTests(value: PbxDatabase | undefined): void {
  database = value;
}

export function loadTopology() {
  return getDatabase().currentTopology().topology;
}
