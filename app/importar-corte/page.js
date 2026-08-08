'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatoMoneda } from '../../lib/format';

export default function ImportarCorte() {
  const [cuentas, setCuentas] = useState([]);
  const [archivo, setArchivo] = useState(null);
  const [propuesta, setPropuesta] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [concepto, setConcepto] = useState('');
  const [fecha, setFecha] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

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

  async function procesarPdf(evento) {
    evento.preventDefault();
    if (!archivo) return;
    setMensaje(null);
    setProcesando(true);
    setPropuesta(null);

    try {
      const formData = new FormData();
      formData.append('archivo', archivo);
      const respuesta = await fetch('/api/importar-corte', { method: 'POST', body: formData });
      const datos = await respuesta.json();

      if (!respuesta.ok) {
        if (datos.diagnostico) {
          setMensaje({
            tipo: 'error',
            texto: `${datos.error} — Caracteres extraídos: ${datos.diagnostico.caracteresExtraidos}. Muestra: "${datos.diagnostico.muestraTexto.slice(0, 400)}"`,
          });
          setProcesando(false);
          return;
        }
        throw new Error(datos.error || 'No se pudo procesar el PDF.');
      }

      setPropuesta(datos.propuesta);
      setConcepto(datos.propuesta.concepto);
      setFecha(datos.propuesta.fecha || new Date().toISOString().slice(0, 10));
      setLineas(
        datos.propuesta.lineas.map((l) => ({
          ...l,
          cuenta_id: idPorCodigo(l.cuenta_codigo),
        }))
      );
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setProcesando(false);
    }
  }

  function actualizarLinea(indice, campo, valor) {
    setLineas((prev) => prev.map((l, i) => (i === indice ? { ...l, [campo]: valor } : l)));
  }

  const totalCargo = lineas.reduce((s, l) => s + (Number(l.cargo) || 0), 0);
  const totalAbono = lineas.reduce((s, l) => s + (Number(l.abono) || 0), 0);
  const cuadra = totalCargo > 0 && Math.abs(totalCargo - totalAbono) < 0.02;

  async function guardarPoliza() {
    setMensaje(null);
    if (!cuadra) {
      setMensaje({ tipo: 'error', texto: 'La póliza no cuadra. Ajusta los montos antes de guardar.' });
      return;
    }
    setGuardando(true);
    try {
      const { data: poliza, error: errorPoliza } = await supabase
        .from('polizas')
        .insert({
          fecha,
          tipo: 'ingreso',
          concepto,
          referencia: 'Corte de caja (PDF)',
          con_factura: true,
        })
        .select('id')
        .single();
      if (errorPoliza) throw errorPoliza;

      const movimientos = lineas
        .filter((l) => l.cuenta_id && (Number(l.cargo) > 0 || Number(l.abono) > 0))
        .map((l) => ({
          poliza_id: poliza.id,
          cuenta_id: l.cuenta_id,
          cargo: Number(l.cargo) || 0,
          abono: Number(l.abono) || 0,
        }));

      const { error: errorMovimientos } = await supabase.from('movimientos').insert(movimientos);
      if (errorMovimientos) throw errorMovimientos;

      setMensaje({ tipo: 'ok', texto: 'Corte de caja guardado como póliza.' });
      setPropuesta(null);
      setLineas([]);
      setArchivo(null);
    } catch (error) {
      setMensaje({ tipo: 'error', texto: `No se pudo guardar: ${error.message}` });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="panel">
      <h2>Importar corte de caja</h2>
      <p className="subtitulo">
        Sube el PDF del corte de caja del día. Se genera una propuesta de póliza que puedes revisar
        y ajustar antes de guardar.
      </p>

      {mensaje && <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>}

      <form onSubmit={procesarPdf} style={{ marginBottom: 20 }}>
        <div className="filtro-fecha">
          <div>
            <label>Archivo PDF</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setArchivo(e.target.files?.[0] || null)}
            />
          </div>
          <button type="submit" className="boton" disabled={!archivo || procesando}>
            {procesando ? 'Leyendo PDF…' : 'Procesar PDF'}
          </button>
        </div>
      </form>

      {propuesta && (
        <>
          {propuesta.avisos?.length > 0 && (
            <div className="mensaje" style={{ background: '#efe2dc' }}>
              {propuesta.avisos.map((aviso, i) => (
                <div key={i}>• {aviso}</div>
              ))}
            </div>
          )}

          <div className="filtro-fecha">
            <div>
              <label>Fecha</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label>Concepto</label>
              <input type="text" value={concepto} onChange={(e) => setConcepto(e.target.value)} />
            </div>
          </div>

          <h2 style={{ fontSize: '0.95rem', marginTop: 20 }}>Póliza propuesta (revisa y ajusta)</h2>
          {lineas.map((linea, indice) => (
            <div className="linea-movimiento" key={indice}>
              <div>
                <label>Cuenta</label>
                <select
                  value={linea.cuenta_id}
                  onChange={(e) => actualizarLinea(indice, 'cuenta_id', e.target.value)}
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
                <label>Cargo</label>
                <input
                  type="number"
                  step="0.01"
                  value={linea.cargo}
                  onChange={(e) => actualizarLinea(indice, 'cargo', e.target.value)}
                />
              </div>
              <div>
                <label>Abono</label>
                <input
                  type="number"
                  step="0.01"
                  value={linea.abono}
                  onChange={(e) => actualizarLinea(indice, 'abono', e.target.value)}
                />
              </div>
              <div />
            </div>
          ))}

          <div className="balance-check">
            Cargos: {formatoMoneda(totalCargo)} &nbsp;·&nbsp; Abonos: {formatoMoneda(totalAbono)} &nbsp;·&nbsp;{' '}
            {cuadra ? <span className="positivo">Cuadra ✓</span> : <span className="negativo">No cuadra</span>}
          </div>

          <button
            className="boton"
            onClick={guardarPoliza}
            disabled={!cuadra || guardando}
            style={{ marginTop: 16 }}
          >
            {guardando ? 'Guardando…' : 'Guardar póliza'}
          </button>
        </>
      )}
    </div>
  );
}
