// lib/viralContentEngine.ts
/**
 * Viral Content Engine
 *
 * Enforces strict interestingness gates and provides autonomous topic synthesis
 * so the pipeline NEVER posts boring B2B/advisory content and NEVER runs out of topics.
 */

import { chatCompletion } from './llm';

export interface ChannelEditorialProfile {
  name: string;
  theme: string;
  coreHook: string;
  forbiddenTopics: string[];
  mandatoryElements: string[];
  exampleWinners: string[];
}

export const CHANNEL_EDITORIAL_PROFILES: Record<string, ChannelEditorialProfile> = {
  canvas_center: {
    name: 'Canvas Center',
    theme: 'Bizarre Geography & Border Anomalies',
    coreHook: 'Start with an impossible territorial anomaly, a forbidden town, or a country boundary that violates logic.',
    forbiddenTopics: ['business', 'accounting', 'taxes', 'leases', 'marketing', 'software tools', 'clinics'],
    mandatoryElements: ['specific location', 'astonishing geographical fact', 'border/land anomaly', 'unsolved or weird status'],
    exampleWinners: [
      "The World's Shortest Border #Shorts (1,671 views)",
      "The World's Only Unclaimed Land #Shorts (1,532 views)",
      "Why Dying is Forbidden in Longyearbyen #Shorts (574 views)",
      "The Hidden Ocean in Siberia #Shorts (1,000 views)",
    ],
  },
  canvas_area: {
    name: 'Canvas Area',
    theme: 'Audacious Heists, Financial Scandals & Master Con Artists',
    coreHook: 'Start with a staggering amount of money, a massive deception, or a single document that destroyed an empire.',
    forbiddenTopics: ['general budgeting', 'how to invest', 'accounting tutorials', 'small business tips'],
    mandatoryElements: ['specific dollar amount or stakes', 'mastermind deception or secret document', 'how authorities were baffled'],
    exampleWinners: [
      "The Great Salad Oil Swindle That Crashed Wall Street (1,020 views)",
      "The 1-Page Memo That Predicted Enron's Collapse #Shorts",
      "The Forged Letter That Fooled Forensic Experts for Decades #Shorts",
    ],
  },
  canvas_base: {
    name: 'Canvas Base',
    theme: 'Extreme Human Survival & Miraculous Escapes',
    coreHook: 'Start with zero odds of survival, an impossible environment, or a human enduring the unthinkable.',
    forbiddenTopics: ['motivational self-help', 'morning routines', 'productivity tips', 'corporate resilience'],
    mandatoryElements: ['extreme physical environment', 'days or hours without resources', 'the counter-intuitive decision that kept them alive'],
    exampleWinners: [
      "Surviving 76 Days Alone on an Inflatable Raft in the Atlantic #Shorts",
      "The Deep-Sea Diver Who Survived 30 Minutes on the Seabed with No Oxygen #Shorts",
      "Falling 33,000 Feet from a Disintegrating Plane Without a Parachute #Shorts",
    ],
  },
  canvas_station: {
    name: 'Canvas Station',
    theme: 'Internet Mysteries, Black-Hat Hacks & Lost Digital Lore',
    coreHook: 'Start with a terrifying digital breach, a mysterious transmission, or a catastrophic piece of code.',
    forbiddenTopics: ['how to code', 'software product demos', 'upload scripts', 'API token management tutorials'],
    mandatoryElements: ['mysterious technical occurrence', 'staggering digital stakes', 'unsolved or mind-bending conclusion'],
    exampleWinners: [
      "How a Typo in a Printer Stopped a $1 Billion Bank Heist #Shorts",
      "The 8 Lines of Dead Code That Erased $440 Million in 45 Minutes #Shorts",
      "The Mysterious Buzzer Radio That Has Broadcast from a Russian Swamp Since 1973 #Shorts",
    ],
  },
  clinic_playbook: {
    name: 'The Clinic Playbook (Curiosities)',
    theme: 'Bizarre Medical Curiosities & Shocking Historical Surgeries',
    coreHook: 'Start with a surgical impossibility, a terrifying ancient epidemic, or a human anatomical miracle.',
    forbiddenTopics: ['clinic leases', 'UPI reconciliation', 'appointment booking software', 'staff hiring tips', 'consultation fees'],
    mandatoryElements: ['shocking medical or historical condition', 'the bizarre clinical mechanism', 'unbelievable medical outcome'],
    exampleWinners: [
      "The 300% Mortality Rate Surgery: Robert Liston's Triple Casualty #Shorts",
      "The 1518 Dancing Plague: When 400 People Danced Until Their Hearts Burst #Shorts",
      "The Surgeon Who Removed His Own Appendix in Antarctica #Shorts",
      "Phineas Gage: The Iron Rod That Pierced a Brain and Rewrote Science #Shorts",
    ],
  },
};

