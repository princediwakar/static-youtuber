#!/usr/bin/env node
/**
 * setup-database.js
 * Run once to create tables and seed the psychology topic pool.
 * Usage: node setup-database.js
 */
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log('🔌 Connecting to database…');
  const client = await pool.connect();

  try {
    // Run schema
    console.log('📐 Applying schema…');
    const schema = fs.readFileSync(path.join(__dirname, 'database/schema.sql'), 'utf8');
    await client.query(schema);
    console.log('✅ Schema applied');

    // Seed topics
    console.log('🌱 Seeding history topics…');
    const topics = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'topics/history.json'), 'utf8')
    );

    let inserted = 0;
    let skipped  = 0;

    for (const { topic, niche } of topics) {
      const res = await client.query(
        `INSERT INTO slideshow_topics (topic, niche)
         VALUES ($1, $2)
         ON CONFLICT (topic) DO NOTHING
         RETURNING id`,
        [topic, niche]
      );
      if (res.rowCount > 0) inserted++;
      else skipped++;
    }

    console.log(`✅ Topics: ${inserted} inserted, ${skipped} already existed`);
    console.log('\n🎉 Database setup complete!');
    console.log('   Run `npm run dev` to start the app.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});
