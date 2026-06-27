// Path: app/api/webhooks/modal/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/inngest/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, mp4Url } = body;

    if (!jobId || !mp4Url || typeof jobId !== 'string' || typeof mp4Url !== 'string') {
      console.error('[Modal Webhook] Invalid payload:', body);
      return NextResponse.json({ error: 'Missing or invalid jobId or mp4Url' }, { status: 400 });
    }

    console.log(`[Modal Webhook] Received render complete for job ${jobId}: ${mp4Url}`);

    await inngest.send({
      name: 'modal/render.complete',
      data: { jobId, mp4Url },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[Modal Webhook] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