// ─── Content Boringness Filter ────────────────────────────────────────────────

const BANNED_PATTERNS = [
  /\bconsultation fee\b/i,
  /\bclinic lease\b/i,
  /\breconciliation\b/i,
  /\bcommercial real estate\b/i,
  /\bappointment-first\b/i,
  /\bsoftware uploader\b/i,
  /\byoutube metadata\b/i,
  /\bwriting youtube titles\b/i,
  /\bwrite titles\b/i,
  /\bapprentice as a subcontractor\b/i,
  /\btax advice\b/i,
  /\bllc vs s-corp\b/i,
  /\bcompeting on price\b/i,
  /\btime management\b/i,
  /\bbusiness structure\b/i,
  /\bhow to hire\b/i,
  /\bcontent creator\b/i,
  /\bcontent creation\b/i,
  /\bautomated metadata\b/i,
  /\bmarketing strategy\b/i,
];

export function isContentInteresting(topic: string, context?: string): { isInteresting: boolean; reason?: string } {
  const combined = `${topic} ${context || ''}`;

  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(combined)) {
      return {
        isInteresting: false,
        reason: `Matched banned boring pattern: ${pattern.toString()}`,
      };
    }
  }

  // Must have some curiosity trigger
  const curiositySignals = [
    /\b(mystery|secret|only|never|impossible|shortest|longest|deadliest|bizarre|curious|unclaimed|disaster|heist|swindle|stole|vanished|trapped|fell|survived|miracle|hack|glitch|plague|poison|submerged|banned|forbidden|anomaly|accident|surgery|mortality|brain|epidemic|crash|collapsed|exploded|unsolved)\b/i,
    /\b(\$\d+|\d+ days|\d+ hours|\d+ miles|\d+ percent|\d+%|\d+ feet|\d+ years|\d+ mins|\d+ minutes)\b/i,
  ];

  const hasSignal = curiositySignals.some(s => s.test(combined));
  if (!hasSignal) {
    return {
      isInteresting: false,
      reason: 'Lacks curiosity signals, high-stakes numbers, or mystery triggers.',
    };
  }

  return { isInteresting: true };
}

// ─── Autonomous Viral Topic Generator ─────────────────────────────────────────

export async function generateAutonomousViralTopic(
  niche: string,
  accountId: string,
): Promise<{ topic: string; research_context: string }> {
  const profile = CHANNEL_EDITORIAL_PROFILES[accountId] ?? CHANNEL_EDITORIAL_PROFILES.canvas_center;

  console.log(`[ViralContentEngine] Synthesizing fresh viral topic for [${accountId}] (${profile.theme})...`);

  const prompt = `You are the lead investigative researcher for an elite viral documentary YouTube channel.
Your mission is to invent ONE completely true, mind-bending historical, geographical, or physical anomaly story.

CHANNEL PROFILE: ${profile.name}
THEME: ${profile.theme}
CORE HOOK MANDATE: ${profile.coreHook}

EXAMPLES OF PROVEN 1,000+ VIEW HITS ON THIS NETWORK:
${profile.exampleWinners.map(w => `- ${w}`).join('\n')}

STRICT FORBIDDEN CONTENT (DO NOT WRITE ABOUT THESE):
${profile.forbiddenTopics.map(f => `- ${f}`).join('\n')}
- NO generic business advice, accounting, hiring tips, or software pitches.
- NO moral lessons or general productivity tips.

OUTPUT REQUIREMENT (STRICT JSON FORMAT):
{
  "topic": "A punchy, curiosity-gap title under 65 chars ending in #Shorts",
  "research_context": "2-3 dense paragraphs packed with exact dates, names, locations, dollar amounts, numbers, and the shocking factual sequence of events. Treat this as absolute ground-truth fact."
}`;

  try {
    const response = await chatCompletion(
      [{ role: 'user', content: prompt }],
      { temperature: 0.85, maxTokens: 800, responseJson: true, timeout: 120_000 }
    );

    if (!response) {
      throw new Error('[ViralContentEngine] LLM returned empty response for autonomous topic');
    }

    const parsed = typeof response === 'string' ? JSON.parse(response) : response;
    const topic = String(parsed.topic || '').trim();
    const research_context = String(parsed.research_context || '').trim();

    if (!topic || !research_context) {
      throw new Error('Missing topic or research_context fields');
    }

    // Ensure title has #Shorts
    const cleanTopic = topic.includes('#Shorts') ? topic : `${topic} #Shorts`;

    console.log(`[ViralContentEngine] Generated viral topic: "${cleanTopic}"`);
    return { topic: cleanTopic, research_context };
  } catch (err: any) {
    console.error('[ViralContentEngine] Autonomous topic generation failed, using bulletproof viral fallback:', err.message);
    // Bulletproof hardcoded fallback for absolute zero-failure guarantee
    return getEmergencyFallbackTopic(accountId);
  }
}

