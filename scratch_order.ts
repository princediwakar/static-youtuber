import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function checkResponses() {
  const imageBatchName = 'batches/xroxp607kyoo3ipks0rendlbbryq1l8m9ica';
  try {
    const imageJob = await ai.batches.get({ name: imageBatchName });
    const inlined = imageJob.dest?.inlinedResponses || [];
    console.dir(inlined[0], { depth: null });
  } catch (error) {
    console.error(error);
  }
}

checkResponses();
