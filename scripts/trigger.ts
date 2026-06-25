import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function triggerPipeline() {
  const { inngest } = await import('../inngest/client');

  console.log('Sending manual trigger event to Inngest...');

  const result = await inngest.send({
    name: 'slideshow/trigger',
  });

  console.log('✅ Trigger sent!');
  console.log('Event IDs:', result.ids);
  console.log('You can now watch the execution in your Inngest dev server terminal, or open the UI to see the steps.');
}

triggerPipeline().catch((err) => {
  console.error('Failed to trigger pipeline:', err);
  process.exit(1);
});
