// scripts/seed-data.ts
export type SeedTopic = {
  title: string;
  research_context: string;
};

export const SEEDS: [string, string, SeedTopic[]][] = [
  // ─── Trade Wealth (canvas_center) ────────────────────────────────────
  [
    'Trade Wealth',
    'canvas_center',
    [
      {
        title: 'The $40K equipment lease decision that builds or breaks a small HVAC business',
        research_context: 'Breakdown of buying vs leasing a $40K HVAC service van. Leasing a $40K van might cost $800/month, which directly eats into operating cash flow during the slow shoulder seasons. Buying outright using a business loan allows you to take a Section 179 deduction for full depreciation in year one, drastically lowering tax burden, but ties up capital. The right decision depends entirely on whether your bottleneck is monthly cash flow or end-of-year tax liability.'
      },
      {
        title: 'Why most electricians underprice their first year — the real hourly math',
        research_context: 'When an electrician transitions from employee to owner-operator, they typically anchor their rate to their old $35/hr wage. They fail to account for non-billable time (driving, estimating), commercial auto insurance ($3,000/yr), general liability ($1,500/yr), and self-employment taxes (15.3%). To net $35/hr, a solo electrician actually needs to charge upwards of $120/hr just to break even on overhead and unbillable hours.'
      },
      {
        title: 'One contractor\'s real numbers: solo operator to a 4-man crew',
        research_context: 'The "Valley of Death" in trade businesses occurs when scaling from 1 to 4 employees. As a solo operator, you might gross $250k and take home $150k. But when you hire a crew, you suddenly face workers\' comp (often 10-15% of payroll for trades), payroll taxes, vehicle maintenance, and a massive drop in your own billable hours. A business with a 4-man crew might gross $800k but the owner\'s take-home often drops to $100k until they achieve enough volume to cover the new overhead.'
      },
      {
        title: 'S-corp vs. LLC for a trade business — the actual dollar difference',
        research_context: 'Most solo tradesmen start as a single-member LLC, meaning all net profit is subject to the 15.3% self-employment tax. Once the business nets over roughly $60,000 to $80,000 annually, remaining an LLC is a massive financial mistake. By electing S-Corp status, the owner can pay themselves a reasonable salary and take the rest as a shareholder distribution, completely exempt from the 15.3% self-employment tax, often saving $5,000+ in taxes the very first year.'
      },
      {
        title: 'The truck-vs-financing decision nobody explains to new contractors',
        research_context: 'The psychological trap of buying a brand-new $80k F-250 Platinum to project "success" as a new contractor. An $80k truck financed over 60 months results in a $1,500 monthly payment. In the trades, cash flow is highly seasonal. Having a $1,500 fixed liability every single month destroys the cash reserves needed to float payroll when contractors delay their net-30 or net-60 payments for completed jobs.'
      },
      {
        title: 'How a plumbing business owner built a $2M exit in 12 years',
        research_context: 'Private equity and competitors do not buy trade businesses because the owner is a highly skilled plumber; they buy the cash flow and customer base. A plumbing business that relies entirely on emergency calls is worth 1-2x earnings. A business that has 1,000 active $20/month preventative maintenance contracts has predictable, recurring revenue and commands a 4-5x multiple. The $2M exit requires transitioning from a transactional business to a recurring revenue model.'
      },
      {
        title: 'Why "cash business" habits quietly cap what a trade business is worth',
        research_context: 'Pocketing cash for side jobs feels like a tax hack, but it artificially suppresses the company\'s gross revenue and net profit on tax returns. When the owner wants to sell the business for a 3x multiple, every $10,000 of unreported cash costs them $30,000 in valuation. Furthermore, it severely limits borrowing capacity for lines of credit or equipment financing, capping the business\'s ability to scale.'
      },
      {
        title: 'The insurance mistake that ends small contracting businesses',
        research_context: 'Carrying only a basic $1M General Liability policy while operating commercial vehicles and performing high-risk work. If an apprentice causes a severe water leak that destroys a commercial property, or gets into an at-fault accident in the company truck, damages can easily exceed $1M. Without a commercial umbrella policy (which costs just a few hundred dollars a year), the resulting lawsuit will pierce the corporate veil and liquidate the owner\'s personal assets.'
      },
      {
        title: 'Apprentice to owner: the real financial turning points in a trade career',
        research_context: 'The fundamental identity shift from technician to manager. When you make $20/hr, your value is turning wrenches. When you own the company, every hour you spend turning a wrench is an hour you aren\'t doing estimating, marketing, or recruiting. The turning point is when the owner fires themselves from field work; revenue often dips temporarily before skyrocketing, as the owner finally has time to focus on lead generation and operational efficiency.'
      },
      {
        title: 'What a bank actually checks before financing a contractor\'s second truck',
        research_context: 'When a young contracting company tries to finance their second truck, banks ignore top-line revenue. They look at the Debt Service Coverage Ratio (DSCR)—the cash flow available to pay current debt obligations. If the owner has been artificially suppressing profit to avoid taxes, the DSCR will be too low. Banks also require 3-6 months of operating expenses in liquid cash reserves because trade businesses are notoriously vulnerable to economic downturns.'
      }
    ]
  ],

  // ─── The Case File (canvas_area) ────────────────────────────────────
  [
    'The Case File',
    'canvas_area',
    [
      {
        title: 'The memo that predicted a company\'s collapse years early',
        research_context: 'In August 2001, Enron Vice President Sherron Watkins wrote an anonymous, multi-page memo to CEO Kenneth Lay. The memo warned that the company\'s accounting practices, specifically the use of \'special purpose entities\' like the Raptor partnerships managed by CFO Andrew Fastow, were essentially a massive fraud used to hide toxic assets and debt. She explicitly warned that Enron \'will implode in a wave of accounting scandals.\' Lay ignored the warning and instead ordered lawyers to find a way to fire her. Within months, the company filed for the largest bankruptcy in US history at the time, destroying thousands of jobs and billions in retirement savings. Source: https://en.wikipedia.org/wiki/Sherron_Watkins'
      },
      {
        title: 'The letter written hours before an outcome that changed everything',
        research_context: 'On the eve of his fatal duel with Vice President Aaron Burr in July 1804, Alexander Hamilton penned a deeply introspective final letter and statement of his intentions. In this document, Hamilton outlines his moral and religious objections to dueling, his desire to avoid the conflict, and his fateful decision to \'throw away\' his first fire—intentionally missing Burr. This single document completely frames the historical understanding of the duel, transforming Hamilton from an aggressive political rival into a martyr who died defending his honor without compromising his morality, fundamentally altering the trajectory of early American political history. Source: https://founders.archives.gov/documents/Hamilton/01-26-02-0001-0264'
      },
      {
        title: 'The court transcript nobody read before the verdict',
        research_context: 'During the 1692 Salem Witch Trials, the official court examination transcript of Tituba, an enslaved woman in the Parris household, became the catalyst for mass hysteria. When pressured by magistrates, Tituba broke from the expected denial and instead confessed, weaving a vivid and terrifying narrative of the devil\'s \'black book,\' familiars, and a vast conspiracy of witches operating within the village. Her testimony, perfectly tailored to Puritan fears, transformed isolated accusations of spectral affliction into a massive, state-sanctioned witch hunt that resulted in the execution of 20 people. Source: https://salem.lib.virginia.edu/texts/tei/default.html'
      },
      {
        title: 'The signature that was forged — and went uncaught for decades',
        research_context: 'In 1984, Mark Hofmann \'discovered\' the Salamander Letter, a document purportedly written by Martin Harris, an early witness to the golden plates of the Latter Day Saint movement. The letter claimed Joseph Smith was guided to the plates not by an angel, but by a \'white salamander,\' threatening the foundational narrative of the LDS Church. The forgery was so brilliant it fooled forensic experts and historians for years. When Hofmann\'s massive forgery enterprise began to unravel under financial pressure, he resorted to building pipe bombs, killing two people in Salt Lake City in a desperate attempt to cover his tracks and deflect attention. Source: https://en.wikipedia.org/wiki/Salamander_letter'
      },
      {
        title: 'The ledger that exposed a fraud',
        research_context: 'During the Prohibition era, notorious Chicago mobster Al Capone seemed untouchable, avoiding convictions for murder and bootlegging. The turning point came when federal agents raided the Hawthorne Hotel in Cicero, Illinois, in 1926. Amidst the seized evidence was a seemingly mundane accounting book known as the \'Special Ledger.\' It meticulously tracked the massive illicit profits from Capone\'s gambling operations. Years later, IRS investigator Frank Wilson and his team tied the handwriting and the entries directly to Capone\'s inner circle, providing the irrefutable financial paper trail needed to finally convict Capone of tax evasion in 1931, ending his criminal empire. Source: https://www.archives.gov/publications/prologue/2000/winter/al-capone.html'
      },
      {
        title: 'The last entry before a disappearance that was never solved',
        research_context: 'In December 1900, the three lighthouse keepers of the remote Flannan Isles vanished. For over a century, their disappearance has been framed by dramatic, deeply unsettling final logbook entries: "severe winds the likes of which I have never seen," keeper Ducat being "quiet," McArthur "crying," and a final entry reading "Storm ended, sea calm. God is over all." However, these chilling logs are a well-documented complete fabrication. They were invented by Wilfrid Wilson Gibson in his 1912 poem "Flannan Isle." The actual final logbook entries were entirely routine weather readings until they abruptly stopped. The true mystery is not supernatural, but how an ordinary shift ended in a tragic accident that swept all three experienced men into the sea, and how a poet\'s fiction became accepted as historical fact. Source: https://en.wikipedia.org/wiki/Flannan_Isles_Lighthouse#1900_crew_disappearance'
      },
      {
        title: 'Meeting minutes that contradict the official story',
        research_context: 'In July 1977, Exxon senior scientist James Black delivered an internal presentation to the company\'s management committee, clearly demonstrating that the burning of fossil fuels was increasing CO2 levels and would cause significant global warming. Subsequent internal memos throughout the 1980s detailed precise climate models predicting the devastating effects of climate change. Despite this definitive internal knowledge, Exxon executives pivoted in the late 1980s to spearhead and fund a massive, decades-long public disinformation campaign designed to cast doubt on climate science, lobby against emissions regulations, and protect their core business. Source: https://www.scientificamerican.com/article/exxon-knew-about-climate-change-almost-40-years-ago/'
      },
      {
        title: 'The evidence that sat in an archive for decades before anyone connected it',
        research_context: 'For decades, the true identity of the Golden State Killer—responsible for 13 murders and over 50 rapes in California between 1974 and 1986—remained a mystery. The case went completely cold, though investigators preserved DNA evidence from the crime scenes in an archive. It wasn\'t until 2018 that investigator Paul Holes uploaded the decades-old DNA profile to GEDmatch, a public genetic genealogy website. By building out complex family trees from distant relatives identified in the database, investigators narrowed the suspect pool down to one man: Joseph James DeAngelo, a former police officer who had been hiding in plain sight. Source: https://en.wikipedia.org/wiki/Joseph_James_DeAngelo'
      },
      {
        title: 'The telegram that triggered a financial panic',
        research_context: 'The Panic of 1873 was one of the first global economic crises, and its rapid spread was catalyzed by the newly laid transatlantic telegraph cables. When Jay Cooke & Company, a massive US bank heavily invested in railroad expansion, abruptly declared bankruptcy, the news didn\'t take weeks to cross the ocean via ship. Instead, telegraphs instantly transmitted the shock to European financial centers. This rapid dissemination of bad news caused immediate, localized bank runs in multiple cities simultaneously, creating a cascading domino effect that locked up credit markets worldwide and triggered an economic depression that lasted for over five years. Source: https://www.richmondfed.org/publications/research/econ_focus/2021/q1/economic_history'
      },
      {
        title: 'The document that was declassified decades after it stopped mattering',
        research_context: 'In 1958, at the height of the Cold War space race and following the Soviet launch of Sputnik, the US Air Force commissioned a highly classified study known as Project A119. The plan, led by physicist Leonard Reiffel and involving a young Carl Sagan, was to detonate a nuclear weapon on the Moon. The objective was purely psychological: to create a visible mushroom cloud on the lunar terminator line that could be seen from Earth, proving American technological dominance. The plan was eventually scrapped due to fears of a launch failure and public backlash, remaining top secret until it was finally declassified and confirmed in 2000. Source: https://en.wikipedia.org/wiki/Project_A119'
      }
    ]
  ],

  // ─── Second Act (canvas_base) ────────────────────────────────────
  [
    'Second Act',
    'canvas_base',
    [
      {
        title: 'The first 90 days after bankruptcy — what rebuilds credit vs. what\'s a myth',
        research_context: 'Filing Chapter 7 bankruptcy immediately halts collections and wipes out unsecured debt, but it drops a credit score to the 300s. The rebuild doesn\'t start in a year; it starts on day one. Secured credit cards (where you put down a deposit) report positive payment history instantly. The myth is that you can\'t get credit for 7 years; the reality is that in many cases, with 12-18 months of aggressive, flawless payment history on secured lines, scores can often rebound to 650+.'
      },
      {
        title: 'One year after: how income actually recovers after a business collapse',
        research_context: 'When a founder\'s business fails, they are often left with personal guarantees on business debt and zero income. The immediate priority is stabilizing cash flow, which usually means swallowing pride and taking a W-2 job. The tactical reality is that a steady W-2 salary provides the immediate psychological relief and bankability needed to stop the bleeding, allowing the founder to negotiate settlements on the remaining debt from a position of stability.'
      },
      {
        title: 'Why starting over at 45 has real financial advantages nobody talks about',
        research_context: 'Society pathologizes starting over in middle age, but a 45-year-old has a massive invisible advantage: compound experience. They possess 20 years of soft skills—conflict resolution, negotiation, network building, and emotional regulation—that a 20-year-old lacks. While the bank account might read zero, the "human capital" is near its peak, meaning the velocity at which a 45-year-old can rebuild wealth and career momentum is exponentially faster than a true beginner.'
      },
      {
        title: 'The real cost — and real payoff — of rebuilding solo after divorce',
        research_context: 'Divorce is a catastrophic financial event: it halves the household assets while instantly doubling living expenses. The first year is brutal, often requiring a massive lifestyle downgrade. However, once the dust settles, the newly single individual gains 100% autocratic control over their financial decisions. Without a partner dragging down the budget or misaligning on goals, individuals often achieve higher savings rates in year three than they ever did while married.'
      },
      {
        title: 'What the first year of financial stability looks like after early recovery',
        research_context: 'Substance abuse completely destroys financial trust and reliability. In the first year of recovery, the financial strategy is extreme simplicity and automation. It\'s not about investing or getting rich; it\'s about setting up auto-pay, avoiding new debt at all costs, and rebuilding a 12-month track record of paying rent and utilities on time. This boring consistency rebuilds the dopamine pathways around financial responsibility.'
      },
      {
        title: 'The credit-rebuild timeline, realistically, not the myth version',
        research_context: 'Credit repair companies sell the illusion of a 30-day fix by disputing legitimate charges. The actual, mathematical timeline to repair a 500 credit score is roughly 24 months. It requires paying down credit utilization below 10%, letting hard inquiries age off, and stacking 24 consecutive months of on-time payments. Recent positive history heavily outweighs older negative history, but it requires patience, not a quick-fix loophole.'
      },
      {
        title: 'Why the second business usually outperforms the first',
        research_context: 'The first business is usually a chaotic, expensive education. Founders underprice their services, hire friends instead of professionals, and blow cash on unnecessary overhead. The second business is built on these painful lessons. The founder inherently understands unit economics, says "no" to unprofitable clients, and keeps overhead razor-thin. Consequently, the profit margins on a founder\'s second venture are typically 2-3x higher than their first.'
      },
      {
        title: 'Restarting a career after a decade out of the workforce — the real path',
        research_context: 'A 10-year resume gap (due to caregiving or illness) terrifies hiring managers because they fear skill atrophy. The most effective path back is not applying blindly on LinkedIn. The strategy involves taking low-stakes contract work, freelancing, or highly specific upskilling certifications to build a "bridge" of recent, relevant activity that proves competence and neutralizes the gap.'
      },
      {
        title: 'The one habit that separates people who actually rebuild from those who stall',
        research_context: 'The dividing line between those who successfully rebuild and those who stall is the total abandonment of the victim narrative. Successful rebuilders engage in radical acceptance: they look at their negative net worth without flinching, accept that it is unfair, and then focus entirely on forward momentum. They stop trying to "get back to where they were" and instead focus on building from where they are.'
      },
      {
        title: 'What nobody tells you about the emotional cost of a financial restart',
        research_context: 'The heaviest burden of starting over isn\'t the math; it\'s the shame. Society heavily intertwines net worth with self-worth. When a 50-year-old is renting an apartment while their peers are paying off mortgages, the ego takes a massive hit. Surviving a financial restart requires intentionally decoupling your identity from your bank account and recognizing that resilience and adaptability are far more valuable traits than early, uninterrupted success.'
      }
    ]
  ],

  // ─── YouTube Automation (canvas_station) ────────────────────────────────────
  [
    'YouTube Automation',
    'canvas_station',
    [
      {
        title: 'You\'re wasting 6 hours a week just writing YouTube titles',
        research_context: 'Manual metadata entry—typing out titles, descriptions, and tags—is the lowest ROI activity for a content creator. If a creator uploads 3 times a week, they might spend 2 hours per upload tweaking metadata and organizing playlists. That is 6 hours a week (300 hours a year) stolen from scripting and filming. Automating the upload process allows the creator to reclaim that time for activities that actually drive audience growth.'
      },
      {
        title: 'The metadata mistake quietly costing creators reach',
        research_context: 'YouTube\'s recommendation algorithm relies heavily on session watch time and viewer history. When creators manually upload, they often forget to assign videos to specific, ordered playlists or use inconsistent series tags. This breaks the \'binge chain.\' Automation software ensures that every single upload is perfectly categorized, tagged, and dropped into the correct playlist, forcing the algorithm to queue up your next video automatically.'
      },
      {
        title: 'I uploaded 50 Shorts in 10 minutes — here\'s exactly how',
        research_context: 'A detailed breakdown of the batch uploading workflow. Instead of logging into YouTube Studio daily, a creator renders 50 short-form videos into a single local folder. They populate a structured CSV file with 50 corresponding titles, descriptions, and scheduled dates. Using an automated API tool, they map the CSV to the folder, click \'run,\' and the software sequentially uploads, processes, and schedules a month\'s worth of content in 10 minutes.'
      },
      {
        title: 'Why manual playlist organization is killing your session data',
        research_context: 'YouTube rewards channels that keep viewers on the platform. If you aren\'t automatically adding new uploads to bingeable playlists, you are leaving views on the table. Automation ensures that the moment a video goes live, it is instantly grouped with related content. When a viewer finishes the video, the playlist auto-plays the next one, drastically increasing the session watch time and signaling to the algorithm that your channel retains viewers.'
      },
      {
        title: 'The real time-cost of uploading one video vs. one batch',
        research_context: 'The context-switching penalty is massive. Logging into YouTube, uploading a file, waiting for processing, writing the description, and publishing takes about 30-45 minutes of fractured focus. Doing this every day destroys deep work. By batch scheduling 10 videos at once via an automated script, the total time spent per video drops to 3 minutes, entirely eliminating the daily friction of publishing.'
      },
      {
        title: 'Batch uploading, start to finish: full workflow breakdown',
        research_context: 'The technical workflow requires three components: a strict local folder naming convention (e.g., `001_Title.mp4`), a master spreadsheet that links the filename to the metadata, and a script or platform that interfaces with the YouTube Data API v3. The script iterates through the spreadsheet, grabs the corresponding video file, and pushes the payload to YouTube servers perfectly formatted.'
      },
      {
        title: 'Auto-generated titles vs. hand-written — the retention data',
        research_context: 'Creators often get emotionally attached to clever or poetic titles. However, AI-generated titles based on massive datasets of successful templates strictly optimize for Click-Through Rate (CTR). By programmatically generating titles that follow proven psychological hooks, channels often see a 20-30% increase in baseline CTR because the automation removes the creator\'s ego from the packaging.'
      },
      {
        title: 'The folder-structure trick that saves educators hours per course',
        research_context: 'Educators selling courses or building massive tutorial libraries need strict organization. By using nested local folders (e.g., `Module 1/Lesson 1.mp4`), automation software can be written to read the directory tree and instantly generate corresponding YouTube playlists for each module, automatically titling the videos based on the filenames, and sequencing them perfectly without any manual data entry.'
      },
      {
        title: 'What changes in your analytics after switching to batch publishing',
        research_context: 'When a creator relies on manual motivation to upload, their publishing cadence is erratic. The YouTube algorithm struggles to predict their output. When a channel switches to automated batch publishing (e.g., exactly every Tuesday and Friday at 9 AM for 6 months), the channel becomes a highly reliable data source for the algorithm. This consistency often results in a slow, steady, and permanent increase in baseline daily impressions.'
      },
      {
        title: '3 automation mistakes that get channels flagged, and how to avoid them',
        research_context: 'Using the YouTube API incorrectly can trigger spam filters and result in a shadowban or termination. The three fatal mistakes are: 1) Uploading more than 50 videos in a single day (hitting API quotas), 2) Using the exact same copy-pasted description across hundreds of videos (flagged as duplicate content), and 3) Automating comments or likes alongside the uploads. Automation must strictly mimic human scheduling behavior.'
      }
    ]
  ],

  // ─── The Clinic Playbook (clinic_playbook) ────────────────────────────────────
  [
    'The Clinic Playbook',
    'clinic_playbook',
    [
      {
        title: '3 numbers to check before signing a clinic lease',
        research_context: 'Doctors are notoriously terrible at commercial real estate negotiation. Before signing a lease in India, verify three things: 1) The security deposit (often a massive 6-10 months rent in cities like Mumbai or Bengaluru). 2) The annual escalation clause (usually 5-10% every year or 15% after 3 years). 3) The exact costs of society NOCs and municipal commercial licenses (Shop and Establishment act, Biomedical waste tie-ups).'
      },
      {
        title: 'The first hire most new clinic owners get wrong',
        research_context: 'Trying to save money by hiring a ₹12,000/month inexperienced "compounder" or receptionist instead of a trained clinic manager. They handle the chaotic Indian OPD, UPI/cash transactions, and VIP patient demands. A weak front desk leads to massive daily revenue leakage and unrecorded cash consultations. Hiring a highly competent manager pays for itself immediately.'
      },
      {
        title: 'Opening a Clinic: The Lease',
        research_context: 'A deep dive into the traps of Indian commercial real estate. Avoid properties with illegal alterations or residential zoning, which can lead to sudden municipal (BMC/BBMP) sealing. Negotiate the lock-in period so you aren\'t trapped for 3 years if the location fails, and demand a "rent-free" period during the 1-2 month interior build-out phase.'
      },
      {
        title: 'Why your no-show rate is higher than it should be',
        research_context: 'In India, patients often treat appointment times as loose suggestions, leading to chaotic clashes between walk-ins and booked patients. The fix requires an automated WhatsApp reminder sequence in the local language and enforcing a strict digital token system via a screen in the waiting room to completely eliminate arguments over who came first.'
      },
      {
        title: 'The billing habit quietly costing clinics thousands a month',
        research_context: 'Heavy reliance on cash and UPI without daily reconciliation is a silent killer. The revenue leak happens when staff collects ₹500 via cash or a personal UPI QR code and fails to enter it into Practo or the clinic management software. Every evening, the physical cash drawer and merchant UPI settlements must perfectly match the software ledger.'
      },
      {
        title: 'The daily system behind a clinic that runs without chaos',
        research_context: 'Managing the evening OPD rush (6 PM to 9 PM), which is peak time for Indian clinics. It requires a 10-minute staff huddle at 5:45 PM. Delegating BP, weight, and basic history taking to the nursing staff *before* the patient enters the doctor\'s cabin saves 3 minutes per consultation, allowing the doctor to see 10 more patients a night without burnout.'
      },
      {
        title: 'When to raise your consultation fee — the real signal to watch',
        research_context: 'Doctors fear raising fees from ₹500 to ₹800 because they worry about losing neighborhood (mohalla) goodwill. The mathematical signal to raise prices: if your waiting room overflows into the street every evening and patients wait over 1.5 hours, your prices are too low. A price hike reduces volume slightly but drastically increases care quality and total revenue.'
      },
      {
        title: 'The referral system that grows a specialty without ad spend',
        research_context: 'Building a reliable referral network with local family physicians. In India, this requires deep relationship building and personal clinic visits. PCPs want specialists who accommodate their emergency referrals immediately and, crucially, send a concise discharge summary or consult note back to the referring GP via WhatsApp on the exact same day.'
      },
      {
        title: 'How a solo GP practice becomes a 3-doctor clinic',
        research_context: 'Scaling by hiring junior resident doctors or AYUSH (BAMS/BHMS) medical officers for triage, follow-ups, and basic care, while the senior MD/MS handles complex cases. Structuring their pay with a fixed salary (e.g., ₹45,000/month) plus a small performance incentive per OPD patient seen incentivizes them to efficiently manage higher patient volumes.'
      },
      {
        title: 'The partnership question every growing clinic faces',
        research_context: 'Opening a polyclinic with friends (e.g., a pediatrician, dentist, and physician sharing space). The ultimate danger is relying on vague verbal agreements made over chai. You absolutely must have a legally registered partnership deed detailing the exact split of common expenses (electricity, receptionist, software) and revenue to avoid bitter, practice-destroying breakups later.'
      }
    ]
  ]
];
