export type SeedTopic = {
  title: string;
  research_context: string;
};

export const SEEDS: [string, string, SeedTopic[]][] = [
  [
    'SaaS & AI Tools',
    'tech_shots',
    [
      // Batch 1
      {
        title: 'How Knight Capital lost $440 million in 45 minutes',
        research_context: 'In 2012, a technician at Knight Capital forgot to copy a new software code to one of their 8 trading servers. When the market opened, the dead code on the 8th server woke up and started buying high and selling low at a rate of thousands of trades per second. The company literally couldn\'t figure out how to shut it off. In 45 minutes, they lost $440 million and the company was bankrupt.'
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