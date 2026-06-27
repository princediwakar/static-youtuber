// Path: app/api/cron/route.ts
// Receives POST from cron-job.org → triggers the Inngest slideshow pipeline.
// Returns 202 in < 50ms — the actual work happens asynchronously in Inngest.
import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/inngest/client';
import { ACCOUNT_ID } from '@/lib/constants';

export const runtime = 'nodejs';
// Short timeout is fine — we're only firing an Inngest event, not doing real work
export const maxDuration = 15;

export async function POST(request: NextRequest) {
  // Auth check — same pattern as ai-youtuber
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  let accountId: string | undefined;
  try {
    const body = await request.json();
    accountId = body.accountId;
  } catch {
    // No JSON body — use the env default
  }

  const resolvedAccountId = accountId ?? ACCOUNT_ID;
  console.log(`[Cron] Triggering slideshow pipeline for account: ${resolvedAccountId}`);

  await inngest.send({
    name: 'slideshow/trigger',
    data: { accountId: resolvedAccountId },
  });

  return NextResponse.json({ ok: true, message: `Pipeline triggered for ${resolvedAccountId}` }, { status: 202 });
}
