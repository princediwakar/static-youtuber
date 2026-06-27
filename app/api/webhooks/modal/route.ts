// Path: app/api/webhooks/modal/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/inngest/client';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { jobId, mp4Url } = body;

  if (!jobId || !mp4Url) {
    return NextResponse.json({ error: 'Missing jobId or mp4Url' }, { status: 400 });
  }

  await inngest.send({
    name: 'modal/render.complete',
    data: { jobId, mp4Url },
  });

  return NextResponse.json({ ok: true });
}
