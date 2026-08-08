'use client';

import { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../../../lib/supabaseClient';
import { formatoMoneda } from '../../../lib/format';

const UMBRAL_AUMENTO = 0.25; // 25% — a partir de aquí se marca como aumento considerable

function haceMeses(n) {
  const hoy = new Date();
  const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - n, 1);
  return fecha.toISOString().slice(0, 10);
}
function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReporteProveedores() {
  const [fechaInicio, setFechaInicio] = useState(haceMeses(6));
  const [fechaFin, setFechaFin] = useState(hoyISO());
  const [filas, setFilas] = useState([]);
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState('');
  const [cargando, setCargando] = useState(false);

  async function cargar() {
    setCargando(true);
    const { data, error } = await supabase
      .from('v_compras_proveedores')
      .select('*')
      .gte('fecha', fechaInicio)
      .lte('fecha', fechaFin)
      .order('fecha');
    if (!error) setFilas(data || []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Agrupar por proveedor + mes
  const resumen = useMemo(() => {
    const acumulado = {};
    for (const fila of filas) {
      const proveedor = fila.proveedor_nombre || 'Sin proveedor especificado';
      const mes = (fila.fecha || '').slice(0, 7);
      const clave = `${proveedor}|${mes}`;
      if (!acumulado[clave]) acumulado[clave] = { proveedor, mes, total: 0 };
      acumulado[clave].total += Number(fila.monto);
    }
    return Object.values(acumulado).sort((a, b) =>
      a.proveedor === b.proveedor ? a.mes.localeCompare(b.mes) : a.proveedor.localeCompare(b.proveedor)
    );
  }, [filas]);

  // Agregar variación % vs mes anterior del mismo proveedor
  const resumenConVariacion = useMemo(() => {
    const porProveedor = {};
    return resumen.map((fila) => {
      const anterior = porProveedor[fila.proveedor];
      const variacion = anterior ? (fila.total - anterior) / anterior : null;
      porProveedor[fila.proveedor] = fila.total;
      return { ...fila, variacion };
    });
  }, [resumen]);

  const proveedores = useMemo(
    () => [...new Set(resumen.map((f) => f.proveedor))].sort(),
    [resumen]
  );

  const alertas = resumenConVariacion.filter((f) => f.variacion !== null && f.variacion >= UMBRAL_AUMENTO);

  const datosGrafica = useMemo(() => {
    if (!proveedorSeleccionado) return [];
    return resumenConVariacion
      .filter((f) => f.proveedor === proveedorSeleccionado)
      .map((f) => ({ mes: f.mes, total: Number(f.total.toFixed(2)) }));
  }, [resumenConVariacion, proveedorSeleccionado]);

  return (
    <div className="panel">
      <h2>Gasto en insumos por proveedor</h2>
      <p className="subtitulo">
        Compras a proveedores (cuenta 1104) agrupadas por mes, para detectar aumentos considerables en el tiempo.
      </p>

      <div className="filtro-fecha">
        <div>
          <label>Desde</label>
          <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
        </div>
        <div>
          <label>Hasta</label>
          <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
        </div>
        <button className="boton" onClick={cargar} disabled={cargando}>
          {cargando ? 'Cargando…' : 'Consultar'}
        </button>
      </div>

      {alertas.length > 0 && (
        <div className="mensaje error">
          <strong>{alertas.length} aumento(s) considerable(s)</strong> (≥{Math.round(UMBRAL_AUMENTO * 100)}% vs
          mes anterior):
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {alertas.map((a, i) => (
              <li key={i}>
                {a.proveedor} — {a.mes}: {formatoMoneda(a.total)} ({a.variacion >= 0 ? '+' : ''}
                {Math.round(a.variacion * 100)}%)
              </li>
            ))}
          </ul>
        </div>
      )}

      {resumen.length === 0 && !cargando ? (
        <p className="estado-vacio">No hay compras a proveedores en este período.</p>
      ) : (
        <>
          <table className="reporte" style={{ marginBottom: 28 }}>
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>Mes</th>
                <th className="monto">Total</th>
                <th className="monto">Variación vs mes anterior</th>
              </tr>
            </thead>
            <tbody>
              {resumenConVariacion.map((f, i) => (
                <tr key={i}>
                  <td className="nombre">{f.proveedor}</td>
                  <td>{f.mes}</td>
                  <td className="monto">{formatoMoneda(f.total)}</td>
                  <td className={`monto ${f.variacion >= UMBRAL_AUMENTO ? 'negativo' : ''}`}>
                    {f.variacion === null
                      ? '—'
                      : `${f.variacion >= 0 ? '+' : ''}${Math.round(f.variacion * 100)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 style={{ fontSize: '0.95rem' }}>Ver comportamiento de un proveedor</h2>
          <div className="filtro-fecha">
            <div style={{ flex: 1, minWidth: 220 }}>
              <label>Proveedor</label>
              <select
                value={proveedorSeleccionado}
                onChange={(e) => setProveedorSeleccionado(e.target.value)}
              >
                <option value="">Selecciona un proveedor</option>
                {proveedores.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {proveedorSeleccionado && (
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <LineChart data={datosGrafica}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--linea)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} width={80} />
                  <Tooltip formatter={(valor) => formatoMoneda(valor)} />
                  <Line type="monotone" dataKey="total" stroke="var(--acento)" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
