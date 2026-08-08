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

export default function NoDeducibles() {
  const [fechaInicio, setFechaInicio] = useState(primerDiaDelMes());
  const [fechaFin, setFechaFin] = useState(hoyISO());
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);

  async function cargar() {
    setCargando(true);
    const { data, error } = await supabase
      .from('v_movimientos_no_deducibles')
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

  const total = filas.reduce((s, f) => s + Number(f.cargo), 0);

  return (
    <div className="panel">
      <h2>Gastos y costos sin factura</h2>
      <p className="subtitulo">
        Movimientos marcados como &quot;sin factura&quot; (CFDI) en el período — normalmente no deducibles para ISR.
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
        <p className="estado-vacio">No hay movimientos sin factura en este período.</p>
      ) : (
        <table className="reporte">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Concepto</th>
              <th>Cuenta</th>
              <th className="monto">Monto</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i}>
                <td>{f.fecha}</td>
                <td className="nombre">{f.concepto}</td>
                <td className="nombre">
                  {f.codigo} — {f.cuenta_nombre}
                </td>
                <td className="monto">{formatoMoneda(f.cargo)}</td>
              </tr>
            ))}
            <tr className="subtotal">
              <td colSpan={3}>Total sin factura</td>
              <td className="monto negativo">{formatoMoneda(total)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
