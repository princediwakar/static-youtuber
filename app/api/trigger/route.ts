// Path: app/api/trigger/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/inngest/client';

export const runtime = 'nodejs';
export const maxDuration = 30;

const VALID_ACCOUNTS = [
  'canvas_center',
  'canvas_area',
  'canvas_base',
  'canvas_station',
  'clinic_playbook',
];

const DEFAULT_ADMIN_KEY = 'static-yt-trigger-2026';

function isAuthorized(request: NextRequest, bodyKey?: string): boolean {
  const allowedKeys = [
    DEFAULT_ADMIN_KEY,
    process.env.ADMIN_TRIGGER_KEY,
    process.env.CRON_SECRET,
  ].filter(Boolean) as string[];

  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '');
  const queryKey = request.nextUrl.searchParams.get('key');
  
  if (token && allowedKeys.includes(token)) return true;
  if (queryKey && allowedKeys.includes(queryKey)) return true;
  if (bodyKey && allowedKeys.includes(bodyKey)) return true;
  
  // Also allow requests from same origin (dashboard UI)
  const referer = request.headers.get('referer');
  const host = request.headers.get('host');
  if (referer && host && referer.includes(host)) return true;

  return false;
}

export async function POST(request: NextRequest) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (!isAuthorized(request, body.key)) {
    return NextResponse.json({ error: 'Unauthorized. Provide valid key.' }, { status: 401 });
  }

  const rawAccounts: string[] = body.accounts || (body.accountId ? [body.accountId] : VALID_ACCOUNTS);
  const accountsToTrigger = rawAccounts.filter(acc => VALID_ACCOUNTS.includes(acc));

  if (accountsToTrigger.length === 0) {
    return NextResponse.json({ error: 'No valid accounts specified.' }, { status: 400 });
  }

  const results: Array<{ accountId: string; eventIds?: string[]; error?: string }> = [];

  for (const accountId of accountsToTrigger) {
    try {
      console.log(`[Trigger API] Sending slideshow/trigger event for account: ${accountId}`);
      const res = await inngest.send({
        name: 'slideshow/trigger',
        data: { accountId },
      });
      results.push({ accountId, eventIds: res.ids });
    } catch (err: any) {
      console.error(`[Trigger API] Failed for account ${accountId}: ${err.message}`);
      results.push({ accountId, error: err.message });
    }
  }

  return NextResponse.json({
    ok: true,
    message: `Triggered pipeline for ${results.length} channel(s)`,
    results,
  }, { status: 202 });
}

export async function GET(request: NextRequest) {
  // Convenient trigger via GET if key provided
  const queryKey = request.nextUrl.searchParams.get('key');
  if (!isAuthorized(request, queryKey || undefined)) {
    return NextResponse.json({ error: 'Unauthorized. Provide ?key=...' }, { status: 401 });
  }

  const accountArg = request.nextUrl.searchParams.get('accountId');
  const accountsToTrigger = accountArg ? [accountArg].filter(a => VALID_ACCOUNTS.includes(a)) : VALID_ACCOUNTS;

  const results: Array<{ accountId: string; eventIds?: string[]; error?: string }> = [];
  for (const accountId of accountsToTrigger) {
    try {
      const res = await inngest.send({
        name: 'slideshow/trigger',
        data: { accountId },
      });
      results.push({ accountId, eventIds: res.ids });
    } catch (err: any) {
      results.push({ accountId, error: err.message });
    }
  }

  return NextResponse.json({
    ok: true,
    message: `Triggered pipeline for ${results.length} channel(s)`,
    results,
  }, { status: 202 });
}
