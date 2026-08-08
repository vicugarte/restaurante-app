'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';

const BUCKET = 'barman-respaldos';
const MAX_BYTES = 100 * 1024 * 1024;

const ESTADOS = {
  subiendo: { etiqueta: 'Subiendo', clase: 'estado-subiendo', progreso: 10 },
  pendiente: { etiqueta: 'Pendiente', clase: 'estado-pendiente', progreso: 20 },
  descargando: { etiqueta: 'Descargando', clase: 'estado-procesando', progreso: 35 },
  restaurando: { etiqueta: 'Restaurando base', clase: 'estado-procesando', progreso: 50 },
  procesando: { etiqueta: 'Extrayendo datos', clase: 'estado-procesando', progreso: 65 },
  validando: { etiqueta: 'Validando', clase: 'estado-validando', progreso: 80 },
  importando: { etiqueta: 'Actualizando datos', clase: 'estado-validando', progreso: 92 },
  completado: { etiqueta: 'Completado', clase: 'estado-completado', progreso: 100 },
  error: { etiqueta: 'Error', clase: 'estado-error', progreso: 100 },
  error_subida: { etiqueta: 'Error de subida', clase: 'estado-error', progreso: 100 },
};

const ETAPAS = [
  ['subiendo', 'Subir archivo'],
  ['pendiente', 'En cola'],
  ['descargando', 'Descargar'],
  ['restaurando', 'Restaurar'],
  ['procesando', 'Extraer'],
  ['validando', 'Validar'],
  ['importando', 'Actualizar'],
  ['completado', 'Listo'],
];

function limpiarNombre(nombre) {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');
}

function formatoFecha(valor) {
  if (!valor) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(valor));
}

