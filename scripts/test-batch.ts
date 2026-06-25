import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function main() {
  console.log('Testing Batch API for Image and TTS...');
  
  const imageBatch = await ai.batches.create({
    model: 'gemini-2.5-flash-image',
    src: [{
      contents: [{ role: 'user', parts: [{ text: 'A tiny cute kitten sitting in a mug.' }] }],
      config: { responseModalities: ['IMAGE'] },
    }],
    config: { displayName: `test-images-${Date.now()}` },
  });
  console.log('Image Batch created:', imageBatch.name);

  const audioBatch = await ai.batches.create({
    model: 'gemini-3.1-flash-tts-preview',
    src: [{
      contents: [{
        role: 'user',
        parts: [{ text: 'This is a test of the Gemini TTS batch API.' }],
      }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Fenrir' },
          },
        },
      },
    }],
    config: { displayName: `test-audio-${Date.now()}` },
  });
  console.log('Audio Batch created:', audioBatch.name);

  // Poll until both are complete
  let imgDone = false;
  let audDone = false;

  while (!imgDone || !audDone) {
    await new Promise(r => setTimeout(r, 10000));
    
    if (!imgDone) {
      const job = await ai.batches.get({ name: imageBatch.name as string });
      console.log(`Image batch state: ${job.state}`);
      if (['JOB_STATE_SUCCEEDED', 'JOB_STATE_FAILED', 'JOB_STATE_CANCELLED'].includes(job.state as string)) {
        imgDone = true;
        if (job.state === 'JOB_STATE_SUCCEEDED') {
          console.log('Image batch succeeded. Inspecting output...');
          const resp = job.dest?.inlinedResponses?.[0];
          console.log('Image Response parts:', JSON.stringify(resp?.response?.candidates?.[0]?.content?.parts?.map((p: any) => ({
            text: !!p.text,
            inlineData: p.inlineData ? p.inlineData.mimeType : undefined,
          })), null, 2));
        } else {
          console.error('Image batch failed:', job);
        }
      }
    }

    if (!audDone) {
      const job = await ai.batches.get({ name: audioBatch.name as string });
      console.log(`Audio batch state: ${job.state}`);
      if (['JOB_STATE_SUCCEEDED', 'JOB_STATE_FAILED', 'JOB_STATE_CANCELLED'].includes(job.state as string)) {
        audDone = true;
        if (job.state === 'JOB_STATE_SUCCEEDED') {
          console.log('Audio batch succeeded. Inspecting output...');
          const resp = job.dest?.inlinedResponses?.[0];
          console.log('Audio Response parts:', JSON.stringify(resp?.response?.candidates?.[0]?.content?.parts?.map((p: any) => ({
            text: !!p.text,
            inlineData: p.inlineData ? p.inlineData.mimeType : undefined,
          })), null, 2));
        } else {
          console.error('Audio batch failed:', job);
        }
      }
    }
  }
}

main().catch(console.error);
