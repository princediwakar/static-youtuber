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
  try {
    const body = await request.json();
    accountId = body.accountId;
    jobId = body.jobId;
  } catch {
    // No JSON body — use the env default
  }

  const resolvedAccountId = accountId ?? ACCOUNT_ID;
  const label = jobId ? `retry job ${jobId} (${resolvedAccountId})` : resolvedAccountId;
  console.log(`[Cron] Triggering slideshow pipeline for: ${label}`);

  await inngest.send({
    name: 'slideshow/trigger',
    data: { accountId: resolvedAccountId, ...(jobId ? { jobId } : {}) },
  });

  return NextResponse.json({ ok: true, message: `Pipeline triggered for ${label}` }, { status: 202 });
}
