'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';

const BUCKET = 'barman-respaldos';
const MAX_BYTES = 100 * 1024 * 1024;

const ESTADOS = {
  subiendo: { etiqueta: 'Subiendo', clase: 'estado-subiendo' },
  pendiente: { etiqueta: 'Pendiente', clase: 'estado-pendiente' },
  descargando: { etiqueta: 'Descargando', clase: 'estado-procesando' },
  restaurando: { etiqueta: 'Restaurando', clase: 'estado-procesando' },
  procesando: { etiqueta: 'Procesando', clase: 'estado-procesando' },
  validando: { etiqueta: 'Validando', clase: 'estado-validando' },
  importando: { etiqueta: 'Actualizando datos', clase: 'estado-validando' },
  completado: { etiqueta: 'Completado', clase: 'estado-completado' },
  error: { etiqueta: 'Error', clase: 'estado-error' },
  error_subida: { etiqueta: 'Error de subida', clase: 'estado-error' },
};

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

function Estado({ valor }) {
  const estado = ESTADOS[valor] || { etiqueta: valor || 'Sin estado', clase: 'estado-pendiente' };
  return <span className={`barman-estado ${estado.clase}`}>{estado.etiqueta}</span>;
}

export default function ActualizarBarManPage() {
  const [archivo, setArchivo] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [progresoTexto, setProgresoTexto] = useState('');
  const [mensaje, setMensaje] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(true);

  const cargaActiva = useMemo(
    () => historial.find((x) => !['completado', 'error', 'error_subida'].includes(x.estado)),
    [historial]
  );

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
    const timer = setInterval(() => cargarHistorial(true), 10000);
    return () => clearInterval(timer);
  }, [cargarHistorial]);

  function seleccionarArchivo(event) {
    setMensaje(null);
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
    setMensaje(null);
    setProgresoTexto('Preparando carga…');
    let importacionId = null;

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) throw new Error('La sesión expiró. Vuelve a iniciar sesión.');

      const ahora = new Date();
      const carpeta = ahora.toISOString().slice(0, 10);
      const identificador = crypto.randomUUID();
      const nombreSeguro = limpiarNombre(archivo.name);
      const storagePath = `${authData.user.id}/${carpeta}/${identificador}_${nombreSeguro}`;

      const { data: registro, error: registroError } = await supabase
        .from('barman_importaciones')
        .insert({
          archivo: archivo.name,
          storage_path: storagePath,
          tamano_bytes: archivo.size,
          estado: 'subiendo',
          mensaje: 'Recibiendo respaldo desde la aplicación.',
          subido_por: authData.user.id,
        })
        .select('id')
        .single();

      if (registroError) throw new Error(`No se pudo registrar la carga: ${registroError.message}`);
      importacionId = registro.id;
      await cargarHistorial(true);

      setProgresoTexto(`Subiendo ${formatoBytes(archivo.size)}…`);
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, archivo, {
          cacheControl: '3600',
          upsert: false,
          contentType: 'application/octet-stream',
        });

      if (uploadError) throw new Error(`No se pudo subir el respaldo: ${uploadError.message}`);

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
            Sube aquí el respaldo <strong>.bm2</strong> que se genere cada lunes. Al terminar la carga,
            el archivo quedará en espera del procesamiento automático y el estado se actualizará en esta misma pantalla.
          </p>
        </div>
        <div className="barman-dia">
          <span>Día recomendado</span>
          <strong>Lunes</strong>
        </div>
      </section>

      {cargaActiva && (
        <section className="barman-activa">
          <div>
            <span className="barman-etiqueta">PROCESO ACTIVO</span>
            <strong>{cargaActiva.archivo}</strong>
            <small>{cargaActiva.mensaje || 'El respaldo está siendo atendido.'}</small>
          </div>
          <Estado valor={cargaActiva.estado} />
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
            {cargando ? 'Subiendo…' : 'Subir respaldo'}
          </button>
        </div>

        {progresoTexto && <div className="barman-progreso">{progresoTexto}</div>}
        {mensaje && (
          <div className={`barman-mensaje ${mensaje.tipo === 'ok' ? 'mensaje-ok' : 'mensaje-error'}`}>
            {mensaje.texto}
          </div>
        )}

        <div className="barman-flujo">
          <span>1. Subir .bm2</span>
          <b>→</b>
          <span>2. En espera</span>
          <b>→</b>
          <span>3. Procesando</span>
          <b>→</b>
          <span>4. Completado</span>
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
                <th>Estado</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {cargandoHistorial ? (
                <tr><td colSpan="5" className="barman-vacio">Cargando historial…</td></tr>
              ) : historial.length === 0 ? (
                <tr><td colSpan="5" className="barman-vacio">Todavía no hay respaldos cargados.</td></tr>
              ) : (
                historial.map((item) => (
                  <tr key={item.id}>
                    <td className="barman-fecha">{formatoFecha(item.creado_en)}</td>
                    <td>
                      <strong className="barman-archivo">{item.archivo}</strong>
                      {item.fin_proceso && <small>Finalizó: {formatoFecha(item.fin_proceso)}</small>}
                    </td>
                    <td>{formatoBytes(item.tamano_bytes)}</td>
                    <td><Estado valor={item.estado} /></td>
                    <td>
                      {item.estado === 'completado' ? (
                        <div className="barman-resultados">
                          <span>{Number(item.ventas_nuevas || 0)} nuevas</span>
                          <span>{Number(item.ventas_modificadas || 0)} modificadas</span>
                          <span>{Number(item.productos_procesados || 0)} productos</span>
                          <span>{Number(item.pagos_procesados || 0)} pagos</span>
                        </div>
                      ) : (
                        <span className={item.estado?.startsWith('error') ? 'barman-error-texto' : 'barman-mensaje-tabla'}>
                          {item.mensaje || '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="barman-auto-refresh">La pantalla consulta automáticamente el estado cada 10 segundos.</p>
      </section>
    </main>
  );
}
