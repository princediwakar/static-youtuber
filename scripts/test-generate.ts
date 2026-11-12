import { generateScript } from '../lib/generators/short';
import { selectExperimentStrategy } from '../lib/experimentEngine';

async function testGeneration(accountId: string) {
  console.log(`\n========================================`);
  console.log(`🧪 Testing Generation for: ${accountId}`);
  console.log(`========================================`);

  const expConfig = selectExperimentStrategy(accountId, 'The Case File');
  console.log(`Strategy: ${expConfig.id} (${expConfig.durationBracket}) | Hook: ${expConfig.hookStyle} | Target Shots: ${expConfig.shotCountRange.min}-${expConfig.shotCountRange.max} | Target Duration: ~${expConfig.targetSeconds}s`);

  // Mock Inngest step runner
  const mockStep = {
    run: async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
      console.log(`  ▶ [step] ${name}`);
      const t0 = Date.now();
      const res = await fn();
      console.log(`  ✔ [step] ${name} completed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      return res;
    },
  };

  try {
    const { script: result, topic, formatTemplate } = await generateScript(mockStep, 'The Case File', accountId);
    console.log(`\n--- GENERATED SCRIPT DETAILS ---`);
    console.log(`Topic: ${topic}`);
    console.log(`Format Template: ${formatTemplate}`);
    const hook = result.shots[0]?.caption_text || '';
    console.log(`Title: ${result.title}`);
    console.log(`Hook (Shot 1): ${hook}`);
    console.log(`Visual World: ${result.visual_world}`);
    console.log(`Shot Count: ${result.shots.length}`);
    
    const totalWords = result.shots.reduce((acc, s) => acc + s.spoken_text.split(/\s+/).length, 0);
    const estDuration = (totalWords / 2.5).toFixed(1);
    console.log(`Total Words: ${totalWords} (~${estDuration}s spoken duration)`);

    console.log(`\n--- SHOTS PREVIEW ---`);
    result.shots.forEach((s, idx) => {
      console.log(`Shot ${idx + 1} [${s.visual_prompt.slice(0, 50)}...]: "${s.caption_text}"`);
    });

    // Virality and Interestingness Evaluation
    console.log(`\n--- VIRALITY & QUALITY EVALUATION ---`);
    const hasShortsTag = result.title.includes('#Shorts');
    const wordCountOk = totalWords >= expConfig.wordCountRange.min * 0.8 && totalWords <= expConfig.wordCountRange.max * 1.25;
    const shotCountOk = result.shots.length >= expConfig.shotCountRange.min && result.shots.length <= expConfig.shotCountRange.max;
    const hookStrong = hook.length > 10 && !hook.toLowerCase().includes('in this video');
    const noCorporateJargon = !/roi|b2b|corporate tax|tax consultation|medical practice leasing|software pipeline/i.test(hook + ' ' + result.shots.map(s => s.caption_text).join(' '));

    console.log(`1. Mandatory #Shorts in title: ${hasShortsTag ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`2. Pacing/Duration target (${expConfig.wordCountRange.min}-${expConfig.wordCountRange.max} words for ~${expConfig.targetSeconds}s): ${wordCountOk ? '✅ PASS' : '⚠️ WARN'} (${totalWords} words)`);
    console.log(`3. Shot count (${expConfig.shotCountRange.min}-${expConfig.shotCountRange.max} shots): ${shotCountOk ? '✅ PASS' : '⚠️ ACCEPTABLE'} (${result.shots.length} shots)`);
    console.log(`4. High-curiosity hook: ${hookStrong ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`5. Anti-boring / No corporate jargon: ${noCorporateJargon ? '✅ PASS' : '❌ FAIL'}`);

    return { success: true, result };
  } catch (err: any) {
    console.error(`❌ Generation failed:`, err.message || err);
    return { success: false, error: err };
  }
}

async function main() {
  const accounts = ['canvas_center', 'canvas_station', 'clinic_playbook'];
  for (const acc of accounts) {
    await testGeneration(acc);
  }
}

main().catch(console.error);
