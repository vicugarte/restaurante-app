'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { formatoMoneda } from '../../../lib/format';

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function BalanceGeneral() {
  const [fechaCorte, setFechaCorte] = useState(hoyISO());
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);

  async function cargar() {
    setCargando(true);
    const anioCorte = fechaCorte.slice(0, 4);
    const inicioAnioCorte = `${anioCorte}-01-01`;

    const [balance, resultadosAnteriores, resultadosActual] = await Promise.all([
      supabase.from('v_balance_general').select('*').lte('fecha', fechaCorte),
      supabase.from('v_estado_resultados').select('tipo, monto').lt('fecha', inicioAnioCorte),
      supabase
        .from('v_estado_resultados')
        .select('tipo, monto')
        .gte('fecha', inicioAnioCorte)
        .lte('fecha', fechaCorte),
    ]);

    if (!balance.error) {
      const acumulado = {};
      for (const fila of balance.data || []) {
        if (!acumulado[fila.codigo]) acumulado[fila.codigo] = { ...fila, saldo: 0 };
        acumulado[fila.codigo].saldo += Number(fila.saldo);
      }

      function sumarResultado(filas) {
        let ingresos = 0;
        let costos = 0;
        let gastos = 0;
        for (const fila of filas || []) {
          if (fila.tipo === 'ingreso') ingresos += Number(fila.monto);
          else if (fila.tipo === 'costo') costos += Number(fila.monto);
          else if (fila.tipo === 'gasto') gastos += Number(fila.monto);
        }
        return ingresos - costos - gastos;
      }

      if (!resultadosAnteriores.error && !resultadosActual.error) {
        acumulado['RES_ANTERIORES'] = {
          codigo: '3102',
          cuenta_nombre: 'Resultados de ejercicios anteriores (calculado)',
          tipo: 'capital',
          saldo: sumarResultado(resultadosAnteriores.data),
        };
        acumulado['RES_ACTUAL'] = {
          codigo: '3103',
          cuenta_nombre: `Resultado del ejercicio ${anioCorte} (calculado)`,
          tipo: 'capital',
          saldo: sumarResultado(resultadosActual.data),
        };
      }

      setFilas(Object.values(acumulado).sort((a, b) => a.codigo.localeCompare(b.codigo)));
    }
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grupos = ['activo', 'pasivo', 'capital'];
  const etiquetaGrupo = { activo: 'Activo', pasivo: 'Pasivo', capital: 'Capital' };
  const totalesPorGrupo = Object.fromEntries(
    grupos.map((g) => [g, filas.filter((f) => f.tipo === g).reduce((s, f) => s + f.saldo, 0)])
  );
  const diferencia = totalesPorGrupo.activo - (totalesPorGrupo.pasivo + totalesPorGrupo.capital);
  const cuadraBalance = Math.abs(diferencia) < 0.01;

  const ivaAcreditable = filas.find((f) => f.codigo === '1106')?.saldo || 0;
  const ivaTrasladado = filas.find((f) => f.codigo === '2106')?.saldo || 0;
  const ivaPorPagarDeterminado = filas.find((f) => f.codigo === '2111')?.saldo || 0;
  const ivaNeto = ivaTrasladado - ivaAcreditable + ivaPorPagarDeterminado;

  return (
    <div className="panel">
      <h2>Balance General</h2>
      <p className="subtitulo">Saldos acumulados de activo, pasivo y capital a una fecha de corte.</p>

      <div className="filtro-fecha">
        <div>
          <label>Fecha de corte</label>
          <input type="date" value={fechaCorte} onChange={(e) => setFechaCorte(e.target.value)} />
        </div>
        <button className="boton" onClick={cargar} disabled={cargando}>
          {cargando ? 'Cargando…' : 'Consultar'}
        </button>
      </div>

      {!cargando && (
        <div className={`mensaje ${cuadraBalance ? 'ok' : 'error'}`}>
          {cuadraBalance
            ? 'Activo = Pasivo + Capital. El balance cuadra.'
            : `El balance no cuadra. Diferencia: ${formatoMoneda(diferencia)}`}
        </div>
      )}

      {!cargando && filas.length > 0 && (
        <div className="mensaje" style={{ background: '#efe2dc' }}>
          Las líneas de Capital marcadas &quot;(calculado)&quot; se obtienen en vivo — no son pólizas
          capturadas. &quot;Resultados de ejercicios anteriores&quot; suma todo antes del 1 de enero
          del año de la fecha de corte; &quot;Resultado del ejercicio&quot; suma solo el año en curso
          hasta la fecha de corte. Así se separan correctamente sin necesitar un cierre contable
          físico cada fin de año.
        </div>
      )}

      {!cargando && filas.length > 0 && (
        <div className="mensaje" style={{ background: '#efe2dc' }}>
          {ivaNeto >= 0
            ? `IVA por pagar (determinado + pendiente de determinar): ${formatoMoneda(ivaNeto)}`
            : `IVA a favor acumulado: ${formatoMoneda(-ivaNeto)}`}
          {' — '}usa &quot;Determinación de IVA del período&quot; y luego &quot;Pago de IVA por
          pagar&quot; en Capturar movimiento cuando presentes tu declaración.
        </div>
      )}

      {filas.length === 0 && !cargando ? (
        <p className="estado-vacio">No hay movimientos hasta esta fecha.</p>
      ) : (
        <table className="reporte">
          <thead>
            <tr>
              <th>Código</th>
              <th>Cuenta</th>
              <th className="monto">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((grupo) => (
              <>
                <tr className="grupo" key={`grupo-${grupo}`}>
                  <td colSpan={3}>{etiquetaGrupo[grupo]}</td>
                </tr>
                {filas
                  .filter((f) => f.tipo === grupo)
                  .map((f) => (
                    <tr key={f.codigo}>
                      <td>{f.codigo}</td>
                      <td className="nombre">{f.cuenta_nombre}</td>
                      <td className="monto">{formatoMoneda(f.saldo)}</td>
                    </tr>
                  ))}
                <tr className="subtotal" key={`subtotal-${grupo}`}>
                  <td colSpan={2}>Total {etiquetaGrupo[grupo].toLowerCase()}</td>
                  <td className="monto">{formatoMoneda(totalesPorGrupo[grupo])}</td>
                </tr>
              </>
            ))}
            <tr className="subtotal">
              <td colSpan={2}>Pasivo + Capital</td>
              <td className="monto">
                {formatoMoneda(totalesPorGrupo.pasivo + totalesPorGrupo.capital)}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
