import type { SeedTopic } from "../seed-data.js";

export const canvasStation: [string, string, SeedTopic[]] = [
  "The Case File",
  "canvas_station",
  [
    {
      title: "The Typo That Stopped a $1 Billion Hack #Shorts",
      research_context:
        "In February 2016, hackers compromised the Bangladesh Central Bank and stole credentials to issue 35 fraudulent SWIFT transfer requests totaling $951 Million to the Federal Reserve Bank of New York. Four transfers totaling $81 Million cleared to Philippine casinos, but a fifth transfer of $20 Million was flagged when the hackers misspelled 'foundation' as 'fandation'. A German routing bank clerk spotted the typo, alerting authorities and halting the remaining $850 Million in transfers.",
    },
    {
      title: "The 8 Lines of Code That Lost $440M in 45 Mins #Shorts",
      research_context:
        "On August 1, 2012, financial trading firm Knight Capital deployed new software to its servers for the NYSE market opening. However, an engineer forgot to copy the update to one of the eight servers, leaving dead test code active. When trading opened at 9:30 AM, that rogue server began buying high and selling low at machine speed, executing 4 million executions in 154 stocks. By the time engineers finally shut down the system 45 minutes later, Knight Capital had lost $440 Million, leading to its emergency buyout.",
    },
    {
      title: "Cicada 3301: The Internet's Deepest Mystery #Shorts",
      research_context:
        "On January 4, 2012, a mysterious image appeared on internet forums: 'Hello. We are looking for highly intelligent individuals. To find them, we have devised a test.' What followed was the most complex cryptographic scavenger hunt in history. Clues were hidden in steganography, Maya numerology, medieval poetry, and physical fliers taped to telephone poles in Paris, Sydney, and Seoul. A handful of solvers reportedly reached the end, but the identity and purpose of the organization behind Cicada 3301 remains completely unknown.",
    },
    {
      title: "The Rocket That Exploded Over a 64-Bit Variable #Shorts",
      research_context:
        "On June 4, 1996, the European Space Agency launched the $370 Million Ariane 5 rocket on its maiden voyage from French Guiana. Exactly 37 seconds after launch, the rocket veered off course, broke apart, and self-destructed. The post-mortem revealed that code reused from the older Ariane 4 attempted to cram a 64-bit floating-point number representing horizontal velocity into a 16-bit signed integer. The resulting arithmetic overflow caused both primary and backup flight computers to crash simultaneously.",
    },
    {
      title: "The Ghost Radio Station in a Russian Swamp #Shorts",
      research_context:
        "Since at least 1973, a shortwave radio transmitter broadcasting on 4625 kHz has emitted a monotonous, repeating buzz tone 25 times per minute, 24 hours a day. Known worldwide as 'The Buzzer' (UVB-76), the transmission originates from a swamp outside Saint Petersburg, Russia. On rare occasions, the buzzer stops and a live Russian voice reads out mysterious code names and numbers like 'MDZhB 76 497 SMIRNYJ'. Despite decades of monitoring, its military or nuclear purpose remains officially unacknowledged.",
    },
    {
      title: "The Student Who Crashed 10% of the Internet in 1988 #Shorts",
      research_context:
        "In November 1988, 23-year-old Cornell graduate student Robert Tappan Morris wanted to gauge the size of the fledgling internet. He wrote a 99-line self-replicating program designed to spread quietly across UNIX systems. However, a fatal design flaw instructed the worm to re-infect machines regardless of whether they were already carrying it. Within hours, thousands of computers at MIT, Harvard, NASA, and the Pentagon bogged down in endless CPU loops and crashed, leading to the creation of the world's first cyber emergency response team (CERT).",
    },
    {
      title: "The $300 Billion Cost of a 2-Digit Shortcut #Shorts",
      research_context:
        "In the early decades of computing when memory was measured in kilobytes, programmers saved storage by recording years as two digits instead of four (e.g., '85' for 1985). As the millennium approached, governments and corporations realized computers worldwide would interpret '00' as the year 1900, threatening to collapse banking systems, nuclear power plants, and flight scheduling. A frantic global sprint of software audits and rewrites cost over $300 Billion—preventing the catastrophe so successfully that the public mistakenly believed the threat was a hoax.",
    },
    {
      title: "Stuxnet: The World's First Digital Weapon #Shorts",
      research_context:
        "In 2010, computer security researchers uncovered a 500-kilobyte piece of malware called Stuxnet that behaved unlike anything seen before. It bypassed security using four zero-day vulnerabilities, specifically targeting Siemens industrial programmable logic controllers (PLCs). The worm covertly spun Iranian uranium enrichment centrifuges at dangerously high speeds while simultaneously playing back normal sensor readings to the control room monitors, destroying over 1,000 centrifuges without firing a single bullet.",
    },
    {
      title: "The Hacker Who Tricked His Way to Freedom #Shorts",
      research_context:
        "Kevin Mitnick was once the most wanted computer fugitive in America, hunted by the FBI for breaking into systems at Motorola, Nokia, and Sun Microsystems. Mitnick rarely used brute-force code; his primary weapon was social engineering. He would call telecommunication technicians, impersonate system administrators using internal company jargon, and convince employees to give him passwords and source code voluntarily. His 1995 capture led to federal solitary confinement because prosecutors convinced the judge he could 'whistle nuclear codes into a payphone.'",
    },
    {
      title: "The Satellite That Woke Up After 46 Years #Shorts",
      research_context:
        "In 1965, the Massachusetts Institute of Technology built and launched the LES-1 satellite to test military communications. An orbital insertion motor failure sent the satellite tumbling into a useless, uncontrolled orbit, and its transmitter went completely silent in 1967. Forty-six years later in 2013, an amateur radio astronomer in the UK picked up a strange, rhythmic pulsing on 237 MHz. LES-1's solar panels had slowly recharged its dead batteries after nearly five decades of tumbling in deep space.",
    },
  ],
];
