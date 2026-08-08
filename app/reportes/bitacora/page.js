'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { formatoMoneda } from '../../../lib/format';

function primerDiaDelMes() {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
}
function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
function formatoFechaHora(iso) {
  const d = new Date(iso);
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function Bitacora() {
  const [fechaInicio, setFechaInicio] = useState(primerDiaDelMes());
  const [fechaFin, setFechaFin] = useState(hoyISO());
  const [busqueda, setBusqueda] = useState('');
  const [filas, setFilas] = useState([]);
  const [detalles, setDetalles] = useState({});
  const [expandidas, setExpandidas] = useState({});
  const [cargando, setCargando] = useState(false);

  async function cargar() {
    setCargando(true);
    const { data, error } = await supabase
      .from('v_bitacora_movimientos')
      .select('*')
      .gte('fecha', fechaInicio)
      .lte('fecha', fechaFin)
      .order('creado_en', { ascending: false });
    if (!error) setFilas(data || []);
    setExpandidas({});
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function alternarDetalle(polizaId) {
    setExpandidas((prev) => ({ ...prev, [polizaId]: !prev[polizaId] }));
    if (!detalles[polizaId]) {
      const { data, error } = await supabase
        .from('v_bitacora_detalle')
        .select('*')
        .eq('poliza_id', polizaId);
      if (!error) setDetalles((prev) => ({ ...prev, [polizaId]: data || [] }));
    }
  }

  async function eliminarPoliza(f) {
    const confirmado = window.confirm(
      `¿Eliminar esta póliza permanentemente?\n\n${f.fecha} — ${f.concepto}\nTotal: ${formatoMoneda(f.total)}\n\nEsto borra también todos sus cargos y abonos. No se puede deshacer.`
    );
    if (!confirmado) return;

    const { error } = await supabase.from('polizas').delete().eq('id', f.poliza_id);
    if (error) {
      window.alert(`No se pudo eliminar: ${error.message}`);
      return;
    }
    setFilas((prev) => prev.filter((x) => x.poliza_id !== f.poliza_id));
  }

  const filasFiltradas = filas.filter((f) => {
    if (!busqueda.trim()) return true;
    const q = busqueda.toLowerCase();
    return (
      (f.concepto || '').toLowerCase().includes(q) ||
      (f.referencia || '').toLowerCase().includes(q) ||
      (f.proveedor_nombre || '').toLowerCase().includes(q) ||
      (f.cuentas_involucradas || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="panel">
      <h2>Bitácora de movimientos</h2>
      <p className="subtitulo">
        Registro cronológico de cada póliza capturada — fecha y hora exacta de captura, para dar
        seguimiento y control de todo lo que ha ingresado al sistema.
      </p>

      <div className="filtro-fecha">
        <div>
          <label>Fecha desde</label>
          <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
        </div>
        <div>
          <label>Fecha hasta</label>
          <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label>Buscar</label>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Concepto, referencia, proveedor, cuenta…"
          />
        </div>
        <button className="boton" onClick={cargar} disabled={cargando}>
          {cargando ? 'Cargando…' : 'Consultar'}
        </button>
      </div>

      {filasFiltradas.length === 0 && !cargando ? (
        <p className="estado-vacio">No hay movimientos en este período.</p>
      ) : (
        <>
          <p className="subtitulo" style={{ marginBottom: 10 }}>
            {filasFiltradas.length} póliza(s)
          </p>
          <table className="reporte">
            <thead>
              <tr>
                <th>Fecha del movimiento</th>
                <th>Capturado el</th>
                <th>Concepto</th>
                <th>Cuentas involucradas</th>
                <th className="monto">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filasFiltradas.map((f) => (
                <>
                  <tr key={f.poliza_id}>
                    <td>{f.fecha}</td>
                    <td className="nombre">{formatoFechaHora(f.creado_en)}</td>
                    <td className="nombre">
                      {f.concepto}
                      {f.referencia && (
                        <span className="subtitulo" style={{ margin: 0 }}>
                          {' '}
                          · Ref: {f.referencia}
                        </span>
                      )}
                    </td>
                    <td className="nombre" style={{ fontSize: '0.78rem' }}>
                      {f.cuentas_involucradas}
                    </td>
                    <td className="monto">{formatoMoneda(f.total)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="boton" onClick={() => alternarDetalle(f.poliza_id)} style={{ marginRight: 6 }}>
                        {expandidas[f.poliza_id] ? 'Ocultar' : 'Detalle'}
                      </button>
                      <button
                        className="boton"
                        onClick={() => eliminarPoliza(f)}
                        style={{ background: 'var(--negativo)' }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                  {expandidas[f.poliza_id] && (
                    <tr key={`${f.poliza_id}-detalle`}>
                      <td colSpan={6} style={{ background: '#faf7f0' }}>
                        {!detalles[f.poliza_id] ? (
                          <p className="estado-vacio" style={{ padding: '4px 0' }}>
                            Cargando…
                          </p>
                        ) : (
                          <table className="reporte" style={{ margin: '4px 0' }}>
                            <thead>
                              <tr>
                                <th>Cuenta</th>
                                <th className="monto">Cargo</th>
                                <th className="monto">Abono</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detalles[f.poliza_id].map((d, i) => (
                                <tr key={i}>
                                  <td className="nombre">
                                    {d.codigo} — {d.cuenta_nombre}
                                  </td>
                                  <td className="monto">
                                    {Number(d.cargo) > 0 ? formatoMoneda(d.cargo) : ''}
                                  </td>
                                  <td className="monto">
                                    {Number(d.abono) > 0 ? formatoMoneda(d.abono) : ''}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
