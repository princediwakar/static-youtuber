// Path: scripts/test-assets.js
// Quick asset verification — no ESM/CJS boundary issues.
require('dotenv').config({ path: '.env.local' });
const { existsSync } = require('fs');
const path = require('path');
const { Pool } = require('pg');

// ── Constants (mirror lib/constants.ts) ────────────────────────────────
const CWD = process.cwd();
const MUSIC_DIR = path.join(CWD, 'assets', 'music');
const MUSIC_FILES = ['focus-01.mp3', 'tension-01.mp3', 'ambient-01.mp3'];
const FONT_PATH = path.join(CWD, 'assets', 'fonts', 'Montserrat-Bold.ttf');
const MUSIC_ATTRIBUTION = 'Music by Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/';

async function main() {
  console.log('═══ Asset Verification ═══\n');

  // ── 1. Font ──────────────────────────────────────────────────────────
  console.log('1. Font');
  console.log(`   Path: ${FONT_PATH}`);
  const fontOk = existsSync(FONT_PATH);
  console.log(`   Exists: ${fontOk ? 'YES' : 'NO — BROKEN'} ${fontOk ? '(size: ' + (require('fs').statSync(FONT_PATH).size / 1024).toFixed(0) + ' KB)' : ''}`);
  console.log(fontOk ? '   ✅ Font ready' : '   ❌ Missing');

  // ── 2. Music ─────────────────────────────────────────────────────────
  console.log('\n2. Background Music');
  const available = [];
  for (const f of MUSIC_FILES) {
    const full = path.join(MUSIC_DIR, f);
    const ok = existsSync(full);
    const size = ok ? (require('fs').statSync(full).size / (1024 * 1024)).toFixed(1) + ' MB' : 'MISSING';
    console.log(`   ${f}: ${ok ? 'EXISTS' : '❌ MISSING'} (${size})`);
    if (ok) available.push(f);
  }
  if (available.length > 0) {
    const chosen = available[Math.floor(Math.random() * available.length)];
    console.log(`   Random pick: ${chosen}`);
    console.log('   ✅ Music ready');
  } else {
    console.error('   ❌ No music files');
  }

  // ── 3. Attribution ───────────────────────────────────────────────────
  console.log('\n3. Attribution');
  console.log(`   "${MUSIC_ATTRIBUTION.substring(0, 80)}..."`);
  console.log('   ✅ Ready');

  // ── 4. DB ─────────────────────────────────────────────────────────────
  console.log('\n4. Database');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL.replace(
      /[?&]sslmode=(?:prefer|require|verify-ca)(?=\?|&|$)/,
      (m) => m.replace(/(prefer|require|verify-ca)/, 'verify-full')
    ),
    ssl: { rejectUnauthorized: false },
  });
  try {
    const r = await pool.query(
      'SELECT COUNT(*) as c FROM slideshow_topics WHERE used = false AND niche = $1',
      ['history']
    );
    console.log(`   Available topics: ${r.rows[0].c}`);
    console.log('   ✅ DB connected');
  } catch (e) {
    console.error(`   ❌ DB error: ${e.message}`);
  } finally {
    pool.end();
  }

  // ── Summary ──────────────────────────────────────────────────────────
  console.log('\n═══ Summary ═══');
  const allOk = fontOk && available.length === 3;
  console.log(allOk
    ? '✅ All assets ready. Pipeline produces videos with:'
    : '❌ Issues found');
  console.log('   • Background music (Kevin MacLeod, CC BY 4.0)');
  console.log('   • Montserrat-Bold captions');
  console.log('   • Attribution in YouTube descriptions');
}

main().catch(console.error);
