const str = "In 1993, Jensen Huang co-founded Nvidia at Denny's.";
const sanitized = str
  .replace(/[‘’`]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[\u2014—]/g, '... ')
  .replace(/[^\x00-\x7F]/g, '');
console.log("length:", sanitized.length, "text:", sanitized);
