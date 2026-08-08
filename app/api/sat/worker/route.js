import { NextResponse } from 'next/server';
import { processSatQueue } from '../../../../lib/satWorker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(request) {
  const secret = process.env.SAT_WORKER_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const bearer = request.headers.get('authorization') || '';
  return bearer === `Bearer ${secret}` || request.headers.get('x-worker-secret') === secret;
}

export async function POST(request) {
  if (!authorized(request)) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit) || 10, 30);
    const concurrency = Math.min(Math.max(Number(body.concurrency) || 3, 1), 10);
    const results = await processSatQueue({ limit, concurrency });
    return NextResponse.json({ ok: true, procesadas: results.length, results });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  if (!authorized(request)) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  try {
    const results = await processSatQueue({ limit: 10, concurrency: 3 });
    return NextResponse.json({ ok: true, procesadas: results.length, results });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
