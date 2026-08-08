import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fechaIso(fecha) {
  return new Date(`${fecha}T00:00:00Z`);
}

function isoDia(fecha) {
  return fecha.toISOString().slice(0, 10);
}

function dividirPorMes(fechaInicial, fechaFinal) {
  const inicio = fechaIso(fechaInicial);
  const fin = fechaIso(fechaFinal);
  const periodos = [];
  let cursor = new Date(inicio);

  while (cursor <= fin) {
    const ultimoMes = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const hasta = ultimoMes < fin ? ultimoMes : fin;
    periodos.push({ fecha_inicial: isoDia(cursor), fecha_final: isoDia(hasta) });
    cursor = new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate() + 1));
  }

  return periodos;
}

export async function GET() {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from('sat_solicitudes_descarga')
      .select('*').order('creado_en', { ascending: false }).limit(200);
    if (error) throw error;
    return NextResponse.json({ solicitudes: data || [] });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    let {
      rfc,
      fechaInicial,
      fechaFinal,
      tipo = 'recibidos',
      contenido = 'cfdi',
      dividirPeriodos = true,
      metadataPrimero = false,
      incremental = false,
    } = body;

    if (!rfc || !fechaInicial || !fechaFinal) {
      return NextResponse.json({ error: 'RFC y periodo son obligatorios.' }, { status: 400 });
    }
    if (fechaIso(fechaInicial) > fechaIso(fechaFinal)) {
      return NextResponse.json({ error: 'La fecha inicial no puede ser posterior a la final.' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: credencial } = await admin.from('sat_credenciales')
      .select('rfc, activa, vigente_hasta').eq('rfc', rfc).eq('activa', true).maybeSingle();
    if (!credencial) {
      return NextResponse.json({ error: 'No existe una e.firma activa para ese RFC.' }, { status: 400 });
    }

    if (incremental) {
      const { data: ultima } = await admin.from('sat_solicitudes_descarga')
        .select('fecha_final')
        .eq('rfc', rfc)
        .eq('tipo', tipo)
        .eq('contenido', contenido)
        .eq('estado', 'descargada')
        .order('fecha_final', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ultima?.fecha_final) {
        const siguiente = fechaIso(ultima.fecha_final);
        siguiente.setUTCDate(siguiente.getUTCDate() + 1);
        const candidata = isoDia(siguiente);
        if (candidata > fechaInicial) fechaInicial = candidata;
      }

      if (fechaInicial > fechaFinal) {
        return NextResponse.json({
          error: 'No hay un periodo nuevo por sincronizar: la última descarga ya cubre la fecha final seleccionada.',
        }, { status: 400 });
      }
    }

    const periodos = dividirPeriodos ? dividirPorMes(fechaInicial, fechaFinal) : [{ fecha_inicial: fechaInicial, fecha_final: fechaFinal }];
    const grupo = crypto.randomUUID();

    // Solo se considera "ya cubierto" un periodo si existe una solicitud
    // que YA terminó con éxito (estado = descargada). Si existe pero
    // quedó en error/rechazada/vencida/pausada/a medias, se reintenta
    // reutilizando esa misma fila -- así nunca queda un rango de fechas
    // atorado para siempre por una falla temporal, y tampoco se duplica.
    const { data: existentes, error: errorExistentes } = await admin
      .from('sat_solicitudes_descarga')
      .select('id, fecha_inicial, fecha_final, contenido, estado')
      .eq('rfc', rfc)
      .eq('tipo', tipo);
    if (errorExistentes) throw errorExistentes;

    const mapaExistentes = new Map();
    for (const e of existentes || []) {
      mapaExistentes.set(`${e.fecha_inicial}|${e.fecha_final}|${e.contenido}`, e);
    }

    const filas = [];
    const idsAReintentar = [];
    let completadas = 0;

    function procesarPeriodo(fila, clave) {
      const existente = mapaExistentes.get(clave);
      if (existente) {
        if (existente.estado === 'descargada') {
          completadas += 1;
          return;
        }
        idsAReintentar.push(existente.id);
        mapaExistentes.delete(clave);
        return;
      }
      filas.push(fila);
      mapaExistentes.set(clave, { estado: 'pendiente_envio' });
    }

    for (const periodo of periodos) {
      if (metadataPrimero && contenido === 'cfdi') {
        procesarPeriodo(
          {
            rfc,
            ...periodo,
            tipo,
            contenido: 'metadata',
            estado: 'pendiente_envio',
            mensaje: `Metadata preliminar del grupo ${grupo}. Pendiente de envío automático al SAT.`,
          },
          `${periodo.fecha_inicial}|${periodo.fecha_final}|metadata`
        );
      }
      procesarPeriodo(
        {
          rfc,
          ...periodo,
          tipo,
          contenido,
          estado: 'pendiente_envio',
          mensaje: `Solicitud del grupo ${grupo}. Pendiente de envío automático al SAT.`,
        },
        `${periodo.fecha_inicial}|${periodo.fecha_final}|${contenido}`
      );
    }

    if (idsAReintentar.length > 0) {
      const { error: errorReintento } = await admin
        .from('sat_solicitudes_descarga')
        .update({
          estado: 'pendiente_envio',
          id_solicitud_sat: null,
          ids_paquetes: null,
          numero_cfdi: null,
          codigo_estado: null,
          mensaje: 'Reintentando solicitud (el intento anterior no llegó a completarse).',
          intentos: 0,
          proxima_consulta: null,
          actualizado_en: new Date().toISOString(),
        })
        .in('id', idsAReintentar);
      if (errorReintento) throw errorReintento;
    }

    if (filas.length === 0 && idsAReintentar.length === 0) {
      return NextResponse.json({
        solicitudes: [],
        cantidad: 0,
        nuevas: 0,
        reintentadas: 0,
        periodos: periodos.length,
        duplicadas: completadas,
        grupo,
        requiereWorker: false,
        mensaje: `Las ${completadas} solicitud(es) de este periodo ya estaban descargadas -- no se creó nada nuevo.`,
      });
    }

    const { data, error } = filas.length > 0
      ? await admin.from('sat_solicitudes_descarga').insert(filas).select('*')
      : { data: [], error: null };
    if (error) throw error;

    return NextResponse.json({
      solicitudes: data || [],
      cantidad: (data?.length || 0) + idsAReintentar.length,
      nuevas: data?.length || 0,
      reintentadas: idsAReintentar.length,
      periodos: periodos.length,
      duplicadas: completadas,
      grupo,
      requiereWorker: true,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
