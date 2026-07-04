// Path: app/api/webhooks/modal/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/inngest/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, mp4Url, error } = body;

    if (!jobId || typeof jobId !== 'string') {
      console.error('[Modal Webhook] Missing jobId:', body);
      return NextResponse.json({ error: 'Missing or invalid jobId' }, { status: 400 });
    }

    if (error) {
      console.error(`[Modal Webhook] Render FAILED for job ${jobId}: ${error}`);
      await inngest.send({
        name: 'modal/render.complete',
        data: { jobId, error },
      });
      return NextResponse.json({ ok: true });
    }

    if (!mp4Url || typeof mp4Url !== 'string') {
      console.error('[Modal Webhook] Missing mp4Url on success callback:', body);
      return NextResponse.json({ error: 'Missing or invalid mp4Url' }, { status: 400 });
    }

    console.log(`[Modal Webhook] Render complete for job ${jobId}: ${mp4Url}`);

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
