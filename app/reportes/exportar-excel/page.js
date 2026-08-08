'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../../lib/supabaseClient';
import { formatoMoneda } from '../../../lib/format';
import {
  METRICAS,
  CODIGOS_NOMINA,
  CODIGOS_SERVICIOS,
  CODIGOS_COMPRA_INVENTARIO,
  NOMBRE_TIPO,
  slugProveedor,
  etiquetaSerie,
  construirDatosPorPeriodo,
} from '../../../lib/analisisDatos';

function primerDiaAnioActual() {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), 0, 1).toISOString().slice(0, 10);
}
function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

const DETALLES_ESPECIALES = {
  ventas_netas: { etiqueta: 'Detalle VN', hoja: 'Detalle VN' },
  costo_ventas: { etiqueta: 'Detalle CV', hoja: 'Detalle CV' },
  gastos_operacion: { etiqueta: 'Detalle GO', hoja: 'Detalle GO' },
};

const COLUMNAS_DETALLE = [
  { key: 'Fecha', ancho: 12 },
  { key: 'Capturado el', ancho: 20 },
  { key: 'Concepto', ancho: 35 },
  { key: 'Referencia', ancho: 16 },
  { key: 'Proveedor', ancho: 25 },
  { key: 'Con factura', ancho: 10 },
  { key: 'Cuenta', ancho: 30 },
  { key: 'Cargo', ancho: 14 },
  { key: 'Abono', ancho: 14 },
];

function Checkbox({ lista, setLista, id, etiqueta }) {
  function alternar() {
    setLista(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  }
  return (
    <label style={{ display: 'block', fontSize: '0.85rem', margin: '5px 0' }}>
      <input type="checkbox" checked={lista.includes(id)} onChange={alternar} style={{ width: 'auto', marginRight: 8 }} />
      {etiqueta}
    </label>
  );
}

function GrupoDesplegable({ titulo, abierto, onToggle, textoAbrir, textoCerrar, children }) {
  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={onToggle}>
        <strong style={{ fontSize: '0.82rem' }}>▸ {titulo}</strong>
        <span style={{ fontSize: '0.72rem', color: 'var(--texto-sutil)' }}>{abierto ? textoCerrar : textoAbrir}</span>
      </div>
      {children}
    </div>
  );
}

