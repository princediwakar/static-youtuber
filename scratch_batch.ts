import { GoogleGenAI } from '@google/genai';

async function checkBatch() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const imageBatch = await ai.batches.get({ name: 'batches/0opgmp2xxdd9melucml2y8ef6x0e3io8ktg9' });
  const audioBatch = await ai.batches.get({ name: 'batches/cttkysousf7dgrkphs91pwcnun2w2eyy3imn' });
  console.log('Image Batch Status:', imageBatch.state);
  console.log('Audio Batch Status:', audioBatch.state);
}

checkBatch();
