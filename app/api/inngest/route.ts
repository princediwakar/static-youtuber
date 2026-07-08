// Path: app/api/inngest/route.ts
// Inngest SDK serve handler — all Inngest function invocations come through here.
import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { 
  generateShort, 
  channelScheduler, 
  syncAnalyticsCron, 
  generateLongForm, 
  longFormScheduler 
} from '@/inngest/pipeline';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    generateShort, 
    channelScheduler, 
    syncAnalyticsCron, 
    generateLongForm, 
    longFormScheduler
  ],
});

// assemble-video step can take up to 5 minutes
export const maxDuration = 900;