export default function ExportarExcel() {
  const [fechaInicio, setFechaInicio] = useState(primerDiaAnioActual());
  const [fechaFin, setFechaFin] = useState(hoyISO());
  const [periodicidad, setPeriodicidad] = useState('mes');
  const [seleccion, setSeleccion] = useState(['ventas_netas', 'costo_ventas', 'utilidad_bruta', 'margen_bruto_pct', 'margen_neto_pct']);
  const [detallesIncluidos, setDetallesIncluidos] = useState([]);
  const [vistaActiva, setVistaActiva] = useState('resumen');
  const [cuentas, setCuentas] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [comprasProveedor, setComprasProveedor] = useState([]);
  const [detalleCompleto, setDetalleCompleto] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [expandido, setExpandido] = useState({ compra_inventario: false, nomina: false, servicios: false });

  useEffect(() => {
    async function cargarCuentas() {
      const { data, error } = await supabase
        .from('cuentas')
        .select('codigo, nombre, tipo, seccion_reporte')
        .eq('activa', true)
        .order('codigo');
      if (!error) setCuentas(data || []);
    }
    cargarCuentas();
  }, []);

  async function consultar() {
    setCargando(true);
    const [saldos, compras, detalle] = await Promise.all([
      supabase
        .from('v_saldos_movimientos')
        .select('codigo, tipo, fecha, saldo')
        .gte('fecha', fechaInicio)
        .lte('fecha', fechaFin),
      supabase
        .from('v_compras_proveedores')
        .select('fecha, proveedor_nombre, monto')
        .gte('fecha', fechaInicio)
        .lte('fecha', fechaFin),
      supabase
        .from('v_detalle_completo')
        .select('*')
        .gte('fecha', fechaInicio)
        .lte('fecha', fechaFin),
    ]);
    if (!saldos.error) setMovimientos(saldos.data || []);
    if (!compras.error) setComprasProveedor((compras.data || []).filter((c) => c.proveedor_nombre));
    if (!detalle.error) setDetalleCompleto(detalle.data || []);
    else setDetalleCompleto([]);
    setCargando(false);
  }

  useEffect(() => {
    consultar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cuentaPorCodigo = useMemo(() => {
    const mapa = {};
    for (const c of cuentas) mapa[c.codigo] = c;
    return mapa;
  }, [cuentas]);

  const proveedores = useMemo(
    () => [...new Set(comprasProveedor.map((c) => c.proveedor_nombre))].sort(),
    [comprasProveedor]
  );

  const codigosEnGrupos = useMemo(
    () => new Set([...CODIGOS_NOMINA, ...CODIGOS_SERVICIOS, ...CODIGOS_COMPRA_INVENTARIO]),
    []
  );
  const opcionesCuentasPorTipo = useMemo(() => {
    const grupos = {};
    for (const c of cuentas) {
      if (codigosEnGrupos.has(c.codigo)) continue;
      if (['activo', 'pasivo', 'capital'].includes(c.tipo)) continue;
      if (!grupos[c.tipo]) grupos[c.tipo] = [];
      grupos[c.tipo].push(c);
    }
    return grupos;
  }, [cuentas, codigosEnGrupos]);

  const datos = useMemo(
    () => construirDatosPorPeriodo(movimientos, comprasProveedor, periodicidad, cuentaPorCodigo),
    [movimientos, comprasProveedor, periodicidad, cuentaPorCodigo]
  );

  const detallesActivos = useMemo(
    () =>
      Object.keys(DETALLES_ESPECIALES).filter(
        (id) => seleccion.includes(id) && detallesIncluidos.includes(id)
      ),
    [seleccion, detallesIncluidos]
  );

  useEffect(() => {
    if (vistaActiva !== 'resumen' && !detallesActivos.includes(vistaActiva)) {
      setVistaActiva('resumen');
    }
  }, [detallesActivos, vistaActiva]);

  function alternarExpandido(grupo) {
    setExpandido((prev) => ({ ...prev, [grupo]: !prev[grupo] }));
  }

  // Para cada elemento seleccionado, determina qué códigos de cuenta (o qué
  // proveedor) le corresponden, para poder filtrar el detalle real.
  function criterioParaId(id) {
    if (id === 'ventas_netas') return { tipo: 'seccion', valores: ['ventas', 'devolucion'] };
    if (id === 'costo_ventas') return { tipo: 'seccion', valores: ['costo_ventas'] };
    if (id === 'gastos_operacion') return { tipo: 'seccion', valores: ['gasto_operacion'] };
    if (id === 'grp_compra_inventario') return { tipo: 'codigo', valores: CODIGOS_COMPRA_INVENTARIO };
    if (id === 'grp_nomina') return { tipo: 'codigo', valores: CODIGOS_NOMINA };
    if (id === 'grp_servicios') return { tipo: 'codigo', valores: CODIGOS_SERVICIOS };
    if (id.startsWith('prov__')) {
      const proveedor = proveedores.find((p) => slugProveedor(p) === id);
      return proveedor ? { tipo: 'proveedor', valores: [proveedor] } : null;
    }
    if (/^\d/.test(id)) return { tipo: 'codigo', valores: [id] };
    return null; // métricas calculadas (utilidad_*, margen_*_pct) no tienen detalle propio
  }

  function construirHojaDetalle(id) {
    const criterio = criterioParaId(id);
    if (!criterio) return [];

    const filas = detalleCompleto
      .filter((d) => {
        if (criterio.tipo === 'seccion') return criterio.valores.includes(d.seccion_reporte);
        if (criterio.tipo === 'codigo') return criterio.valores.includes(d.codigo);
        if (criterio.tipo === 'proveedor') return d.proveedor_nombre === criterio.valores[0];
        return false;
      })
      .map((d) => ({
        Fecha: d.fecha,
        'Capturado el': d.creado_en,
        Concepto: d.concepto,
        Referencia: d.referencia || '',
        Proveedor: d.proveedor_nombre || '',
        'Con factura': d.con_factura ? 'Sí' : 'No',
        Cuenta: `${d.codigo} — ${d.cuenta_nombre}`,
        Cargo: Number(d.cargo) || 0,
        Abono: Number(d.abono) || 0,
      }));

    filas.sort((a, b) => a.Fecha.localeCompare(b.Fecha));
    return filas;
  }

  function alternarDetalle(id) {
    setDetallesIncluidos((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function alternarMetrica(id) {
    const estabaSeleccionada = seleccion.includes(id);
    setSeleccion((prev) =>
      estabaSeleccionada ? prev.filter((x) => x !== id) : [...prev, id]
    );
    if (estabaSeleccionada && DETALLES_ESPECIALES[id]) {
      setDetallesIncluidos((prev) => prev.filter((x) => x !== id));
    }
  }

  function descargarExcel() {
    if (seleccion.length === 0 || datos.length === 0) return;

    const encabezados = ['Período', ...seleccion.map((id) => etiquetaSerie(id, cuentaPorCodigo))];
    const filas = datos.map((fila) => [
      fila.periodo,
      ...seleccion.map((id) => (fila[id] !== undefined && fila[id] !== null ? fila[id] : 0)),
    ]);

    const hoja = XLSX.utils.aoa_to_sheet([encabezados, ...filas]);
    hoja['!cols'] = encabezados.map((h, i) => ({ wch: i === 0 ? 12 : Math.max(14, h.length) }));

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Resumen');

    for (const id of detallesActivos) {
      const filasDetalle = construirHojaDetalle(id);
      const hojaDetalle = filasDetalle.length > 0
        ? XLSX.utils.json_to_sheet(filasDetalle)
        : XLSX.utils.aoa_to_sheet([COLUMNAS_DETALLE.map((columna) => columna.key)]);
      hojaDetalle['!cols'] = COLUMNAS_DETALLE.map((columna) => ({ wch: columna.ancho }));
      XLSX.utils.book_append_sheet(libro, hojaDetalle, DETALLES_ESPECIALES[id].hoja);
    }

    const nombreArchivo = `charalita_reporte_${fechaInicio}_a_${fechaFin}.xlsx`;
    XLSX.writeFile(libro, nombreArchivo);
  }

  return (
    <div className="panel">
      <h2>Exportar a Excel</h2>
      <p className="subtitulo">
        Misma selección que la página Gráfica — elige qué columnas quieres y descarga el reporte en
        formato .xlsx. El archivo siempre incluye la hoja &quot;Resumen&quot; y, cuando actives
        &quot;Incluir detalle&quot;, agrega las hojas &quot;Detalle VN&quot;, &quot;Detalle CV&quot; y/o
        &quot;Detalle GO&quot; con las pólizas correspondientes.
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
        <div>
          <label>Ver por</label>
          <select value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value)}>
            <option value="dia">Día</option>
            <option value="mes">Mes</option>
            <option value="anio">Año</option>
          </select>
        </div>
        <button className="boton" onClick={consultar} disabled={cargando}>
          {cargando ? 'Cargando…' : 'Consultar'}
        </button>
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'flex-end',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            className={vistaActiva === 'resumen' ? 'boton' : ''}
            onClick={() => setVistaActiva('resumen')}
            style={vistaActiva === 'resumen' ? undefined : { padding: '9px 12px' }}
          >
            Resumen
          </button>
          {detallesActivos.map((id) => (
            <button
              key={id}
              type="button"
              className={vistaActiva === id ? 'boton' : ''}
              onClick={() => setVistaActiva(id)}
              style={vistaActiva === id ? undefined : { padding: '9px 12px' }}
            >
              {DETALLES_ESPECIALES[id].etiqueta}
            </button>
          ))}
        </div>
      </div>

      <h2 style={{ fontSize: '0.85rem', color: 'var(--texto-sutil)', textTransform: 'uppercase' }}>
        Vista previa — {vistaActiva === 'resumen' ? 'Resumen' : DETALLES_ESPECIALES[vistaActiva]?.etiqueta}
      </h2>
      {vistaActiva === 'resumen' ? (
        datos.length === 0 ? (
          <p className="estado-vacio">No hay datos en este período.</p>
        ) : (
          <>
            <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid var(--linea)', borderRadius: 6, marginBottom: 8 }}>
              <table className="reporte" style={{ fontSize: '0.78rem' }}>
                <thead>
                  <tr>
                    <th>Período</th>
                    {seleccion.map((id) => (
                      <th key={id} className="monto">
                        {etiquetaSerie(id, cuentaPorCodigo)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {datos.slice(0, 12).map((fila) => (
                    <tr key={fila.periodo}>
                      <td>{fila.periodo}</td>
                      {seleccion.map((id) => (
                        <td key={id} className="monto">
                          {fila[id] === null || fila[id] === undefined
                            ? '—'
                            : id.endsWith('_pct')
                            ? `${fila[id]}%`
                            : formatoMoneda(fila[id])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {datos.length > 12 && (
              <p className="subtitulo" style={{ marginBottom: 6 }}>
                Mostrando 12 de {datos.length} períodos — el Excel descargado incluye todos.
              </p>
            )}
          </>
        )
      ) : (() => {
        const filasDetalleVista = construirHojaDetalle(vistaActiva);
        return filasDetalleVista.length === 0 ? (
          <p className="estado-vacio">No hay movimientos para este detalle en el período seleccionado.</p>
        ) : (
          <>
            <div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid var(--linea)', borderRadius: 6, marginBottom: 8 }}>
              <table className="reporte" style={{ fontSize: '0.74rem', minWidth: 1050 }}>
                <thead>
                  <tr>
                    {COLUMNAS_DETALLE.map((columna) => (
                      <th key={columna.key} className={['Cargo', 'Abono'].includes(columna.key) ? 'monto' : ''}>
                        {columna.key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filasDetalleVista.slice(0, 50).map((fila, indice) => (
                    <tr key={`${fila.Fecha}-${fila.Cuenta}-${indice}`}>
                      {COLUMNAS_DETALLE.map((columna) => (
                        <td key={columna.key} className={['Cargo', 'Abono'].includes(columna.key) ? 'monto' : ''}>
                          {['Cargo', 'Abono'].includes(columna.key)
                            ? formatoMoneda(fila[columna.key])
                            : fila[columna.key] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filasDetalleVista.length > 50 && (
              <p className="subtitulo" style={{ marginBottom: 6 }}>
                Mostrando 50 de {filasDetalleVista.length} movimientos — el Excel incluye todos.
              </p>
            )}
          </>
        );
      })()}

      {datos.length > 0 && (
        <button
          className="boton"
          onClick={descargarExcel}
          disabled={seleccion.length === 0}
          style={{ marginBottom: 8 }}
        >
          Descargar Excel (.xlsx)
        </button>
      )}

      <h2 style={{ fontSize: '0.85rem', color: 'var(--texto-sutil)', textTransform: 'uppercase', marginTop: 28 }}>
        Qué incluir en el Excel
      </h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
        }}
      >
        <div style={{ border: '1px solid var(--linea)', borderRadius: 6, padding: 12 }}>
          <strong style={{ fontSize: '0.8rem' }}>Resumen financiero</strong>
          {METRICAS.map((m) => {
            const permiteDetalle = Boolean(DETALLES_ESPECIALES[m.id]);
            const seleccionada = seleccion.includes(m.id);
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  minHeight: 28,
                }}
              >
                <label style={{ fontSize: '0.85rem', margin: '5px 0', flex: 1 }}>
                  <input
                    type="checkbox"
                    checked={seleccionada}
                    onChange={() => alternarMetrica(m.id)}
                    style={{ width: 'auto', marginRight: 8 }}
                  />
                  {m.label}
                </label>
                {permiteDetalle && (
                  <label
                    style={{
                      fontSize: '0.74rem',
                      whiteSpace: 'nowrap',
                      color: seleccionada ? 'inherit' : 'var(--texto-sutil)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={detallesIncluidos.includes(m.id)}
                      disabled={!seleccionada}
                      onChange={() => alternarDetalle(m.id)}
                      style={{ width: 'auto', marginRight: 5 }}
                    />
                    Incluir detalle
                  </label>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ border: '1px solid var(--linea)', borderRadius: 6, padding: 12 }}>
          <GrupoDesplegable
            titulo="Compra de inventario"
            abierto={expandido.compra_inventario}
            onToggle={() => alternarExpandido('compra_inventario')}
            textoAbrir="ver proveedores"
            textoCerrar="ocultar"
          >
            <Checkbox lista={seleccion} setLista={setSeleccion} id="grp_compra_inventario" etiqueta="Total (todos los proveedores)" />
            {expandido.compra_inventario &&
              (proveedores.length === 0 ? (
                <p className="estado-vacio" style={{ padding: 0, fontSize: '0.76rem' }}>
                  No hay proveedores identificados en este período.
                </p>
              ) : (
                <div style={{ paddingLeft: 14 }}>
                  {proveedores.map((p) => (
                    <Checkbox key={p} lista={seleccion} setLista={setSeleccion} id={slugProveedor(p)} etiqueta={p} />
                  ))}
                </div>
              ))}
          </GrupoDesplegable>

          <GrupoDesplegable
            titulo="Nómina"
            abierto={expandido.nomina}
            onToggle={() => alternarExpandido('nomina')}
            textoAbrir="ver por área"
            textoCerrar="ocultar"
          >
            <Checkbox lista={seleccion} setLista={setSeleccion} id="grp_nomina" etiqueta="Total (cocina + salón)" />
            {expandido.nomina && (
              <div style={{ paddingLeft: 14 }}>
                <Checkbox lista={seleccion} setLista={setSeleccion} id="6101" etiqueta="Cocina" />
                <Checkbox lista={seleccion} setLista={setSeleccion} id="6102" etiqueta="Salón" />
              </div>
            )}
          </GrupoDesplegable>

          <GrupoDesplegable
            titulo="Servicios"
            abierto={expandido.servicios}
            onToggle={() => alternarExpandido('servicios')}
            textoAbrir="ver por tipo"
            textoCerrar="ocultar"
          >
            <Checkbox lista={seleccion} setLista={setSeleccion} id="grp_servicios" etiqueta="Total (todos los servicios)" />
            {expandido.servicios && (
              <div style={{ paddingLeft: 14 }}>
                <Checkbox lista={seleccion} setLista={setSeleccion} id="6118" etiqueta="Luz/CFE" />
                <Checkbox lista={seleccion} setLista={setSeleccion} id="6119" etiqueta="Agua" />
                <Checkbox lista={seleccion} setLista={setSeleccion} id="6120" etiqueta="Gas" />
                <Checkbox lista={seleccion} setLista={setSeleccion} id="6121" etiqueta="Internet/Telefonía" />
                <Checkbox lista={seleccion} setLista={setSeleccion} id="6104" etiqueta="General/otro (histórico)" />
              </div>
            )}
          </GrupoDesplegable>
        </div>

        <div style={{ border: '1px solid var(--linea)', borderRadius: 6, padding: 12 }}>
          <strong style={{ fontSize: '0.8rem' }}>Ingresos</strong>
          {(opcionesCuentasPorTipo.ingreso || []).map((c) => (
            <Checkbox key={c.codigo} lista={seleccion} setLista={setSeleccion} id={c.codigo} etiqueta={`${c.codigo} — ${c.nombre}`} />
          ))}
          <strong style={{ fontSize: '0.8rem', display: 'block', marginTop: 12 }}>Costos</strong>
          {(opcionesCuentasPorTipo.costo || []).map((c) => (
            <Checkbox key={c.codigo} lista={seleccion} setLista={setSeleccion} id={c.codigo} etiqueta={`${c.codigo} — ${c.nombre}`} />
          ))}
        </div>

        <div style={{ border: '1px solid var(--linea)', borderRadius: 6, padding: 12 }}>
          <strong style={{ fontSize: '0.8rem' }}>Gastos</strong>
          {(opcionesCuentasPorTipo.gasto || []).map((c) => (
            <Checkbox key={c.codigo} lista={seleccion} setLista={setSeleccion} id={c.codigo} etiqueta={`${c.codigo} — ${c.nombre}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
