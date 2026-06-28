// scripts/seed-topics.ts
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

import { query } from '../lib/database';

type SeedTopic = {
  title: string;
  research_context: string;
};

const SEEDS: [string, string, SeedTopic[]][] = [
  [
    'SaaS & AI Tools',
    'tech_shots',
    [
      {
        title: 'How Make.com replaced 12 people and nobody got fired',
        research_context: 'In early 2024, a mid-sized logistics company was drowning in manual data entry. 12 employees spent 6 hours a day copying shipping manifests from email PDFs into an AS400 legacy system. The CTO built a Make.com scenario: Webhooks caught the emails, Google Cloud Document AI extracted the text, and an HTTP module pushed it via API. Processing time dropped from 45 minutes per manifest to 1.2 seconds. Error rate dropped from 8% to 0%. The 12 employees were not fired; they were retrained as logistics coordinators, managing exceptions and negotiating freight rates, directly increasing company margin by 14% in Q3.'
      },
      {
        title: 'The Claude prompt that reviews a contract in 4 minutes',
        research_context: 'A solo real estate attorney was spending 3 hours per commercial lease review. She implemented a specific Claude 3.5 Sonnet prompt: "Act as a ruthless commercial real estate litigator in New York. Review this lease and output only three things: 1. Non-standard liability clauses. 2. Hidden fee escalations. 3. Missing tenant protections." By uploading the PDF directly to Claude, the review time dropped to 4 minutes. She increased her capacity from 4 reviews a week to 30, scaling her solo practice revenue by 400% without hiring a paralegal.'
      },
      {
        title: 'When a 2000-person company ripped out Confluence overnight',
        research_context: 'A 2000-person SaaS company realized their Confluence instance had 45,000 pages, but search success rate was under 20%. Instead of organizing it, the CIO ripped it out over a weekend. They migrated entirely to Notion and deployed Notion AI. The mandate: no more hierarchical folders. Employees simply ask the AI: "What is the Q4 roadmap for the checkout team?" Notion AI synthesizes the answer across databases. Time spent searching for documents plummeted by 8.5 hours per employee per month, saving an estimated $12 million in lost productivity annually.'
      },
      {
        title: 'How Cursor went from 0 to $100M ARR in 21 months with 0 salespeople',
        research_context: 'Cursor, the AI-powered code editor built on VS Code, reached $100 million in annual recurring revenue in November 2024 — just 21 months after launch. They did it without a single salesperson. No enterprise sales team, no cold outreach, no demo calls. Their entire growth engine was: developers trying the free tier, experiencing the "tab-to-accept" autocomplete magic, telling their teammates, and teams self-serving into the $20/month Pro plan. The viral loop was built into the product itself — every time a developer used Cursor in a pairing session or screen share, it was a live demo. By the time enterprise procurement teams came knocking, entire engineering orgs were already on it. Cursor proved that in AI tools, product-led growth with a genuinely magical UX outpaces any sales org.'
      },
      {
        title: 'The $40M typo that nuked a SaaS company\'s entire production database',
        research_context: 'In 2017, a senior engineer at GitLab accidentally ran `rm -rf` on the wrong directory during a routine database replication fix. The command targeted the primary database server instead of the lagging secondary. Within seconds, 300GB of production data was gone. Six hours of replication delay meant the secondary only had data up to 6 hours prior. The team scrambled to restore from backups — and discovered the S3 backup system had been silently failing for weeks. LSN (Log Sequence Number) gaps made WAL replay impossible. They were able to recover roughly 10GB of data from a staging server that happened to be a few hours behind, but 6 hours of issues, merge requests, and comments were permanently lost. GitLab famously live-streamed the entire 18-hour recovery attempt on YouTube. No customer sued them because the radical transparency built more trust than a perfectly hidden outage ever could.'
      },
      {
        title: 'The AI customer support agent that deflected 73% of tickets but killed the company\'s NPS',
        research_context: 'In 2024, a Series B B2B SaaS company deployed an LLM-powered customer support chatbot built on GPT-4 with full documentation RAG. The bot achieved 73% ticket deflection within 3 months — a metric the board celebrated. But something else happened: Net Promoter Score dropped from 62 to 41 in the same period. Qualitative follow-ups revealed the issue: the bot answered questions correctly, but it destroyed the human signal customers used to escalate urgent issues. Before the bot, a customer saying "this is causing downtime" would trigger a human escalation within 5 minutes. The bot treated every ticket identically, sending thoughtful, correct, 400-word responses while the customer\'s production was on fire. The company added a "this is urgent" keyword detection layer to fast-track critical tickets to humans, and NPS recovered to 58 within two quarters. The lesson: AI efficiency and human escalation paths are not competing priorities — they are layers in a stack.'
      },
      {
        title: 'How Linear redesigned the humble issue tracker into a $400M company',
        research_context: 'In 2019, Tuomas Artman, a former Uber engineer, looked at Jira and saw a product that had become a configuration management nightmare. Teams spent more time configuring workflows than building software. Linear started with a radical constraint: no configurable workflows. Instead, they optimized for one thing — keyboard-driven speed. Every action in Linear takes under 100ms. The UI renders at 60fps through aggressive local state management. The result: engineers reported spending 83% less time in their project management tool. Linear reached $400M valuation with a team of under 50 people, proving that in a market dominated by an incumbent (Atlassian, market cap $60B+), you do not compete on features. You compete on philosophy. Linear\'s bet: opinionated speed beats configurable everything.'
      },
      {
        title: 'The AWS S3 us-east-1 outage that broke the entire internet in 2017',
        research_context: 'On February 28, 2017, an AWS S3 engineer was debugging a billing issue and accidentally typed a command to remove a small number of servers from the S3 indexing subsystem. Due to a typo, far more servers were taken offline than intended. S3\'s index subsystem manages the metadata lookup for every object — without it, no object can be located. The outage took down S3 in us-east-1, which hosts a disproportionate share of the internet because it is AWS\'s oldest and default region. Slack file uploads died. Trello image attachments broke. Quora, Coursera, and the entire US Securities and Exchange Commission EDGAR filing system went dark. Even Amazon\'s own status dashboard relied on S3 and went down — meaning the status page reporting the S3 outage was itself unavailable. The outage lasted 4 hours. AWS subsequently redesigned the dashboard to run on a separate region and added guardrails requiring staged rollbacks for capacity changes. One mistyped command, $150M+ in estimated downstream economic impact.'
      }
    ],
  ],
  [
    'Financial Forensics',
    'finance_shots',
    [
      {
        title: 'The $4.7M typo that erased a fortune in 14 seconds',
        research_context: 'In 2014, a junior trader at a Japanese brokerage firm intended to sell 1 share of J-Com stock for 610,000 yen. Instead, due to fatigue and a clunky UI, he submitted an order to sell 610,000 shares for 1 yen each. The order went live on the Tokyo Stock Exchange. Algorithmic trading bots instantly scooped up the heavily discounted shares. The firm desperately tried to cancel the order, but the exchange\'s protocol did not allow it. In exactly 14 seconds, the firm lost 27 billion yen (roughly $225 million USD at the time), wiping out their entire quarterly profit.'
      },
      {
        title: 'Two pizzas bought with Bitcoin now worth $680 million',
        research_context: 'On May 22, 2010, Laszlo Hanyecz, a programmer in Florida, made a post on the BitcoinTalk forum offering 10,000 BTC for a couple of pizzas. A British user named Jeremy Sturdivant took the deal, ordering two Papa John\'s pizzas to Laszlo\'s house for $25. At the time, 10,000 BTC was worth about $41. Today, at a Bitcoin price of $68,000, those two pizzas cost $680 million. Laszlo has stated he doesn\'t regret it, as he was proving that Bitcoin could actually be used as a medium of exchange.'
      },
      {
        title: 'How Wirecard fooled auditors into believing $2B existed',
        research_context: 'Wirecard, a German payment processor darling, claimed to have €1.9 billion sitting in trustee accounts in the Philippines. Ernst & Young (EY) audited them for years. Wirecard executives simply forged bank confirmations and set up fake websites for the trustee banks. When auditors wanted to visit the banks in Manila, Wirecard organized highly choreographed theatrical visits with fake bank employees. The fraud collapsed in June 2020 when the actual Philippine banks (BDO and BPI) publicly stated the documents were forged and the money never existed. Wirecard filed for insolvency, owing creditors €3.2 billion.'
      },
      {
        title: 'The Flash Crash of 2010: $1 trillion vanished in 36 minutes',
        research_context: 'On May 6, 2010, at 2:32 PM, the Dow Jones Industrial Average plunged 998.5 points — roughly 9% of its value — in 36 minutes, wiping out over $1 trillion in market capitalization. The trigger? A single trader, Navinder Singh Sarao, operating out of his parents\' London home, used an automated trading program to "spoof" the market with $200M worth of fake sell orders on the E-mini S&P 500 futures contract. Algorithmic trading firms reacted to the phantom sell pressure by executing real sell orders, triggering a cascade. Accenture\'s stock fell from $40 to $0.01 in seconds. Apple briefly traded at $100,000 per share as liquidity completely evaporated. Prices snapped back almost as fast as they fell, with some trades later canceled as "clearly erroneous." Sarao was eventually extradited to the US, pleaded guilty, and was sentenced to time served plus home detention. The SEC never fully fixed the structural vulnerabilities — spoofing accounted for 30% of order-book activity on some exchanges in 2023.'
      },
      {
        title: 'How Nick Leeson\'s single hidden account sank the 233-year-old Barings Bank',
        research_context: 'In 1992, Nick Leeson, a 25-year-old derivatives trader from Watford, was sent to Singapore to handle back-office settlements for Barings Bank — a 233-year-old British institution that counted the Queen among its clients. Leeson was simultaneously chief trader and head of settlement, meaning he was managing both the trades and the books that recorded them. He opened a secret error account — #88888 — to hide a subordinate\'s £20,000 mistake. By 1994, he was converting small hidden losses into massive unauthorized bets on the Nikkei 225. Then the Kobe earthquake hit in January 1995. The Nikkei plunged. Leeson doubled down rather than admit the loss, buying massive futures positions. By the time he fled Singapore on February 23, 1995, leaving a note that read "I\'m sorry," Barings had accumulated £827 million in losses — roughly double the bank\'s trading capital. Barings collapsed. ING bought it for £1.'
      },
      {
        title: 'The $6B Nasdaq glitch that crashed Apple stock for 41 minutes',
        research_context: 'On August 22, 2013, Nasdaq halted trading in all listed stocks for over three hours due to a software bug in the Securities Information Processor (SIP) — the system that consolidates and disseminates stock quotes. A flood of quote updates from the NYSE Arca exchange overwhelmed a connection, causing the SIP to repeatedly reset and reconnect in a 5-second cycle. During the outage, Apple stock couldn\'t trade. Neither could Google. Microsoft. Amazon. Facebook. Roughly $6 trillion in market value sat frozen. The root cause was a race condition in the SIP\'s software that had been present for years but never triggered at this scale. The SEC fined Nasdaq $10M — the largest penalty ever against an exchange at the time — for failing to design the SIP to handle the capacity it was rated for. What was worse: Nasdaq engineers could see the issue on their monitoring dashboards but had no mechanism to patch it while the system was running. The fix required a full restart, which took hours of coordination to avoid data corruption.'
      },
      {
        title: 'How Michael Burry made $800M betting against the housing market after everyone laughed at him',
        research_context: 'In 2005, Dr. Michael Burry — a one-eyed neurologist turned hedge fund manager — read through hundreds of pages of mortgage bond prospectuses and discovered something terrifying: the underlying mortgages backing AAA-rated bonds were almost entirely subprime, with teaser rates set to reset in 2007. He realized homeowners with zero income documentation would face payment shocks they could not absorb. Defaults would cascade. Burry approached Goldman Sachs and other banks with an audacious request: he wanted to buy credit default swaps (CDS) — essentially insurance — on the very mortgage bonds the banks were selling as ironclad. The banks laughed and eagerly sold him the swaps, collecting his premiums as free money. For 2 years, Burry\'s investors berated him as premiums bled the fund. He was down double digits while the market roared. When the housing market cracked in 2007, the CDS positions exploded in value. His fund, Scion Capital, returned 489% to investors who stayed. Burry\'s personal take: $100 million. His investors collectively gained $700 million. The banks that had laughed at him needed $700 billion in government bailouts.'
      },
      {
        title: 'The FTX balance sheet that was scribbled on a single-page napkin',
        research_context: 'When FTX filed for bankruptcy on November 11, 2022, the restructuring team led by John J. Ray III (who had previously handled the Enron liquidation) found something astonishing: the company\'s "balance sheet" was partially maintained in QuickBooks, but a significant portion of assets — including over $8 billion in customer funds — were tracked in a single Excel spreadsheet riddled with formula errors. There was no auditable general ledger. No reconciliation between exchange wallets and customer deposits. No approval workflow for Alameda Research using FTX customer funds as a personal trading account. Employees communicated sensitive financial approvals through disappearing Signal messages set to auto-delete. The new CEO, who had spent 40 years restructuring companies, told Congress: "Never in my career have I seen such a complete failure of corporate controls and such a complete absence of trustworthy financial information as occurred here." Sam Bankman-Fried was convicted on 7 counts of fraud and sentenced to 25 years. The $8 billion hole in customer funds remains the largest individual financial fraud in crypto history.'
      }
    ],
  ],
  [
    'Stoic Philosophy',
    'stoic_shots',
    [
      {
        title: 'Marcus Aurelius wrote Meditations during a plague that killed 5 million',
        research_context: 'Between 165 and 180 AD, the Antonine Plague devastated the Roman Empire, killing an estimated 5 million people, including up to 2,000 a day in Rome. The economy collapsed, and the army was decimated. During this apocalyptic scenario, Emperor Marcus Aurelius was stuck on the frozen northern frontier fighting Germanic tribes. In his tent at night, surrounded by death and war, he wrote Meditations—not for publication, but as a private journal to keep himself sane. He constantly reminded himself: "The mind adapts and converts to its own purposes the obstacle to our acting." He never complained in the text.'
      },
      {
        title: 'Epictetus was a crippled slave who became Rome\'s greatest philosopher',
        research_context: 'Epictetus was born a slave in 50 AD. His master, Epaphroditus, was a violent man who deliberately snapped Epictetus\'s leg, leaving him permanently crippled. According to legend, as the leg was being broken, Epictetus calmly said, "You will break it." When it snapped, he added, "Did I not tell you that you would break it?" He focused entirely on the Dichotomy of Control: he could not control his enslaved body, but his mind was completely free. He eventually gained his freedom, founded a school, and became so respected that Emperor Hadrian attended his lectures.'
      },
      {
        title: 'James Stockdale: 7 years as a POW, kept alive by Epictetus',
        research_context: 'Vice Admiral James Stockdale was shot down over Vietnam in 1965. As he parachuted into enemy territory, he recalled the teachings of Epictetus: "I am leaving the world of technology and entering the world of Epictetus." He was held in the Hanoi Hilton for 7 years, tortured 15 times, put in leg irons, and kept in solitary confinement. He survived by brutally accepting his reality while maintaining absolute faith he would prevail. He noted that the optimists died first—they kept hoping to be out by Christmas, and died of broken hearts. Stockdale used Stoicism as a literal survival protocol.'
      },
      {
        title: 'Seneca was a billionaire philosopher who practiced poverty every month',
        research_context: 'Seneca was one of the richest men in the Roman Empire — a senator, playwright, and advisor to Emperor Nero with an estimated net worth of 300 million sesterces (roughly $75 million in today\'s terms). But once a month, Seneca would eat only the cheapest bread, sleep on the floor, and wear rags. He called this practice "premeditatio malorum" — the premeditation of evils. By voluntarily experiencing poverty, he was inoculating himself against the fear of losing his wealth. He wrote: "Set aside a certain number of days during which you shall be content with the scantiest and cheapest fare, saying to yourself the while: Is this the condition that I feared?" The irony was not lost on Roman society — he was accused of hypocrisy for preaching simplicity while amassing a fortune. He addressed this directly in On the Happy Life: "The wise man does not love wealth, but he prefers it. He does not receive it into his spirit, but into his house." His voluntary discomfort practice is now backed by modern psychology as exposure therapy.'
      },
      {
        title: 'Cato the Younger tore out his own intestines rather than live under tyranny',
        research_context: 'In 46 BC, Julius Caesar had won the civil war and became dictator of Rome. Cato the Younger — the Senate\'s most principled Stoic — refused to live in a world ruled by a tyrant. Holed up in the North African city of Utica, he read Plato\'s Phaedo twice and then attempted suicide by stabbing himself in the abdomen with his own sword. His friends rushed in, found him still alive, and called a surgeon who pushed his intestines back inside and stitched the wound. Cato waited until they left the room, then ripped the stitches open with his bare hands and pulled out his own intestines, completing the act. He became the Stoic martyr for liberty. Every Roman who later resisted tyranny — from Brutus to Thrasea Paetus — invoked Cato\'s name. Seneca wrote: "Even if you conquer Cato, the gods themselves will be amazed." For the Stoics, death was not a tragedy — compromising your principles was. Cato proved that the ultimate act of freedom was the choice to die rather than submit.'
      },
      {
        title: 'Ryan Holiday dropped out of college at 19, read Epictetus, and built a $40M philosophy empire',
        research_context: 'In 2006, Ryan Holiday was a 19-year-old college dropout working as an assistant to Robert Greene, author of The 48 Laws of Power. In a moment of professional crisis, Greene handed him Epictetus. The teachings rewired Holiday\'s brain. By 21, he was the Director of Marketing at American Apparel, creating viral stunts that placed the brand at the center of internet attention. By 25, he published his first book, Trust Me I\'m Lying, detailing the media manipulation tactics he had personally used. But it was The Obstacle Is the Way in 2014 that broke through, translating Marcus Aurelius into a formula even NFL coaches and CEOs could apply. The book became a locker-room staple — the New England Patriots credited it during their Super Bowl run, and it spread through the NBA. Amazon bought the audiobook rights. Holiday launched the Daily Stoic in 2016 — a daily email with one Stoic passage and interpretation — now reaching over 800,000 subscribers. The Daily Stoic brand expanded into books, a podcast, challenge coins, and a physical challenge coin club. Estimated annual revenue across all channels exceeds $10 million. Holiday proved that a 2,000-year-old philosophy, packaged with modern media rigor, could build a direct-to-consumer education business at scale.'
      },
      {
        title: 'Zeno founded Stoicism after a shipwreck destroyed his entire life\'s wealth',
        research_context: 'Around 300 BC, Zeno of Citium was a wealthy merchant trader transporting Tyrian purple dye — the most valuable commodity in the ancient world — across the Mediterranean. His ship sank near Athens. Everything was lost. Stranded and broke, Zeno wandered into an Athenian bookshop and heard the bookseller reading aloud from Xenophon\'s Memorabilia of Socrates. Intrigued, he asked where he could find such a man. At that exact moment, the Cynic philosopher Crates of Thebes walked past the shop. The bookseller pointed: "Follow that man." Zeno studied under Crates for years, absorbing the Cynic emphasis on virtue and indifference to external goods. But he found Cynicism too extreme — too antagonistic to society. So he synthesized Cynic ethics with the logic of Aristotle and the physics of the pre-Socratics, creating a new school of philosophy he taught at the Stoa Poikile (Painted Porch) in the Athenian Agora. He taught that virtue was the only true good, but unlike the Cynics, he said wealth, health, and reputation were "preferred indifferents" — nice to have but irrelevant to happiness. Zeno\'s teachings were so attractive that his followers were called "Zenonians" until they rebranded as "Stoics" after the porch where he taught. The man who lost everything created a system to prove you could lose everything and still flourish.'
      },
      {
        title: 'Victor Frankl survived Auschwitz by inventing the last great Stoic-compatible philosophy',
        research_context: 'In September 1942, Viktor Frankl, a 37-year-old Viennese psychiatrist, was arrested by the Nazis and deported to Theresienstadt, then to Auschwitz, and finally to Kaufering and Türkheim. His pregnant wife, his mother, and his brother were all murdered in the camps. He was stripped of his manuscript, his clothes, his name — replaced by number 119104. In the camps, Frankl observed something that contradicted every existing survival theory: those who found meaning in their suffering survived. Those who lost meaning died — regardless of physical strength. A man who knew his child was alive in another camp would survive typhus, starvation, and 14-hour workdays. A physically stronger man would die within days because he had lost his "why." After liberation, Frankl wrote Man\'s Search for Meaning in 9 days, dictating it while weeping. The book sold over 16 million copies in 52 languages. While Frankl was not a Stoic, his core insight — "Between stimulus and response there is a space. In that space is our power to choose our response" — is functionally identical to Epictetus\'s Dichotomy of Control. Logotherapy, his therapeutic method, helps patients find meaning *in* suffering rather than escape suffering entirely. The Library of Congress named it one of the ten most influential books in America.'
      }
    ],
  ],
  [
    'Urban Survival',
    'survival_shots',
    [
      {
        title: 'The 2003 blackout that blacked out 8 states in 6 seconds',
        research_context: 'On August 14, 2003, a high-voltage power line in Ohio sagged into untrimmed trees and shorted out. Due to a software bug in the alarm system, operators were blind. The load shifted to other lines, overloading them. Within 6 seconds, a cascading failure rippled across the grid. 50 million people across 8 US states and Ontario lost power. Water pumps stopped, trapping people in subways; ATMs died; gas stations couldn\'t pump fuel. In Manhattan, thousands walked miles across bridges to get home. It proved that modern urban infrastructure has zero redundancy for power loss.'
      },
      {
        title: 'FEMA says 72 hours — every survival instructor stocks 14 days',
        research_context: 'FEMA officially recommends citizens keep a 72-hour supply of food and water. However, every professional emergency manager and survival instructor maintains a minimum 14-day supply. The 72-hour myth stems from the assumption that federal aid can mobilize in three days. During Hurricane Katrina (2005) and Hurricane Maria (2017), isolated urban and suburban pockets went over 10 days without clean water or organized food distribution. A 14-day supply bridges the gap between local collapse and federal logistical setup.'
      },
      {
        title: 'Cell networks die in 12 minutes — the $25 radio that survives',
        research_context: 'During the 2013 Boston Marathon bombing, cellular networks completely crashed within 12 minutes. The towers weren\'t destroyed; they were overwhelmed by everyone trying to call simultaneously. The same happens in earthquakes and blackouts. While digital communications fail instantly, analog UHF/VHF frequencies remain functional. A $25 Baofeng UV-5R ham radio can listen to NOAA weather broadcasts, police dispatch (if unencrypted), and emergency services. It requires no cellular backhaul, making it the only reliable source of information when the digital grid locks up.'
      },
      {
        title: 'Hurricane Katrina destroyed 70% of New Orleans homes — the 3 houses that stayed standing shared one thing',
        research_context: 'After Hurricane Katrina\'s storm surge overwhelmed New Orleans levees in August 2005, over 70% of the city\'s housing stock was damaged or destroyed — 134,000 housing units. When structural engineers surveyed the wreckage, they found a pattern: the homes that survived with minimal damage were almost exclusively built before 1940. The reason was counterintuitive. Older homes were constructed with old-growth cypress and heart pine — wood so dense and resin-rich it is naturally rot-resistant and insect-repellent. Modern homes used plantation-grown southern yellow pine, which is structurally weaker and absorbs water 3x faster. The old homes also had elevated foundations on brick piers that allowed floodwater to flow underneath rather than pressuring walls, and they had continuous ridge vents that equalized wind pressure — a feature eliminated from most 1970s tract housing to cut costs. The survival of pre-1940 construction reshaped FEMA\'s post-Katrina rebuilding guidelines, which now mandate both pier elevation and ridge venting in all flood-zone reconstruction.'
      },
      {
        title: 'The Fukushima operator who stayed behind when the radiation alarms screamed at 1,000x lethal dose',
        research_context: 'On March 11, 2011, after a 9.0 magnitude earthquake and 15-meter tsunami knocked out the Fukushima Daiichi nuclear plant\'s cooling systems, radiation levels inside the reactor buildings began spiking exponentially. TEPCO ordered a full evacuation. But roughly 70 workers — later called the "Fukushima 50" — refused to leave. Plant manager Masao Yoshida defied direct orders from TEPCO headquarters and stayed with his team, knowing they were the only barrier between a partial meltdown and a full core breach that would require evacuating Tokyo — 30 million people. Inside the reactor building, radiation reached 1,000 millisieverts per hour — a lethal dose in under 20 minutes. Workers took 90-second shifts to manually vent reactor vessels, rotating through like a bucket brigade where each person was absorbing a year\'s worth of safe radiation in under a minute. They ran cables from car batteries to power makeshift cooling pumps. By March 15, they had managed to inject seawater into all three damaged reactors using fire trucks, preventing a complete meltdown. None of the Fukushima 50 died from acute radiation poisoning — their rotation system worked — but several received doses above the lifetime occupational limit of 100 mSv. Masao Yoshida died of esophageal cancer in 2013 at age 58, though TEPCO maintains it was not linked to radiation exposure. His final interview: "I thought we were all going to die. But we couldn\'t leave. You don\'t abandon a burning ship when you\'re the only ones who know where the fire extinguisher is."'
      },
      {
        title: 'The NYC blackout of 1977: 1,700 stores looted, 3,800 arrests in 25 hours',
        research_context: 'On July 13, 1977, lightning struck a Con Edison substation on the Hudson River at 8:37 PM. Two more strikes followed within minutes, tripping critical transmission lines. Normally, the grid would have shed load gracefully — but a maintenance error had left the primary circuit breaker locked in the open position, and the backup failed to engage. At 9:27 PM, New York City went dark. But unlike the 2003 blackout — which saw neighborly cooperation and zero looting — the 1977 blackout coincided with a heat wave, the Son of Sam serial killer panic, and the city being functionally bankrupt. Within an hour, looting erupted across Brooklyn, the Bronx, and Harlem. Roving groups smashed storefronts and emptied inventory. Some shop owners stood on rooftops with rifles guarding their property — NYPD could not respond to all 1,037 fires set that night. By the time power was restored 25 hours later, police had made 3,776 arrests — the largest mass arrest in US history — and 1,616 stores were damaged. Total economic damage: over $300M ($1.5B in 2024 dollars). The blackout exposed a grim truth about urban survival: a city\'s resilience is determined less by its infrastructure than by the social fabric when that infrastructure fails. Two identical blackouts, 26 years apart, produced opposite outcomes — because in 2003, the city had trust, functional communities, and working institutions. In 1977, it had none.'
      },
      {
        title: 'The Pentagon\'s classified EMP report: 90% of Americans dead within 12 months of a Carrington-level event',
        research_context: 'In 1859, amateur astronomer Richard Carrington observed a massive solar flare erupt from the Sun. Eighteen hours later, the resulting coronal mass ejection hit Earth\'s magnetosphere. Telegraph wires across North America and Europe burst into flames. Some operators were thrown across the room by the induced current. The Northern Lights were visible as far south as Cuba. This was the Carrington Event. In 2008, the National Academy of Sciences, under commission from the Department of Defense, modeled what a Carrington-level CME would do to the modern power grid. Their findings were declassified in 2010: the induced geomagnetic current would melt the copper windings in roughly 350 of the largest Extra High Voltage (EHV) transformers in the US grid. These transformers weigh 200-400 tons each, are custom-built per installation, and have an average manufacturing lead time of 18-24 months. With a global backlog of roughly 100 units per year, complete grid restoration would take 4 to 10 years. The cascading consequence: no water pumps, no sewage treatment, no refrigeration, no fuel pumps, no hospital equipment, no telecommunications. The report estimated that within 12 months without power, up to 90% of the US population would die — from starvation, disease, and societal breakdown. There are currently fewer than 10 spare EHV transformers in the entire United States. The EMP Commission\'s recommendation to stockpile 350 units at an estimated cost of $2B has never been funded by Congress.'
      },
      {
        title: 'How improvised water filtration saved 2.6 million people during the Bangladesh cholera epidemic',
        research_context: 'In the 1990s, cholera — a waterborne bacterial disease — was killing an estimated 100,000 people annually in rural Bangladesh, where 97% of the population relied on surface water contaminated with human waste. Western NGOs repeatedly tried to install expensive ceramic filters and chemical treatment plants, but they required supply chains, replacement parts, and maintenance budgets that dissolved the moment funding ran out. In 1999, researcher Dr. Rita Colwell learned that rural women were filtering water through eight layers of their cotton saris. She was skeptical, so she ran an experiment: she had women in 65 villages filter their drinking water through four layers of sari cloth folded eight times. The results stunned the scientific community. The 20-micron cotton weave trapped plankton carrying Vibrio cholerae bacteria. Cholera incidence dropped by 48% across the study villages — comparable to the effectiveness of a cholera vaccine. It cost nothing and required no supply chain. The intervention was later adopted as a formal WHO recommendation for cholera outbreaks when clinical resources are unavailable. The sari filter is now taught as an S-level (immediate life-saving) technique in urban survival training alongside tourniquet application and water boiling protocols.'
      }
    ],
  ],
];

async function main() {
  let inserted = 0;
  let skipped = 0;

  for (const [niche, accountId, topics] of SEEDS) {
    console.log(`Seeding ${niche} (${accountId})...`);
    for (const data of topics) {
      try {
        const res = await query(
          `INSERT INTO slideshow_topics (topic, research_context, niche, account_id) 
           VALUES ($1, $2, $3, $4) 
           ON CONFLICT (topic, account_id) DO UPDATE 
           SET research_context = EXCLUDED.research_context`,
          [data.title, data.research_context, niche, accountId]
        );
        if ((res.rowCount ?? 0) > 0) {
          inserted++;
        } else {
          skipped++;
        }
      } catch (err: any) {
        console.error(`  Failed to insert: "${data.title.slice(0, 60)}..." — ${err.message}`);
      }
    }
  }

  console.log(`\nDone. Inserted/Updated ${inserted}, skipped ${skipped} (duplicates without changes).`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});