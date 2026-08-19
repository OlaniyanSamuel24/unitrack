import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false });
const client = await pool.connect();
try {
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const directory = path.resolve('db/migrations');
  const files = (await fs.readdir(directory)).filter(file => file.endsWith('.sql')).sort();
  for (const file of files) {
    const applied = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [file]);
    if (applied.rowCount) continue;
    await client.query('BEGIN');
    await client.query(await fs.readFile(path.join(directory, file), 'utf8'));
    await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
    await client.query('COMMIT');
    console.log(`Applied ${file}`);
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally { client.release(); await pool.end(); }
