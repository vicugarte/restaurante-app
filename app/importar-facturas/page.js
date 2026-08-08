'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatoMoneda } from '../../lib/format';

const NOMBRES_FORMA_PAGO = {
  '01': 'Efectivo',
  '02': 'Cheque nominativo',
  '03': 'Transferencia',
  '04': 'Tarjeta de crédito',
  '28': 'Tarjeta de débito',
  '99': 'Por definir',
};

export default function ImportarFacturas() {
  const [cuentas, setCuentas] = useState([]);
  const [archivos, setArchivos] = useState([]);
  const [items, setItems] = useState([]); // { nombreArchivo, error?, propuesta?, lineas, incluir }
  const [procesando, setProcesando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [resumenGuardado, setResumenGuardado] = useState(null);

  useEffect(() => {
    async function cargarCuentas() {
      const { data, error } = await supabase
        .from('cuentas')
        .select('id, codigo, nombre')
        .eq('activa', true)
        .order('codigo');
      if (!error) setCuentas(data || []);
    }
    cargarCuentas();
  }, []);

  function idPorCodigo(codigo) {
    const cuenta = cuentas.find((c) => c.codigo === codigo);
    return cuenta ? cuenta.id : '';
  }

  async function procesarArchivos(evento) {
    evento.preventDefault();
    if (archivos.length === 0) return;
    setMensaje(null);
    setResumenGuardado(null);
    setProcesando(true);
    setItems([]);

    try {
      const formData = new FormData();
      for (const archivo of archivos) formData.append('archivos', archivo);

      const respuesta = await fetch('/api/importar-facturas', { method: 'POST', body: formData });
      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos.error || 'No se pudieron procesar los archivos.');

      setItems(
        datos.resultados.map((r) => ({
          ...r,
          incluir: !r.error,
          fecha: r.propuesta?.fecha || '',
          concepto: r.propuesta?.concepto || '',
          lineas: (r.propuesta?.lineas || []).map((l) => ({
            ...l,
            cuenta_id: idPorCodigo(l.cuenta_codigo),
          })),
        }))
      );
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setProcesando(false);
    }
  }

  function actualizarItem(indice, campo, valor) {
    setItems((prev) => prev.map((it, i) => (i === indice ? { ...it, [campo]: valor } : it)));
  }

  function actualizarLinea(indiceItem, indiceLinea, campo, valor) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== indiceItem) return it;
        const lineas = it.lineas.map((l, j) => (j === indiceLinea ? { ...l, [campo]: valor } : l));
        return { ...it, lineas };
      })
    );
  }

  function cuadraItem(item) {
    const cargo = item.lineas.reduce((s, l) => s + (Number(l.cargo) || 0), 0);
    const abono = item.lineas.reduce((s, l) => s + (Number(l.abono) || 0), 0);
    const todasConCuenta = item.lineas.every((l) => l.cuenta_id);
    return todasConCuenta && cargo > 0 && Math.abs(cargo - abono) < 0.02;
  }

  const itemsIncluidos = items.filter((it) => it.incluir && !it.error);
  const todosCuadran = itemsIncluidos.every((it) => cuadraItem(it));

  async function guardarTodas() {
    setMensaje(null);
    setResumenGuardado(null);
    if (itemsIncluidos.length === 0) {
      setMensaje({ tipo: 'error', texto: 'No hay pólizas seleccionadas para guardar.' });
      return;
    }
    if (!todosCuadran) {
      setMensaje({ tipo: 'error', texto: 'Hay pólizas seleccionadas que no cuadran. Revísalas antes de guardar.' });
      return;
    }

    setGuardando(true);
    let exitosas = 0;
    let fallidas = 0;
    const detallesError = [];

    for (const item of itemsIncluidos) {
      try {
        const { data: poliza, error: errorPoliza } = await supabase
          .from('polizas')
          .insert({
            fecha: item.fecha,
            tipo: 'egreso',
            concepto: item.concepto,
            referencia: item.propuesta.folioFiscal || null,
            con_factura: true,
            folio_fiscal: item.propuesta.folioFiscal || null,
            proveedor_nombre: item.propuesta.proveedorNombre || null,
            proveedor_rfc: item.propuesta.proveedorRfc || null,
            uso_cfdi: item.propuesta.usoCfdi || null,
            moneda: item.propuesta.moneda || 'MXN',
            tipo_cambio: item.propuesta.tipoCambio || null,
            serie: item.propuesta.serie || null,
            folio: item.propuesta.folio || null,
          })
          .select('id')
          .single();
        if (errorPoliza) throw errorPoliza;

        if (item.propuesta.conceptos?.length > 0) {
          const conceptos = item.propuesta.conceptos.map((c) => ({
            poliza_id: poliza.id,
            clave_prod_serv: c.claveProdServ,
            descripcion: c.descripcion,
            cantidad: c.cantidad,
            clave_unidad: c.claveUnidad,
            valor_unitario: c.valorUnitario,
            importe: c.importe,
          }));
          const { error: errorConceptos } = await supabase.from('factura_conceptos').insert(conceptos);
          if (errorConceptos) throw errorConceptos;
        }

        const movimientos = item.lineas
          .filter((l) => l.cuenta_id && (Number(l.cargo) > 0 || Number(l.abono) > 0))
          .map((l) => ({
            poliza_id: poliza.id,
            cuenta_id: l.cuenta_id,
            cargo: Number(l.cargo) || 0,
            abono: Number(l.abono) || 0,
          }));

        const { error: errorMovimientos } = await supabase.from('movimientos').insert(movimientos);
        if (errorMovimientos) throw errorMovimientos;

        exitosas += 1;
      } catch (error) {
        fallidas += 1;
        detallesError.push(`${item.nombreArchivo}: ${error.message || 'error desconocido'}`);
      }
    }

    setResumenGuardado({ exitosas, fallidas, detallesError });
    setGuardando(false);
    if (fallidas === 0) {
      setItems([]);
      setArchivos([]);
    }
  }

  return (
    <div className="panel">
      <h2>Importar facturas de proveedores (CFDI)</h2>
      <p className="subtitulo">
        Sube varios archivos XML de facturas de compra. Cada una se convierte en una póliza propuesta
        según su Método de Pago y Forma de Pago:
      </p>
      <ul className="subtitulo">
        <li>PPD → abono a Proveedores de alimentos y bebidas (2101)</li>
        <li>PUE + transferencia / tarjeta crédito / tarjeta débito → abono a Bancos (1102)</li>
        <li>PUE + efectivo → abono a Caja (1101)</li>
      </ul>

      {mensaje && <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>}
      {resumenGuardado && (
        <div className={`mensaje ${resumenGuardado.fallidas === 0 ? 'ok' : 'error'}`}>
          Guardadas {resumenGuardado.exitosas} pólizas.
          {resumenGuardado.fallidas > 0 && ` ${resumenGuardado.fallidas} fallaron.`}
          {resumenGuardado.detallesError?.length > 0 && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {resumenGuardado.detallesError.map((detalle, i) => (
                <li key={i}>{detalle}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <form onSubmit={procesarArchivos} style={{ marginBottom: 20 }}>
        <div className="filtro-fecha">
          <div>
            <label>Archivos XML (selecciona varios con Ctrl o Shift)</label>
            <input
              type="file"
              accept=".xml"
              multiple
              onChange={(e) => setArchivos(Array.from(e.target.files || []))}
            />
          </div>
          <button type="submit" className="boton" disabled={archivos.length === 0 || procesando}>
            {procesando ? 'Procesando…' : `Procesar ${archivos.length || ''} archivo(s)`}
          </button>
        </div>
      </form>

      {items.length > 0 && (
        <>
          {items.map((item, indice) => (
            <div
              key={indice}
              className="panel"
              style={{ background: item.error ? '#fbe8e5' : 'var(--panel)', marginBottom: 12 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <strong style={{ fontSize: '0.85rem' }}>{item.nombreArchivo}</strong>
                {!item.error && (
                  <label style={{ fontSize: '0.8rem' }}>
                    <input
                      type="checkbox"
                      checked={item.incluir}
                      onChange={(e) => actualizarItem(indice, 'incluir', e.target.checked)}
                      style={{ width: 'auto', marginRight: 6 }}
                    />
                    Incluir al guardar
                  </label>
                )}
              </div>

              {item.error ? (
                <p className="estado-vacio" style={{ color: 'var(--negativo)' }}>
                  {item.error}
                </p>
              ) : (
                <>
                  <p className="subtitulo" style={{ margin: '4px 0 12px' }}>
                    {item.propuesta.metodoPago} · Forma de pago:{' '}
                    {NOMBRES_FORMA_PAGO[item.propuesta.formaPago] || item.propuesta.formaPago}
                    {item.propuesta.folioFiscal && <> · UUID: {item.propuesta.folioFiscal}</>}
                    <br />
                    {item.propuesta.serie || item.propuesta.folio ? (
                      <>
                        Factura: {item.propuesta.serie || ''}
                        {item.propuesta.folio || ''} ·{' '}
                      </>
                    ) : null}
                    Moneda: {item.propuesta.moneda}
                    {item.propuesta.tipoCambio ? ` (TC ${item.propuesta.tipoCambio})` : ''}
                    {item.propuesta.usoCfdi && <> · Uso CFDI: {item.propuesta.usoCfdi}</>}
                  </p>
                  {item.propuesta.avisos?.map((aviso, i) => (
                    <div key={i} className="mensaje" style={{ background: '#efe2dc' }}>
                      {aviso}
                    </div>
                  ))}

                  <div className="filtro-fecha">
                    <div>
                      <label>Fecha</label>
                      <input
                        type="date"
                        value={item.fecha}
                        onChange={(e) => actualizarItem(indice, 'fecha', e.target.value)}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <label>Concepto</label>
                      <input
                        type="text"
                        value={item.concepto}
                        onChange={(e) => actualizarItem(indice, 'concepto', e.target.value)}
                      />
                    </div>
                  </div>

                  {item.lineas.map((linea, indiceLinea) => (
                    <div className="linea-movimiento" key={indiceLinea}>
                      <div>
                        <select
                          value={linea.cuenta_id}
                          onChange={(e) => actualizarLinea(indice, indiceLinea, 'cuenta_id', e.target.value)}
                        >
                          <option value="">Selecciona una cuenta</option>
                          {cuentas.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.codigo} — {c.nombre}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <input
                          type="number"
                          step="0.01"
                          value={linea.cargo}
                          onChange={(e) => actualizarLinea(indice, indiceLinea, 'cargo', e.target.value)}
                        />
                      </div>
                      <div>
                        <input
                          type="number"
                          step="0.01"
                          value={linea.abono}
                          onChange={(e) => actualizarLinea(indice, indiceLinea, 'abono', e.target.value)}
                        />
                      </div>
                      <div />
                    </div>
                  ))}

                  <div className="balance-check">
                    {cuadraItem(item) ? (
                      <span className="positivo">Cuadra ✓</span>
                    ) : (
                      <span className="negativo">No cuadra</span>
                    )}
                  </div>

                  {item.propuesta.conceptos?.length > 0 && (
                    <details style={{ marginTop: 12 }}>
                      <summary style={{ fontSize: '0.8rem', cursor: 'pointer', color: 'var(--texto-sutil)' }}>
                        Ver {item.propuesta.conceptos.length} concepto(s) de la factura
                      </summary>
                      <table className="reporte" style={{ marginTop: 10 }}>
                        <thead>
                          <tr>
                            <th>Descripción</th>
                            <th className="monto">Cantidad</th>
                            <th className="monto">Precio unitario</th>
                            <th className="monto">Importe</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.propuesta.conceptos.map((c, i) => (
                            <tr key={i}>
                              <td className="nombre">{c.descripcion}</td>
                              <td className="monto">{c.cantidad}</td>
                              <td className="monto">{formatoMoneda(c.valorUnitario)}</td>
                              <td className="monto">{formatoMoneda(c.importe)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  )}
                </>
              )}
            </div>
          ))}

          <button
            className="boton"
            onClick={guardarTodas}
            disabled={guardando || itemsIncluidos.length === 0 || !todosCuadran}
          >
            {guardando ? 'Guardando…' : `Guardar ${itemsIncluidos.length} póliza(s)`}
          </button>
        </>
      )}
    </div>
  );
}