// ─── Bulletproof Fallback Topics (Guaranteed Interesting & Available) ─────────

const EMERGENCY_TOPIC_BANK: Record<string, Array<{ topic: string; research_context: string }>> = {
  canvas_center: [
    {
      topic: "The Island That Changes Countries Every 6 Months #Shorts",
      research_context: "Pheasant Island is an uninhabited island in the Bidasoa River between France and Spain. Under the 1659 Treaty of the Pyrenees, the island switches sovereignty every six months. From February 1 to July 31, it belongs to Spain; from August 1 to January 31, it is administered by France. It is the oldest and only condominium territory in the world whose sovereignty alternates between two sovereign states on a regular schedule.",
    },
    {
      topic: "The Town Divided Down the Middle of Every Room #Shorts",
      research_context: "Baarle-Hertog and Baarle-Nassau form a bizarre border anomaly between Belgium and the Netherlands. The border cuts through houses, cafes, and supermarkets. In some homes, the international border passes directly through the front door, dividing the living room in the Netherlands from the kitchen in Belgium. Residents must pay taxes based on where their front door is located.",
    },
  ],
  canvas_area: [
    {
      topic: "The Man Who Sold the Eiffel Tower Twice #Shorts",
      research_context: "In 1925, con artist Victor Lustig read that the Eiffel Tower was in desperate need of expensive repairs. Posing as the Deputy Director General of the Ministry of Posts and Telegraphs, Lustig invited six prominent scrap metal dealers to a secret meeting at an expensive hotel. He convinced dealer Andre Poisson that Paris was selling the tower for scrap metal, collected a massive bribe and the purchase price, and fled to Vienna with a suitcase of cash. Poisson was too humiliated to report it, so Lustig returned months later and attempted to sell it a second time.",
    },
  ],
  canvas_base: [
    {
      topic: "Trapped on the Ocean Floor with No Air #Shorts",
      research_context: "In September 2012, deep-sea commercial saturation diver Chris Lemons was working on an oil pipe 300 feet below the North Sea. A dynamic positioning computer failure caused the support ship above to drift, snapping his umbilical line and cutting off all heat, communication, and primary oxygen. Left with only a 5-minute emergency gas cylinder on his back, Lemons lay in pitch black, freezing water at 4 degrees Celsius. When rescuers reached him 33 minutes later, he was miraculously alive due to rapid hypothermic brain preservation.",
    },
  ],
  canvas_station: [
    {
      topic: "The Typo That Stopped a $1 Billion Hack #Shorts",
      research_context: "In February 2016, hackers infiltrated the Bangladesh Central Bank and stole credentials to issue 35 fraudulent SWIFT transfer requests totaling $951 Million to the Federal Reserve Bank of New York. Four transfers totaling $81 Million succeeded, but a fifth transfer of $20 Million to a Sri Lankan NGO was flagged because the hackers misspelled the word foundation as 'fandation'. A German routing bank clerk noticed the typo, halting the remaining $850 Million in transfers.",
    },
  ],
  clinic_playbook: [
    {
      topic: "The 300% Mortality Rate Surgery #Shorts",
      research_context: "In the 1840s before anesthesia, Scottish surgeon Robert Liston was famous for operating at lightning speed to reduce patient pain. During an amputation of a patient's leg, Liston operated so fast that he accidentally severed his surgical assistant's fingers. Both the patient and the assistant later died of gangrene infection. In the gallery, a distinguished surgical spectator was so horrified by the spraying blood that he suffered a fatal heart attack on the spot, making it the only surgery in recorded human history with a 300% mortality rate.",
    },
    {
      topic: "The Surgeon Who Operated on Himself in Antarctica #Shorts",
      research_context: "In April 1961, 27-year-old Soviet physician Leonid Rogozov was stationed at the isolated Novolazarevskaya Station in Antarctica during polar winter. He developed acute appendicitis with a high fever and peritonitis. As the only doctor at the base with transport cut off by blizzards, Rogozov had to perform his own appendectomy. Using local novocaine, a mirror, and two non-medical colleagues holding retractors, he operated for 1 hour and 45 minutes on himself, successfully removed his necrotic appendix, and made a complete recovery within two weeks.",
    },
  ],
};

function getEmergencyFallbackTopic(accountId: string): { topic: string; research_context: string } {
  const list = EMERGENCY_TOPIC_BANK[accountId] || EMERGENCY_TOPIC_BANK.canvas_center;
  const picked = list[Math.floor(Math.random() * list.length)];
  return picked;
}
