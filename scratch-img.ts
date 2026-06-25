import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function main() {
  const models = ['imagen-4.0-fast-generate-001', 'imagen-4.0-generate-001', 'gemini-3.1-flash-image', 'gemini-3-pro-image'];
  for (const m of models) {
    try {
      console.log(`Trying ${m}...`);
      await ai.models.generateImages({
        model: m,
        prompt: 'a tiny kitten',
        config: { numberOfImages: 1, aspectRatio: '16:9' }
      });
      console.log(`SUCCESS: ${m}`);
      break;
    } catch (e: any) {
      console.log(`FAILED ${m}: ${e.message}`);
    }
  }
}
main();
