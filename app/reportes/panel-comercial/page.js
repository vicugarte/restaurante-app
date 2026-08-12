'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import { supabase } from '../../../lib/supabaseClient';
import { formatoMoneda } from '../../../lib/format';

const NAVY = '#0b2545';
const CORAL = '#e8603c';
const TEAL = '#0fa8c2';
const ROSA = '#eb9dc2';
const VERDE = '#1b7a5e';
const PALETA = [CORAL, TEAL, NAVY, ROSA, VERDE, '#c1443b', '#756a5c', '#9c6b30'];
const TONOS_NARANJA = ['#e8603c', '#ef7d5c', '#f3986f', '#f7b394', '#fbceb9', '#fee4d6', '#ffdcc4', '#ffcaa8', '#ffe0c2', '#fff0e3'];
const TONOS_AZUL = ['#0b2545', '#173a68', '#24508c', '#3268ab', '#5487c4', '#7ea8d8', '#9fc0e6', '#c2d8f0', '#132f56', '#1e4577'];
const NOMBRES_MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function claveSemana(fechaStr) {
  const d = new Date(`${fechaStr}T00:00:00`);
  const dia = d.getDay();
  const diff = (dia === 0 ? -6 : 1) - dia;
  const lunes = new Date(d);
  lunes.setDate(d.getDate() + diff);
  return lunes.toISOString().slice(0, 10);
}
function etiquetaSemana(claveLunes) {
  const lunes = new Date(`${claveLunes}T00:00:00`);
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  const fmt = (d) => `${d.getDate()}/${d.getMonth() + 1}`;
  return `${fmt(lunes)}-${fmt(domingo)}`;
}
function obtenerAnios(lista) {
  return [...new Set(lista.map((v) => v.fecha?.slice(0, 4)).filter(Boolean))].sort();
}
function obtenerMesesDisponibles(lista, anio) {
  const filtradas = anio ? lista.filter((v) => v.fecha?.slice(0, 4) === anio) : lista;
  return [...new Set(filtradas.map((v) => v.fecha?.slice(5, 7)).filter(Boolean))].sort();
}
function obtenerSemanasDisponibles(lista, anio, meses) {
  let filtradas = lista;
  if (anio) filtradas = filtradas.filter((v) => v.fecha?.slice(0, 4) === anio);
  if (meses && meses.length > 0) filtradas = filtradas.filter((v) => meses.includes(v.fecha?.slice(5, 7)));
  return [...new Set(filtradas.map((v) => claveSemana(v.fecha.slice(0, 10))))].sort();
}
function filtrarPorAnioMesSemana(lista, anio, meses, semanas) {
  return lista.filter((v) => {
    if (!v.fecha) return false;
    const f = v.fecha.slice(0, 10);
    if (anio && f.slice(0, 4) !== anio) return false;
    if (meses && meses.length > 0 && !meses.includes(f.slice(5, 7))) return false;
    if (semanas && semanas.length > 0 && !semanas.includes(claveSemana(f))) return false;
    return true;
  });
}

