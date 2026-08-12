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

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      const [v, p, pg, c] = await Promise.all([
        supabase.from('barman_ventas').select('venta_id, fecha, total_venta, propina, mesero_nombre, seccion_nombre'),
        supabase.from('barman_productos').select('producto_nombre, categoria, cantidad, importe_lista, es_modificador'),
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

  const topProductosIngreso = useMemo(() => {
    const mapa = {};
    for (const p of productos) {
      if (p.es_modificador) continue;
      const nombre = p.producto_nombre;
      if (!mapa[nombre]) mapa[nombre] = { ingreso: 0, categoria: p.categoria };
      mapa[nombre].ingreso += Number(p.importe_lista || 0);
    }
    return Object.entries(mapa)
      .map(([nombre, d]) => ({ nombre, ingreso: d.ingreso, categoria: d.categoria }))
      .sort((a, b) => b.ingreso - a.ingreso)
      .slice(0, 10);
  }, [productos]);

  const mixCategoria = useMemo(() => {
    let alimento = 0, bebida = 0;
    for (const p of productos) {
      if (p.es_modificador) continue;
      if (p.categoria === 'bebida') bebida += Number(p.importe_lista || 0);
      else alimento += Number(p.importe_lista || 0);
    }
    const total = alimento + bebida;
    return { alimento, bebida, total, pctAlimento: total ? (alimento / total) * 100 : 0, pctBebida: total ? (bebida / total) * 100 : 0 };
  }, [productos]);

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

  const [horasDesde1, setHorasDesde1] = useState('');
  const [horasHasta1, setHorasHasta1] = useState('');
  const [compararHoras, setCompararHoras] = useState(false);
  const [horasDesde2, setHorasDesde2] = useState('');
  const [horasHasta2, setHorasHasta2] = useState('');

  const porHora = useMemo(() => {
    const periodo1 = calcularVentaPorHora(filtrarVentasPorRango(ventas, horasDesde1, horasHasta1));
    const periodo2 = compararHoras ? calcularVentaPorHora(filtrarVentasPorRango(ventas, horasDesde2, horasHasta2)) : null;

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
  }, [ventas, horasDesde1, horasHasta1, compararHoras, horasDesde2, horasHasta2]);

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

        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20 }}>
          {/* Top productos */}
          <TarjetaSeccion titulo="Productos más vendidos" subtitulo="Por ingreso generado — top 10">
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={topProductosIngreso} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--linea)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatoMoneda(v)} />
                  <YAxis type="category" dataKey="nombre" width={150} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatoMoneda(v)} />
                  <Bar dataKey="ingreso" radius={[0, 4, 4, 0]}>
                    {topProductosIngreso.map((d, i) => (
                      <Cell key={i} fill={d.categoria === 'bebida' ? TEAL : CORAL} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: '0.78rem', color: 'var(--texto-sutil)' }}>
              <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: CORAL, marginRight: 5 }} />Alimentos</span>
              <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: TEAL, marginRight: 5 }} />Bebidas</span>
            </div>
          </TarjetaSeccion>

          {/* Mix alimentos/bebidas */}
          <TarjetaSeccion titulo="Mezcla de venta" subtitulo="Alimentos vs. bebidas">
            <div style={{ display: 'flex', height: 28, borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ width: `${mixCategoria.pctAlimento}%`, background: CORAL }} />
              <div style={{ width: `${mixCategoria.pctBebida}%`, background: TEAL }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span><span style={{ color: CORAL, fontWeight: 700 }}>●</span> Alimentos — {mixCategoria.pctAlimento.toFixed(0)}% ({formatoMoneda(mixCategoria.alimento)})</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginTop: 4 }}>
              <span><span style={{ color: TEAL, fontWeight: 700 }}>●</span> Bebidas — {mixCategoria.pctBebida.toFixed(0)}% ({formatoMoneda(mixCategoria.bebida)})</span>
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
          <div className="filtro-fecha" style={{ marginBottom: 4 }}>
            <div>
              <label>Desde</label>
              <input type="date" value={horasDesde1} onChange={(e) => setHorasDesde1(e.target.value)} />
            </div>
            <div>
              <label>Hasta</label>
              <input type="date" value={horasHasta1} onChange={(e) => setHorasHasta1(e.target.value)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={compararHoras}
                  onChange={(e) => setCompararHoras(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                Comparar con otro período
              </label>
            </div>
          </div>

          {compararHoras && (
            <div className="filtro-fecha" style={{ marginBottom: 12 }}>
              <div>
                <label>Desde (período 2)</label>
                <input type="date" value={horasDesde2} onChange={(e) => setHorasDesde2(e.target.value)} />
              </div>
              <div>
                <label>Hasta (período 2)</label>
                <input type="date" value={horasHasta2} onChange={(e) => setHorasHasta2(e.target.value)} />
              </div>
            </div>
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
                  name={horasDesde1 || horasHasta1 ? `${horasDesde1 || '…'} a ${horasHasta1 || '…'}` : 'Período 1'}
                  fill={NAVY}
                  radius={[4, 4, 0, 0]}
                />
                {compararHoras && (
                  <Bar
                    dataKey="periodo2"
                    name={horasDesde2 || horasHasta2 ? `${horasDesde2 || '…'} a ${horasHasta2 || '…'}` : 'Período 2'}
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
