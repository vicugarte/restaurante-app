import AdmZip from 'adm-zip';
import { decryptSecret } from './satCrypto';
import { requestDownload, verifyDownload, downloadPackage } from './satSoap';
import { getSupabaseAdmin } from './supabaseAdmin';
import { traducirMensajeVerificacion, traducirMensajeAutenticacion } from './satMensajes';

const ESTADOS = { 1: 'aceptada', 2: 'en_proceso', 3: 'terminada', 4: 'error', 5: 'rechazada', 6: 'vencida' };

async function credentialsFor(admin, rfc) {
  const { data, error } = await admin.from('sat_credenciales').select('*').eq('rfc', rfc).eq('activa', true).single();
  if (error || !data) throw new Error(`No se encontró una e.firma activa para ${rfc}.`);
  return {
    cerDer: decryptSecret(data.certificado_encriptado),
    keyDer: decryptSecret(data.llave_encriptada),
    password: decryptSecret(data.password_encriptado).toString('utf8'),
  };
}

async function patch(admin, id, values) {
  const { error } = await admin.from('sat_solicitudes_descarga').update({ ...values, actualizado_en: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

function extraerUuidCfdi(buffer) {
  const texto = buffer.toString('utf8');
  const match = texto.match(/UUID="([0-9a-fA-F-]{36})"/i);
  return match ? match[1].toUpperCase() : null;
}

async function storePackage(admin, solicitud, packageId, zipBuffer) {
  const bucket = process.env.SAT_STORAGE_BUCKET || 'sat-cfdi';
  const zipPath = `${solicitud.rfc}/${solicitud.id}/${packageId}.zip`;
  const { error: zipError } = await admin.storage.from(bucket).upload(zipPath, zipBuffer, { contentType: 'application/zip', upsert: true });
  if (zipError) throw new Error(`No se pudo guardar ZIP en Storage: ${zipError.message}`);

  const zip = new AdmZip(zipBuffer);
  const candidatos = [];
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const nombre = entry.entryName.replace(/^.*[\\/]/, '');
    const extension = nombre.toLowerCase().split('.').pop();
    if (!['xml', 'txt', 'csv'].includes(extension)) continue;
    const content = entry.getData();
    const uuid = extension === 'xml' ? extraerUuidCfdi(content) : null;
    candidatos.push({ entryName: entry.entryName, nombre, extension, content, uuid });
  }

  // Antes de guardar nada, revisa cuáles UUID ya existen en la base --
  // así, si dos solicitudes traen el mismo CFDI (rangos de fechas
  // traslapados), no se sube ni se registra dos veces.
  const uuidsXml = candidatos.filter((c) => c.uuid).map((c) => c.uuid);
  let uuidsExistentes = new Set();
  if (uuidsXml.length > 0) {
    const { data: yaExisten, error: errorExistentes } = await admin
      .from('sat_xml_descargados')
      .select('uuid')
      .in('uuid', uuidsXml);
    if (errorExistentes) throw errorExistentes;
    uuidsExistentes = new Set((yaExisten || []).map((r) => r.uuid));
  }

  const archivos = [];
  let xmlCount = 0;
  let metadataCount = 0;
  let duplicadosOmitidos = 0;

  for (const c of candidatos) {
    if (c.uuid && uuidsExistentes.has(c.uuid)) {
      duplicadosOmitidos += 1;
      continue;
    }
    const carpeta = c.extension === 'xml' ? 'xml' : 'metadata';
    const contentType = c.extension === 'xml' ? 'application/xml' : 'text/plain; charset=utf-8';
    const ruta = `${solicitud.rfc}/${solicitud.id}/${carpeta}/${c.nombre}`;
    const { error } = await admin.storage.from(bucket).upload(ruta, c.content, { contentType, upsert: true });
    if (error) throw new Error(`No se pudo guardar ${c.entryName}: ${error.message}`);

    archivos.push({
      solicitud_id: solicitud.id,
      paquete_id: packageId,
      nombre_archivo: c.entryName,
      ruta_storage: ruta,
      uuid: c.uuid,
      procesado: false,
    });
    if (c.extension === 'xml') xmlCount += 1;
    else metadataCount += 1;
    if (c.uuid) uuidsExistentes.add(c.uuid);
  }

  if (archivos.length) {
    const { error } = await admin.from('sat_xml_descargados').upsert(archivos, { onConflict: 'solicitud_id,ruta_storage' });
    if (error) throw error;
  }
  return { zipPath, xmlCount, metadataCount, duplicadosOmitidos };
}

async function processOne(admin, solicitud) {
  try {
    const credentials = await credentialsFor(admin, solicitud.rfc);
    if (!solicitud.id_solicitud_sat) {
      await patch(admin, solicitud.id, { estado: 'enviando', mensaje: 'Autenticando y enviando solicitud al SAT.', intentos: solicitud.intentos + 1 });

      let intentos5002 = solicitud.intentos_5002 || 0;
      let sent = await requestDownload(credentials, solicitud, intentos5002);

      // 5002 = "se agotaron las solicitudes de por vida" para este rango
      // exacto de fechas. El SAT lo trata como un rango distinto si la
      // hora de inicio cambia aunque sea un segundo -- se reintenta unas
      // pocas veces con ese pequeño desfase antes de darlo por fallido.
      const MAX_REINTENTOS_5002 = 5;
      while (String(sent.codigo) === '5002' && intentos5002 < MAX_REINTENTOS_5002) {
        intentos5002 += 1;
        sent = await requestDownload(credentials, solicitud, intentos5002);
      }
      if (intentos5002 !== (solicitud.intentos_5002 || 0)) {
        await admin.from('sat_solicitudes_descarga').update({ intentos_5002: intentos5002 }).eq('id', solicitud.id);
      }

      if (!sent.idSolicitud) throw new Error(`${sent.codigo || ''} ${traducirMensajeAutenticacion(sent.codigo, sent.mensaje) || 'El SAT no devolvió IdSolicitud.'}`.trim());
      await patch(admin, solicitud.id, {
        id_solicitud_sat: sent.idSolicitud,
        estado: 'aceptada', codigo_estado: String(sent.codigo || ''),
        mensaje: traducirMensajeVerificacion(sent.codigo, sent.mensaje || 'Solicitud aceptada por el SAT.', 'aceptada'),
        proxima_consulta: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
      });
      return { id: solicitud.id, action: 'sent', satId: sent.idSolicitud };
    }

    const verification = await verifyDownload(credentials, solicitud);
    const estado = ESTADOS[verification.estadoSolicitud] || 'en_proceso';
    const codigoEstado = String(verification.codigoEstadoSolicitud || verification.codigo || '');
    const esFinalDirecto = ['rechazada', 'vencida', 'error'].includes(estado);
    await patch(admin, solicitud.id, {
      estado, codigo_estado: codigoEstado,
      mensaje: traducirMensajeVerificacion(codigoEstado, verification.mensaje || `Estado SAT ${verification.estadoSolicitud}`, estado),
      numero_cfdi: verification.numeroCfdi,
      ids_paquetes: verification.idsPaquetes,
      proxima_consulta: estado === 'terminada' ? new Date().toISOString() : new Date(Date.now() + 3 * 60 * 1000).toISOString(),
      ...(esFinalDirecto ? { resuelto_en: new Date().toISOString() } : {}),
    });

    if (estado === 'terminada' && verification.idsPaquetes.length) {
      let totalXml = 0;
      let totalMetadata = 0;
      let totalDuplicados = 0;
      let paquetesPendientes = 0;

      // Los paquetes de UNA MISMA solicitud se descargan en paralelo -- el
      // token ya está en caché, así que esto no genera autenticaciones extra.
      const paquetesResultado = await Promise.all(
        verification.idsPaquetes.map(async (packageId) => {
          try {
            const downloaded = await downloadPackage(credentials, solicitud.rfc, packageId);
            return await storePackage(admin, solicitud, packageId, downloaded.zip);
          } catch (packageError) {
            if (packageError?.code === 'SAT_PACKAGE_NOT_READY') return { pendiente: true };
            throw packageError;
          }
        })
      );
      for (const r of paquetesResultado) {
        if (r.pendiente) paquetesPendientes += 1;
        else {
          totalXml += r.xmlCount;
          totalMetadata += r.metadataCount;
          totalDuplicados += r.duplicadosOmitidos || 0;
        }
      }

      if (paquetesPendientes > 0) {
        await patch(admin, solicitud.id, {
          estado: 'terminada',
          mensaje: `${paquetesPendientes} paquete(s) informado(s) por el SAT todavía no tienen contenido disponible. Se reintentará la descarga.`,
          proxima_consulta: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
        });
      } else {
        const resumen = solicitud.contenido === 'metadata'
          ? `${verification.idsPaquetes.length} paquete(s) descargado(s); ${totalMetadata} archivo(s) de metadata guardado(s).${totalDuplicados ? ` ${totalDuplicados} ya se tenían (mismo UUID) y se omitieron.` : ''}`
          : `${verification.idsPaquetes.length} paquete(s) descargado(s); ${totalXml} XML extraído(s).${totalDuplicados ? ` ${totalDuplicados} ya se tenían (mismo UUID) y se omitieron.` : ''}`;
        await patch(admin, solicitud.id, { estado: 'descargada', mensaje: resumen, proxima_consulta: null, resuelto_en: new Date().toISOString() });
      }
    }
    return { id: solicitud.id, action: estado, packages: verification.idsPaquetes.length };
  } catch (err) {
    const attempts = (solicitud.intentos || 0) + 1;
    const permanent = attempts >= 5;
    await patch(admin, solicitud.id, {
      estado: permanent ? 'error' : 'error_temporal', intentos: attempts,
      mensaje: err.message.slice(0, 1000),
      proxima_consulta: permanent ? null : new Date(Date.now() + Math.min(60, 5 * attempts) * 60 * 1000).toISOString(),
      ...(permanent ? { resuelto_en: new Date().toISOString() } : {}),
    });
    return { id: solicitud.id, action: 'error', error: err.message };
  }
}

// Corre varias solicitudes en paralelo, con un tope de concurrencia (para no
// saturar al SAT ni a la función serverless). Por defecto 3 a la vez.
async function conConcurrencia(items, limite, fn) {
  const resultados = new Array(items.length);
  let siguiente = 0;
  async function trabajador() {
    while (siguiente < items.length) {
      const i = siguiente++;
      resultados[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, trabajador));
  return resultados;
}

const HORAS_LIMITE_ATORADA = 2;
// Estados que cuentan como "en curso" para el reemplazo automático --
// se excluye 'terminada' a propósito: ese estado puede tener paquetes ya
// descargados esperando a los demás, y borrar el registro arriesgaría
// perder ese vínculo. Solo se reemplazan estados donde es seguro que
// todavía no se ha guardado nada.
const ESTADOS_EN_CURSO = ['pendiente_envio', 'enviando', 'aceptada', 'en_proceso', 'error_temporal'];

// Busca solicitudes que llevan más de 2 horas sin resolverse, borra ese
// registro, y crea uno nuevo en su lugar (mismos rfc/fechas/tipo/contenido,
// desde cero: pendiente_envio, sin intentos previos). Así nunca queda un
// registro viejo "atorado" conviviendo con el nuevo -- se sustituye.
async function reemplazarSolicitudesAtoradas(admin) {
  const limite = new Date(Date.now() - HORAS_LIMITE_ATORADA * 60 * 60 * 1000).toISOString();
  const { data: atoradas, error } = await admin
    .from('sat_solicitudes_descarga')
    .select('id, rfc, fecha_inicial, fecha_final, tipo, contenido, creado_en')
    .in('estado', ESTADOS_EN_CURSO)
    .lt('creado_en', limite);
  if (error || !atoradas || atoradas.length === 0) return [];

  const resultados = [];
  for (const s of atoradas) {
    const { error: deleteError } = await admin.from('sat_solicitudes_descarga').delete().eq('id', s.id);
    if (deleteError) {
      resultados.push({ id: s.id, action: 'error', error: `No se pudo eliminar la solicitud atorada: ${deleteError.message}` });
      continue;
    }
    const { data: nueva, error: insertError } = await admin
      .from('sat_solicitudes_descarga')
      .insert({
        rfc: s.rfc, fecha_inicial: s.fecha_inicial, fecha_final: s.fecha_final,
        tipo: s.tipo, contenido: s.contenido,
        estado: 'pendiente_envio',
        mensaje: `Se sustituyó automáticamente una solicitud que llevaba más de ${HORAS_LIMITE_ATORADA} horas sin resolverse (creada ${s.creado_en}).`,
      })
      .select('id')
      .single();
    resultados.push({
      id: insertError ? s.id : nueva.id,
      action: insertError ? 'error' : 'reemplazada_por_atorada',
      error: insertError ? insertError.message : undefined,
      rfc: s.rfc,
      periodo: `${s.fecha_inicial} a ${s.fecha_final}`,
    });
  }
  return resultados;
}

export async function processSatQueue({ limit = 5, concurrency = 3 } = {}) {
  const admin = getSupabaseAdmin();

  const reemplazos = await reemplazarSolicitudesAtoradas(admin);

  const now = new Date().toISOString();
  const { data: rows, error } = await admin.from('sat_solicitudes_descarga').select('*')
    .in('estado', ['pendiente_envio', 'aceptada', 'en_proceso', 'terminada', 'error_temporal'])
    .or(`proxima_consulta.is.null,proxima_consulta.lte.${now}`)
    .order('creado_en', { ascending: true }).limit(limit);
  if (error) throw error;

  const procesados = await conConcurrencia(rows || [], concurrency, (solicitud) => processOne(admin, solicitud));
  return [...reemplazos, ...procesados];
}
