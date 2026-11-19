import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createDemo } from './simulation.mjs';

export function createStore(file = 'data/demo.sqlite') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA busy_timeout = 5000; CREATE TABLE IF NOT EXISTS simulation (id INTEGER PRIMARY KEY CHECK(id = 1), value TEXT NOT NULL)');
  db.prepare('INSERT OR IGNORE INTO simulation (id, value) VALUES (1, ?)').run(JSON.stringify(createDemo()));
  const read = () => JSON.parse(db.prepare('SELECT value FROM simulation WHERE id = 1').get().value);
  return {
    read,
    transact(update) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const state = read();
        const result = update(state);
        state.revision++;
        db.prepare('UPDATE simulation SET value = ? WHERE id = 1').run(JSON.stringify(state));
        db.exec('COMMIT');
        return result;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    close() { db.close(); },
  };
}
