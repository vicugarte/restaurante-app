'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { formatoMoneda } from '../../../lib/format';
import { calcularIsrPersonaFisica, mesesEnPeriodo } from '../../../lib/tablaIsr';

function primerDiaDelMes() {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
}
function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
function periodoYaCerro(fechaFinISO) {
  const hoy = new Date();
  const inicioMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  // El período "ya cerró" si su fecha final es anterior al mes en curso.
  return fechaFinISO < inicioMesActual;
}

export default function EstadoResultados() {
  const [fechaInicio, setFechaInicio] = useState(primerDiaDelMes());
  const [fechaFin, setFechaFin] = useState(hoyISO());
  const [filas, setFilas] = useState([]);
  const [tasaIsr, setTasaIsr] = useState(30);
  const [regimenIsr, setRegimenIsr] = useState(0);
  const [tasaIva, setTasaIva] = useState(16);
  const [ivaPagadoReal, setIvaPagadoReal] = useState(0);
  const [cargando, setCargando] = useState(false);

  async function cargar() {
    setCargando(true);
    const [resultados, config, movsIva] = await Promise.all([
      supabase
        .from('v_estado_resultados')
        .select('*')
        .gte('fecha', fechaInicio)
        .lte('fecha', fechaFin),
      supabase
        .from('configuracion')
        .select('clave, valor')
        .in('clave', ['isr_tasa_estimada', 'isr_regimen', 'iva_tasa_estimada']),
      supabase
        .from('v_saldos_movimientos')
        .select('codigo, cargo, abono')
        .eq('codigo', '2111')
        .gte('fecha', fechaInicio)
        .lte('fecha', fechaFin),
    ]);

    if (!config.error) {
      for (const fila of config.data || []) {
        if (fila.clave === 'isr_tasa_estimada') setTasaIsr(Number(fila.valor));
        if (fila.clave === 'isr_regimen') setRegimenIsr(Number(fila.valor));
        if (fila.clave === 'iva_tasa_estimada') setTasaIva(Number(fila.valor));
      }
    }

    if (!movsIva.error) {
      // El pago real se identifica por cargos a 2111 (IVA por pagar) --
      // resultado de la plantilla "Pago de IVA por pagar", posterior a la
      // "Determinación de IVA del período".
      let pagado = 0;
      for (const m of movsIva.data || []) {
        if (m.codigo === '2111') pagado += Number(m.cargo);
      }
      setIvaPagadoReal(pagado);
    }

    if (!resultados.error) {
      const acumulado = {};
      for (const fila of resultados.data || []) {
        const clave = fila.codigo;
        if (!acumulado[clave]) acumulado[clave] = { ...fila, monto: 0 };
        acumulado[clave].monto += Number(fila.monto);
      }
      setFilas(Object.values(acumulado).sort((a, b) => a.codigo.localeCompare(b.codigo)));
    }
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function filasDe(seccion) {
    return filas.filter((f) => f.seccion_reporte === seccion);
  }
  function sumaDe(seccion, tipoFiltro) {
    return filas
      .filter((f) => f.seccion_reporte === seccion && (!tipoFiltro || f.tipo === tipoFiltro))
      .reduce((s, f) => s + f.monto, 0);
  }

  const ventas = sumaDe('ventas');
  const devoluciones = sumaDe('devolucion');
  // devoluciones ya viene en negativo (se registra por cargo), así que se
  // SUMA, no se resta -- restar duplicaría el signo y aumentaría ventas
  // netas en vez de disminuirlas.
  const ventasNetas = ventas + devoluciones;

  const costoVentas = sumaDe('costo_ventas');
  const utilidadBruta = ventasNetas - costoVentas;

  const gastosOperacion = sumaDe('gasto_operacion');
  const utilidadOperacion = utilidadBruta - gastosOperacion;

  const otrosIngresos = sumaDe('otros_financieros', 'ingreso');
  const gastosFinancieros = sumaDe('otros_financieros', 'gasto');
  const otrosFinancierosNeto = otrosIngresos - gastosFinancieros;

  const utilidadAntesImpuestos = utilidadOperacion + otrosFinancierosNeto;

  const impuestosReales = sumaDe('impuestos');
  const esEstimado = impuestosReales <= 0;
  let impuestos;
  if (!esEstimado) {
    impuestos = impuestosReales;
  } else if (regimenIsr === 1) {
    const meses = mesesEnPeriodo(fechaInicio, fechaFin);
    impuestos = calcularIsrPersonaFisica(utilidadAntesImpuestos, meses);
  } else {
    impuestos = Math.max(0, utilidadAntesImpuestos * (tasaIsr / 100));
  }

  const utilidadNeta = utilidadAntesImpuestos - impuestos;

  // El IVA no se estima como % de utilidad -- solo se muestra el pago
  // real capturado dentro del período (cifra de caja, no de devengo).
  const hayPagoIva = ivaPagadoReal > 0;
  const iva = ivaPagadoReal;

  const hayDatos = filas.length > 0;
  const cerrado = periodoYaCerro(fechaFin);

  return (
    <div className="panel">
      <h2>Estado de Resultados</h2>
      <p className="subtitulo">Ventas netas, utilidad bruta, operativa, antes de impuestos y neta del período.</p>

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

      {!hayDatos && !cargando ? (
        <p className="estado-vacio">No hay movimientos en este período.</p>
      ) : (
        <table className="reporte">
          <thead>
            <tr>
              <th>Código</th>
              <th>Cuenta</th>
              <th className="monto">Monto</th>
            </tr>
          </thead>
          <tbody>
            {/* VENTAS */}
            <tr className="grupo">
              <td colSpan={3}>Ventas</td>
            </tr>
            {filasDe('ventas').map((f) => (
              <tr key={f.codigo}>
                <td>{f.codigo}</td>
                <td className="nombre">{f.cuenta_nombre}</td>
                <td className="monto">{formatoMoneda(f.monto)}</td>
              </tr>
            ))}
            {filasDe('devolucion').map((f) => (
              <tr key={f.codigo}>
                <td>{f.codigo}</td>
                <td className="nombre">(-) {f.cuenta_nombre}</td>
                <td className="monto">{formatoMoneda(f.monto)}</td>
              </tr>
            ))}
            <tr className="subtotal">
              <td colSpan={2}>Ventas netas</td>
              <td className="monto">{formatoMoneda(ventasNetas)}</td>
            </tr>

            {/* COSTO DE VENTAS */}
            <tr className="grupo">
              <td colSpan={3}>Costo de ventas</td>
            </tr>
            {filasDe('costo_ventas').map((f) => (
              <tr key={f.codigo}>
                <td>{f.codigo}</td>
                <td className="nombre">{f.cuenta_nombre}</td>
                <td className="monto">{formatoMoneda(f.monto)}</td>
              </tr>
            ))}
            <tr className="subtotal">
              <td colSpan={2}>Utilidad bruta</td>
              <td className="monto">{formatoMoneda(utilidadBruta)}</td>
            </tr>

            {/* GASTOS DE OPERACION */}
            <tr className="grupo">
              <td colSpan={3}>Gastos de operación</td>
            </tr>
            {filasDe('gasto_operacion').map((f) => (
              <tr key={f.codigo}>
                <td>{f.codigo}</td>
                <td className="nombre">{f.cuenta_nombre}</td>
                <td className="monto">{formatoMoneda(f.monto)}</td>
              </tr>
            ))}
            <tr className="subtotal">
              <td colSpan={2}>Utilidad de operación</td>
              <td className="monto">{formatoMoneda(utilidadOperacion)}</td>
            </tr>

            {/* OTROS INGRESOS Y GASTOS FINANCIEROS */}
            <tr className="grupo">
              <td colSpan={3}>Otros ingresos y gastos financieros</td>
            </tr>
            {filasDe('otros_financieros')
              .filter((f) => f.tipo === 'ingreso')
              .map((f) => (
                <tr key={f.codigo}>
                  <td>{f.codigo}</td>
                  <td className="nombre">{f.cuenta_nombre}</td>
                  <td className="monto">{formatoMoneda(f.monto)}</td>
                </tr>
              ))}
            {filasDe('otros_financieros')
              .filter((f) => f.tipo === 'gasto')
              .map((f) => (
                <tr key={f.codigo}>
                  <td>{f.codigo}</td>
                  <td className="nombre">(-) {f.cuenta_nombre}</td>
                  <td className="monto">{formatoMoneda(f.monto)}</td>
                </tr>
              ))}
            <tr className="subtotal">
              <td colSpan={2}>Utilidad antes de impuestos</td>
              <td className="monto">{formatoMoneda(utilidadAntesImpuestos)}</td>
            </tr>

            {/* IMPUESTOS */}
            <tr className="grupo">
              <td colSpan={3}>Impuestos</td>
            </tr>
            <tr>
              <td></td>
              <td className="nombre">
                {!esEstimado
                  ? 'Pago de impuestos (ISR) — dato real capturado'
                  : cerrado
                  ? regimenIsr === 1
                    ? 'Provisión de ISR — tabla progresiva SAT 2026 (período cerrado, sin póliza real capturada)'
                    : `Provisión de ISR (${tasaIsr}% — período cerrado, sin póliza real capturada)`
                  : regimenIsr === 1
                  ? `Provisión estimada de ISR — tabla progresiva SAT 2026 (mes en curso)`
                  : `Provisión estimada de ISR (${tasaIsr}% — mes en curso)`}
              </td>
              <td className="monto">{formatoMoneda(impuestos)}</td>
            </tr>

            <tr className="subtotal">
              <td colSpan={2}>{esEstimado ? 'Utilidad neta estimada' : 'Utilidad neta'}</td>
              <td className={`monto ${utilidadNeta >= 0 ? 'positivo' : 'negativo'}`}>
                {formatoMoneda(utilidadNeta)}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {hayDatos && (
        <div className="mensaje" style={{ background: '#efe2dc', marginTop: 16 }}>
          <strong>
            Pago de IVA realizado dentro del período: {formatoMoneda(iva)}
          </strong>{' '}
          ({hayPagoIva
            ? 'dato real capturado'
            : 'sin pagos de IVA registrados en este período'}). Nota: el pago que capturas en un mes
          normalmente corresponde al IVA determinado del mes anterior, no al de este mismo mes — por
          eso esta cifra es de <strong>caja</strong> (cuándo salió el dinero), no de devengo. El IVA{' '}
          <strong>no reduce la utilidad</strong> — es un impuesto de traslado, no un gasto del
          restaurante — así que no se resta arriba. Se muestra aquí solo como referencia de flujo de
          efectivo.
        </div>
      )}

      {hayDatos && esEstimado && !cerrado && (
        <div className="mensaje" style={{ background: '#efe2dc', marginTop: 12 }}>
          {regimenIsr === 1 ? (
            <>
              El <strong>ISR</strong> mostrado es una estimación usando la tarifa progresiva oficial
              del SAT para 2026 (Persona Física con Actividad Empresarial, Anexo 8 RMF), aplicada solo
              sobre el período seleccionado — no acumula desde enero ni acredita pagos provisionales
              previos del ejercicio.
            </>
          ) : (
            <>
              El <strong>ISR</strong> mostrado es una estimación ({tasaIsr}% de la utilidad antes de
              impuestos, configurable en Configuración).
            </>
          )}{' '}
          Como el período seleccionado incluye el mes en curso (que todavía no termina), este número
          puede cambiar. Cuando captures el pago real con la plantilla &quot;Pago de impuestos
          (ISR)&quot; en Capturar movimiento, este reporte va a mostrar el dato real en su lugar.
        </div>
      )}
    </div>
  );
}
