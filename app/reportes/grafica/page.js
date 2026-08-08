'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { supabase } from '../../../lib/supabaseClient';
import { formatoMoneda } from '../../../lib/format';

const COLORES = ['#e8603c', '#0fa8c2', '#0b2545', '#1b7a5e', '#eb9dc2', '#8b5cf6', '#d97706', '#0891b2', '#4f46e5', '#be123c', '#15803d', '#7c3aed'];
const TAM_PAGINA = 1000;
const MAX_PRODUCTOS = 8;

const METRICAS_TIEMPO = [
  { id: 'ventas', label: 'Ventas totales', formato: 'moneda', eje: 'izquierdo' },
  { id: 'ticket_promedio', label: 'Ticket promedio', formato: 'moneda', eje: 'derecho' },
  { id: 'alimentos', label: 'Alimentos', formato: 'moneda', eje: 'izquierdo' },
  { id: 'bebidas', label: 'Bebidas', formato: 'moneda', eje: 'izquierdo' },
  { id: 'cortesias', label: 'Cortesías', formato: 'moneda', eje: 'izquierdo' },
  { id: 'tickets', label: 'Número de tickets', formato: 'entero', eje: 'derecho' },
  { id: 'propinas', label: 'Propinas', formato: 'moneda', eje: 'izquierdo' },
  { id: 'propina_pct', label: 'Propina sobre venta %', formato: 'porcentaje', eje: 'derecho' },
];

const TIPOS_GRAFICA = [
  { value: 'barras', label: 'Barras' },
  { value: 'lineas', label: 'Líneas' },
  { value: 'area', label: 'Área' },
];

