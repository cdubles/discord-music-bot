import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';

import config from '../config.js';
import logger from '../logger.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, 'migrations');

const dir = dirname(config.dbPath);
if (dir && dir !== '.' && !existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

const db = new Database(config.dbPath);

// WAL keeps reads from blocking the (synchronous) writes this driver performs.
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

/**
 * Apply any .sql files in migrations/ that haven't run yet, in filename order.
 * Each file runs inside a transaction together with its version bookkeeping,
 * so a failed migration leaves no partial schema behind.
 */
function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version),
  );

  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const record = db.prepare(
    'INSERT INTO schema_migrations (version, applied_at) VALUES (?, unixepoch())',
  );

  for (const file of files) {
    const version = Number.parseInt(file.split('_')[0], 10);
    if (Number.isNaN(version) || applied.has(version)) continue;

    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      record.run(version);
    })();
    logger.info({ migration: file }, 'Applied migration');
  }
}

migrate();

export function closeDatabase() {
  try {
    // Checkpoints the WAL so the .db file is self-contained on shutdown.
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
  } catch (error) {
    logger.warn({ err: error }, 'Error closing database');
  }
}

export default db;