function FiltroPeriodo({ ventasBase, anio, setAnio, meses, setMeses, semanas, setSemanas, titulo }) {
  const anios = useMemo(() => obtenerAnios(ventasBase), [ventasBase]);
  const mesesDisp = useMemo(() => obtenerMesesDisponibles(ventasBase, anio), [ventasBase, anio]);
  const semanasDisp = useMemo(() => obtenerSemanasDisponibles(ventasBase, anio, meses), [ventasBase, anio, meses]);

  function cambiarAnio(a) {
    setAnio(a);
    setMeses([]);
    setSemanas([]);
  }
  function alternarMes(m) {
    setMeses(meses.includes(m) ? meses.filter((x) => x !== m) : [...meses, m]);
    setSemanas([]);
  }
  function alternarSemana(s) {
    setSemanas(semanas.includes(s) ? semanas.filter((x) => x !== s) : [...semanas, s]);
  }

  return (
    <div style={{ marginBottom: 12, border: '1px solid var(--linea)', borderRadius: 8, padding: '10px 12px', background: '#faf7f0' }}>
      {titulo && <p style={{ fontSize: '0.78rem', fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>{titulo}</p>}
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: '0.74rem', color: 'var(--texto-sutil)' }}>Año</label>
        <select value={anio} onChange={(e) => cambiarAnio(e.target.value)} style={{ maxWidth: 180 }}>
          <option value="">Total período</option>
          {anios.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: '0.74rem', color: 'var(--texto-sutil)' }}>Mes(es)</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
          {mesesDisp.map((m) => (
            <label
              key={m}
              style={{
                display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.74rem',
                border: '1px solid var(--linea)', borderRadius: 6, padding: '3px 7px',
                background: meses.includes(m) ? 'var(--acento-suave)' : '#fff', cursor: 'pointer',
              }}
            >
              <input type="checkbox" checked={meses.includes(m)} onChange={() => alternarMes(m)} style={{ width: 'auto' }} />
              {NOMBRES_MES[parseInt(m, 10) - 1]}
            </label>
          ))}
        </div>
      </div>
      <div>
        <label style={{ fontSize: '0.74rem', color: 'var(--texto-sutil)' }}>Semana(s)</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 4, maxHeight: 70, overflowY: 'auto' }}>
          {semanasDisp.map((s) => (
            <label
              key={s}
              style={{
                display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.7rem',
                border: '1px solid var(--linea)', borderRadius: 6, padding: '3px 7px',
                background: semanas.includes(s) ? 'var(--acento-suave)' : '#fff', cursor: 'pointer',
              }}
            >
              <input type="checkbox" checked={semanas.includes(s)} onChange={() => alternarSemana(s)} style={{ width: 'auto' }} />
              {etiquetaSemana(s)}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function Tarjeta({ etiqueta, valor, detalle, color }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid var(--linea)',
        borderRadius: 10,
        padding: '18px 20px',
        borderTop: `4px solid ${color || CORAL}`,
      }}
    >
      <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--texto-sutil)', marginBottom: 6 }}>
        {etiqueta}
      </div>
      <div style={{ fontFamily: 'var(--fuente-datos)', fontSize: '1.6rem', fontWeight: 700, color: NAVY }}>{valor}</div>
      {detalle && <div style={{ fontSize: '0.78rem', color: 'var(--texto-sutil)', marginTop: 4 }}>{detalle}</div>}
    </div>
  );
}

function TarjetaSeccion({ titulo, subtitulo, children }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--linea)', borderRadius: 10, padding: '20px 22px', marginBottom: 20 }}>
      <h2 style={{ fontFamily: 'var(--fuente-titulo)', fontSize: '1.4rem', color: NAVY, margin: 0, letterSpacing: '0.02em' }}>{titulo}</h2>
      {subtitulo && <p className="subtitulo" style={{ marginTop: 2, marginBottom: 14 }}>{subtitulo}</p>}
      {children}
    </div>
  );
}

function FilaRanking({ nombre, valor, maxValor, color }) {
  const pct = maxValor > 0 ? Math.max(4, (valor / maxValor) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 3 }}>
        <span style={{ fontWeight: 600, color: NAVY }}>{nombre}</span>
        <span style={{ fontFamily: 'var(--fuente-datos)', color: 'var(--texto-sutil)' }}>{valor}</span>
      </div>
      <div style={{ background: '#f0ede4', borderRadius: 6, height: 8, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, background: color, height: '100%', borderRadius: 6 }} />
      </div>
    </div>
  );
}

