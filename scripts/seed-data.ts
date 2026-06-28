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
      {
        title: 'The Stuxnet virus that physically destroyed a nuclear facility',
        research_context: 'Stuxnet was the first digital weapon to cross into the physical world. Built by the US and Israel, the malware specifically targeted Siemens industrial centrifuges in Iran. It fed fake, perfectly normal sensor data to the plant operators\' screens, while secretly spinning the actual uranium centrifuges so fast that they physically tore themselves apart.'
      },
      {
        title: 'The $500M Bitcoin hard drive buried in a Welsh landfill',
        research_context: 'In 2013, IT worker James Howells accidentally threw away a hard drive containing 8,000 Bitcoins he mined in 2009. The drive ended up in a massive landfill in Newport, Wales. At today\'s prices, it is worth over $500 million. He has spent a decade raising venture capital to fund a robotic excavation of the landfill, but the city council refuses to let him dig.'
      },
      {
        title: 'NotPetya: The $10 Billion Russian cyber weapon that went rogue',
        research_context: 'In 2017, Russian hackers unleashed NotPetya, a destructive malware aimed at Ukrainian accounting software. But it spread instantly across the global supply chain. It paralyzed the shipping giant Maersk, forcing them to run global logistics on WhatsApp. It caused an estimated $10 billion in global damage, making it the most devastating cyberattack in history.'
      },
      {
        title: 'The Therac-25 medical machine that radiated patients to death',
        research_context: 'In the 1980s, the Therac-25 radiation therapy machine relied entirely on software for safety, removing hardware interlocks. A race condition in the code meant that if an operator typed commands too quickly, the machine would deliver 100 times the intended dose of radiation. Six patients died of massive radiation poisoning before the software bug was found.'
      },
      {
        title: 'How a 15-year-old hacked NASA and the Pentagon',
        research_context: 'In 1999, a 15-year-old named Jonathan James hacked into the US Department of Defense and downloaded the source code for the International Space Station\'s life support systems. NASA was forced to shut down its computers for three weeks to fix the breach. James became the first juvenile incarcerated for cybercrime in the US.'
      },
      {
        title: 'The Y2K bug was actually a massive engineering victory',
        research_context: 'People joke that Y2K was a hoax because nothing happened, but nothing happened because of a massive, frantic, global engineering effort. Programmers came out of retirement to fix decades of legacy COBOL code in the global banking and power grid systems. It wasn\'t a scam; it was the most successful preventative maintenance project in human history.'
      },
      {
        title: 'The Morris Worm: How a grad student broke the early internet',
        research_context: 'In 1988, Cornell student Robert Tappan Morris released a worm just to measure the size of the internet. But a flaw in his code caused it to copy itself onto computers multiple times, bogging them down until they crashed. It infected 10% of the entire internet and caused millions in damage. He became the first person convicted under the Computer Fraud and Abuse Act.'
      },
      {
        title: 'How deepfakes almost stole $25 million from a multinational firm',
        research_context: 'In early 2024, a finance worker at a multinational firm in Hong Kong was invited to a video conference call. The CFO and several colleagues were on the call, instructing him to execute a massive money transfer. The worker transferred $25 million. Later, it was revealed that everyone on the video call—their faces and voices—were entirely deepfaked by scammers.'
      },
      {
        title: 'The DAO Hack that forced Ethereum to rewrite its own history',
        research_context: 'In 2016, a decentralized venture fund called The DAO raised $150 million in Ethereum. A hacker found a vulnerability in the smart contract and drained $50 million. To save the investors, the Ethereum founders did the unthinkable: they rolled back the blockchain to a state before the hack, splitting the community and creating Ethereum Classic.'
      },
      // Batch 2
      {
        title: 'The Mt. Gox hack that vanished 850,000 Bitcoin',
        research_context: 'In 2014, Mt. Gox was handling 70% of all global Bitcoin transactions from a messy office in Tokyo. Over the course of three years, hackers silently siphoned 850,000 Bitcoins out of the exchange\'s hot wallets because the CEO, Mark Karpelès, had stored the unencrypted private keys in a simple text file on a networked computer. The company collapsed overnight, erasing $450 million (now worth $57 billion) of customer funds.'
      },
      {
        title: 'The SolarWinds hack that breached the US Government',
        research_context: 'Russian intelligence didn\'t hack the US Treasury directly; they hacked the IT monitoring software everyone used. By silently slipping malicious code into a routine SolarWinds software update, the hackers gained god-level access to the Pentagon, the DOJ, and 18,000 other organizations. The breach went completely undetected for nine months, exposing the absolute fragility of the global software supply chain.'
      },
      {
        title: 'The Y2K38 problem will crash the internet in 2038',
        research_context: 'On January 19, 2038, the Unix time system that underpins the entire internet will run out of digits. Because it counts seconds since 1970 using a 32-bit integer, it will hit its maximum capacity and roll over to a negative number (representing the year 1901). If legacy systems aren\'t upgraded to 64-bit, satellites will fall out of orbit, banking databases will corrupt, and GPS will fail globally.'
      },
      {
        title: 'The $600M Axie Infinity heist via a fake job interview',
        research_context: 'North Korean hackers from the Lazarus Group didn\'t use brute force to steal $600 million from the crypto game Axie Infinity. They targeted a senior engineer on LinkedIn, offering him a lucrative fake job. After passing multiple rounds of "interviews," he downloaded a PDF offer letter containing spyware. That single click gave the hackers access to the blockchain\'s validator nodes, draining the entire treasury.'
      },
      {
        title: 'The Mirai Botnet took down the internet using toasters',
        research_context: 'In 2016, half of the US internet—including Twitter, Netflix, and Reddit—suddenly went dark. The attack wasn\'t a sophisticated nation-state weapon. Three college students had built a malware called Mirai that hijacked default-password smart home devices: security cameras, baby monitors, and smart toasters. They unleashed a massive DDoS attack just to gain an advantage in the game Minecraft, accidentally paralyzing the global web.'
      },
      {
        title: 'The ILOVEYOU virus that cost the economy $10 Billion',
        research_context: 'In 2000, a 24-year-old college dropout in the Philippines wrote a simple VBScript worm disguised as a love letter. Because the Windows operating system hid file extensions by default, millions of people clicked the attachment. The script overwrote local files and instantly emailed itself to everyone in the user\'s address book. It infected 50 million computers in 10 days, forcing the Pentagon and CIA to shut down their mail servers.'
      },
      {
        title: 'Pegasus Spyware: The invisible zero-click weapon',
        research_context: 'Built by the NSO Group, Pegasus is a military-grade spyware that doesn\'t require you to click a link. It infects iPhones via a "zero-click" exploit, often through a missed WhatsApp call that instantly deletes itself from the call log. Once installed, it silently activates the microphone, camera, and GPS, turning a target\'s phone into a permanent tracking device for hostile governments.'
      },
      {
        title: 'How a bored hacker poisoned a Florida town\'s water supply',
        research_context: 'In 2021, an operator at a water treatment plant in Oldsmar, Florida, watched his mouse cursor move on its own. A hacker had bypassed their outdated Windows 7 firewall and opened the software controlling the water chemicals. The hacker increased the sodium hydroxide (lye) levels from 100 parts per million to 11,100—a lethal, highly corrosive dose. The operator caught it seconds before the poisoned water entered the city pipes.'
      },
      {
        title: 'The Ashley Madison breach that ruined 32 million lives',
        research_context: 'The dating site for extramarital affairs promised absolute discretion. In 2015, a hacker group called The Impact Team downloaded the entire user database and demanded the site shut down. When they refused, the hackers dumped 9.7 gigabytes of data onto the dark web. Marriages collapsed, executives were fired, and pastors resigned as millions of names, credit cards, and sexual fantasies were made public.'
      },
      {
        title: 'WannaCry: The ransomware that crippled UK hospitals',
        research_context: 'In 2017, the WannaCry ransomware worm locked hundreds of thousands of computers globally, demanding Bitcoin to unencrypt the hard drives. It utilized "EternalBlue," an exploit stolen from the NSA. The attack paralyzed the UK’s National Health Service; ambulances were diverted, and cancer surgeries were canceled because doctors couldn\'t access patient records. It was stopped only when a 22-year-old researcher accidentally registered a "kill switch" domain.'
      }
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
      {
        title: 'How Wirecard fooled auditors into believing $2B existed',
        research_context: 'Wirecard claimed to have €1.9 billion in Philippine trustee accounts. Executives forged bank confirmations and set up fake websites. When EY auditors visited Manila, Wirecard organized choreographed theatrical visits with fake bank employees in rented offices. The fraud collapsed in 2020 when the actual banks stated the money never existed.'
      },
      {
        title: 'Bernie Madoff ran a $64B fund without making a single trade',
        research_context: 'Bernie Madoff ran the largest Ponzi scheme in history by ignoring the market. He generated fake paper statements showing a steady 10-12% return. Financial analysts realized the math was impossible; option pricing models proved the volume of index options Madoff claimed to be trading didn\'t even exist in the open market.'
      },
      {
        title: 'A 28-year-old bankrupted the Queen of England\'s bank',
        research_context: 'Nick Leeson, a rogue trader in Singapore, used a dormant error account (88888) to hide losses from unauthorized derivatives trading. To recover the hidden losses, he doubled down on his bets, eventually amassing a $1.4 billion deficit. He single-handedly caused the collapse of Barings Bank, a 233-year-old institution.'
      },
      {
        title: 'Theranos faked a revolution using standard Siemens machines',
        research_context: 'Elizabeth Holmes claimed her Edison machine could run 200 health tests from a single drop of blood. The prototypes failed constantly. To maintain the illusion to investors, the company secretly diluted patient blood samples and ran them on standard, commercially available Siemens machines locked in a secret basement lab.'
      },
      {
        title: 'FTX backed billions in loans with a token they invented out of thin air',
        research_context: 'Sam Bankman-Fried’s exchange FTX lent billions in customer deposits to his trading firm, Alameda Research. The collateral backing these loans was FTT, a token that FTX created and controlled. When a rival CEO tweeted about dumping FTT, the token crashed to zero, exposing an $8 billion hole in customer funds.'
      },
      {
        title: 'Lehman Brothers hid $50B using a trick called "Repo 105"',
        research_context: 'Before their 2008 collapse, Lehman Brothers used an accounting loophole called "Repo 105" to temporarily move $50 billion of toxic assets off its balance sheet right before quarterly earnings reports. They classified short-term loans as outright sales, making their leverage look vastly healthier to regulators.'
      },
      {
        title: 'The Indonesian gold mine that held absolutely no gold',
        research_context: 'In the 1990s, Bre-X Minerals claimed to have found the largest gold deposit in history in the jungle, pushing its stock to a $6B valuation. In truth, the chief geologist was buying panned gold from locals and "salting" the core samples—dumping gold shavings into the dirt—before sending them to independent labs.'
      },
      {
        title: 'Enron booked billions in revenue on deals that entirely failed',
        research_context: 'Enron utilized "mark-to-market" accounting to book potential future profits on the day a deal was signed. When projects failed, the losses were hidden in off-the-books shell companies. They reported $100B in revenue while quietly hemorrhaging cash, leading to a catastrophic collapse and the dissolution of Arthur Andersen.'
      },
      {
        title: 'The Hunt Brothers tried to corner the global silver market',
        research_context: 'In 1980, billionaire brothers Nelson and William Hunt bought up one-third of the entire world’s privately held silver supply. They drove the price from $6 to $50 an ounce. In response, the exchange abruptly changed the margin rules, forcing a massive sell-off. "Silver Thursday" collapsed the price, bankrupting the brothers.'
      },
      // Batch 2
      {
        title: 'Nobel laureates blew up a $126 Billion hedge fund',
        research_context: 'Long-Term Capital Management was run by two Nobel Prize-winning economists who believed markets were perfectly rational. They used complex computer models to leverage their fund 25-to-1. When Russia defaulted on its debt in 1998, the markets behaved irrationally, defying their mathematical models. The fund vaporized $4.6 billion in months, forcing the US Federal Reserve to orchestrate a massive bailout to prevent a global banking collapse.'
      },
      {
        title: 'The Great Salad Oil Swindle that crashed Wall Street',
        research_context: 'In the 1960s, Anthony DeAngelis secured massive loans using his company’s inventory of soybean oil as collateral. American Express sent inspectors to verify the tanks. DeAngelis knew oil floats on water, so he filled the massive vats entirely with seawater, adding just a few inches of oil at the top. He forged $150 million in receipts before the scam collapsed, bankrupting two brokerage houses.'
      },
      {
        title: 'How a 36-year-old spoofed the market from his bedroom',
        research_context: 'During the 2010 Flash Crash, the Dow Jones dropped 1,000 points in minutes, wiping out a trillion dollars. The culprit wasn\'t a massive bank. It was Navinder Singh Sarao, a day trader in his parents\' house in London. He used custom software to place thousands of massive, fake sell orders, canceling them milliseconds before execution. This "spoofing" tricked Wall Street\'s algorithms into panic-selling, while Sarao quietly bought the dip.'
      },
      {
        title: 'The crypto CEO who faked his death with $250 million',
        research_context: 'Gerald Cotten ran QuadrigaCX, Canada’s largest crypto exchange. In 2018, he unexpectedly died of complications from Crohn\'s disease while honeymooning in India. He was supposedly the only person with the passwords to the "cold wallets" holding $250 million of customer funds. Forensic investigators later discovered the wallets were mostly empty; Cotten had been using fake accounts to gamble away customer crypto for years.'
      },
      {
        title: 'The chatroom cartel that rigged global interest rates',
        research_context: 'LIBOR is the benchmark interest rate that dictates everything from student loans to global mortgages. For years, a small group of elite traders across rival banks colluded in private Bloomberg chatrooms (with names like "The Cartel") to manually rig the daily rate submissions. By moving the global interest rate by just a fraction of a percent, they secured billions in illicit profits.'
      },
      {
        title: '1MDB: The heist that funded the Wolf of Wall Street',
        research_context: 'Jho Low, a Malaysian fugitive, orchestrated the theft of $4.5 billion from Malaysia’s sovereign wealth fund, 1MDB. With the help of Goldman Sachs bankers, he diverted state funds through complex offshore shell companies. He used the stolen billions to buy superyachts, throw parties with Leonardo DiCaprio, and ironically, finance the production of the movie "The Wolf of Wall Street."'
      },
      {
        title: 'The man who sold the Eiffel Tower twice',
        research_context: 'In 1925, con artist Victor Lustig read that the Eiffel Tower was rusting and expensive to maintain. He forged government stationery and invited wealthy scrap metal dealers to a secret meeting, claiming the city was selling the tower for scrap. He secured a massive bribe from a gullible dealer, fled to Austria with a suitcase of cash, and when the dealer was too embarrassed to go to the police, Lustig returned and tried to sell it again.'
      },
      {
        title: 'The Pigeon King International Ponzi Scheme',
        research_context: 'Arlan Galbraith convinced hundreds of Amish and Mennonite farmers in Canada to buy breeding pairs of pigeons for up to $500 each, promising to buy back their offspring at highly inflated prices for a non-existent "squab meat market." The company generated zero actual revenue; he was simply paying the old farmers with money from the new farmers. When the $20 million Pigeon Ponzi collapsed, millions of birds had to be euthanized.'
      },
      {
        title: 'The $6 Billion natural gas weather bet that failed',
        research_context: 'In 2006, Brian Hunter, a star trader at Amaranth Advisors, made massive leveraged bets that winter natural gas prices would skyrocket due to hurricanes. When the weather turned out to be milder than expected, the market moved against him. Because he held such massive, illiquid positions, he couldn\'t exit the trades. The fund lost $6 billion in a matter of weeks and was liquidated.'
      },
      {
        title: 'Just Mayo bought their own mayonnaise to fake demand',
        research_context: 'Hampton Creek, a Silicon Valley food-tech startup backed by Bill Gates, wanted their vegan "Just Mayo" to dominate supermarkets. To convince investors of massive consumer demand, the company ran a secret operation where they paid contractors to physically walk into grocery stores across the country and buy thousands of jars of their own mayonnaise, heavily artificially inflating their sales metrics.'
      }
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
      {
        title: 'Epictetus was a crippled slave who became Rome\'s greatest mind',
        research_context: 'Born a slave, Epictetus\'s master deliberately snapped his leg. Epictetus focused entirely on the Dichotomy of Control: he could not control his enslaved, crippled body, but his mind was absolutely free. He gained his freedom, founded a school, and became so respected that emperors attended his lectures.'
      },
      {
        title: 'James Stockdale survived 7 years as a POW using Stoicism',
        research_context: 'Shot down over Vietnam in 1965, Admiral Stockdale was held in the Hanoi Hilton, tortured, and kept in solitary confinement. He survived by brutally accepting his reality while maintaining faith he would prevail. He noted that the optimists died of broken hearts, while he used Epictetus\'s teachings as a literal survival protocol.'
      },
      {
        title: 'Seneca treated his exile to a barren island as a vacation',
        research_context: 'Banished to the barren island of Corsica by Emperor Claudius, Seneca did not despair. He wrote letters of consolation to his grieving mother, arguing that the true philosopher is at home anywhere in the universe. He asserted that external geography and lack of luxury cannot diminish internal virtue.'
      },
      {
        title: 'Zeno founded Stoicism after losing his entire fortune at sea',
        research_context: 'Zeno of Citium, a wealthy merchant, lost his entire fortune when his cargo ship sank. Wandering Athens penniless, he stumbled into a bookstore and discovered philosophy. Realizing his wealth had been blinding him from truth, he later stated, "I made a prosperous voyage when I suffered shipwreck."'
      },
      {
        title: 'Cato the Younger chose death over living under a tyrant',
        research_context: 'Cato was the ultimate Stoic politician, refusing to compromise his morals as the Republic crumbled. When Julius Caesar won the civil war and offered a pardon, Cato chose to end his own life rather than live under a dictator\'s mercy, believing moral integrity was worth more than breathing.'
      },
      {
        title: 'Cleanthes hauled water at night to study wisdom by day',
        research_context: 'Cleanthes worked grueling night shifts carrying water for gardens so he could afford to study under Zeno during the day. Despite his extreme poverty, he refused state subsidies, demonstrating that manual labor and severe frugality were not barriers to achieving profound intellectual mastery.'
      },
      {
        title: 'Agrippinus went to dinner after receiving a death sentence',
        research_context: 'Paconius Agrippinus was informed by a messenger that he had been condemned by the volatile Emperor Nero. His immediate response? "Then let us go dine in Aricia." He refused to let the tyrant\'s death sentence disrupt his daily routine, treating a fatal external event with absolute emotional indifference.'
      },
      {
        title: 'Musonius Rufus argued exile was optimal for human growth',
        research_context: 'Repeatedly exiled by fearful emperors, Musonius Rufus taught that humans are designed to endure hardship, just as a soldier is trained to march. He viewed exile not as a punishment, but as a forced training ground to strip away luxury, test one\'s true character, and build resilience.'
      },
      {
        title: 'Marcus Aurelius wept when his betrayer was assassinated',
        research_context: 'When Avidius Cassius, one of his most trusted generals, rebelled and claimed the throne, Marcus did not seek revenge. He told his troops he intended to capture Cassius alive to show him total mercy. When Cassius was killed by his own men, Marcus wept for the lost opportunity to forgive him.'
      },
      // Batch 2
      {
        title: 'Seneca practiced poverty to destroy his fear of it',
        research_context: 'Seneca was one of the wealthiest men in Rome, yet he understood that luxury creates fragility. Once a month, he engaged in "Premeditatio Malorum" (the premeditation of evils). He would dress in rags, sleep on the cold floor, and eat only stale bread. He did this not for charity, but to look at his worst-case scenario and realize: "Is this the condition I so feared?"'
      },
      {
        title: 'Marcus Aurelius sold the palace treasures to avoid taxing the poor',
        research_context: 'When the Marcomannic Wars drained the Roman treasury, Emperor Marcus Aurelius refused to raise taxes on the citizens. Instead, he ordered all the imperial palace\'s luxury goods—gold statues, crystal goblets, and his wife\'s silk robes—to be hauled to the Forum and auctioned off over two months. He proved that a true leader sacrifices his own comfort before his people\'s.'
      },
      {
        title: 'Epictetus on dealing with toxic people',
        research_context: 'Epictetus taught that being offended is a choice. He used the analogy of a stone: "If someone insulted a rock, what would the rock do? Nothing." He argued that when you let a toxic person provoke an emotional reaction out of you, you are handing them the remote control to your own mind. True power is becoming emotionally bulletproof.'
      },
      {
        title: 'The Stockdale Paradox: Why optimists die first',
        research_context: 'Admiral James Stockdale observed a brutal truth during his 7 years in a Vietnam POW camp. The prisoners who died of broken hearts were the optimists—the ones who said, "We\'ll be out by Christmas." When Christmas passed, they lost their minds. Stockdale survived by accepting the brutal reality of his current situation, while maintaining an unwavering, disciplined belief that he would eventually prevail in the end.'
      },
      {
        title: 'Diogenes the Cynic mocked Alexander the Great to his face',
        research_context: 'Alexander the Great, the most powerful man on earth, sought out Diogenes, a philosopher who lived in a ceramic tub in the street. Alexander stood over him and said, "Ask any favor of me, and it is yours." Diogenes, completely unbothered by wealth or status, simply replied, "Yes, stand a little out of my sun." Alexander later said, "If I were not Alexander, I would wish to be Diogenes."'
      },
      {
        title: 'Zeno\'s Dog and the Cart: The concept of Amor Fati',
        research_context: 'Zeno explained fate using the metaphor of a dog tied to a moving cart. The cart represents the universe, and you are the dog. If you fight the cart, you will be dragged, scraped, and choked by the rope. If you accept the cart\'s direction and trot alongside it, you retain your dignity. You cannot control what happens to you, only your reaction to it.'
      },
      {
        title: 'Seneca on the shortness of life',
        research_context: 'Seneca brutally observed that human life is not actually short; we just waste most of it. We guard our property and money with our lives, but we let anyone steal our time. We spend years scrolling, gossiping, and pursuing vanity, only to panic on our deathbeds. The Stoic realization is that time is the only non-renewable asset you possess.'
      },
      {
        title: 'Epictetus: You are an actor in a play you didn\'t write',
        research_context: 'Epictetus reminded his students that life is a stage play, and you are merely an actor. The Director (fate) decides if you play a beggar, a king, a cripple, or a wealthy merchant. It is not your job to demand a better role; it is your job to play the role you were assigned with absolute excellence and zero complaints.'
      },
      {
        title: 'Chrysippus ran 500 miles just to study under Cleanthes',
        research_context: 'Chrysippus was an elite long-distance runner. When he discovered philosophy, he gave up his athletic fame, ran 500 miles to Athens, and begged to study under the Stoic master Cleanthes. He realized that physical superiority means nothing if the mind is weak. He went on to write over 700 books and systemize the entire school of Stoic logic.'
      },
      {
        title: 'Marcus Aurelius dealt with severe chronic illness',
        research_context: 'The Emperor of Rome was not a physically robust man; he suffered from chronic chest pains, stomach ulcers, and insomnia his entire life. Yet, he never used his physical pain as an excuse to neglect his imperial duties. In Meditations, he repeatedly reminds himself that physical pain affects the body, but it cannot touch the soul unless the mind grants it permission.'
      }
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
      {
        title: 'FEMA says 72 hours — survival instructors stock 14 days',
        research_context: 'FEMA officially recommends citizens keep a 72-hour supply of food and water. However, every professional emergency manager maintains a minimum 14-day supply. During massive hurricanes, isolated urban pockets routinely go over 10 days without clean water before federal logistical chains can reach them.'
      },
      {
        title: 'Texas Freeze 2021 proved modern homes are death traps',
        research_context: 'Winter Storm Uri collapsed the power grid, leaving 4.5 million Texans without power in freezing temperatures. Without electricity, uninsulated pipes burst, flooding homes. People resorted to burning furniture indoors to survive. It exposed how modern architecture relies entirely on artificial heating.'
      },
      {
        title: 'Grocery stores will empty in exactly 72 hours',
        research_context: 'Modern supermarkets hold only about 3 days of inventory, tightly managed by "just-in-time" algorithmic logistics. When a massive snowstorm, cyberattack, or trucking strike halts deliveries, the shelves are stripped bare in 24 to 72 hours by panicked buyers. Abundance vanishes instantly.'
      },
      {
        title: 'The Water Hierarchy: Why boiling isn\'t enough in a city',
        research_context: 'Storing enough water takes too much space. Urban survivalists rely on filters like Sawyer and Berkey. Boiling water kills biological pathogens, but in an urban crisis, the water is filled with heavy metals, chemical runoff, and industrial waste. Only a high-end filtration system removes chemical contaminants.'
      },
      {
        title: 'The Grey Man Concept: Why tactical gear gets you killed',
        research_context: 'In a severe urban crisis, wearing a tactical backpack and camouflage makes you a high-value target for desperate people. The "Grey Man" strategy dictates blending in entirely—wearing dull, common clothing and acting scared. You survive by becoming visually invisible to predators, not by looking like Rambo.'
      },
      {
        title: 'Your first aid kit is useless in a mass casualty event',
        research_context: 'Most urbanites have a first aid kit with Band-Aids, but lack a true trauma kit. In a severe accident where EMS is overwhelmed, survival depends entirely on tourniquets, hemostatic gauze, and chest seals to stop catastrophic arterial bleeding in the crucial first 3 minutes.'
      },
      {
        title: 'Bug Out vs. Bug In: Escaping is often a fatal math error',
        research_context: 'The Hollywood fantasy is escaping to the woods. The reality is that "bugging out" often means becoming a refugee trapped in a gridlocked highway traffic jam without shelter. Unless your home is physically compromised (fire, flood), fortifying your location with your supplies is mathematically much safer.'
      },
      {
        title: 'EMP Fragility: Why a solar flare erases your bank account',
        research_context: 'An Electromagnetic Pulse (EMP), whether from a solar flare or a detonation, would fry unprotected microchips. Modern vehicles wouldn\'t start, water treatment plants would fail, and digital financial ledgers would erase. Only analog technology and electronics stored in Faraday cages would survive.'
      },
      {
        title: 'Cash is King when the point-of-sale systems crash',
        research_context: 'When digital payment networks crash, all commerce stops. Survivalists keep small denomination bills ($1, $5, $10). If the grid is down, a desperate vendor cannot give you change for a $100 bill, meaning your $100 might only buy you a $5 bottle of water.'
      },
      // Batch 2
      {
        title: 'The Rule of 3s: Why panic kills you faster than thirst',
        research_context: 'Survival instructors drill the Rule of 3s into every student. You can survive 3 weeks without food, 3 days without water, and 3 hours without shelter in extreme weather. But you will die in 3 minutes without oxygen, and 3 seconds without hope. In an urban collapse, people panic and exhaust their energy securing food, completely ignoring immediate threats like exposure or bleeding.'
      },
      {
        title: 'Normalcy Bias: Why people die in burning buildings',
        research_context: 'During the 9/11 attacks, many people in the towers gathered their belongings, shut down their computers, and waited for instructions instead of fleeing immediately. This is "Normalcy Bias"—the brain\'s refusal to process that a catastrophe is happening because it has never happened before. In a crisis, your brain will lie to you and tell you everything is fine. You must train yourself to act instantly.'
      },
      {
        title: 'Carbon Monoxide: The invisible urban killer',
        research_context: 'During massive winter grid failures, more people die from carbon monoxide poisoning than from freezing. Desperate to stay warm, families bring charcoal grills, gas generators, and propane heaters indoors. Because modern homes are so tightly insulated, the odorless, invisible gas builds up rapidly, putting the entire family to sleep permanently without them ever realizing they are suffocating.'
      },
      {
        title: 'Elevator safety during grid failures: Never force the doors',
        research_context: 'If the power grid collapses while you are in a high-rise elevator, the instinct is to pry the doors open and climb out. This is a fatal mistake. If the power momentarily surges, or the emergency brake slips, the car can move instantly, shearing you in half. The safest protocol is to stay inside the car, use the emergency call box, and conserve oxygen until rescue crews manually hoist the car.'
      },
      {
        title: 'Sewer backup: The disgusting reality of power loss',
        research_context: 'Modern urban plumbing relies entirely on massive electrical lift pumps to move raw sewage uphill to treatment plants. If the grid goes down for more than 48 hours, those pumps stop. Millions of gallons of raw sewage will back up through the pipes, violently flooding the basements and ground floors of high-rise apartment buildings, creating an immediate biological hazard.'
      },
      {
        title: 'Why a bicycle is the ultimate bug-out vehicle',
        research_context: 'During an evacuation, a $60,000 4x4 truck is a metal coffin. Highways will turn into parking lots within two hours of a crisis announcement, gridlocked by accidents and stalled cars. A simple mountain bike is silent, requires no fuel, can navigate between stalled cars, and can carry 50 lbs of gear in panniers. It is mathematically the fastest way out of a collapsing city.'
      },
      {
        title: 'The 1977 NYC Blackout: Society collapses in hours',
        research_context: 'It is a myth that people band together in a crisis. During the 1977 New York City blackout, it took less than two hours for massive looting and arson to erupt across the five boroughs. 1,600 stores were destroyed and 1,000 fires were set before the sun came up. It proved that the thin veneer of civilization is entirely dependent on streetlights and functioning police radios.'
      },
      {
        title: 'Bartering in a collapse: Why gold is useless',
        research_context: 'Preppers hoard gold coins, but in a true urban collapse, you cannot eat gold, and you cannot give a starving person change for an ounce of silver. The true post-collapse currencies are small, highly addictive, or highly medical consumables: antibiotics, painkillers, miniature liquor bottles, instant coffee, water filters, and lighters.'
      },
      {
        title: 'The danger of glass skyscrapers in an explosion',
        research_context: 'In an urban bombing or massive earthquake, the primary cause of death is not the blast itself—it is "glass rain." The tempered glass facades of high-rise buildings shatter and fall to the streets below in massive, lethal shards. Survival protocol dictates that during any blast or quake in a financial district, you must immediately seek structural overhead cover, not run out into the open street.'
      },
      {
        title: 'Why GPS failure means total logistical gridlock',
        research_context: 'We assume we can always navigate out of a city. But if the cellular networks crash, or a solar flare knocks out GPS satellites, 95% of the population instantly loses all spatial awareness. Delivery trucks won\'t know where the grocery stores are, and evacuees will jam the wrong highways. A physical, waterproof topographic map of your region is an absolute mandatory prep.'
      }
    ],
  ],
];