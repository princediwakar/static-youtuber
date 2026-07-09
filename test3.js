const str = "In 1993, Jensen Huang co-founded Nvidia.";
const sanitized = str.replace(/[^\\x00-\\x7F]/g, '');
console.log("length:", sanitized.length, "text:", sanitized);
