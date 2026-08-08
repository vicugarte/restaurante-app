import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(request) {
  const secret = process.env.SAT_WORKER_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const bearer = request.headers.get('authorization') || '';
  return bearer === `Bearer ${secret}` || request.headers.get('x-worker-secret') === secret;
}

// Fecha desde la que se empieza a pedir historial si un RFC nunca se ha
// sincronizado. Ajustable con la variable de entorno SAT_FECHA_BASE.
const FECHA_BASE = process.env.SAT_FECHA_BASE || '2020-01-01';

// Este endpoint NO descarga nada -- solo revisa cada e.firma activa y crea
// las solicitudes que falten para llegar hasta AYER (usando la misma
// lógica "incremental" que ya tenía el botón manual). Se detiene en ayer
// y no en hoy a propósito: las facturas de hoy todavía pueden seguir
// timbrándose durante el día, así que pedir "hasta hoy" arriesgaría
// marcar el día como completo antes de que en realidad lo esté. El
// worker de siempre se encarga de procesarlas después. Pensado para
// llamarse 1 vez al día.
export async function POST(request) {
  if (!authorized(request)) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  try {
    const admin = getSupabaseAdmin();
    const { data: credenciales, error } = await admin
      .from('sat_credenciales')
      .select('rfc')
      .eq('activa', true);
    if (error) throw error;

    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const baseUrl = new URL(request.url).origin;
    const resultados = [];

    for (const { rfc } of credenciales || []) {
      try {
        const respuesta = await fetch(`${baseUrl}/api/sat/solicitudes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.SAT_WORKER_SECRET ? { 'x-worker-secret': process.env.SAT_WORKER_SECRET } : {}),
          },
          body: JSON.stringify({
            rfc,
            fechaInicial: FECHA_BASE,
            fechaFinal: ayer,
            tipo: 'recibidos',
            contenido: 'cfdi',
            dividirPeriodos: true,
            incremental: true,
          }),
        });
        const datos = await respuesta.json();
        resultados.push({
          rfc,
          ok: respuesta.ok,
          nuevas: datos.nuevas || 0,
          reintentadas: datos.reintentadas || 0,
          mensaje: datos.mensaje || (respuesta.ok ? 'Al día.' : datos.error),
        });
      } catch (rfcError) {
        resultados.push({ rfc, ok: false, mensaje: rfcError.message });
      }
    }

    return NextResponse.json({ ok: true, resultados });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
