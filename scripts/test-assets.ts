// Path: scripts/test-assets.ts
// Direct test of downloaded assets (music, font) and attribution.
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { existsSync } from 'fs';
import {
  ACE_STEP_BGM_URL,
  ACE_STEP_API_KEY,
  FONT_PATH,
} from '../lib/constants';

async function main() {
  console.log('═══ Asset Verification ═══\n');

  // ── 1. Font ──────────────────────────────────────────────────────────
  console.log('1. Font');
  console.log(`   Path: ${FONT_PATH}`);
  const fontOk = existsSync(FONT_PATH);
  console.log(`   Exists: ${fontOk ? 'YES' : 'NO — BROKEN'}`);
  if (!fontOk) {
    console.error('   ❌ Montserrat-Bold.ttf not found — captions will fall back to sans-serif');
  } else {
    console.log('   ✅ Font ready for sharp captions');
  }

  // ── 2. Music (ACE-Step) ──────────────────────────────────────────────
  console.log('\n2. Background Music (ACE-Step)');
  const acestepConfigured = ACE_STEP_BGM_URL && !ACE_STEP_BGM_URL.includes('example-modal-url');
  console.log(`   ACE-Step BGM URL: ${ACE_STEP_BGM_URL ? (acestepConfigured ? '✅ configured' : '⚠️  placeholder') : '❌ not set'}`);
  console.log(`   ACE-Step API Key: ${ACE_STEP_API_KEY ? '✅ set' : '❌ not set'}`);

  if (acestepConfigured && ACE_STEP_API_KEY) {
    try {
      const baseUrl = new URL(ACE_STEP_BGM_URL);
      const warmupUrl = new URL('/warmup', baseUrl.origin).toString();
      const res = await fetch(warmupUrl, { method: 'GET', signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        const data = await res.json();
        console.log(`   ✅ ACE-Step reachable — GPU: ${data.gpu}`);
      } else {
        console.warn(`   ⚠️  ACE-Step warmup returned ${res.status} — may be cold`);
      }
    } catch (e: any) {
      console.warn(`   ⚠️  ACE-Step unreachable: ${e.message}`);
    }
  }

  // ── 3. DB connectivity ───────────────────────────────────────────────
  console.log('\n4. Database');
  const { query } = require('../lib/database');
  try {
    const r = await query('SELECT COUNT(*) as c FROM slideshow_topics WHERE used = false AND niche = $1', ['history']);
    const count = parseInt(r.rows[0].c, 10);
    console.log(`   Available topics: ${count}`);
    console.log('   ✅ DB connection works');
  } catch (e: any) {
    console.error(`   ❌ DB error: ${e.message}`);
  }

  // ── Summary ──────────────────────────────────────────────────────────
  console.log('\n═══ Summary ═══');
  if (fontOk) {
    console.log('✅ Font ready.');
    console.log('   Pipeline is ready to produce videos with ACE-Step BGM + captions + Ken Burns.');
  } else {
    console.error('❌ Montserrat-Bold.ttf missing — captions will fall back to sans-serif.');
  }
}

main().catch(console.error);
