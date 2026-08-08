'use client';

import { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../../../lib/supabaseClient';
import { formatoMoneda } from '../../../lib/format';

function haceMeses(n) {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth() - n, 1).toISOString().slice(0, 10);
}
function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function PrecioInsumos() {
  const [fechaInicio, setFechaInicio] = useState(haceMeses(6));
  const [fechaFin, setFechaFin] = useState(hoyISO());
  const [filas, setFilas] = useState([]);
  const [insumoSeleccionado, setInsumoSeleccionado] = useState('');
  const [cargando, setCargando] = useState(false);

  async function cargar() {
    setCargando(true);
    const { data, error } = await supabase
      .from('v_precios_insumos')
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

  const insumos = useMemo(
    () => [...new Set(filas.map((f) => f.descripcion))].sort(),
    [filas]
  );

  const historialInsumo = useMemo(() => {
    if (!insumoSeleccionado) return [];
    const compras = filas
      .filter((f) => f.descripcion === insumoSeleccionado)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    let anterior = null;
    return compras.map((c) => {
      const variacion = anterior ? (Number(c.valor_unitario) - anterior) / anterior : null;
      anterior = Number(c.valor_unitario);
      return { ...c, variacion };
    });
  }, [filas, insumoSeleccionado]);

  const datosGrafica = historialInsumo.map((h) => ({
    fecha: h.fecha,
    precio: Number(h.valor_unitario).toFixed(2),
  }));

  // Insumos con el mayor incremento entre su primera y última compra del período
  const mayoresIncrementos = useMemo(() => {
    const porInsumo = {};
    for (const fila of filas) {
      if (!porInsumo[fila.descripcion]) porInsumo[fila.descripcion] = [];
      porInsumo[fila.descripcion].push(fila);
    }
    const resultado = [];
    for (const [descripcion, compras] of Object.entries(porInsumo)) {
      if (compras.length < 2) continue;
      const ordenadas = [...compras].sort((a, b) => a.fecha.localeCompare(b.fecha));
      const primero = Number(ordenadas[0].valor_unitario);
      const ultimo = Number(ordenadas[ordenadas.length - 1].valor_unitario);
      if (primero <= 0) continue;
      const variacion = (ultimo - primero) / primero;
      if (variacion >= 0.15) {
        resultado.push({ descripcion, primero, ultimo, variacion, unidad: ordenadas[0].clave_unidad });
      }
    }
    return resultado.sort((a, b) => b.variacion - a.variacion).slice(0, 10);
  }, [filas]);

  return (
    <div className="panel">
      <h2>Precio por insumo</h2>
      <p className="subtitulo">
        Evolución del precio unitario de cada producto comprado, según los conceptos de las facturas importadas.
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

      {filas.length === 0 && !cargando ? (
        <p className="estado-vacio">
          No hay conceptos de facturas en este período. Importa facturas en &quot;Importar facturas&quot; para
          empezar a ver esta información.
        </p>
      ) : (
        <>
          {mayoresIncrementos.length > 0 && (
            <div className="mensaje error">
              <strong>Insumos con mayor aumento en el período</strong> (≥15% entre su primera y última compra):
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {mayoresIncrementos.map((m, i) => (
                  <li key={i}>
                    {m.descripcion}: {formatoMoneda(m.primero)} → {formatoMoneda(m.ultimo)} (+
                    {Math.round(m.variacion * 100)}%)
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="filtro-fecha">
            <div style={{ flex: 1, minWidth: 260 }}>
              <label>Buscar insumo</label>
              <input
                list="lista-insumos"
                value={insumoSeleccionado}
                onChange={(e) => setInsumoSeleccionado(e.target.value)}
                placeholder="Escribe para buscar, ej. camarón"
              />
              <datalist id="lista-insumos">
                {insumos.map((i) => (
                  <option key={i} value={i} />
                ))}
              </datalist>
            </div>
          </div>

          {insumoSeleccionado && historialInsumo.length === 0 && (
            <p className="estado-vacio">No hay compras registradas de &quot;{insumoSeleccionado}&quot;.</p>
          )}

          {historialInsumo.length > 0 && (
            <>
              <div style={{ width: '100%', height: 260, marginBottom: 20 }}>
                <ResponsiveContainer>
                  <LineChart data={datosGrafica}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--linea)" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} width={70} />
                    <Tooltip formatter={(valor) => formatoMoneda(valor)} />
                    <Line type="monotone" dataKey="precio" stroke="var(--acento)" strokeWidth={2} dot />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <table className="reporte">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Proveedor</th>
                    <th className="monto">Cantidad</th>
                    <th className="monto">Precio unitario</th>
                    <th className="monto">Variación</th>
                  </tr>
                </thead>
                <tbody>
                  {historialInsumo.map((h, i) => (
                    <tr key={i}>
                      <td>{h.fecha}</td>
                      <td className="nombre">{h.proveedor_nombre}</td>
                      <td className="monto">
                        {h.cantidad} {h.clave_unidad || ''}
                      </td>
                      <td className="monto">{formatoMoneda(h.valor_unitario)}</td>
                      <td className={`monto ${h.variacion >= 0.15 ? 'negativo' : ''}`}>
                        {h.variacion === null
                          ? '—'
                          : `${h.variacion >= 0 ? '+' : ''}${Math.round(h.variacion * 100)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </div>
  );
}
