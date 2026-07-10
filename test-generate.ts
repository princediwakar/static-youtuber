import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const { generateScript } = await import('./lib/generators/short.js');
  const step = { run: async (name: string, fn: any) => fn() };
  try {
    console.log("Generating script...");
    const res = await generateScript(step, 'Anti-Status Wealth', 'canvas_center');
    console.log("SUCCESS:");
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error("ERROR GENERATING:", err);
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
