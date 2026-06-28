// Auto-replenishment has been intentionally removed.
//
// Reason: DeepSeek cannot generate factually accurate `research_context` without web access.
// Auto-generated topics hallucinate facts, producing garbage scripts that fail the quality gate.
//
// Replacement workflow:
//   1. Research topics manually (or use Perplexity/Tavily in the future)
//   2. Add them to scripts/seed-topics.ts with accurate research_context
//   3. Run: npx ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node"}' scripts/seed-topics.ts
//
// See Option B in CLAUDE.md if you want to build an agentic researcher later.

console.error('ERROR: Auto-replenishment has been removed. Use scripts/seed-topics.ts instead.');
console.error('See scripts/regenerate-topics.ts for the rationale and migration guide.');
process.exit(1);

export {};
