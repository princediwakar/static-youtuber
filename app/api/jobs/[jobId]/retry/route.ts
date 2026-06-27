// Path: app/api/jobs/[jobId]/retry/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/inngest/client';
import { db } from '@/lib/database';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { jobId } = await params;
  const job = await db.getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  if (job.status === 'published') {
    return NextResponse.json({ ok: true, message: 'Job already published' }, { status: 200 });
  }

  await inngest.send({
    name: 'slideshow/trigger',
    data: { accountId: job.account_id, jobId: job.id },
  });

  return NextResponse.json({ ok: true, message: `Retrying job ${job.id}`, jobId: job.id }, { status: 202 });
}
