'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const INTERVALO_PANEL_MS = 30000;

const ETAPAS = {
  pendiente_envio: { texto: 'Pendiente de envío', avance: 10 },
  enviando: { texto: 'Autenticando', avance: 20 },
  aceptada: { texto: 'Aceptada por SAT', avance: 35 },
  en_proceso: { texto: 'SAT preparando paquetes', avance: 55 },
  terminada: { texto: 'Paquetes disponibles', avance: 75 },
  descargada: { texto: 'XML descargados', avance: 100 },
  error_temporal: { texto: 'Reintento programado', avance: 15 },
  error: { texto: 'Error', avance: 0 },
  rechazada: { texto: 'Rechazada', avance: 0 },
  vencida: { texto: 'Vencida', avance: 0 },
  pausada: { texto: 'Pausada', avance: 0 },
};

export default function DescargaSat() {
  const hoy = new Date().toISOString().slice(0, 10);

  const fechaHaceAnios = (anios) => {
    const fecha = new Date();
    fecha.setFullYear(fecha.getFullYear() - anios);
    return fecha.toISOString().slice(0, 10);
  };

  const fechaMinimaGeneral = fechaHaceAnios(10);
  const fechaMinimaXml = fechaHaceAnios(6);

  const inicio = new Date();
  inicio.setDate(inicio.getDate() - 30);

  const [credenciales, setCredenciales] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [mensaje, setMensaje] = useState(null);
  const [mensajeSolicitud, setMensajeSolicitud] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [actualizando, setActualizando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);
  const [ultimaSincronizacion, setUltimaSincronizacion] = useState(null);
  const [form, setForm] = useState({
    rfc: '',
    fechaInicial: inicio.toISOString().slice(0, 10),
    fechaFinal: hoy,
    tipo: 'recibidos',
    contenido: 'cfdi',
    dividirPeriodos: true,
    metadataPrimero: false,
    incremental: false,
  });

  const solicitudesActivas = useMemo(
    () => solicitudes.filter((s) =>
      [
        'pendiente_envio',
        'enviando',
        'aceptada',
        'en_proceso',
        'terminada',
        'error_temporal',
      ].includes(s.estado)
    ),
    [solicitudes]
  );

  const activas = solicitudesActivas.length;

  const cargarSolicitudes = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setActualizando(true);
    try {
      const respuesta = await fetch('/api/sat/solicitudes', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const resultado = await respuesta.json();
      if (!respuesta.ok) throw new Error(resultado.error || 'No fue posible consultar las solicitudes.');
      setSolicitudes(resultado.solicitudes || []);
      setUltimaActualizacion(new Date());
    } catch (error) {
      if (!silencioso) setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      if (!silencioso) setActualizando(false);
    }
  }, []);

  const sincronizar = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setSincronizando(true);
    try {
      const respuesta = await fetch('/api/sat/sincronizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 10 }),
        cache: 'no-store',
      });
      const resultado = await respuesta.json();
      if (!respuesta.ok) throw new Error(resultado.error || 'No fue posible ejecutar la sincronización.');
      setUltimaSincronizacion(new Date());
      await cargarSolicitudes({ silencioso: true });
      if (!silencioso) {
        const detalle = resultado.procesadas
          ? `Se procesaron ${resultado.procesadas} solicitud(es).`
          : 'No había solicitudes listas para procesar en este momento.';
        setMensaje({ tipo: 'ok', texto: detalle });
      }
      return resultado;
    } catch (error) {
      if (!silencioso) setMensaje({ tipo: 'error', texto: error.message });
      return null;
    } finally {
      if (!silencioso) setSincronizando(false);
    }
  }, [cargarSolicitudes]);

  const cargarCredenciales = useCallback(async () => {
    const respuesta = await fetch('/api/sat/credenciales', { cache: 'no-store' });
    const resultado = await respuesta.json();
    if (!respuesta.ok) throw new Error(resultado.error || 'No fue posible consultar las e.firmas.');
    setCredenciales(resultado.credenciales || []);
    setForm((actual) => actual.rfc || !resultado.credenciales?.[0]
      ? actual
      : { ...actual, rfc: resultado.credenciales[0].rfc });
  }, []);

  useEffect(() => {
    Promise.all([cargarCredenciales(), cargarSolicitudes()]).catch((error) => {
      setMensaje({ tipo: 'error', texto: error.message });
    });
  }, [cargarCredenciales, cargarSolicitudes]);

  useEffect(() => {
    const panel = window.setInterval(
      () => cargarSolicitudes({ silencioso: true }),
      INTERVALO_PANEL_MS
    );

    const canal = supabase
      .channel('sat-solicitudes-descarga-panel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sat_solicitudes_descarga' },
        () => cargarSolicitudes({ silencioso: true })
      )
      .subscribe();

    return () => {
      window.clearInterval(panel);
      supabase.removeChannel(canal);
    };
  }, [cargarSolicitudes]);

  async function guardarFiel(e) {
    e.preventDefault();
    const formulario = e.currentTarget;
    setMensaje(null);
    setGuardando(true);
    try {
      const respuesta = await fetch('/api/sat/credenciales', { method: 'POST', body: new FormData(formulario) });
      const resultado = await respuesta.json();
      if (!respuesta.ok) throw new Error(resultado.error || 'No fue posible guardar la e.firma.');
      setMensaje({ tipo: 'ok', texto: `e.firma validada y guardada para ${resultado.rfc}.` });
      formulario?.reset();
      await cargarCredenciales();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setGuardando(false);
    }
  }

  async function solicitar(e) {
    e.preventDefault();
    setMensajeSolicitud(null);

    if (form.fechaInicial < fechaMinimaGeneral) {
      setMensajeSolicitud({
        tipo: 'error',
        texto: `Solo se permiten consultas de hasta 10 años hacia atrás. La fecha mínima disponible es ${fechaMinimaGeneral}.`,
      });
      return;
    }

    if (form.contenido === 'cfdi' && form.fechaInicial < fechaMinimaXml) {
      setMensajeSolicitud({
        tipo: 'error',
        texto: `El SAT no permite solicitar XML con más de 6 años de antigüedad. Para periodos anteriores a ${fechaMinimaXml}, selecciona Metadata.`,
      });
      return;
    }

    try {
      const respuesta = await fetch('/api/sat/solicitudes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const resultado = await respuesta.json();
      if (!respuesta.ok) throw new Error(resultado.error || 'No fue posible crear la solicitud.');
      const partes = [];

      if (resultado.nuevas > 0) {
        partes.push(`${resultado.nuevas} solicitud(es) nueva(s) creada(s).`);
      }

      if (resultado.reintentadas > 0) {
        partes.push(`${resultado.reintentadas} solicitud(es) incompleta(s) se programaron nuevamente.`);
      }

      if (resultado.duplicadas > 0) {
        if (resultado.nuevas === 0 && resultado.reintentadas === 0) {
          partes.push(
            resultado.duplicadas === 1
              ? 'La descarga se canceló porque ese periodo ya se encuentra descargado.'
              : `La descarga se canceló porque los ${resultado.duplicadas} periodos seleccionados ya se encuentran descargados.`
          );
        } else {
          partes.push(
            resultado.duplicadas === 1
              ? '1 periodo ya se encontraba descargado y no se volvió a solicitar.'
              : `${resultado.duplicadas} periodos ya se encontraban descargados y no se volvieron a solicitar.`
          );
        }
      }

      if (resultado.cantidad > 0) {
        partes.push('La solicitud quedó registrada para procesamiento.');
      }

      const soloDuplicadas =
        resultado.duplicadas > 0 &&
        resultado.nuevas === 0 &&
        resultado.reintentadas === 0;

      setMensajeSolicitud({
        tipo: soloDuplicadas ? 'error' : (resultado.cantidad > 0 ? 'ok' : 'error'),
        texto: partes.join(' ') || resultado.mensaje,
      });
      await cargarSolicitudes({ silencioso: true });
      if (resultado.cantidad > 0) await sincronizar({ silencioso: true });
    } catch (error) {
      setMensajeSolicitud({ tipo: 'error', texto: error.message });
    }
  }

  return <>
    <style jsx>{`
      @media (max-width: 1100px) {
        .sat-grid-form {
          grid-template-columns: repeat(2, minmax(160px, 1fr)) !important;
        }
      }
      @media (max-width: 640px) {
        .sat-grid-form {
          grid-template-columns: 1fr !important;
        }
      }
    `}</style>
    <div className="panel">
    <h2>Descarga automática de facturas del SAT</h2>
    <p className="subtitulo">Solicita, verifica, descarga y conserva los CFDI en una bóveda privada de Supabase.</p>
    <div className="mensaje error" style={{ marginBottom: 16 }}><strong>Seguridad:</strong> no captures la Contraseña/SIEC. El servicio utiliza e.firma y las credenciales se cifran en el servidor.</div>
    {mensaje && <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>}

    <div className="panel" style={{ marginBottom: 16 }}>
      <h3>1. Registrar e.firma</h3>
      <form onSubmit={guardarFiel}>
        <div className="filtro-fecha">
          <div><label>Nombre o alias</label><input name="alias" placeholder="Restaurante principal" required /></div>
          <div><label>Certificado .cer</label><input name="cer" type="file" accept=".cer" required /></div>
          <div><label>Llave privada .key</label><input name="key" type="file" accept=".key" required /></div>
          <div><label>Contraseña de la llave privada</label><input name="password" type="password" autoComplete="new-password" required /></div>
          <button className="boton" disabled={guardando}>{guardando ? 'Validando…' : 'Validar y guardar'}</button>
        </div>
      </form>
      {credenciales.map((c) => <div key={c.rfc} className="subtitulo" style={{ marginTop: 8 }}><strong>{c.alias}</strong> · {c.rfc} · vigencia hasta {String(c.vigente_hasta).slice(0, 10)}</div>)}
    </div>

    <div className="panel" style={{ marginBottom: 16 }}>
      <h3>2. Solicitar CFDI</h3>
      <form onSubmit={solicitar}>
        <div
          className="sat-grid-form"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, minmax(150px, 1fr))',
            gap: 12,
            alignItems: 'end',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label>RFC</label>
            <select
              value={form.rfc}
              onChange={(e) => setForm({ ...form, rfc: e.target.value })}
              required
              style={{ width: '100%', minHeight: 40 }}
            >
              <option value="">Selecciona</option>
              {credenciales.map((c) => <option key={c.rfc}>{c.rfc}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label>Desde</label>
            <input
              type="date"
              value={form.fechaInicial}
              min={fechaMinimaGeneral}
              max={hoy}
              onChange={(e) => {
                const nuevaFecha = e.target.value;
                setForm({
                  ...form,
                  fechaInicial: nuevaFecha,
                  fechaFinal: nuevaFecha,
                });
              }}
              required
              style={{ width: '100%', minHeight: 40 }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label>Hasta</label>
            <input
              type="date"
              value={form.fechaFinal}
              min={form.fechaInicial || fechaMinimaGeneral}
              max={hoy}
              onChange={(e) => setForm({ ...form, fechaFinal: e.target.value })}
              required
              style={{ width: '100%', minHeight: 40 }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label>Tipo</label>
            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              style={{ width: '100%', minHeight: 40 }}
            >
              <option value="recibidos">Recibidos</option>
              <option value="emitidos">Emitidos</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label>Contenido</label>
            <select
              value={form.contenido}
              onChange={(e) => setForm({ ...form, contenido: e.target.value })}
              style={{ width: '100%', minHeight: 40 }}
            >
              <option value="cfdi">XML CFDI</option>
              <option value="metadata">Metadata</option>
            </select>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <button className="boton" disabled={!form.rfc}>Crear y sincronizar</button>
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 12 }}>
          <label><input type="checkbox" checked={form.dividirPeriodos} onChange={(e) => setForm({ ...form, dividirPeriodos: e.target.checked })} /> Dividir automáticamente por mes</label>
          <label>
            <input
              type="checkbox"
              checked={form.metadataPrimero}
              disabled={form.contenido !== 'cfdi'}
              onChange={(e) => setForm({ ...form, metadataPrimero: e.target.checked })}
            />{' '}
            Incluir metadata para conciliación
          </label>
          <label><input type="checkbox" checked={form.incremental} onChange={(e) => setForm({ ...form, incremental: e.target.checked })} /> Solo periodo nuevo desde la última descarga</label>
        </div>
      </form>

      {mensajeSolicitud && (
        <div
          className={`mensaje ${mensajeSolicitud.tipo}`}
          style={{ marginTop: 14 }}
        >
          {mensajeSolicitud.texto}
        </div>
      )}
    </div>

    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ marginBottom: 4 }}>3. Estado de solicitudes</h3>
          <p className="subtitulo" style={{ margin: 0 }}>
            {activas} solicitud(es) activa(s). Panel cada 30 segundos; procesamiento automático mediante SAT Cron.
            {ultimaActualizacion ? ` Última consulta: ${ultimaActualizacion.toLocaleTimeString('es-MX')}.` : ''}
            {ultimaSincronizacion ? ` Última sincronización: ${ultimaSincronizacion.toLocaleTimeString('es-MX')}.` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="boton" onClick={() => cargarSolicitudes()} disabled={actualizando}>{actualizando ? 'Actualizando…' : 'Actualizar panel'}</button>
          <button type="button" className="boton" onClick={() => sincronizar()} disabled={sincronizando}>{sincronizando ? 'Sincronizando…' : 'Sincronizar SAT ahora'}</button>
        </div>
      </div>

      {solicitudesActivas.length === 0
        ? <p className="estado-vacio">No hay solicitudes activas en este momento.</p>
        : <div style={{ overflowX: 'auto', marginTop: 12 }}><table><thead><tr><th>RFC</th><th>Periodo</th><th>Contenido</th><th>Etapa</th><th>Avance</th><th>CFDI</th><th>Mensaje</th></tr></thead><tbody>{solicitudesActivas.map((s) => {
          const etapaBase = ETAPAS[s.estado] || { texto: s.estado, avance: 0 };
          const avanceConservado = s.estado === 'error_temporal'
            ? (Array.isArray(s.ids_paquetes) && s.ids_paquetes.length ? 75 : s.id_solicitud_sat ? 55 : etapaBase.avance)
            : etapaBase.avance;
          const etapa = { ...etapaBase, avance: avanceConservado };
          return <tr key={s.id}>
            <td>{s.rfc}</td>
            <td>{s.fecha_inicial} a {s.fecha_final}<br /><small>{s.tipo}</small></td>
            <td>{s.contenido === 'metadata' ? 'Metadata' : 'XML'}</td>
            <td><strong>{etapa.texto}</strong><br /><small>{s.estado}</small></td>
            <td style={{ minWidth: 140 }}><div style={{ height: 8, background: '#e7e7e7', borderRadius: 8, overflow: 'hidden' }}><div style={{ width: `${etapa.avance}%`, height: '100%', background: 'currentColor' }} /></div><small>{etapa.avance}%</small></td>
            <td>{s.numero_cfdi ?? '—'}</td>
            <td>{s.mensaje || '—'}{s.id_solicitud_sat ? <><br /><small>ID SAT: {s.id_solicitud_sat}</small></> : null}</td>
          </tr>;
        })}</tbody></table></div>}
    </div>
  </div>
  </>;
}
