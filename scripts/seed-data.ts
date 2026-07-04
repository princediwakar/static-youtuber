export type SeedTopic = {
  title: string;
  research_context: string;
};

export const SEEDS: [string, string, SeedTopic[]][] = [
  [
    'SaaS & AI Tools',
    'tech_shots',
    [
      {
        title: 'How Airbnb sold cereal boxes to survive their first year',
        research_context: 'In 2008, Brian Chesky and Joe Gebbia were $30,000 in credit card debt. They had launched Airbnb during the Democratic National Convention — renting air mattresses in their living room — but after the event, bookings dried up. To stay alive, they bought bulk cereal boxes, redesigned them as Obama O\'s and Cap\'n McCain\'s, and sold them for $40 each at the 2008 DNC. They made $30,000 and flew to SXSW to meet their first real users. Paul Graham later said "the founders were so desperate they would not die."'
      },
      {
        title: 'Patrick Collison coded Stripe from his bedroom at 19',
        research_context: 'Patrick Collison dropped out of MIT at 19 to build Stripe with his 16-year-old brother John. For two years, they lived in a small bedroom in San Francisco, coding payment infrastructure that big banks said was impossible. In 2011, they applied to Y Combinator but were rejected because their idea — "a developer-friendly payment API" — sounded too boring. Paul Graham reversed the decision after meeting them in person. Stripe was valued at $65 billion by 2021.'
      },
      {
        title: 'Jensen Huang bet Nvidia on gaming when everyone said no',
        research_context: 'In 1993, Jensen Huang co-founded Nvidia with $20,000 from his savings. Their first chip, the NV1, was a commercial failure. By 1995, Nvidia had burned through its funding and laid off half the staff. Huang bet the entire company on a single new chip — the RIVA 128 — that had to be perfect on first silicon because they couldn\'t afford a second run. It shipped in 1997 and sold 1 million units in 4 months. Nvidia is now worth over $3 trillion.'
      },
      {
        title: 'Melanie Perkins was rejected 100 times before Canva',
        research_context: 'Melanie Perkins first pitched Canva in 2007 at age 20 while still a university student in Perth, Australia. Over the next 3 years, she was rejected by more than 100 venture capitalists. Her first product, Fusion Books, generated $1M in revenue selling school yearbook design software — but VCs still said a design platform for regular people would never work. In 2010, she flew to Silicon Valley and camped in coffee shops until she got a meeting with Bill Tai. Canva is now valued at $40 billion.'
      },
      {
        title: 'Jan Koum built WhatsApp from a gym membership fee',
        research_context: 'Jan Koum grew up in a small village in Ukraine with no running water. His family immigrated to California when he was 16, and he lived on food stamps. In 2009, he bought an iPhone and realized the App Store was about to explode. He built a simple messaging app in his spare time. When he ran out of money, he kept WhatsApp alive by charging users $1 per year — just enough to cover SMS costs. Sequoia Capital invested $8 million in 2011. Facebook bought WhatsApp for $19 billion in 2014.'
      },
      {
        title: 'Luis von Ahn turned CAPTCHAs into a $700M company',
        research_context: 'Luis von Ahn, a Guatemalan immigrant, invented CAPTCHA and reCAPTCHA at Carnegie Mellon — selling the latter to Google in 2009. But he wanted to build a company that made education free. In 2012, he launched Duolingo with a radical idea: teach languages through gamified lessons, no classroom needed. In the first year, 10 million users signed up. Duolingo went public in 2021 at a $6.5 billion valuation and now has over 500 million users — making it the most downloaded education app in history.'
      },
      {
        title: 'Kevin Systrom built a check-in app before Instagram',
        research_context: 'In 2010, Kevin Systrom launched Burbn — a Foursquare clone that let users check into locations, post photos, and earn points. It was too complicated and had zero traction. He and co-founder Mike Krieger analyzed user behavior and found that people only used one feature: photo sharing. In 8 weeks, they stripped Burbn down to a single feature — square photos with filters — and launched Instagram on October 6, 2010. It got 25,000 users in the first day. 2 years later, Facebook acquired Instagram for $1 billion.'
      },
      {
        title: 'Larry Page and Sergey Brin almost sold Google for $750,000',
        research_context: 'In 1998, Larry Page and Sergey Brin were PhD students at Stanford with a "research project" called BackRub. They tried to sell their search algorithm to Excite for $750,000. Excite\'s CEO said no — explaining that search was just a commodity and their technology was "too good" because it kept users on Google instead of Excite\'s portal. A year later, they incorporated Google with $100,000 from Andy Bechtolsheim. By 2004, Google went public at $27 billion. Excite filed for bankruptcy the same year.'
      },
      {
        title: 'Ivan Zhao coded Notion alone for 3 years before anyone cared',
        research_context: 'Ivan Zhao started Notion in 2013 with a radical idea: a single tool that replaces every other productivity app. The first version took 2 years to build and was a complete failure — too slow, too buggy, and users hated it. By 2015, Zhao was broke, alone, and sleeping in the office. He fired everyone except himself, then spent another 18 months rebuilding Notion from scratch in a new framework. Version 2.0 launched in 2018 and grew to 1 million users in 12 months without any marketing. Notion hit $10 billion valuation in 2021.'
      },
      {
        title: 'Adam Neumann turned a WeWork into a $47 billion lesson',
        research_context: 'Adam Neumann started WeWork in 2010 renting a single floor in SoHo and subletting desks to freelancers. By 2019, WeWork was the largest office tenant in Manhattan, valued at $47 billion. But the business was bleeding cash: WeWork lost $1.6 billion in 2018 alone, spent $47 million on a private jet, and Neumann had extracted $700 million in personal loans and stock sales. When the S-1 filing revealed the losses, the IPO collapsed. SoftBank wrote down the valuation to $2.9 billion — a 94% loss in 6 weeks.'
      },
      {
        title: 'Daniel Ek built Spotify from a pirate radio bedroom in Sweden',
        research_context: 'Daniel Ek grew up in a Stockholm suburb and taught himself to code at 14. At 22, he sold his first startup for $1.5 million. In 2006, the music industry was collapsing from piracy — but Ek saw an opportunity. He built a prototype that streamed music instantly, then spent 2 years convincing record labels to license their catalogs. Every label said no. In 2008, he finally got Universal to sign by threatening to launch an unlicensed version anyway. Spotify launched with 1 million users in 6 months and now has over 500 million users.'
      },
      {
        title: 'Nikolay Storonsky built Revolut after being rejected by 100 banks',
        research_context: 'Nikolay Storonsky was a former Credit Suisse trader who grew up in Russia and studied physics. In 2015, he pitched Revolut as a digital bank that eliminated hidden fees for international spending. More than 100 investors rejected him — "you can\'t compete with banks." He maxed out credit cards and worked from a WeWork. In 2017, Revolut hit 1 million users. By 2021, it was valued at $33 billion, making Storonsky\'s stake worth $7 billion. The company serves 45 million people across 38 countries.'
      },
      {
        title: 'Sebastian Siemiatkowski pitched Klarna for 3 years before anyone invested',
        research_context: 'Sebastian Siemiatkowski was a 22-year-old Swedish fast-food worker when he pitched his idea — "buy now, pay later" — to every bank in Stockholm. All of them laughed. He kept pitching for 3 years while working at Burger King. In 2005, a single angel investor put $60,000 into Klarna. By 2010, Klarna had 4 million users across Scandinavia. In 2021, Klarna was valued at $45.6 billion, making Siemiatkowski a billionaire. The company had buried 400 years of traditional banking with a single 2-click checkout button.'
      },
      {
        title: 'Taavet and Kristo built Wise to fix a $200B problem',
        research_context: 'Taavet Hinrikus was employee #1 at Skype. Kristo Käärmann was a Deloitte consultant. Both were Estonian expats living in London, and both were furious at banks charging 5% to send money home. In 2011, they built a workaround: Taavet would deposit pounds into Kristo\'s UK account, and Kristo would deposit kroons into Taavet\'s Estonian account. The system worked so well they turned it into TransferWise (now Wise). By 2022, Wise was processing $9 billion in cross-border payments per month at a $13 billion valuation, saving users $2B in fees annually.'
      },
      {
        title: 'Markus Villig dropped out of school to fight Uber — at 19',
        research_context: 'Markus Villig was 19 years old and still in high school in Estonia when he decided to build a competitor to Uber. He had no coding experience, no funding, and no team — he taught himself to code from YouTube tutorials. In 2013, he launched Bolt (then Taxify) with a team of 5 friends in Tallinn. Uber tried to crush them by subsidizing rides below cost. Villig survived by expanding to Africa — a continent Uber had ignored. By 2023, Bolt was operating in 45 countries, valued at $8.4 billion, and Villig was Europe\'s youngest unicorn founder.'
      },
      {
        title: 'Ilkka Paananen created Supercell after almost quitting gaming',
        research_context: 'Ilkka Paananen had already failed with his first gaming startup, Sumea, which was acquired and then shut down. In 2010, he founded Supercell in Helsinki with $6 million from a venture fund. The first 3 games failed. On the verge of running out of money, Supercell released Clash of Clans in 2012. It became the highest-grossing mobile game in history at the time — generating $1 billion in revenue annually. In 2016, Tencent bought 84% of Supercell for $8.6 billion. Paananen\'s philosophy: "fail fast, learn faster, kill the bad ideas early."'
      },
      {
        title: 'Riccardo Zacconi sold Candy Crush for $5.9 billion',
        research_context: 'Riccardo Zacconi was an Italian entrepreneur who moved to Sweden and co-founded King in 2003. The company struggled through 10 years of game development, almost going bankrupt twice. In 2012, King launched Candy Crush Saga on Facebook — a simple match-3 puzzle game. It became a global phenomenon: 93 million daily active users, generating $1.9 billion in revenue in 2013 alone. In 2014, Activision Blizzard acquired King for $5.9 billion. Zacconi walked away with $500 million from a game that started as a side project.'
      },
      {
        title: 'Demis Hassabis sold DeepMind to Google before releasing a product',
        research_context: 'Demis Hassabis was a child chess prodigy who became a video game designer at 17, then a neuroscientist at University College London. In 2010, he founded DeepMind with Shane Legg and Mustafa Suleyman — an AI research lab that had zero revenue and no product. DeepMind taught itself to play 49 Atari games using only raw pixels as input. Google acquired DeepMind in 2014 for $600 million before they had shipped a single commercial product. In 2016, DeepMind\'s AlphaGo beat the world champion Go player, a feat experts said was a decade away.'
      },
      {
        title: 'Pieter van der Does built Adyen without a single salesperson',
        research_context: 'Pieter van der Does and the founding team of Adyen had already built — and lost — Bibit, a payment company sold to the Royal Bank of Scotland that was then shut down. In 2006, they launched Adyen in Amsterdam with an anti-sales philosophy: no salespeople, no marketing, just a single-page website that listed pricing transparently. Companies like Netflix, Uber, and Spotify found them through search. For 10 years, Adyen had zero sales staff. By 2018, Adyen went public at $10 billion, and by 2024 it was worth over $80 billion — Europe\'s largest fintech.'
      },
      {
        title: 'Niklas Zennström built Skype by accident and sold it twice',
        research_context: 'Niklas Zennström and Janus Friis — a Swede and a Dane — were the founders of Kazaa, the piracy platform that record labels sued into oblivion. In 2003, they built a side project: a peer-to-peer voice calling app that bypassed phone networks. Skype launched in August 2003 and hit 1 million users in 3 months. EBay bought Skype in 2005 for $2.6 billion — but the founders kept the core P2P technology, forcing eBay to write off $1.4 billion. In 2011, Microsoft bought Skype for $8.5 billion. Zennström had sold the same technology twice, netting over $1 billion personally.'
      },
    ],
  ],
  [
    'Financial Forensics',
    'finance_shots',
    [
      // Batch 1
      {
        title: 'The $4.7M typo that erased a fortune in 14 seconds',
        research_context: 'In 2014, a junior trader intended to sell 1 share of J-Com stock for 610,000 yen. Instead, he submitted an order to sell 610,000 shares for 1 yen each. Algorithmic trading bots scooped up the shares instantly. The exchange protocol did not allow cancellations. In exactly 14 seconds, the firm lost 27 billion yen (roughly $225 million USD).'
      },
    ],
  ],
  [
    'Stoic Philosophy',
    'stoic_shots',
    [
      // Batch 1
      {
        title: 'Marcus Aurelius wrote Meditations during a plague that killed 5M',
        research_context: 'Between 165 and 180 AD, the Antonine Plague devastated Rome, killing up to 2,000 a day. Emperor Marcus Aurelius was stuck on the frozen northern frontier fighting Germanic tribes. In his tent at night, surrounded by death, he wrote his journal to maintain sanity, reminding himself to adapt to the obstacle rather than complain.'
      },
    ],
  ],
  [
    'Urban Survival',
    'survival_shots',
    [
      // Batch 1
      {
        title: 'The 2003 blackout that paralyzed 8 states in 6 seconds',
        research_context: 'In 2003, a high-voltage line sagged into trees. Due to a software bug, operators were blind. The load shifted, overloading other lines. Within 6 seconds, a cascading failure rippled across the grid. 50 million people lost power. Water pumps stopped, ATMs died, and subways trapped thousands in the dark.'
      },
    ],
  ],
];