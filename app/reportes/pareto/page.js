'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { supabase } from '../../../lib/supabaseClient';
import { formatoMoneda } from '../../../lib/format';

const NAVY = '#0b2545';
const CORAL = '#e8603c';
const TEAL = '#0fa8c2';
const COLOR_TIPO = { A: '#1b7a5e', B: '#c98a1f', C: '#c1443b' };

function claseTipo(letra) {
  return { color: COLOR_TIPO[letra] || NAVY, fontWeight: 700 };
}

function tipoDeAcumulado(pct) {
  if (pct <= 80) return 'A';
  if (pct <= 95) return 'B';
  return 'C';
}

export default function Pareto() {
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('todos'); // todos | todos_cortesias | alimento | bebida
  const [filtroTipoVenta, setFiltroTipoVenta] = useState([]); // subconjunto de ['A','B','C'] -- vacío = sin filtro
  const [filtroTipoRotacion, setFiltroTipoRotacion] = useState([]); // subconjunto de ['A','B','C'] -- vacío = sin filtro
  const [filtroTipoVR, setFiltroTipoVR] = useState(''); // '' = sin filtro, o una de las 9 combinaciones
  const [ventas, setVentas] = useState([]);
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      const [v, p] = await Promise.all([
        supabase.from('barman_ventas').select('venta_id, fecha'),
        supabase
          .from('barman_productos')
          .select('venta_id, producto_nombre, categoria, cantidad, importe_lista, es_modificador'),
      ]);
      if (!v.error) setVentas(v.data || []);
      if (!p.error) setProductos(p.data || []);
      setCargando(false);
    }
    cargar();
  }, []);

  const rangoDisponible = useMemo(() => {
    const fechas = ventas.map((v) => v.fecha?.slice(0, 10)).filter(Boolean).sort();
    return { min: fechas[0], max: fechas[fechas.length - 1] };
  }, [ventas]);

  const filas = useMemo(() => {
    if (ventas.length === 0 || productos.length === 0) return { detalle: [], totalVenta: 0, totalCuentas: 0 };

    const fechaPorVenta = {};
    for (const v of ventas) fechaPorVenta[v.venta_id] = v.fecha?.slice(0, 10);

    const desde = fechaInicio || rangoDisponible.min;
    const hasta = fechaFin || rangoDisponible.max;

    const filtrados = productos.filter((p) => {
      if (p.es_modificador) return false;
      const fecha = fechaPorVenta[p.venta_id];
      if (!fecha) return false;
      if (fecha < desde || fecha > hasta) return false;

      const esCortesia = Number(p.importe_lista || 0) <= 0;

      if (filtroCategoria === 'alimento') return p.categoria === 'alimento' && !esCortesia;
      if (filtroCategoria === 'bebida') return p.categoria === 'bebida' && !esCortesia;
      if (filtroCategoria === 'todos') return !esCortesia; // Alimentos + Bebidas, SIN cortesías
      // 'todos_cortesias' -> Alimentos + Bebidas + Cortesías, no se excluye nada más
      return true;
    });

    const totalCuentas = new Set(filtrados.map((p) => p.venta_id)).size;

    const grupos = {};
    for (const p of filtrados) {
      const esCortesia = Number(p.importe_lista || 0) <= 0;
      const bucket = esCortesia ? 'cortesia' : p.categoria;
      const clave = `${p.producto_nombre}__${bucket}`;
      if (!grupos[clave]) {
        grupos[clave] = {
          nombre: p.producto_nombre,
          categoria: bucket,
          unidades: 0,
          venta: 0,
          ventaIds: new Set(),
        };
      }
      grupos[clave].unidades += Number(p.cantidad || 0);
      grupos[clave].venta += Number(p.importe_lista || 0);
      grupos[clave].ventaIds.add(p.venta_id);
    }

    let lista = Object.values(grupos).map((g) => ({
      nombre: g.nombre,
      categoria: g.categoria,
      unidades: g.unidades,
      venta: g.venta,
      rotacion: g.ventaIds.size,
      precioUnitario: g.unidades > 0 ? g.venta / g.unidades : 0,
    }));

    const totalVenta = lista.reduce((s, r) => s + r.venta, 0);

    lista.sort((a, b) => b.venta - a.venta);
    let acumuladoVenta = 0;
    lista.forEach((r, i) => {
      r.rankingVenta = i + 1;
      r.pctTotal = totalVenta > 0 ? (r.venta / totalVenta) * 100 : 0;
      acumuladoVenta += r.pctTotal;
      r.paretoVentas = acumuladoVenta;
      r.tipoVenta = tipoDeAcumulado(acumuladoVenta);
    });

    const porRotacion = [...lista].sort((a, b) => b.rotacion - a.rotacion);
    let acumuladoRotacion = 0;
    porRotacion.forEach((r, i) => {
      r.rankingRotacion = i + 1;
      r.pctRotacion = totalCuentas > 0 ? (r.rotacion / totalCuentas) * 100 : 0;
      acumuladoRotacion += r.pctRotacion;
      r.paretoRotacion = acumuladoRotacion;
      r.tipoRotacion = tipoDeAcumulado(acumuladoRotacion);
    });

    lista.forEach((r) => {
      r.tipoVR = `${r.tipoVenta}${r.tipoRotacion}`;
    });

    lista.sort((a, b) => a.rankingVenta - b.rankingVenta);

    return { detalle: lista, totalVenta, totalCuentas };
  }, [productos, ventas, fechaInicio, fechaFin, filtroCategoria, rangoDisponible]);

  const matrizVentaConsumo = useMemo(() => {
    const celdas = {};
    for (const a of ['A', 'B', 'C']) {
      for (const b of ['A', 'B', 'C']) {
        celdas[`${a}${b}`] = { venta: 0, unidades: 0, sumaPctRotacion: 0, n: 0 };
      }
    }
    for (const r of filas.detalle) {
      const c = celdas[r.tipoVR];
      if (!c) continue;
      c.venta += r.venta;
      c.unidades += r.unidades;
      c.sumaPctRotacion += r.pctRotacion;
      c.n += 1;
    }
    return celdas;
  }, [filas]);

  const filasVisibles = useMemo(() => {
    return filas.detalle.filter((r) => {
      if (filtroTipoVenta.length > 0 && !filtroTipoVenta.includes(r.tipoVenta)) return false;
      if (filtroTipoRotacion.length > 0 && !filtroTipoRotacion.includes(r.tipoRotacion)) return false;
      if (filtroTipoVR && r.tipoVR !== filtroTipoVR) return false;
      return true;
    });
  }, [filas, filtroTipoVenta, filtroTipoRotacion, filtroTipoVR]);

  const COLOR_VR = {
    AA: '#1b7a5e', AB: '#3fa07f', AC: '#7fc7a8',
    BA: '#c98a1f', BB: '#e0ac4d', BC: '#f2cf8f',
    CA: '#c1443b', CB: '#dd7a71', CC: '#f0b3ad',
  };

  const puntosDispersión = useMemo(() => {
    const porCuadrante = {};
    for (const a of ['A', 'B', 'C']) {
      for (const b of ['A', 'B', 'C']) {
        porCuadrante[`${a}${b}`] = [];
      }
    }
    for (const r of filas.detalle) {
      if (!porCuadrante[r.tipoVR]) continue;
      porCuadrante[r.tipoVR].push({ x: r.pctRotacion, y: r.pctTotal, nombre: r.nombre, tipoVR: r.tipoVR });
    }
    return porCuadrante;
  }, [filas]);

  function alternarTipo(lista, setLista, letra) {
    setLista(lista.includes(letra) ? lista.filter((x) => x !== letra) : [...lista, letra]);
  }

  const etiquetaCategoria = { alimento: 'Alimentos', bebida: 'Bebidas', cortesia: 'Cortesía' };

  return (
    <div className="pagina-ancha">
      <div className="panel" style={{ paddingTop: 14 }}>
        <h2 style={{ marginBottom: 2 }}>Pareto</h2>
        <p className="subtitulo" style={{ marginBottom: 16 }}>
          Análisis ABC de ventas y rotación por producto — real, calculado en vivo desde BarMan.
        </p>

        <div className="filtro-fecha" style={{ marginBottom: 12 }}>
          <div>
            <label>Fecha inicio</label>
            <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
          </div>
          <div>
            <label>Fecha fin</label>
            <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
          </div>
          <div>
            <label>Categoría</label>
            <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
              <option value="todos">Alimentos + Bebidas</option>
              <option value="todos_cortesias">Alimentos + Bebidas + Cortesías</option>
              <option value="alimento">Solo alimentos</option>
              <option value="bebida">Solo bebidas</option>
            </select>
          </div>
          <div>
            <label>Tipo V-R (combinación exacta)</label>
            <select value={filtroTipoVR} onChange={(e) => setFiltroTipoVR(e.target.value)}>
              <option value="">Todas las combinaciones</option>
              {['A', 'B', 'C'].flatMap((a) => ['A', 'B', 'C'].map((b) => (
                <option key={`${a}${b}`} value={`${a}${b}`}>{a}{b}</option>
              )))}
            </select>
          </div>
        </div>

        <div className="filtro-fecha" style={{ marginBottom: 20, alignItems: 'flex-start' }}>
          <div>
            <label>Tipo venta</label>
            <div style={{ display: 'flex', gap: 12, paddingTop: 8 }}>
              {['A', 'B', 'C'].map((letra) => (
                <label key={letra} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem' }}>
                  <input
                    type="checkbox"
                    checked={filtroTipoVenta.includes(letra)}
                    onChange={() => alternarTipo(filtroTipoVenta, setFiltroTipoVenta, letra)}
                    style={{ width: 'auto' }}
                  />
                  <span style={claseTipo(letra)}>{letra}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label>Tipo rotación</label>
            <div style={{ display: 'flex', gap: 12, paddingTop: 8 }}>
              {['A', 'B', 'C'].map((letra) => (
                <label key={letra} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem' }}>
                  <input
                    type="checkbox"
                    checked={filtroTipoRotacion.includes(letra)}
                    onChange={() => alternarTipo(filtroTipoRotacion, setFiltroTipoRotacion, letra)}
                    style={{ width: 'auto' }}
                  />
                  <span style={claseTipo(letra)}>{letra}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {cargando ? (
          <p className="estado-vacio">Cargando…</p>
        ) : (
          <>
            <h2 style={{ fontFamily: 'var(--fuente-titulo)', fontSize: '1.3rem', color: NAVY, marginBottom: 4 }}>
              Venta Consumo
            </h2>
            <p className="subtitulo" style={{ marginBottom: 12 }}>
              Productos agrupados por Tipo V-R (Venta × Rotación) — venta, unidades y rotación promedio de cada grupo.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28, alignItems: 'start' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {['A', 'B', 'C'].flatMap((filaVenta) =>
                  ['A', 'B', 'C'].map((colRotacion) => {
                    const clave = `${filaVenta}${colRotacion}`;
                    const c = matrizVentaConsumo[clave];
                    return (
                      <div
                        key={clave}
                        style={{
                          border: `1px solid var(--linea)`,
                          borderTop: `4px solid ${COLOR_TIPO[filaVenta]}`,
                          borderRadius: 8,
                          padding: '10px 12px',
                          background: '#fff',
                        }}
                      >
                        <div style={{ fontSize: '0.72rem', color: 'var(--texto-sutil)', marginBottom: 4 }}>
                          <span style={claseTipo(filaVenta)}>{filaVenta}</span>
                          <span style={{ margin: '0 3px' }}>×</span>
                          <span style={claseTipo(colRotacion)}>{colRotacion}</span>
                          {' '}({c.n} art.)
                        </div>
                        <div style={{ fontFamily: 'var(--fuente-datos)', fontWeight: 700, fontSize: '1rem', color: NAVY }}>
                          {formatoMoneda(c.venta)}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--texto-sutil)' }}>
                          {c.unidades.toLocaleString('es-MX')} unidades
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--texto-sutil)' }}>
                          Rotación prom.: {c.n > 0 ? (c.sumaPctRotacion / c.n).toFixed(1) : '0.0'}%
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div style={{ border: '1px solid var(--linea)', borderRadius: 8, padding: '12px 14px', background: '#fff' }}>
                <p style={{ fontSize: '0.78rem', color: 'var(--texto-sutil)', margin: '0 0 8px' }}>
                  Cada punto es un artículo · eje X = % rotación · eje Y = % de venta · color = cuadrante Tipo V-R
                </p>
                <div style={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer>
                    <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--linea)" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name="% Rotación"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => `${v.toFixed(0)}%`}
                        label={{ value: '% Rotación', position: 'insideBottom', offset: -5, fontSize: 11 }}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        name="% Venta"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => `${v.toFixed(0)}%`}
                        label={{ value: '% Venta', angle: -90, position: 'insideLeft', fontSize: 11 }}
                      />
                      <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        formatter={(valor, nombre) => [`${Number(valor).toFixed(2)}%`, nombre]}
                        labelFormatter={() => ''}
                        content={({ active, payload }) => {
                          if (!active || !payload || !payload.length) return null;
                          const p = payload[0].payload;
                          return (
                            <div style={{ background: '#fff', border: '1px solid var(--linea)', borderRadius: 6, padding: '6px 10px', fontSize: '0.78rem' }}>
                              <div style={{ fontWeight: 700, color: NAVY }}>{p.nombre}</div>
                              <div>Tipo V-R: <strong>{p.tipoVR}</strong></div>
                              <div>% Rotación: {p.x.toFixed(2)}%</div>
                              <div>% Venta: {p.y.toFixed(2)}%</div>
                            </div>
                          );
                        }}
                      />
                      {Object.entries(puntosDispersión).map(([clave, puntos]) => (
                        <Scatter key={clave} name={clave} data={puntos} fill={COLOR_VR[clave]} />
                      ))}
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginTop: 8 }}>
                  {Object.entries(puntosDispersión).map(([clave, puntos]) => (
                    <span key={clave} style={{ fontSize: '0.72rem', color: 'var(--texto-sutil)' }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: COLOR_VR[clave], marginRight: 4 }} />
                      {clave} ({puntos.length})
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <h2 style={{ fontFamily: 'var(--fuente-titulo)', fontSize: '1.3rem', color: NAVY, marginBottom: 4 }}>
              Detalle por producto
            </h2>
            <p className="subtitulo" style={{ marginBottom: 10 }}>
              {filasVisibles.length} de {filas.detalle.length} artículo(s) · Venta total {formatoMoneda(filas.totalVenta)} · {filas.totalCuentas} cuentas
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table className="reporte" style={{ fontSize: '0.78rem', minWidth: 1400 }}>
                <thead>
                  <tr>
                    <th>Categoría</th>
                    <th>Nombre artículo</th>
                    <th className="monto">Unidades</th>
                    <th className="monto">Precio unitario</th>
                    <th className="monto">Venta</th>
                    <th className="monto">% Total</th>
                    <th className="monto">Pareto ventas</th>
                    <th>Tipo venta</th>
                    <th className="monto">Ranking venta</th>
                    <th className="monto">Rotación producto</th>
                    <th className="monto">% Rotación</th>
                    <th className="monto">Ranking rotación</th>
                    <th>Tipo rotación</th>
                    <th>Tipo V-R</th>
                  </tr>
                </thead>
                <tbody>
                  {filasVisibles.map((r) => (
                    <tr key={`${r.nombre}__${r.categoria}`}>
                      <td className="nombre">{etiquetaCategoria[r.categoria]}</td>
                      <td className="nombre">{r.nombre}</td>
                      <td className="monto">{r.unidades.toLocaleString('es-MX')}</td>
                      <td className="monto">{formatoMoneda(r.precioUnitario)}</td>
                      <td className="monto">{formatoMoneda(r.venta)}</td>
                      <td className="monto">{r.pctTotal.toFixed(2)}%</td>
                      <td className="monto">{r.paretoVentas.toFixed(2)}%</td>
                      <td style={claseTipo(r.tipoVenta)}>{r.tipoVenta}</td>
                      <td className="monto">{r.rankingVenta}</td>
                      <td className="monto">{r.rotacion.toLocaleString('es-MX')}</td>
                      <td className="monto">{r.pctRotacion.toFixed(2)}%</td>
                      <td className="monto">{r.rankingRotacion}</td>
                      <td style={claseTipo(r.tipoRotacion)}>{r.tipoRotacion}</td>
                      <td style={{ fontWeight: 700, color: NAVY }}>{r.tipoVR}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