export default function PanelComercial() {
  const [ventas, setVentas] = useState([]);
  const [productos, setProductos] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [cortesias, setCortesias] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [pmAnio, setPmAnio] = useState('');
  const [pmMeses, setPmMeses] = useState([]);
  const [pmSemanas, setPmSemanas] = useState([]);

  const [horas1Anio, setHoras1Anio] = useState('');
  const [horas1Meses, setHoras1Meses] = useState([]);
  const [horas1Semanas, setHoras1Semanas] = useState([]);
  const [compararHoras, setCompararHoras] = useState(false);
  const [horas2Anio, setHoras2Anio] = useState('');
  const [horas2Meses, setHoras2Meses] = useState([]);
  const [horas2Semanas, setHoras2Semanas] = useState([]);

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      const [v, p, pg, c] = await Promise.all([
        supabase.from('barman_ventas').select('venta_id, fecha, total_venta, propina, mesero_nombre, seccion_nombre'),
        supabase.from('barman_productos').select('venta_id, producto_nombre, categoria, cantidad, importe_lista, es_modificador'),
        supabase.from('barman_pagos').select('forma_pago, cobro_mas_propina'),
        supabase.from('barman_cortesias').select('importe_cortesia, mesero'),
      ]);
      if (!v.error) setVentas(v.data || []);
      if (!p.error) setProductos(p.data || []);
      if (!pg.error) setPagos(pg.data || []);
      if (!c.error) setCortesias(c.data || []);
      setCargando(false);
    }
    cargar();
  }, []);

  const kpis = useMemo(() => {
    const totalVentas = ventas.reduce((s, v) => s + Number(v.total_venta || 0), 0);
    const totalPropina = ventas.reduce((s, v) => s + Number(v.propina || 0), 0);
    const numTickets = ventas.length;
    const ticketProm = numTickets > 0 ? totalVentas / numTickets : 0;
    const totalCortesias = cortesias.reduce((s, c) => s + Number(c.importe_cortesia || 0), 0);
    const fechas = ventas.map((v) => v.fecha).filter(Boolean).sort();
    return {
      totalVentas, numTickets, ticketProm,
      propinaPct: totalVentas > 0 ? (totalPropina / totalVentas) * 100 : 0,
      cortesiaPct: totalVentas > 0 ? (totalCortesias / totalVentas) * 100 : 0,
      totalCortesias,
      desde: fechas[0]?.slice(0, 10),
      hasta: fechas[fechas.length - 1]?.slice(0, 10),
    };
  }, [ventas, cortesias]);

  const productosFiltradosPm = useMemo(() => {
    const ventasFiltradas = filtrarPorAnioMesSemana(ventas, pmAnio, pmMeses, pmSemanas);
    const idsValidos = new Set(ventasFiltradas.map((v) => v.venta_id));
    if (!pmAnio && pmMeses.length === 0 && pmSemanas.length === 0) return productos; // sin filtro: todo el período
    return productos.filter((p) => idsValidos.has(p.venta_id));
  }, [productos, ventas, pmAnio, pmMeses, pmSemanas]);

  const topProductosIngreso = useMemo(() => {
    const mapa = {};
    for (const p of productosFiltradosPm) {
      if (p.es_modificador) continue;
      const nombre = p.producto_nombre;
      if (!mapa[nombre]) mapa[nombre] = { ingreso: 0, categoria: p.categoria };
      mapa[nombre].ingreso += Number(p.importe_lista || 0);
    }
    const alimentos = Object.entries(mapa).filter(([, d]) => d.categoria !== 'bebida').sort((a, b) => b[1].ingreso - a[1].ingreso);
    const bebidas = Object.entries(mapa).filter(([, d]) => d.categoria === 'bebida').sort((a, b) => b[1].ingreso - a[1].ingreso);
    const conColor = (lista, tonos) => lista.map(([nombre, d], i) => ({ nombre, ingreso: d.ingreso, categoria: d.categoria, color: tonos[Math.min(i, tonos.length - 1)] }));
    return [...conColor(alimentos, TONOS_NARANJA), ...conColor(bebidas, TONOS_AZUL)]
      .sort((a, b) => b.ingreso - a.ingreso)
      .slice(0, 10);
  }, [productosFiltradosPm]);

  const mixCategoria = useMemo(() => {
    let alimento = 0, bebida = 0;
    for (const p of productosFiltradosPm) {
      if (p.es_modificador) continue;
      if (p.categoria === 'bebida') bebida += Number(p.importe_lista || 0);
      else alimento += Number(p.importe_lista || 0);
    }
    const total = alimento + bebida;
    return { alimento, bebida, total, pctAlimento: total ? (alimento / total) * 100 : 0, pctBebida: total ? (bebida / total) * 100 : 0 };
  }, [productosFiltradosPm]);

  const topMeseros = useMemo(() => {
    const mapa = {};
    for (const v of ventas) {
      const nombre = v.mesero_nombre || 'Sin asignar';
      if (!mapa[nombre]) mapa[nombre] = { ventas: 0, tickets: 0 };
      mapa[nombre].ventas += Number(v.total_venta || 0);
      mapa[nombre].tickets += 1;
    }
    return Object.entries(mapa)
      .map(([nombre, d]) => ({ nombre, ...d }))
      .sort((a, b) => b.ventas - a.ventas)
      .slice(0, 8);
  }, [ventas]);

  const porSeccion = useMemo(() => {
    const mapa = {};
    for (const v of ventas) {
      const nombre = v.seccion_nombre || 'Sin sección';
      mapa[nombre] = (mapa[nombre] || 0) + Number(v.total_venta || 0);
    }
    return Object.entries(mapa).map(([nombre, ventas]) => ({ nombre, ventas })).sort((a, b) => b.ventas - a.ventas);
  }, [ventas]);

  function calcularVentaPorHora(listaVentas) {
    const mapa = {};
    for (let h = 0; h < 24; h++) mapa[h] = 0;
    for (const v of listaVentas) {
      if (!v.fecha) continue;
      const h = new Date(v.fecha).getHours();
      mapa[h] += Number(v.total_venta || 0);
    }
    return mapa;
  }

  function filtrarVentasPorRango(listaVentas, desde, hasta) {
    return listaVentas.filter((v) => {
      if (!v.fecha) return false;
      const f = v.fecha.slice(0, 10);
      if (desde && f < desde) return false;
      if (hasta && f > hasta) return false;
      return true;
    });
  }

  const porHora = useMemo(() => {
    const ventasP1 = filtrarPorAnioMesSemana(ventas, horas1Anio, horas1Meses, horas1Semanas);
    const periodo1 = calcularVentaPorHora(ventasP1);
    const ventasP2 = compararHoras ? filtrarPorAnioMesSemana(ventas, horas2Anio, horas2Meses, horas2Semanas) : null;
    const periodo2 = ventasP2 ? calcularVentaPorHora(ventasP2) : null;

    const filas = [];
    for (let h = 0; h < 24; h++) {
      const v1 = periodo1[h] || 0;
      const v2 = periodo2 ? periodo2[h] || 0 : 0;
      if (v1 === 0 && (!periodo2 || v2 === 0)) continue; // omite horas sin venta en ningún período
      const fila = { hora: `${h}:00`, periodo1: v1 };
      if (periodo2) fila.periodo2 = v2;
      filas.push(fila);
    }
    return filas;
  }, [ventas, horas1Anio, horas1Meses, horas1Semanas, compararHoras, horas2Anio, horas2Meses, horas2Semanas]);

  const mixPago = useMemo(() => {
    const mapa = {};
    for (const p of pagos) {
      const forma = p.forma_pago || 'Otro';
      mapa[forma] = (mapa[forma] || 0) + Number(p.cobro_mas_propina || 0);
    }
    const total = Object.values(mapa).reduce((a, b) => a + b, 0);
    return Object.entries(mapa)
      .map(([forma, monto]) => ({ forma, monto, pct: total ? (monto / total) * 100 : 0 }))
      .sort((a, b) => b.monto - a.monto);
  }, [pagos]);

  const topCortesiaMesero = useMemo(() => {
    const mapa = {};
    for (const c of cortesias) {
      const nombre = c.mesero || 'Sin asignar';
      mapa[nombre] = (mapa[nombre] || 0) + Number(c.importe_cortesia || 0);
    }
    return Object.entries(mapa).map(([nombre, monto]) => ({ nombre, monto })).sort((a, b) => b.monto - a.monto).slice(0, 5);
  }, [cortesias]);

  if (cargando) {
    return (
      <div className="pagina-ancha">
        <div className="panel">
          <p className="estado-vacio">Cargando panel comercial…</p>
        </div>
      </div>
    );
  }

  const maxMesero = topMeseros[0]?.ventas || 1;
  const maxCortesia = topCortesiaMesero[0]?.monto || 1;

  return (
    <div className="pagina-ancha">
      <div className="panel" style={{ paddingTop: 14 }}>
        <h2 style={{ marginBottom: 2 }}>Panel Comercial — Charalita</h2>
        <p className="subtitulo" style={{ marginBottom: 18 }}>
          Datos reales de venta capturados en BarMan · {kpis.desde} a {kpis.hasta}
        </p>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 22 }}>
          <Tarjeta etiqueta="Ventas totales" valor={formatoMoneda(kpis.totalVentas)} color={CORAL} />
          <Tarjeta etiqueta="Tickets" valor={kpis.numTickets.toLocaleString('es-MX')} color={TEAL} />
          <Tarjeta etiqueta="Ticket promedio" valor={formatoMoneda(kpis.ticketProm)} color={NAVY} />
          <Tarjeta etiqueta="Propina promedio" valor={`${kpis.propinaPct.toFixed(1)}%`} detalle="sobre venta total" color={VERDE} />
          <Tarjeta etiqueta="Cortesías" valor={`${kpis.cortesiaPct.toFixed(1)}%`} detalle={formatoMoneda(kpis.totalCortesias)} color={ROSA} />
        </div>

        <FiltroPeriodo
          ventasBase={ventas}
          anio={pmAnio} setAnio={setPmAnio}
          meses={pmMeses} setMeses={setPmMeses}
          semanas={pmSemanas} setSemanas={setPmSemanas}
          titulo="Filtrar Productos más vendidos y Mezcla de venta"
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20 }}>
          {/* Top productos */}
          <TarjetaSeccion titulo="Productos más vendidos" subtitulo="Por ingreso generado — top 10 · naranja = alimentos, azul = bebidas">
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={topProductosIngreso} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--linea)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatoMoneda(v)} />
                  <YAxis type="category" dataKey="nombre" width={150} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatoMoneda(v)} />
                  <Bar dataKey="ingreso" radius={[0, 4, 4, 0]}>
                    {topProductosIngreso.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: '0.78rem', color: 'var(--texto-sutil)' }}>
              <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: CORAL, marginRight: 5 }} />Alimentos</span>
              <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: NAVY, marginRight: 5 }} />Bebidas</span>
            </div>
          </TarjetaSeccion>

          {/* Mix alimentos/bebidas */}
          <TarjetaSeccion titulo="Mezcla de venta" subtitulo="Alimentos vs. bebidas">
            <div style={{ display: 'flex', height: 28, borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ width: `${mixCategoria.pctAlimento}%`, background: CORAL }} />
              <div style={{ width: `${mixCategoria.pctBebida}%`, background: NAVY }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span><span style={{ color: CORAL, fontWeight: 700 }}>●</span> Alimentos — {mixCategoria.pctAlimento.toFixed(0)}% ({formatoMoneda(mixCategoria.alimento)})</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginTop: 4 }}>
              <span><span style={{ color: NAVY, fontWeight: 700 }}>●</span> Bebidas — {mixCategoria.pctBebida.toFixed(0)}% ({formatoMoneda(mixCategoria.bebida)})</span>
            </div>

            <h2 style={{ fontFamily: 'var(--fuente-titulo)', fontSize: '1.1rem', color: NAVY, marginTop: 22, marginBottom: 10 }}>
              Mix de forma de pago
            </h2>
            {mixPago.map((m) => (
              <FilaRanking key={m.forma} nombre={`${m.forma} (${m.pct.toFixed(0)}%)`} valor={formatoMoneda(m.monto)} maxValor={mixPago[0]?.monto} color={TEAL} />
            ))}
          </TarjetaSeccion>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Meseros */}
          <TarjetaSeccion titulo="Rendimiento por mesero" subtitulo="Top 8 por ventas totales">
            {topMeseros.map((m) => (
              <FilaRanking key={m.nombre} nombre={`${m.nombre} · ${m.tickets} tickets`} valor={formatoMoneda(m.ventas)} maxValor={maxMesero} color={CORAL} />
            ))}
          </TarjetaSeccion>

          {/* Secciones */}
          <TarjetaSeccion titulo="Ventas por sección" subtitulo="Áreas del restaurante">
            {porSeccion.map((s, i) => (
              <FilaRanking key={s.nombre} nombre={s.nombre} valor={formatoMoneda(s.ventas)} maxValor={porSeccion[0]?.ventas} color={PALETA[i % PALETA.length]} />
            ))}
          </TarjetaSeccion>
        </div>

        {/* Horas pico */}
        <TarjetaSeccion titulo="Horas pico" subtitulo="Ventas totales por hora del día — se omiten las horas sin venta en el período">
          <FiltroPeriodo
            ventasBase={ventas}
            anio={horas1Anio} setAnio={setHoras1Anio}
            meses={horas1Meses} setMeses={setHoras1Meses}
            semanas={horas1Semanas} setSemanas={setHoras1Semanas}
            titulo="Período 1"
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={compararHoras}
              onChange={(e) => setCompararHoras(e.target.checked)}
              style={{ width: 'auto' }}
            />
            Comparar con otro período
          </label>

          {compararHoras && (
            <FiltroPeriodo
              ventasBase={ventas}
              anio={horas2Anio} setAnio={setHoras2Anio}
              meses={horas2Meses} setMeses={setHoras2Meses}
              semanas={horas2Semanas} setSemanas={setHoras2Semanas}
              titulo="Período 2 (comparativo)"
            />
          )}

          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={porHora}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--linea)" />
                <XAxis dataKey="hora" tick={{ fontSize: 10 }} interval={0} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatoMoneda(v)} width={80} />
                <Tooltip formatter={(v) => formatoMoneda(v)} />
                <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
                <Bar
                  dataKey="periodo1"
                  name="Período 1"
                  fill={NAVY}
                  radius={[4, 4, 0, 0]}
                />
                {compararHoras && (
                  <Bar
                    dataKey="periodo2"
                    name="Período 2"
                    fill={CORAL}
                    radius={[4, 4, 0, 0]}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TarjetaSeccion>

        {/* Cortesías */}
        <TarjetaSeccion titulo="Cortesías" subtitulo={`${formatoMoneda(kpis.totalCortesias)} otorgados en el período — ${kpis.cortesiaPct.toFixed(1)}% de la venta total`}>
          {topCortesiaMesero.map((c) => (
            <FilaRanking key={c.nombre} nombre={c.nombre} valor={formatoMoneda(c.monto)} maxValor={maxCortesia} color={ROSA} />
          ))}
        </TarjetaSeccion>
      </div>
    </div>
  );
}
