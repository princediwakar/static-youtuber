import type { SeedTopic } from "../seed-data.js";

export const clinicPlaybook: [string, string, SeedTopic[]] = [
  "The Clinic Playbook",
  "clinic_playbook",
  [
    {
      title: "3 numbers to check before signing a clinic lease",
      research_context:
        "Doctors are notoriously terrible at commercial real estate negotiation. Before signing a lease in India, verify three things: 1) The security deposit (often a massive 6-10 months rent in cities like Mumbai or Bengaluru). 2) The annual escalation clause (usually 5-10% every year or 15% after 3 years). 3) The exact costs of society NOCs and municipal commercial licenses (Shop and Establishment act, Biomedical waste tie-ups).",
    },
    {
      title: "The first hire most new clinic owners get wrong",
      research_context:
        'Trying to save money by hiring a ₹12,000/month inexperienced "compounder" or receptionist instead of a trained clinic manager. They handle the chaotic Indian OPD, UPI/cash transactions, and VIP patient demands. A weak front desk leads to massive daily revenue leakage and unrecorded cash consultations. Hiring a highly competent manager pays for itself immediately.',
    },
    {
      title: "Opening a Clinic: The Lease",
      research_context:
        'A deep dive into the traps of Indian commercial real estate. Avoid properties with illegal alterations or residential zoning, which can lead to sudden municipal (BMC/BBMP) sealing. Negotiate the lock-in period so you aren\'t trapped for 3 years if the location fails, and demand a "rent-free" period during the 1-2 month interior build-out phase.',
    },
    {
      title: "Why your no-show rate is higher than it should be",
      research_context:
        "In India, patients often treat appointment times as loose suggestions, leading to chaotic clashes between walk-ins and booked patients. The fix requires an automated WhatsApp reminder sequence in the local language and enforcing a strict digital token system via a screen in the waiting room to completely eliminate arguments over who came first.",
    },
    {
      title: "The billing habit quietly costing clinics thousands a month",
      research_context:
        "Heavy reliance on cash and UPI without daily reconciliation is a silent killer. The revenue leak happens when staff collects ₹500 via cash or a personal UPI QR code and fails to enter it into Practo or the clinic management software. Every evening, the physical cash drawer and merchant UPI settlements must perfectly match the software ledger.",
    },
    {
      title: "The daily system behind a clinic that runs without chaos",
      research_context:
        "Managing the evening OPD rush (6 PM to 9 PM), which is peak time for Indian clinics. It requires a 10-minute staff huddle at 5:45 PM. Delegating BP, weight, and basic history taking to the nursing staff *before* the patient enters the doctor's cabin saves 3 minutes per consultation, allowing the doctor to see 10 more patients a night without burnout.",
    },
    {
      title: "When to raise your consultation fee — the real signal to watch",
      research_context:
        "Doctors fear raising fees from ₹500 to ₹800 because they worry about losing neighborhood (mohalla) goodwill. The mathematical signal to raise prices: if your waiting room overflows into the street every evening and patients wait over 1.5 hours, your prices are too low. A price hike reduces volume slightly but drastically increases care quality and total revenue.",
    },
    {
      title: "The referral system that grows a specialty without ad spend",
      research_context:
        "Building a reliable referral network with local family physicians. In India, this requires deep relationship building and personal clinic visits. PCPs want specialists who accommodate their emergency referrals immediately and, crucially, send a concise discharge summary or consult note back to the referring GP via WhatsApp on the exact same day.",
    },
    {
      title: "How a solo GP practice becomes a 3-doctor clinic",
      research_context:
        "Scaling by hiring junior resident doctors or AYUSH (BAMS/BHMS) medical officers for triage, follow-ups, and basic care, while the senior MD/MS handles complex cases. Structuring their pay with a fixed salary (e.g., ₹45,000/month) plus a small performance incentive per OPD patient seen incentivizes them to efficiently manage higher patient volumes.",
    },
    {
      title: "The partnership question every growing clinic faces",
      research_context:
        "Opening a polyclinic with friends (e.g., a pediatrician, dentist, and physician sharing space). The ultimate danger is relying on vague verbal agreements made over chai. You absolutely must have a legally registered partnership deed detailing the exact split of common expenses (electricity, receptionist, software) and revenue to avoid bitter, practice-destroying breakups later.",
    },
    {
      title: "The hidden trap of buying second-hand medical equipment",
      research_context:
        "Young doctors often buy refurbished ultrasound machines or dental chairs to save capital. But in India, second-hand dealers rarely offer AMC (Annual Maintenance Contracts). When a critical machine breaks down during peak OPD, the lost revenue and patient trust far exceed the initial savings. The rule: finance new equipment for core services, buy second-hand only for non-critical backup gear.",
    },
    {
      title: "Why 300 sq ft is actually the perfect size for your first clinic",
      research_context:
        "New owners overextend by renting massive 1000 sq ft spaces to look successful. This creates massive overhead pressure before they have a patient base. A tight, highly optimized 300 sq ft space with a smart token system forces operational efficiency. Once patient volume consistently breaks the space's capacity, then you expand.",
    },
    {
      title: "The pharmacy tie-up: How to negotiate your first revenue share",
      research_context:
        "Many new doctors just let a local chemist open a shop next door for free. A smart clinic owner negotiates a formal lease agreement or a strict revenue-share model with the attached pharmacy. This creates a secondary, passive revenue stream that can completely cover the clinic's base rent, drastically lowering the break-even point.",
    },
    {
      title: "The consultation fee mistake that attracts the worst patients",
      research_context:
        "Starting with an ultra-low fee (e.g., ₹100 or ₹200) to quickly build volume is a classic mistake. It attracts price-shoppers who argue over every test and demand free follow-ups. Anchoring your fee slightly above the neighborhood average instantly signals quality, reduces daily patient load, prevents burnout, and yields the same total revenue.",
    },
    {
      title: "Designing your waiting room to quietly reduce patient anxiety",
      research_context:
        "A chaotic waiting room with patients staring at the doctor's door creates tension. Simple architectural fixes—facing chairs away from the consultation cabin, using frosted glass, and having a dedicated TV screen showing token numbers—removes the feeling of a 'queue' and stops patients from barging in while you're examining someone else.",
    },
    {
      title: "Stop using your personal WhatsApp to talk to patients",
      research_context:
        'Giving out a personal number seems like good service, but it quickly leads to midnight texts for non-emergencies and free consultation demands. Clinics must transition to a dedicated business WhatsApp API or clinic management software early. This sets professional boundaries, allows staff to handle routine queries, and stops revenue leakage from "quick question" texts.',
    },
    {
      title:
        "The right way to handle medical representatives without losing time",
      research_context:
        "MRs (Medical Representatives) can monopolize a doctor's time during peak hours. The system fix is strictly allocating a 15-minute window twice a week for MRs, enforced ruthlessly by the front desk manager. This reclaims at least 3-4 hours of productive clinical time a week, directly translating to more patient slots.",
    },
    {
      title: "Why your clinic needs a dedicated 'counseling' room",
      research_context:
        "Delivering complex news or explaining a ₹50,000 procedure in the main consultation cabin delays the entire OPD. Having a small, separate counseling room where a trained clinic manager or senior nurse can sit with the family to discuss pricing, insurance (TPA), and next steps keeps the doctor's cabin moving at maximum efficiency.",
    },
    {
      title: "The inventory leak you aren't tracking",
      research_context:
        "While cash is monitored, clinics often lose thousands of rupees a month in stolen or expired consumables—syringes, gloves, IV fluids, and expensive sample medicines. Implementing a strict weekly audit of physical inventory against the digital ledger is the only way to plug this silent drain on margins.",
    },
    {
      title:
        "Managing the backlash when you switch from walk-ins to appointments",
      research_context:
        "Transitioning a traditional Indian clinic to an appointment-first model causes friction with older patients. The strategy is to run a hybrid model for 90 days: reserving 40% of slots for walk-ins but making them wait longer than booked patients. When they see the booked patients walking straight in, they naturally adapt to the new system.",
    },
    {
      title: "How to turn a one-time walk-in into a lifelong family patient",
      research_context:
        'The difference between a transactional clinic and a legacy practice is follow-up architecture. Automating a simple "How are you feeling?" message 3 days after a fever consult, or a birthday greeting, builds immense trust. When that patient needs a specialist referral or regular chronic care, they will always return to the doctor who checked on them.',
    },
    {
      title:
        "The exact script to use when a patient demands an unnecessary antibiotic",
      research_context:
        "Over-prescription is rampant, and patients often feel cheated if they leave without a strong pill. The operational fix is prescribing a specific, branded symptom-relief routine (like a targeted throat spray or specific lozenge) and scheduling a mandatory free follow-up in 48 hours if symptoms persist. It satisfies the patient's need for action while maintaining medical ethics.",
    },
    {
      title: "Why corporate health camps actually hurt small clinics",
      research_context:
        "Clinics often do free health camps in local societies hoping for patient acquisition. Usually, they just attract people looking for freebies who never convert to paying OPD patients. Instead of broad free camps, clinics should do highly targeted, paid diagnostic packages (e.g., a ₹999 comprehensive diabetes screening) which filters for patients who actually value and pay for healthcare.",
    },
    {
      title:
        "The transition from general practice to your actual specialization",
      research_context:
        "A doctor with an MD in Medicine might start by seeing basic colds and flus to pay the bills. The pivot happens when they start actively refusing general cases to free up slots for complex, high-ticket chronic care (diabetes, hypertension). It causes a short-term revenue dip but establishes the clinic as a premium specialist center in the neighborhood.",
    },
    {
      title: "Why buying a ₹15 Lakh machine isn't a marketing strategy",
      research_context:
        "Doctors often buy expensive diagnostic equipment (like a 4D ultrasound or advanced laser) assuming the machine itself will attract patients. It rarely does. The machine is a liability until the clinic builds a referral pipeline specifically for that service. You should only buy heavy capital equipment when your current outsourced diagnostic volume justifies the monthly EMI.",
    },
    {
      title: "The profit split: How to fairly pay visiting specialists",
      research_context:
        "When a GP clinic brings in a visiting Cardiologist or Orthopedic surgeon, the standard 70/30 or 60/40 revenue split can become contentious. The best practice is establishing clear rules on who pays for the consumables, who handles the follow-up free visits, and ensuring all billing goes through the clinic's central desk, not directly to the specialist.",
    },
    {
      title: "Transitioning from a single desk to a multi-counter operation",
      research_context:
        "As a clinic hits 100+ patients a day, the single front desk becomes a massive bottleneck, causing billing errors and patient frustration. The critical scaling step is splitting the workflow: one dedicated counter for registration/triage, and a completely separate counter for billing/pharmacy exit. This physically separates the incoming chaos from the outgoing transactions.",
    },
    {
      title:
        "When to stop doing your own accounting and hire a full-time finance manager",
      research_context:
        "Clinic owners often waste their Sundays reconciling Practo software with bank statements to save a ₹25,000 salary. When a clinic crosses multiple doctors and attached services (lab, pharmacy), the owner's time is worth far more doing clinical work or strategic planning. Handing over daily reconciliation to a dedicated manager is the ultimate leverage.",
    },
    {
      title: "The risk of diluting your brand when adding aesthetics",
      research_context:
        "A serious physician's clinic can lose its medical authority if it suddenly starts aggressively marketing Botox and hair transplants in the same waiting room. If expanding into high-margin cosmetology, it requires physical separation—different branding, different lighting, and a different patient flow—so the core medical practice doesn't look like a beauty parlor.",
    },
    {
      title:
        "Buying the clinic next door: Physical expansion vs opening a second branch",
      research_context:
        'The ego wants to open "Branch #2" in a new area. The data shows that expanding the current physical footprint (renting the adjacent shop) is infinitely more profitable. A second branch requires duplicating all overhead—two managers, two cleaning staff, two backup generators. Expanding the existing space scales revenue without duplicating base operational costs.',
    },
    {
      title: 'The "Free Consultation" trap that bankrupts new clinics',
      research_context:
        "Offering free initial consults during your opening month devalues your expertise permanently. In the Indian market, patients anchor your worth to that first zero-rupee visit. When you start charging ₹500 in month two, the \"freebie\" patients leave and bad-mouth you. Instead, offer a heavily discounted 'complete wellness package'—it filters out non-paying patients while still driving high initial footfall.",
    },
    {
      title: "Why you shouldn't hire your relatives for the front desk",
      research_context:
        "It’s tempting to hire a cousin or sibling to manage the reception to save salary and ensure 'trust' with cash. However, relatives are impossible to fire and rarely respect the strict reporting hierarchies needed to run a professional OPD. The front desk requires a ruthless, emotionally detached manager who enforces tokens and collects payments without feeling 'awkward'.",
    },
    {
      title: "The hidden clauses in commercial hospital contracts",
      research_context:
        "Many young doctors sign up as 'visiting consultants' at larger corporate hospitals while setting up their private clinic. These contracts often contain strict non-compete clauses prohibiting you from opening your own setup within a 5km radius. Always negotiate the geographic limits before signing, or you'll be legally barred from practicing in your own neighborhood.",
    },
    {
      title:
        "The software mistake that makes makes switching systems impossible",
      research_context:
        "Starting a clinic with a cheap, offline, desktop-bound billing software seems cost-effective until you want to add a second doctor or check revenue from home. More dangerously, these local vendors hold your patient database hostage when you try to leave. Start with a cloud-based, scalable platform from day one so your data is always accessible and exportable.",
    },
    {
      title: "Designing your cabin to prevent the 'extended family' takeover",
      research_context:
        "In India, a single patient often brings 4 relatives into the consultation room. This derails the 10-minute appointment slot as everyone asks separate questions. Design your cabin strategically: place only two comfortable chairs opposite your desk. When there’s no physical space to sit, the extra relatives naturally wait outside, keeping the consultation fast and focused.",
    },
    {
      title: "How to stop patients from negotiating your procedure fees",
      research_context:
        "When a doctor verbally quotes ₹15,000 for a minor procedure, the patient instinctively starts bargaining like they are in a market. The fix is visual authority. Have your clinic manager hand them a printed, laminated rate card on official letterhead. People argue with spoken numbers; they rarely argue with a printed, official document.",
    },
    {
      title: 'The "Emergency" walk-in that ruins your booked schedule',
      research_context:
        "Patients often claim an 'emergency' (like a mild fever) to jump the queue of booked appointments, causing chaos. Train your front desk in clinical triage: if it's a true emergency, they are redirected to a hospital casualty. If it's just urgency, they are given a \"squeeze-in\" token that explicitly states they must wait between scheduled slots.",
    },
    {
      title: "Why your local lab tie-up is costing you patient trust",
      research_context:
        "Partnering with a cheap, unbranded local pathology lab offers high commission margins, but their reports are often delayed or inaccurate. When a patient gets a wrong diagnosis because of a cheap lab, they blame the doctor, not the lab. Tie up with reputed, accredited networks; the margin is lower, but the clinical reliability protects your brand.",
    },
    {
      title: "The Sunday clinic dilemma: How to rest without losing revenue",
      research_context:
        "Closing on Sundays costs you the lucrative weekend crowd (working professionals). Opening every Sunday guarantees physician burnout. The operational fix is a rotating locum system. Hire a trusted junior doctor to run the Sunday OPD purely for prescription refills, minor ailments, and triage. You capture the revenue while protecting your rest.",
    },
    {
      title: "Managing the VIP patient who demands special treatment",
      research_context:
        "Local politicians or wealthy businessmen often demand immediate access, skipping the queue and angering waiting patients. Create a 'premium' consultation slot outside of regular OPD hours (e.g., 2 PM - 3 PM) at double the regular fee. When they demand instant access, offer them the premium slot. It accommodates their ego while protecting your primary workflow.",
    },
    {
      title: "The follow-up failure that kills chronic care revenue",
      research_context:
        "For a diabetologist or cardiologist, revenue isn't in the first visit; it's in the 12-month management plan. Yet, clinics leave it up to the patient to remember their next appointment. Implement a strict system: before the patient leaves the billing counter, the manager physically books the next month's slot and schedules an automated WhatsApp reminder for 48 hours prior.",
    },
    {
      title: "How to effectively cross-sell preventive health checkups",
      research_context:
        'Selling comprehensive ₹3,000 health packages feels awkward for doctors who are trained to treat sick people, not sell. The key is removing the doctor from the sales process. The doctor prescribes "Annual Assessment"; the clinic counselor then explains the package benefits and ROI to the family in a separate room, converting clinical advice into a packaged sale.',
    },
    {
      title: "Building a digital presence that actually drives footfall",
      research_context:
        "Most clinics waste money on generic Facebook posts. High-converting digital marketing is hyper-local and intent-driven. Optimize your Google My Business profile with interior photos, clear OPD timings, and heavily encourage happy patients to leave reviews while they are still in the waiting room. A 4.8 rating on Google Maps drives more walk-ins than a massive Instagram following.",
    },
    {
      title: "The correct way to fire a toxic patient",
      research_context:
        "Some patients are chronically abusive to your staff, refuse to pay full fees, and constantly threaten bad reviews. Keeping them poisons your clinic's culture. You must cleanly and professionally discharge them: refund their last fee, hand them a copy of their medical records, and provide a list of three alternative clinics, explicitly stating that the doctor-patient relationship is terminated.",
    },
    {
      title:
        "Transitioning from 'Doctor's Clinic' to a branded 'Healthcare Center'",
      research_context:
        'If the clinic is named "Dr. Sharma\'s Clinic", the entire enterprise value is tied to your physical presence. The moment you are sick, revenue drops to zero. Rebranding to a neutral, professional name (e.g., "Apex Care Center") allows you to plug in associate doctors and specialists without patients feeling like they are getting a \'second-tier\' substitute.',
    },
    {
      title: "The 24/7 Pharmacy trap for growing clinics",
      research_context:
        "Adding an in-house, 24/7 pharmacy seems like the ultimate revenue multiplier. However, running a 24-hour retail operation requires night shifts, stringent inventory control against theft, and constant licensing compliance. Unless your clinic has inpatient beds or a massive continuous footfall (300+ daily), stick to standard OPD pharmacy timings; the night-time overhead will bleed your daytime profits.",
    },
    {
      title: "Bringing in a physiotherapist: Space vs Revenue",
      research_context:
        "Adding physiotherapy is great for ortho/neuro clinics, but PT requires massive physical space (beds, machines) and generates lower revenue-per-square-foot compared to quick doctor consults. Before converting your second cabin into a PT room, ensure you have a strict revenue-sharing agreement where the therapist guarantees a minimum monthly floor rent regardless of patient volume.",
    },
    {
      title: "The multi-doctor billing nightmare and how to fix it",
      research_context:
        "When you have three doctors consulting simultaneously, a manual billing desk will collapse under the pressure of tracking who ordered which test and who saw which patient. The only way to scale is implementing a centralized token system where the doctor enters the prescribed services digitally, and the front desk merely collects the auto-generated invoice.",
    },
    {
      title: "Opening your second branch: The 6-month capital buffer",
      research_context:
        "A successful first clinic does not guarantee immediate success for the second. The new branch will likely run at a loss for 4-6 months while building local trust. Never fund the new branch's operational losses from the first branch's daily cash flow, or you risk bankrupting both. You need 6 months of pure operating capital saved before signing the second lease.",
    },
    {
      title: "When to hire a professional CEO for your polyclinic",
      research_context:
        "When a clinic scales to 5+ doctors, diagnostic labs, and 20+ staff, the founder-doctor becomes the bottleneck if they still manage HR and operations. The moment your clinical income surpasses what you would pay an experienced hospital administrator (approx ₹80,000 - ₹1,20,000/month), you must hire one. You buy back your time to focus entirely on high-value surgeries and strategic growth.",
    },
  ],
];
