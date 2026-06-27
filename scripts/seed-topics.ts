import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

import { query } from '../lib/database';

const SEEDS: [string, string, string[]][] = [
  [
    'SaaS & AI Tools',
    'tech_shots',
    [
      'How Make.com replaced 12 people and nobody got fired',
      'The Claude prompt that reviews a contract in 4 minutes',
      'When a 2000-person company ripped out Confluence overnight',
      'The $47 Zapier workflow making $11k a month',
      'An accountant automated 90% of her own bookkeeping',
      'The AI stack running a fully automated returns pipeline',
      'Airtable + ChatGPT killed a $60k inventory system in 2 weeks',
      'Why 60% of enterprise AI automation projects fail',
      'Solo founder hits $43k MRR with zero outside funding',
      'AI operator agents are replacing entire support teams',
      'A real estate team automated lead follow-up, closed 34% more',
      'The Notion schema that replaced Jira, Slack, and quarterly planning',
      'Claude Code writes, tests, and deploys its own pull requests',
      'An 83-character prompt outperforms senior code reviewers',
      'Typeform killed 80% of its outbound sales team with AI email',
      'Why the best devs use Cursor and Copilot together',
      'The $2.1M AI budget a Fortune 500 CFO said yes to',
      'A dentist automated her entire front desk with ChatGPT and Twilio',
      'The warehouse that killed barcode scanners with computer vision',
      'A fully automated news channel: Cron, Claude API, ElevenLabs',
    ],
  ],
  [
    'Financial Forensics',
    'finance_shots',
    [
      'The $4.7M typo that erased a fortune in 14 seconds',
      'The 22-year-old trader who lost $2.3B and nobody noticed',
      'Two pizzas bought with Bitcoin now worth $680 million',
      'How Enron hid $38B behind 3,000 shell companies',
      'The legal accounting trick that hid $50 billion at Lehman',
      'Sam Bankman-Fried and the $8B hole that appeared overnight',
      'The man who sold the Eiffel Tower for scrap — twice',
      'One PowerPoint slide exposed a $6.2B loss at JPMorgan',
      'The day the Swiss Franc unpegged and brokers went bankrupt in minutes',
      'How Wirecard fooled auditors into believing $2B existed',
      'Two Nobel laureates, one hedge fund, and the Russian default',
      'Charles Ponzi made $250k a day in 1920 — here is how',
      '$1 trillion vanished from US markets in 36 minutes',
      'A single $50M bet on VIX options turned into $2.6B',
      'When a 140% short interest met a subreddit of retail traders',
      'The SEC investigated Madoff 8 times and closed the case each time',
      'The exact script Stratton Oakmont brokers read to pump penny stocks',
      'How Mexican cartels laundered $881M through a single HSBC branch',
      'When a Texas billionaire tried to corner the world silver market',
      'A 20-year-old died thinking he owed Robinhood $730,000',
    ],
  ],
  [
    'Stoic Philosophy',
    'stoic_shots',
    [
      'Marcus Aurelius wrote Meditations during a plague that killed 5 million',
      'Seneca: billionaire who preached poverty, killed by his student Nero',
      'Epictetus was a crippled slave who became Rome\'s greatest philosopher',
      'The general who argued against his own rescue and returned to be executed',
      'Cato ripped out his own intestines rather than accept Caesar\'s pardon',
      'The slave behind every Roman general whispering "you will die"',
      'Viktor Frankl survived Auschwitz and wrote the Stoic book of the Holocaust',
      'When Marcus Aurelius was betrayed by his most trusted general',
      'Why Silicon Valley billionaires secretly practice Stoicism',
      'Zeno was shipwrecked with nothing, walked into a bookshop, founded Stoicism',
      'A Stoic\'s response to surviving a plane crash will change how you think',
      'James Stockdale: 7 years as a POW, kept alive by Epictetus',
      'The Dichotomy of Control inside a nuclear bunker during the Cuban Missile Crisis',
      'Cleanthes worked night labor to afford philosophy lectures by day',
      'A Roman philosopher argued women needed equal education in 50 AD',
      'Seneca\'s wife opened her veins alongside him when Nero ordered his death',
      'The Stoic technique now used by trauma surgeons and special forces',
      'Three sentences from Marcus Aurelius still taught in military academies',
      'A Stoic\'s entire family died in a shipwreck — his response redefined resilience',
      'Cognitive behavioral therapy is Stoicism with a clinical manual',
    ],
  ],
  [
    'Urban Survival',
    'survival_shots',
    [
      'The 2003 blackout that blacked out 8 states in 6 seconds',
      'FEMA says 72 hours — every survival instructor stocks 14 days',
      'What a $120 urban go-bag contains and why it fits under a desk',
      'One water treatment plant fails, 5 states go down in 48 hours',
      'The 3 things that kill first in any urban disaster',
      'A former CIA officer\'s 14-item vehicle emergency loadout',
      'Police response goes to zero during a city-wide disaster — now what',
      'How to purify water with nothing but a clear plastic bottle',
      'Cell networks die in 12 minutes — the $25 radio that survives',
      'The 2011 Tokyo earthquake: what went right and what nearly killed people',
      'A regional grid failure kills more people in week one than the event itself',
      'Things in your apartment that become weapons when everything collapses',
      'How to walk out of a gridlocked city using rivers, rails, and utility corridors',
      'The skills every urban resident needs, from a Seattle SAR volunteer',
      'Why pre-1970 schools are the safest buildings in your neighborhood',
      'Trapped under debris with a dead phone — the SOS pattern that works',
      'Why most people freeze for exactly 90 seconds in a disaster',
      'What a Level 1 trauma surgeon keeps in their home medical kit',
      'A 6-ounce item that saves your life when the air becomes unbreathable',
      'How looters actually behave during civil breakdown — it is not what you think',
    ],
  ],
];

async function main() {
  let inserted = 0;
  let skipped = 0;

  for (const [niche, accountId, topics] of SEEDS) {
    console.log(`Seeding ${niche} (${accountId})...`);
    for (const topic of topics) {
      try {
        const res = await query(
          `INSERT INTO slideshow_topics (topic, niche, account_id) VALUES ($1, $2, $3) ON CONFLICT (topic, account_id) DO NOTHING`,
          [topic, niche, accountId]
        );
        if ((res.rowCount ?? 0) > 0) {
          inserted++;
        } else {
          skipped++;
        }
      } catch (err: any) {
        console.error(`  Failed to insert: "${topic.slice(0, 60)}..." — ${err.message}`);
      }
    }
  }

  console.log(`\nDone. Inserted ${inserted}, skipped ${skipped} (duplicates).`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
