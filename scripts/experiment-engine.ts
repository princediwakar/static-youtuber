// scripts/experiment-engine.ts
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  selectExperimentStrategy,
  buildExperimentSystemPrompt,
  diagnoseChannel,
  HISTORICAL_BENCHMARKS,
  DURATION_SPECS,
  HOOK_INSTRUCTIONS,
} from '../lib/experimentEngine';
import { ACCOUNT_YOUTUBE_CHANNEL_ID, ACCOUNT_NICHE } from '../lib/constants';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function fetchChannelShorts(channelId: string) {
  try {
    const res = await fetch(`https://www.youtube.com/channel/${channelId}/shorts`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    const html = await res.text();
    const match = html.match(/var ytInitialData = ({[\s\S]*?});<\/script>/) || html.match(/>ytInitialData = ({[\s\S]*?});<\/script>/);
    if (!match) return [];

    const data = JSON.parse(match[1]);
    const results: Array<{ videoId: string; title: string; views: string; numericViews: number }> = [];

    function search(obj: any) {
      if (!obj || typeof obj !== 'object') return;
      if (obj.shortsLockupViewModel) {
        const vm = obj.shortsLockupViewModel;
        const videoId = vm.entityId?.replace('shorts-shelf-item-', '') || '';
        const title = vm.overlayMetadata?.primaryText?.content || '';
        const views = vm.overlayMetadata?.secondaryText?.content || '';
        let numericViews = 0;
        if (views.includes('k views')) {
          numericViews = parseFloat(views) * 1000;
        } else if (views.includes('M views')) {
          numericViews = parseFloat(views) * 1000000;
        } else {
          numericViews = parseInt(views.replace(/[^0-9]/g, ''), 10) || 0;
        }
        results.push({ videoId, title, views, numericViews });
      }
      for (const k of Object.keys(obj)) {
        search(obj[k]);
      }
    }
    search(data);
    return results;
  } catch (err: any) {
    console.error(`Failed to fetch channel ${channelId}:`, err.message);
    return [];
  }
}

async function runAudit() {
  console.log('\n========================================================================');
  console.log('           AUTONOMOUS EXPERIMENT ENGINE: MULTI-CHANNEL AUDIT            ');
  console.log('========================================================================\n');

  const channels = ACCOUNT_YOUTUBE_CHANNEL_ID;
  const channelReports = [];

  for (const [key, channelId] of Object.entries(channels)) {
    console.log(`Analyzing [${key}] (${channelId})...`);
    const shorts = await fetchChannelShorts(channelId);
    const sorted = [...shorts].sort((a, b) => b.numericViews - a.numericViews);
    const top = sorted[0];
    const lowest = sorted[sorted.length - 1];
    const topViews = top?.numericViews || 0;
    const avgViews = shorts.length > 0 ? Math.round(shorts.reduce((acc, s) => acc + s.numericViews, 0) / shorts.length) : 0;
    const { diagnosis, recommendation } = diagnoseChannel(key, shorts.length, topViews);

    channelReports.push({
      channel: key,
      channelId,
      niche: ACCOUNT_NICHE[key] || 'General',
      totalShorts: shorts.length,
      topVideo: top ? `"${top.title.slice(0, 45)}" (${top.views})` : 'None',
      avgViews,
      diagnosis,
      recommendation,
    });
  }

  console.log('\n--- LIVE CHANNEL SCORECARD ---');
  console.table(channelReports.map(r => ({
    Channel: r.channel,
    'Total Shorts': r.totalShorts,
    'Top Video': r.topVideo,
    'Avg Views': r.avgViews,
    Diagnosis: r.diagnosis.slice(0, 50) + '...',
  })));

  console.log('\n--- DETAILED DIAGNOSTICS & EXPERIMENTAL ACTIONS ---');
  for (const r of channelReports) {
    console.log(`\n▶ [${r.channel}] (${r.niche})`);
    console.log(`  Status: ${r.diagnosis}`);
    console.log(`  Strategy Action: ${r.recommendation}`);
  }

  console.log('\n--- EXPERIMENT ENGINE HYPOTHESES & STRATEGY WEIGHTS ---');
  console.log('1. DURATION HYPOTHESIS:');
  console.log('   - snappy_25 (20-30s, 70-85 words): Weight 60%. (Target: 100%+ Loop APV)');
  console.log('   - balanced_35 (30-40s, 90-115 words): Weight 30%. (Target: Narrative depth)');
  console.log('   - standard_45 (42-48s): Weight 10%. (Target: True crime / financial scandals)');
  console.log('   - >50s: ELIMINATED (0% Weight). 100% of videos >60s crashed to 1-8 views.');

  console.log('\n2. HOOK ARCHETYPES:');
  console.log('   - curiosity_gap (40%): "The world\'s shortest border is only 85 meters long..."');
  console.log('   - paradox_anomaly (30%): "In this town, dying is strictly illegal..."');
  console.log('   - heist_scandal (20%): "In 1963, a single man swindled Wall Street with water tanks..."');
  console.log('   - counter_intuitive (10%): "Everything you were told about this is backwards..."');

  console.log('\n3. TOPIC PIVOT ENFORCEMENT:');
  console.log('   - canvas_center: Geography, Disputed Borders, Geopolitical Curiosities.');
  console.log('   - canvas_area: Historical Heists, Giant Financial Scandals, Con Artists.');
  console.log('   - canvas_base: Impossible Human Survival, Extreme Calamities.');
  console.log('   - canvas_station: Digital Glitches, Lost Internet Mysteries, High-Stakes Hacks.');
  console.log('   - clinic_playbook: Bizarre Medical Anomalies, Deadly Historical Surgeries, Anatomical Oddities.');
  console.log('   - (Strictly banned: B2B operations, accounting, invoice reconciliation, software ads)');

  console.log('\nAudit complete.\n');
}

async function runSimulate() {
  const targetChannel = process.argv[3] || 'canvas_center';
  const niche = ACCOUNT_NICHE[targetChannel] || 'The Case File';
  console.log(`\nSimulating Experiment Engine strategy selection for: ${targetChannel} (${niche})`);

  const exp = selectExperimentStrategy(targetChannel, niche);
  console.log('\nSelected Experiment Configuration:');
  console.dir(exp, { depth: null });

  console.log('\nGenerated System Prompt Directives:');
  console.log(buildExperimentSystemPrompt(exp, targetChannel));
}

const command = process.argv[2] || 'audit';
if (command === 'audit') {
  runAudit().catch(console.error);
} else if (command === 'simulate') {
  runSimulate().catch(console.error);
} else {
  console.log('Usage: npx tsx scripts/experiment-engine.ts [audit | simulate]');
}
