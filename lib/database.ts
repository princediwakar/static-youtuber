// Path: lib/database.ts
import { Pool, QueryResult, QueryResultRow } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 300000, // 5 min — keep alive through long pipeline steps
});

export async function query<T extends QueryResultRow = any>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
  try {
    return await pool.query<T>(text, params);
  } catch (error: any) {
    // Retry once on connection errors — Neon pooler can drop idle connections
    if (error?.code === 'ECONNRESET' || error?.message?.includes('Connection terminated')) {
      console.warn('[DB] Connection lost, retrying...');
      return await pool.query<T>(text, params);
    }
    console.error('[DB] Query failed:', { text, error });
    throw error;
  }
}