function formatoBytes(bytes) {
  const n = Number(bytes || 0);
  if (!n) return '0 MB';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function infoEstado(valor) {
  return ESTADOS[valor] || { etiqueta: valor || 'Sin estado', clase: 'estado-pendiente', progreso: 0 };
}

function Estado({ valor }) {
  const estado = infoEstado(valor);
  return <span className={`barman-estado ${estado.clase}`}>{estado.etiqueta}</span>;
}

function BarraProgreso({ porcentaje = 0, estado, etiqueta, error = false }) {
  const p = Math.max(0, Math.min(100, Math.round(Number(porcentaje || 0))));
  return (
    <div className="barman-progress-wrap">
      <div className="barman-progress-meta">
        <span>{etiqueta || infoEstado(estado).etiqueta}</span>
        <strong>{p}%</strong>
      </div>
      <div className="barman-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={p}>
        <div
          className={`barman-progress-fill ${error ? 'progress-error' : ''}`}
          style={{ width: `${p}%` }}
        />
      </div>
    </div>
  );
}

function subirStorageConProgreso({ archivo, storagePath, accessToken, onProgress }) {
  return new Promise((resolve, reject) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      reject(new Error('Faltan variables públicas de Supabase para realizar la carga.'));
      return;
    }

    const ruta = storagePath
      .split('/')
      .map((parte) => encodeURIComponent(parte))
      .join('/');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${supabaseUrl}/storage/v1/object/${BUCKET}/${ruta}`);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('apikey', anonKey);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('cache-control', '3600');
    xhr.setRequestHeader('content-type', 'application/octet-stream');

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }
      let detail = xhr.responseText || `HTTP ${xhr.status}`;
      try {
        const parsed = JSON.parse(xhr.responseText);
        detail = parsed.message || parsed.error || detail;
      } catch {}
      reject(new Error(`No se pudo subir el respaldo: ${detail}`));
    };

    xhr.onerror = () => reject(new Error('Se perdió la conexión mientras se subía el respaldo.'));
    xhr.onabort = () => reject(new Error('La carga del respaldo fue cancelada.'));
    xhr.send(archivo);
  });
}

export default function ActualizarBarManPage() {
  const [archivo, setArchivo] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [progresoSubida, setProgresoSubida] = useState(0);
  const [progresoTexto, setProgresoTexto] = useState('');
  const [mensaje, setMensaje] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(true);
  const [importacionSubiendoId, setImportacionSubiendoId] = useState(null);

  const cargaActiva = useMemo(
    () => historial.find((x) => !['completado', 'error', 'error_subida'].includes(x.estado)),
    [historial]
  );

  const progresoCargaActiva = useMemo(() => {
    if (!cargaActiva) return 0;
    if (cargaActiva.estado === 'subiendo' && cargaActiva.id === importacionSubiendoId && cargando) {
      return Math.max(1, Math.round(progresoSubida * 0.2));
    }
    return infoEstado(cargaActiva.estado).progreso;
  }, [cargaActiva, importacionSubiendoId, cargando, progresoSubida]);

  const cargarHistorial = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargandoHistorial(true);
    const { data, error } = await supabase
      .from('barman_importaciones')
      .select('*')
      .order('creado_en', { ascending: false })
      .limit(50);

    if (!error) setHistorial(data || []);
    if (!silencioso) setCargandoHistorial(false);
  }, []);

  useEffect(() => {
    cargarHistorial();
    const timer = setInterval(() => cargarHistorial(true), 5000);
    return () => clearInterval(timer);
  }, [cargarHistorial]);

  function seleccionarArchivo(event) {
    setMensaje(null);
    setProgresoSubida(0);
    const elegido = event.target.files?.[0] || null;
    if (!elegido) {
      setArchivo(null);
      return;
    }

    if (!elegido.name.toLowerCase().endsWith('.bm2')) {
      setArchivo(null);
      event.target.value = '';
      setMensaje({ tipo: 'error', texto: 'Selecciona un respaldo de BarMan con extensión .bm2.' });
      return;
    }

    if (elegido.size > MAX_BYTES) {
      setArchivo(null);
      event.target.value = '';
      setMensaje({ tipo: 'error', texto: 'El archivo supera el límite configurado de 100 MB.' });
      return;
    }

    setArchivo(elegido);
  }

  async function subirArchivo() {
    if (!archivo || cargando) return;

    setCargando(true);
    setProgresoSubida(0);
    setMensaje(null);
    setProgresoTexto('Preparando carga…');
    let importacionId = null;

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (sessionError || !session?.user || !session?.access_token) {
        throw new Error('La sesión expiró. Vuelve a iniciar sesión.');
      }

      const ahora = new Date();
      const carpeta = ahora.toISOString().slice(0, 10);
      const identificador = crypto.randomUUID();
      const nombreSeguro = limpiarNombre(archivo.name);
      const storagePath = `${session.user.id}/${carpeta}/${identificador}_${nombreSeguro}`;

      const { data: registro, error: registroError } = await supabase
        .from('barman_importaciones')
        .insert({
          archivo: archivo.name,
          storage_path: storagePath,
          tamano_bytes: archivo.size,
          estado: 'subiendo',
          mensaje: 'Recibiendo respaldo desde la aplicación.',
          subido_por: session.user.id,
        })
        .select('id')
        .single();

      if (registroError) throw new Error(`No se pudo registrar la carga: ${registroError.message}`);
      importacionId = registro.id;
      setImportacionSubiendoId(importacionId);
      await cargarHistorial(true);

      setProgresoTexto(`Subiendo ${formatoBytes(archivo.size)}…`);
      await subirStorageConProgreso({
        archivo,
        storagePath,
        accessToken: session.access_token,
        onProgress: (p) => {
          setProgresoSubida(p);
          setProgresoTexto(`Subiendo respaldo… ${p}%`);
        },
      });

      const { error: updateError } = await supabase
        .from('barman_importaciones')
        .update({
          estado: 'pendiente',
          mensaje: 'Archivo cargado correctamente. En espera del procesamiento automático de Windows.',
          actualizado_en: new Date().toISOString(),
        })
        .eq('id', importacionId);

      if (updateError) throw new Error(`El archivo se cargó, pero no se pudo poner en cola: ${updateError.message}`);

      setArchivo(null);
      const input = document.getElementById('barman-file');
      if (input) input.value = '';
      setMensaje({
        tipo: 'ok',
        texto: 'Archivo cargado correctamente. Ya quedó en cola para que Windows lo procese automáticamente.',
      });
      setProgresoTexto('');
      setProgresoSubida(0);
      setImportacionSubiendoId(null);
      await cargarHistorial();
    } catch (error) {
      if (importacionId) {
        await supabase
          .from('barman_importaciones')
          .update({
            estado: 'error_subida',
            mensaje: error.message,
            fin_proceso: new Date().toISOString(),
            actualizado_en: new Date().toISOString(),
          })
          .eq('id', importacionId);
      }
      setMensaje({ tipo: 'error', texto: error.message || 'Ocurrió un error durante la carga.' });
      setProgresoTexto('');
      setImportacionSubiendoId(null);
      await cargarHistorial(true);
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="barman-pagina">
      <section className="barman-encabezado">
        <div>
          <p className="barman-kicker">ACTUALIZACIÓN SEMANAL</p>
          <h2>Actualizar datos de BarMan</h2>
          <p>
            Sube aquí el respaldo <strong>.bm2</strong> que se genere cada lunes. La pantalla mostrará el avance de la carga
            y después seguirá automáticamente las etapas de procesamiento en Windows.
          </p>
        </div>
        <div className="barman-dia">
          <span>Día recomendado</span>
          <strong>Lunes</strong>
        </div>
      </section>

      {cargaActiva && (
        <section className="barman-activa barman-activa-progreso">
          <div className="barman-activa-info">
            <span className="barman-etiqueta">PROCESO ACTIVO</span>
            <strong>{cargaActiva.archivo}</strong>
            <small>{cargaActiva.mensaje || 'El respaldo está siendo atendido.'}</small>
          </div>
          <div className="barman-activa-estado">
            <Estado valor={cargaActiva.estado} />
            <BarraProgreso
              porcentaje={progresoCargaActiva}
              estado={cargaActiva.estado}
              etiqueta={
                cargaActiva.estado === 'subiendo' && cargaActiva.id === importacionSubiendoId
                  ? `Carga del archivo ${progresoSubida}%`
                  : infoEstado(cargaActiva.estado).etiqueta
              }
            />
          </div>
          <div className="barman-etapas">
            {ETAPAS.map(([clave, nombre]) => {
              const actual = infoEstado(cargaActiva.estado).progreso;
              const etapa = infoEstado(clave).progreso;
              const hecha = actual >= etapa;
              const activa = cargaActiva.estado === clave;
              return (
                <div key={clave} className={`barman-etapa ${hecha ? 'etapa-hecha' : ''} ${activa ? 'etapa-activa' : ''}`}>
                  <span>{hecha ? '✓' : '○'}</span>
                  <small>{nombre}</small>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="barman-carga-card">
        <div className="barman-carga-grid">
          <label className="barman-filebox" htmlFor="barman-file">
            <span className="barman-file-icon">↑</span>
            <div>
              <strong>{archivo ? archivo.name : 'Seleccionar respaldo BarMan'}</strong>
              <small>{archivo ? formatoBytes(archivo.size) : 'Archivo .bm2 · máximo 100 MB'}</small>
            </div>
            <input
              id="barman-file"
              type="file"
              accept=".bm2,application/octet-stream"
              onChange={seleccionarArchivo}
              disabled={cargando}
            />
          </label>

          <button
            type="button"
            className="barman-subir"
            disabled={!archivo || cargando}
            onClick={subirArchivo}
          >
            {cargando ? `Subiendo ${progresoSubida}%` : 'Subir respaldo'}
          </button>
        </div>

        {cargando && (
          <BarraProgreso porcentaje={progresoSubida} etiqueta={`Carga al servidor · ${formatoBytes(archivo?.size)}`} />
        )}
        {progresoTexto && <div className="barman-progreso">{progresoTexto}</div>}
        {mensaje && (
          <div className={`barman-mensaje ${mensaje.tipo === 'ok' ? 'mensaje-ok' : 'mensaje-error'}`}>
            {mensaje.texto}
          </div>
        )}

        <div className="barman-flujo">
          <span>1. Subir .bm2</span><b>→</b><span>2. En cola</span><b>→</b><span>3. Restaurar</span><b>→</b>
          <span>4. Validar</span><b>→</b><span>5. Actualizar</span><b>→</b><span>6. Completado</span>
        </div>
      </section>

      <section className="barman-historial">
        <div className="barman-historial-titulo">
          <div>
            <p className="barman-kicker">BITÁCORA</p>
            <h3>Cargas realizadas</h3>
          </div>
          <button type="button" className="barman-refrescar" onClick={() => cargarHistorial()}>
            Actualizar estado
          </button>
        </div>

        <div className="barman-tabla-wrap">
          <table className="barman-tabla">
            <thead>
              <tr>
                <th>Fecha y hora</th>
                <th>Archivo</th>
                <th>Tamaño</th>
                <th>Estado / avance</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {cargandoHistorial ? (
                <tr><td colSpan="5" className="barman-vacio">Cargando historial…</td></tr>
              ) : historial.length === 0 ? (
                <tr><td colSpan="5" className="barman-vacio">Todavía no hay respaldos cargados.</td></tr>
              ) : (
                historial.map((item) => {
                  const info = infoEstado(item.estado);
                  const esError = item.estado === 'error' || item.estado === 'error_subida';
                  const progreso = item.estado === 'subiendo' && item.id === importacionSubiendoId && cargando
                    ? Math.max(1, Math.round(progresoSubida * 0.2))
                    : info.progreso;
                  return (
                    <tr key={item.id}>
                      <td className="barman-fecha">{formatoFecha(item.creado_en)}</td>
                      <td>
                        <strong className="barman-archivo">{item.archivo}</strong>
                        {item.fin_proceso && <small>Finalizó: {formatoFecha(item.fin_proceso)}</small>}
                      </td>
                      <td>{formatoBytes(item.tamano_bytes)}</td>
                      <td className="barman-avance-celda">
                        <Estado valor={item.estado} />
                        <BarraProgreso porcentaje={progreso} estado={item.estado} error={esError} />
                      </td>
                      <td>
                        {item.estado === 'completado' ? (
                          <div className="barman-resultados">
                            <span>{Number(item.ventas_nuevas || 0)} nuevas</span>
                            <span>{Number(item.ventas_modificadas || 0)} modificadas</span>
                            <span>{Number(item.productos_procesados || 0)} productos</span>
                            <span>{Number(item.pagos_procesados || 0)} pagos</span>
                          </div>
                        ) : (
                          <span className={esError ? 'barman-error-texto' : 'barman-mensaje-tabla'}>
                            {item.mensaje || '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="barman-auto-refresh">La pantalla consulta automáticamente el estado cada 5 segundos.</p>
      </section>
    </main>
  );
}
