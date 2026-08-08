'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { formatoMoneda, NOMBRES_TIPO } from '../../../lib/format';

function primerDiaDelMes() {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
}
function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

const ACTIVIDADES = ['operacion', 'inversion', 'financiamiento'];

export default function FlujoCaja() {
  const [fechaInicio, setFechaInicio] = useState(primerDiaDelMes());
  const [fechaFin, setFechaFin] = useState(hoyISO());
  const [detalle, setDetalle] = useState([]);
  const [cargando, setCargando] = useState(false);

  async function cargar() {
    setCargando(true);
    const { data, error } = await supabase
      .from('v_flujo_caja_detalle')
      .select('*')
      .gte('fecha', fechaInicio)
      .lte('fecha', fechaFin)
      .order('fecha');

    if (!error) setDetalle(data || []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalesPorActividad = Object.fromEntries(
    ACTIVIDADES.map((a) => [
      a,
      detalle.filter((d) => d.actividad === a).reduce((s, d) => s + Number(d.movimiento_neto), 0),
    ])
  );
  const flujoNeto = ACTIVIDADES.reduce((s, a) => s + totalesPorActividad[a], 0);

  return (
    <div className="panel">
      <h2>Flujo de Caja</h2>
      <p className="subtitulo">
        Entradas y salidas de efectivo (caja y bancos), clasificadas por tipo de actividad.
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

      {detalle.length === 0 && !cargando ? (
        <p className="estado-vacio">No hay movimientos de efectivo en este período.</p>
      ) : (
        <table className="reporte">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Concepto</th>
              <th>Cuenta contraria</th>
              <th className="monto">Monto</th>
            </tr>
          </thead>
          <tbody>
            {ACTIVIDADES.map((actividad) => (
              <>
                <tr className="grupo" key={`grupo-${actividad}`}>
                  <td colSpan={4}>{NOMBRES_TIPO[actividad]}</td>
                </tr>
                {detalle
                  .filter((d) => d.actividad === actividad)
                  .map((d, i) => (
                    <tr key={`${actividad}-${i}`}>
                      <td>{d.fecha}</td>
                      <td className="nombre">{d.concepto}</td>
                      <td className="nombre">
                        {d.cuenta_contraria_codigo} — {d.cuenta_contraria_nombre}
                      </td>
                      <td className={`monto ${Number(d.movimiento_neto) >= 0 ? 'positivo' : 'negativo'}`}>
                        {formatoMoneda(d.movimiento_neto)}
                      </td>
                    </tr>
                  ))}
                <tr className="subtotal" key={`subtotal-${actividad}`}>
                  <td colSpan={3}>Total {NOMBRES_TIPO[actividad].toLowerCase()}</td>
                  <td className={`monto ${totalesPorActividad[actividad] >= 0 ? 'positivo' : 'negativo'}`}>
                    {formatoMoneda(totalesPorActividad[actividad])}
                  </td>
                </tr>
              </>
            ))}
            <tr className="subtotal">
              <td colSpan={3}>Flujo neto del período</td>
              <td className={`monto ${flujoNeto >= 0 ? 'positivo' : 'negativo'}`}>
                {formatoMoneda(flujoNeto)}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
