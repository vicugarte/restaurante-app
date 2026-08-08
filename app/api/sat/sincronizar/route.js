import { NextResponse } from 'next/server';
import { processSatQueue } from '../../../../lib/satWorker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function mismoOrigen(request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request) {
  if (!mismoOrigen(request)) {
    return NextResponse.json({ error: 'Origen no autorizado.' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 10, 1), 30);
    const concurrency = Math.min(Math.max(Number(body.concurrency) || 3, 1), 10);
    const results = await processSatQueue({ limit, concurrency });
    return NextResponse.json({ ok: true, procesadas: results.length, results });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