function primerDiaAnioActual() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-01-01`;
}

function hoyISO() {
  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = String(hoy.getMonth() + 1).padStart(2, '0');
  const d = String(hoy.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fechaLocalISO(valor) {
  if (!valor) return null;
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return null;
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function claveDePeriodo(fecha, periodicidad) {
  const iso = fechaLocalISO(fecha);
  if (!iso) return null;
  if (periodicidad === 'dia') return iso;
  if (periodicidad === 'anio') return iso.slice(0, 4);
  return iso.slice(0, 7);
}

function etiquetaPeriodo(clave, periodicidad) {
  if (periodicidad === 'anio') return clave;
  if (periodicidad === 'mes') {
    const [anio, mes] = clave.split('-');
    const fecha = new Date(Number(anio), Number(mes) - 1, 1);
    return fecha.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' });
  }
  const [anio, mes, dia] = clave.split('-');
  const fecha = new Date(Number(anio), Number(mes) - 1, Number(dia));
  return fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

function formatoValor(valor, formato) {
  if (valor === null || valor === undefined) return '—';
  if (formato === 'moneda') return formatoMoneda(Number(valor || 0));
  if (formato === 'porcentaje') return `${Number(valor || 0).toFixed(1)}%`;
  if (formato === 'decimal') return Number(valor || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 });
  return Number(valor || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 });
}

function textoCategoria(producto) {
  return String(producto?.categoria || '').trim().toLowerCase();
}

function esBebida(producto) {
  const categoria = textoCategoria(producto);
  return categoria === 'bebida' || categoria === 'bebidas' || categoria.includes('bebida');
}

function categoriaComercial(producto) {
  return esBebida(producto) ? 'Bebidas' : 'Alimentos';
}

function slugProducto(nombre, indice) {
  return `producto_${indice}_${String(nombre).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 35)}`;
}

function CheckboxMetrica({ id, label, seleccionadas, setSeleccionadas, ejesMetricas, setEjesMetricas, ejeActivo }) {
  const checked = seleccionadas.includes(id);
  const ejeAsignado = ejesMetricas[id];

  function alternar() {
    if (checked) {
      if (seleccionadas.length === 1) return;
      setSeleccionadas(seleccionadas.filter((x) => x !== id));
      setEjesMetricas((actuales) => {
        const siguiente = { ...actuales };
        delete siguiente[id];
        return siguiente;
      });
    } else {
      setSeleccionadas([...seleccionadas, id]);
      setEjesMetricas((actuales) => ({ ...actuales, [id]: ejeActivo }));
    }
  }

  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.84rem', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={alternar} style={{ width: 'auto', margin: 0 }} />
      <span>{label}</span>
      {checked && (
        <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 6px', borderRadius: 999, border: '1px solid var(--linea)', color: 'var(--texto-sutil)' }}>
          {ejeAsignado === 'derecho' ? 'E2' : 'E1'}
        </span>
      )}
    </label>
  );
}

async function consultarPaginado(tabla, columnas, configurar) {
  const acumulado = [];
  let desde = 0;

  while (true) {
    let consulta = supabase.from(tabla).select(columnas).range(desde, desde + TAM_PAGINA - 1);
    consulta = configurar ? configurar(consulta) : consulta;
    const { data, error } = await consulta;
    if (error) throw error;
    const bloque = data || [];
    acumulado.push(...bloque);
    if (bloque.length < TAM_PAGINA) break;
    desde += TAM_PAGINA;
  }

  return acumulado;
}

function filtrarProductosPeriodo(registros, ventasPeriodo, fechaInicio, fechaFin) {
  const idsPeriodo = new Set(ventasPeriodo.map((v) => String(v.venta_id)));
  const tieneVentaId = registros.some((r) => r.venta_id !== null && r.venta_id !== undefined);
  const tieneFecha = registros.some((r) => r.fecha);

  if (tieneVentaId) {
    return { datos: registros.filter((r) => idsPeriodo.has(String(r.venta_id))), filtrado: true };
  }
  if (tieneFecha) {
    return {
      datos: registros.filter((r) => {
        const iso = fechaLocalISO(r.fecha);
        return iso && iso >= fechaInicio && iso <= fechaFin;
      }),
      filtrado: true,
    };
  }
  return { datos: registros, filtrado: false };
}

export default function Grafica() {
  const [fechaInicio, setFechaInicio] = useState(primerDiaAnioActual());
  const [fechaFin, setFechaFin] = useState(hoyISO());
  const [periodicidad, setPeriodicidad] = useState('mes');
  const [tipoGraficaEje1, setTipoGraficaEje1] = useState('barras');
  const [tipoGraficaEje2, setTipoGraficaEje2] = useState('lineas');
  const [ejeActivo, setEjeActivo] = useState('izquierdo');
  const [metricas, setMetricas] = useState(['ventas', 'ticket_promedio']);
  const [ejesMetricas, setEjesMetricas] = useState({ ventas: 'izquierdo', ticket_promedio: 'derecho' });
  const [metricaProducto, setMetricaProducto] = useState('importe');
  const [productosSeleccionados, setProductosSeleccionados] = useState([]);
  const [ejesProductos, setEjesProductos] = useState({});
  const [buscarAlimento, setBuscarAlimento] = useState('');
  const [buscarBebida, setBuscarBebida] = useState('');
  const [ventas, setVentas] = useState([]);
  const [productos, setProductos] = useState([]);
  const [cortesias, setCortesias] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [avisos, setAvisos] = useState([]);

  async function consultar() {
    if (!fechaInicio || !fechaFin) return;
    setCargando(true);
    setError('');
    setAvisos([]);

    try {
      const ventasPeriodo = await consultarPaginado(
        'barman_ventas',
        'venta_id, fecha, total_venta, propina',
        (q) => q
          .gte('fecha', `${fechaInicio}T00:00:00`)
          .lte('fecha', `${fechaFin}T23:59:59.999`)
          .order('fecha', { ascending: true }),
      );
      setVentas(ventasPeriodo);

      const productosTodos = await consultarPaginado('barman_productos', '*');
      const productosPeriodo = filtrarProductosPeriodo(productosTodos, ventasPeriodo, fechaInicio, fechaFin);
      setProductos(productosPeriodo.datos);

      const cortesiasTodas = await consultarPaginado('barman_cortesias', '*');
      const cortesiasPeriodo = filtrarProductosPeriodo(cortesiasTodas, ventasPeriodo, fechaInicio, fechaFin);
      setCortesias(cortesiasPeriodo.datos);

      const nuevosAvisos = [];
      if (!productosPeriodo.filtrado) {
        nuevosAvisos.push('Los productos no contienen venta_id ni fecha; el análisis por producto usa todo el histórico disponible.');
      }
      if (!cortesiasPeriodo.filtrado) {
        nuevosAvisos.push('Las cortesías no contienen venta_id ni fecha; no es posible distribuirlas correctamente por periodo en la gráfica.');
      }
      setAvisos(nuevosAvisos);
    } catch (e) {
      setVentas([]);
      setProductos([]);
      setCortesias([]);
      setError(`No fue posible consultar la información comercial: ${e.message}`);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    consultar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const productosValidos = useMemo(
    () => productos.filter((p) => !p.es_modificador),
    [productos],
  );

  const catalogoPorCategoria = useMemo(() => {
    const sets = { Alimentos: new Set(), Bebidas: new Set() };
    for (const p of productosValidos) {
      const nombre = String(p.producto_nombre || '').trim();
      if (!nombre) continue;
      sets[categoriaComercial(p)].add(nombre);
    }
    return {
      Alimentos: Array.from(sets.Alimentos).sort((a, b) => a.localeCompare(b, 'es')),
      Bebidas: Array.from(sets.Bebidas).sort((a, b) => a.localeCompare(b, 'es')),
    };
  }, [productosValidos]);

  const alimentosFiltrados = useMemo(() => {
    const q = buscarAlimento.trim().toLowerCase();
    return q ? catalogoPorCategoria.Alimentos.filter((x) => x.toLowerCase().includes(q)) : catalogoPorCategoria.Alimentos;
  }, [catalogoPorCategoria, buscarAlimento]);

  const bebidasFiltradas = useMemo(() => {
    const q = buscarBebida.trim().toLowerCase();
    return q ? catalogoPorCategoria.Bebidas.filter((x) => x.toLowerCase().includes(q)) : catalogoPorCategoria.Bebidas;
  }, [catalogoPorCategoria, buscarBebida]);

  const datosTiempoBase = useMemo(() => {
    const agrupado = {};
    for (const venta of ventas) {
      const clave = claveDePeriodo(venta.fecha, periodicidad);
      if (!clave) continue;
      if (!agrupado[clave]) agrupado[clave] = { clave, ventas: 0, tickets: 0, propinas: 0 };
      agrupado[clave].ventas += Number(venta.total_venta || 0);
      agrupado[clave].tickets += 1;
      agrupado[clave].propinas += Number(venta.propina || 0);
    }
    return Object.values(agrupado)
      .sort((a, b) => a.clave.localeCompare(b.clave))
      .map((fila) => ({
        ...fila,
        periodo: etiquetaPeriodo(fila.clave, periodicidad),
        ticket_promedio: fila.tickets > 0 ? fila.ventas / fila.tickets : 0,
        propina_pct: fila.ventas > 0 ? (fila.propinas / fila.ventas) * 100 : 0,
      }));
  }, [ventas, periodicidad]);

  const seriesProductos = useMemo(
    () => productosSeleccionados.map((nombre, indice) => ({
      nombre,
      id: slugProducto(nombre, indice),
      formato: metricaProducto === 'importe' ? 'moneda' : 'decimal',
      eje: ejesProductos[nombre] || 'izquierdo',
    })),
    [productosSeleccionados, metricaProducto, ejesProductos],
  );

  const datosGrafica = useMemo(() => {
    const filas = datosTiempoBase.map((fila) => ({
      ...fila,
      alimentos: 0,
      bebidas: 0,
      cortesias: 0,
    }));
    const porClave = new Map(filas.map((fila) => [fila.clave, fila]));
    const ventaFecha = new Map(ventas.map((v) => [String(v.venta_id), v.fecha]));
    const mapaSeries = new Map(seriesProductos.map((s) => [s.nombre, s.id]));

    for (const fila of filas) {
      for (const s of seriesProductos) fila[s.id] = 0;
    }

    for (const p of productosValidos) {
      const fecha = p.fecha || ventaFecha.get(String(p.venta_id));
      const clave = claveDePeriodo(fecha, periodicidad);
      if (!clave) continue;
      const fila = porClave.get(clave);
      if (!fila) continue;

      const importe = Number(p.importe_lista || 0);
      if (categoriaComercial(p) === 'Bebidas') fila.bebidas += importe;
      else fila.alimentos += importe;

      const nombre = String(p.producto_nombre || '').trim();
      const idSerie = mapaSeries.get(nombre);
      if (!idSerie) continue;
      fila[idSerie] += metricaProducto === 'importe' ? importe : Number(p.cantidad || 0);
    }

    for (const cortesia of cortesias) {
      const fecha = cortesia.fecha || ventaFecha.get(String(cortesia.venta_id));
      const clave = claveDePeriodo(fecha, periodicidad);
      if (!clave) continue;
      const fila = porClave.get(clave);
      if (!fila) continue;
      fila.cortesias += Number(cortesia.importe_cortesia || 0);
    }

    return filas;
  }, [datosTiempoBase, productosValidos, seriesProductos, metricaProducto, periodicidad, ventas, cortesias]);

  const categorias = useMemo(() => {
    const salida = {
      Alimentos: { importe: 0, unidades: 0 },
      Bebidas: { importe: 0, unidades: 0 },
    };
    for (const p of productosValidos) {
      const categoria = categoriaComercial(p);
      salida[categoria].importe += Number(p.importe_lista || 0);
      salida[categoria].unidades += Number(p.cantidad || 0);
    }
    return salida;
  }, [productosValidos]);

  const kpis = useMemo(() => {
    const totalVentas = ventas.reduce((s, v) => s + Number(v.total_venta || 0), 0);
    const tickets = ventas.length;
    return {
      totalVentas,
      tickets,
      ticketPromedio: tickets > 0 ? totalVentas / tickets : 0,
      alimentos: categorias.Alimentos.importe,
      bebidas: categorias.Bebidas.importe,
      unidadesAlimentos: categorias.Alimentos.unidades,
      unidadesBebidas: categorias.Bebidas.unidades,
    };
  }, [ventas, categorias]);

  function alternarProducto(nombre) {
    setProductosSeleccionados((actuales) => {
      if (actuales.includes(nombre)) {
        setEjesProductos((ejes) => {
          const siguiente = { ...ejes };
          delete siguiente[nombre];
          return siguiente;
        });
        return actuales.filter((x) => x !== nombre);
      }
      if (actuales.length >= MAX_PRODUCTOS) return actuales;
      setEjesProductos((ejes) => ({ ...ejes, [nombre]: ejeActivo }));
      return [...actuales, nombre];
    });
  }

  function serieGrafica(id, label, indice, eje = 'izquierdo') {
    const color = COLORES[indice % COLORES.length];
    const tipoGrafica = eje === 'derecho' ? tipoGraficaEje2 : tipoGraficaEje1;
    if (tipoGrafica === 'lineas') {
      return <Line key={id} yAxisId={eje} type="monotone" dataKey={id} name={label} stroke={color} strokeWidth={2.5} dot={{ r: 3 }} />;
    }
    if (tipoGrafica === 'area') {
      return <Area key={id} yAxisId={eje} type="monotone" dataKey={id} name={label} stroke={color} fill={color} fillOpacity={0.14} />;
    }
    return <Bar key={id} yAxisId={eje} dataKey={id} name={label} fill={color} radius={[4, 4, 0, 0]} />;
  }

  const seriesPrincipales = useMemo(() => metricas.map((id) => {
    const m = METRICAS_TIEMPO.find((x) => x.id === id);
    return {
      ...m,
      eje: ejesMetricas[id] || m?.eje || 'izquierdo',
    };
  }), [metricas, ejesMetricas]);

  const usaEjeDerecho = seriesPrincipales.some((s) => s.eje === 'derecho') || seriesProductos.some((s) => s.eje === 'derecho');

  function ListaProductos({ titulo, productosLista, busqueda, setBusqueda }) {
    return (
      <div className="panel" style={{ margin: 0, padding: 14, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', marginBottom: 8 }}>
          <strong>{titulo}</strong>
          <span className="subtitulo">{productosLista.length.toLocaleString('es-MX')} productos</span>
        </div>
        <input
          type="search"
          placeholder={`Buscar en ${titulo.toLowerCase()}...`}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ width: '100%', marginBottom: 10 }}
        />
        <div style={{ maxHeight: 290, overflowY: 'auto', border: '1px solid var(--linea)', borderRadius: 8, padding: 8 }}>
          {productosLista.length === 0 ? (
            <div className="subtitulo" style={{ padding: 8 }}>No hay productos que coincidan.</div>
          ) : productosLista.map((nombre) => {
            const checked = productosSeleccionados.includes(nombre);
            const limite = !checked && productosSeleccionados.length >= MAX_PRODUCTOS;
            return (
              <label key={nombre} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 6px', fontSize: '0.84rem', cursor: limite ? 'not-allowed' : 'pointer', opacity: limite ? 0.5 : 1 }}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={limite}
                  onChange={() => alternarProducto(nombre)}
                  style={{ width: 'auto', margin: 0 }}
                />
                <span>{nombre}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="pagina-ancha" style={{ marginTop: -18 }}>
      <div className="panel" style={{ paddingTop: 14 }}>
        <h2 style={{ marginBottom: 2 }}>Gráfica comercial de ventas</h2>
        <p className="subtitulo" style={{ marginBottom: 14 }}>
          Visualiza la evolución de ventas y agrega productos de Alimentos o Bebidas directamente a la misma gráfica para compararlos en el tiempo.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 12, marginBottom: 18 }}>
          <div className="panel" style={{ padding: 14, margin: 0 }}><div style={{ fontSize: '0.72rem', color: 'var(--texto-sutil)', textTransform: 'uppercase' }}>Ventas</div><strong style={{ fontSize: '1.2rem' }}>{formatoMoneda(kpis.totalVentas)}</strong></div>
          <div className="panel" style={{ padding: 14, margin: 0 }}><div style={{ fontSize: '0.72rem', color: 'var(--texto-sutil)', textTransform: 'uppercase' }}>Tickets</div><strong style={{ fontSize: '1.2rem' }}>{kpis.tickets.toLocaleString('es-MX')}</strong></div>
          <div className="panel" style={{ padding: 14, margin: 0 }}><div style={{ fontSize: '0.72rem', color: 'var(--texto-sutil)', textTransform: 'uppercase' }}>Ticket promedio</div><strong style={{ fontSize: '1.2rem' }}>{formatoMoneda(kpis.ticketPromedio)}</strong></div>
          <div className="panel" style={{ padding: 14, margin: 0 }}><div style={{ fontSize: '0.72rem', color: 'var(--texto-sutil)', textTransform: 'uppercase' }}>Alimentos</div><strong style={{ fontSize: '1.2rem' }}>{formatoMoneda(kpis.alimentos)}</strong><div className="subtitulo" style={{ marginTop: 3 }}>{formatoValor(kpis.unidadesAlimentos, 'decimal')} unidades</div></div>
          <div className="panel" style={{ padding: 14, margin: 0 }}><div style={{ fontSize: '0.72rem', color: 'var(--texto-sutil)', textTransform: 'uppercase' }}>Bebidas</div><strong style={{ fontSize: '1.2rem' }}>{formatoMoneda(kpis.bebidas)}</strong><div className="subtitulo" style={{ marginTop: 3 }}>{formatoValor(kpis.unidadesBebidas, 'decimal')} unidades</div></div>
        </div>

        {error && <p style={{ color: '#a33232', marginBottom: 14 }}>{error}</p>}
        {avisos.map((aviso) => <p key={aviso} style={{ color: '#8a641d', marginBottom: 8 }}>{aviso}</p>)}

        <div className="filtro-fecha" style={{ marginBottom: 18, alignItems: 'end' }}>
          <div><label>Desde</label><input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} /></div>
          <div><label>Hasta</label><input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} /></div>
          <div>
            <label>Ver por</label>
            <select value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value)}>
              <option value="dia">Día</option><option value="mes">Mes</option><option value="anio">Año</option>
            </select>
          </div>
          <div>
            <label>Gráfica Eje 1</label>
            <select value={tipoGraficaEje1} onChange={(e) => setTipoGraficaEje1(e.target.value)}>
              {TIPOS_GRAFICA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label>Gráfica Eje 2</label>
            <select value={tipoGraficaEje2} onChange={(e) => setTipoGraficaEje2(e.target.value)}>
              {TIPOS_GRAFICA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label>Eje de selección</label>
            <select value={ejeActivo} onChange={(e) => setEjeActivo(e.target.value)}>
              <option value="izquierdo">Eje 1 · Izquierdo</option>
              <option value="derecho">Eje 2 · Derecho</option>
            </select>
          </div>
          <button className="boton" onClick={consultar} disabled={cargando || !fechaInicio || !fechaFin}>{cargando ? 'Cargando…' : 'Consultar'}</button>
        </div>

        {datosGrafica.length === 0 && !cargando ? (
          <p className="estado-vacio">No hay ventas registradas en el período seleccionado.</p>
        ) : (
          <div style={{ width: '100%', height: 440 }}>
            <ResponsiveContainer>
              <ComposedChart data={datosGrafica} margin={{ top: 8, right: 24, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--linea)" />
                <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="izquierdo" tick={{ fontSize: 11 }} tickFormatter={(v) => Number(v || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })} width={82} label={{ value: 'Eje 1', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
                {usaEjeDerecho && <YAxis yAxisId="derecho" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => Number(v || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })} width={82} label={{ value: 'Eje 2', angle: 90, position: 'insideRight', style: { fontSize: 11 } }} />}
                <Tooltip
                  formatter={(valor, nombre, item) => {
                    const principal = seriesPrincipales.find((x) => x.id === item?.dataKey);
                    const producto = seriesProductos.find((x) => x.id === item?.dataKey);
                    return [formatoValor(valor, principal?.formato || producto?.formato || 'moneda'), nombre];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
                {seriesPrincipales.map((s, i) => serieGrafica(s.id, s.label, i, s.eje))}
                {seriesProductos.map((s, i) => serieGrafica(s.id, s.nombre, i + seriesPrincipales.length, s.eje))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        <div style={{ marginTop: 18, borderTop: '1px solid var(--linea)', paddingTop: 14 }}>
          <strong style={{ display: 'block', fontSize: '0.82rem', marginBottom: 4 }}>Indicadores visibles en la gráfica</strong>
          <div className="subtitulo" style={{ marginBottom: 9 }}>Eje activo: <strong>{ejeActivo === 'izquierdo' ? 'Eje 1' : 'Eje 2'}</strong>. Todo indicador o producto nuevo que marques se asignará a ese eje.</div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {METRICAS_TIEMPO.map((m) => <CheckboxMetrica key={m.id} id={m.id} label={m.label} seleccionadas={metricas} setSeleccionadas={setMetricas} ejesMetricas={ejesMetricas} setEjesMetricas={setEjesMetricas} ejeActivo={ejeActivo} />)}
          </div>
        </div>

        <div style={{ marginTop: 28, borderTop: '2px solid var(--linea)', paddingTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginBottom: 14 }}>
            <div>
              <h3 style={{ marginBottom: 2 }}>Agregar productos a la gráfica principal</h3>
              <p className="subtitulo" style={{ margin: 0 }}>
                Marca productos de Alimentos o Bebidas. Cada producto nuevo se agregará a la gráfica principal en el eje que tengas activo arriba.
              </p>
            </div>
            <div style={{ minWidth: 190 }}>
              <label>Graficar productos por</label>
              <select value={metricaProducto} onChange={(e) => setMetricaProducto(e.target.value)} style={{ width: '100%' }}>
                <option value="importe">Importe vendido</option>
                <option value="unidades">Unidades vendidas</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <div className="subtitulo">
              Seleccionados: <strong>{productosSeleccionados.length}</strong> de {MAX_PRODUCTOS} máximo
            </div>
            {productosSeleccionados.length > 0 && (
              <button type="button" className="boton" onClick={() => { setProductosSeleccionados([]); setEjesProductos({}); }}>Limpiar productos</button>
            )}
          </div>

          {productosSeleccionados.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {productosSeleccionados.map((nombre) => (
                <button
                  key={nombre}
                  type="button"
                  onClick={() => alternarProducto(nombre)}
                  title="Quitar de la gráfica"
                  style={{ border: '1px solid var(--linea)', background: 'var(--panel)', borderRadius: 999, padding: '6px 10px', cursor: 'pointer', fontSize: '0.8rem' }}
                >
                  {nombre} · {ejesProductos[nombre] === 'derecho' ? 'E2' : 'E1'} ×
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
            <ListaProductos titulo="Alimentos" productosLista={alimentosFiltrados} busqueda={buscarAlimento} setBusqueda={setBuscarAlimento} />
            <ListaProductos titulo="Bebidas" productosLista={bebidasFiltradas} busqueda={buscarBebida} setBusqueda={setBuscarBebida} />
          </div>
        </div>
      </div>
    </div>
  );
}
