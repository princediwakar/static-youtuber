// Path: app/api/cron/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/inngest/client';
import { ACCOUNT_ID } from '@/lib/constants';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  let accountId: string | undefined;
  let jobId: string | undefined;
  let contentType: string = 'shorts';
  try {
    const body = await request.json();
    accountId = body.accountId;
    jobId = body.jobId;
    contentType = body.contentType || 'shorts';
  } catch {
    // No JSON body — use the env default
  }

  const resolvedAccountId = accountId ?? ACCOUNT_ID;
  const label = jobId ? `retry job ${jobId} (${resolvedAccountId})` : resolvedAccountId;
  const eventName = contentType === 'long' ? 'slideshow/trigger-long' : 'slideshow/trigger';
  console.log(`[Cron] Triggering ${contentType} pipeline for: ${label}`);

  await inngest.send({
    name: eventName,
    data: { accountId: resolvedAccountId, ...(jobId ? { jobId } : {}) },
  });

  return NextResponse.json({ ok: true, message: `${contentType} pipeline triggered for ${label}` }, { status: 202 });
}
