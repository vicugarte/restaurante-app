'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { formatoMoneda } from '../../lib/format';
import { PLANTILLAS } from '../../lib/plantillas';

function CapturaInterna() {
  const [cuentas, setCuentas] = useState([]);
  const [tiposPersonalizados, setTiposPersonalizados] = useState([]);

  // Campos comunes de la póliza
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [concepto, setConcepto] = useState('');
  const [referencia, setReferencia] = useState('');
  const [conFactura, setConFactura] = useState(true);
  const [folioFiscal, setFolioFiscal] = useState('');

  const searchParams = useSearchParams();
  const plantillaInicial = searchParams.get('plantilla');
  const [plantillaId, setPlantillaId] = useState(plantillaInicial || '');
  const [valoresPlantilla, setValoresPlantilla] = useState({});

  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    async function cargarCuentas() {
      const { data, error } = await supabase
        .from('cuentas')
        .select('id, codigo, nombre, tipo, naturaleza')
        .eq('activa', true)
        .order('codigo');
      if (!error) setCuentas(data || []);
    }
    async function cargarTiposPersonalizados() {
      const { data, error } = await supabase
        .from('tipos_movimiento_personalizados')
        .select('*')
        .order('nombre');
      if (!error) setTiposPersonalizados(data || []);
    }
    cargarCuentas();
    cargarTiposPersonalizados();
  }, []);

  function cuentaPorId(id) {
    return cuentas.find((c) => c.id === id);
  }
  function cuentaPorCodigo(codigo) {
    return cuentas.find((c) => c.codigo === codigo);
  }

  // Tipos personalizados traducidos al mismo formato que las plantillas
  // estáticas: un campo de Monto, y construir() arma las 2 líneas fijas
  // (cargo/abono) según las cuentas definidas al crear el tipo.
  const plantillasPersonalizadas = useMemo(
    () =>
      tiposPersonalizados.map((t) => ({
        id: `custom_${t.id}`,
        nombre: t.nombre,
        conceptoDefault: () => t.nombre,
        campos: [{ key: 'monto', label: 'Monto', tipo: 'monto' }],
        construir: (v) => [
          { codigo: t.cuenta_cargo_codigo, lado: 'cargo', monto: Number(v.monto) || 0 },
          { codigo: t.cuenta_abono_codigo, lado: 'abono', monto: Number(v.monto) || 0 },
        ],
      })),
    [tiposPersonalizados]
  );

  const todasLasPlantillas = useMemo(
    () => [...PLANTILLAS, ...plantillasPersonalizadas],
    [plantillasPersonalizadas]
  );

  useEffect(() => {
    if (!plantillaId && todasLasPlantillas.length > 0) {
      setPlantillaId(todasLasPlantillas[0].id);
    }
  }, [plantillaId, todasLasPlantillas]);

  const plantilla = todasLasPlantillas.find((p) => p.id === plantillaId);
  const cuentasGasto = useMemo(
    () => cuentas.filter((c) => c.tipo === 'gasto' && c.codigo !== '6117'),
    [cuentas]
  );

  useEffect(() => {
    setValoresPlantilla({});

    if (plantillaId === 'deposito_caja') {
      async function sugerirMontoDeposito() {
        const [saldoCaja, config] = await Promise.all([
          supabase.from('v_saldos_movimientos').select('saldo').eq('codigo', '1101'),
          supabase.from('configuracion').select('valor').eq('clave', 'caja_pct_retener').single(),
        ]);
        if (saldoCaja.error) return;
        const saldo = (saldoCaja.data || []).reduce((s, f) => s + Number(f.saldo), 0);
        const pctRetener = !config.error && config.data ? Number(config.data.valor) : 10;
        const sugerido = Math.max(0, Math.round(saldo * (1 - pctRetener / 100) * 100) / 100);
        setValoresPlantilla({ monto: sugerido, _saldoCaja: saldo, _pctRetener: pctRetener });
      }
      sugerirMontoDeposito();
    }

    if (plantillaId === 'depreciacion') {
      async function sugerirMontoDepreciacion() {
        const [saldos, config] = await Promise.all([
          supabase
            .from('v_saldos_movimientos')
            .select('codigo, saldo')
            .in('codigo', ['1201', '1202', '1203', '1204']),
          supabase.from('configuracion').select('valor').eq('clave', 'depreciacion_vida_util_anios').single(),
        ]);
        if (saldos.error) return;
        let costoActivos = 0;
        let depreciacionActual = 0;
        for (const fila of saldos.data || []) {
          if (fila.codigo === '1204') depreciacionActual += Number(fila.saldo);
          else costoActivos += Number(fila.saldo);
        }
        const vidaUtilAnios = !config.error && config.data ? Number(config.data.valor) : 10;
        const restantePorDepreciar = Math.max(0, costoActivos - depreciacionActual);
        const sugeridoMensual = costoActivos > 0 ? costoActivos / (vidaUtilAnios * 12) : 0;
        const sugerido = Math.round(Math.min(sugeridoMensual, restantePorDepreciar) * 100) / 100;
        setValoresPlantilla({
          monto: sugerido,
          _costoActivos: costoActivos,
          _depreciacionActual: depreciacionActual,
          _restante: restantePorDepreciar,
          _vidaUtilAnios: vidaUtilAnios,
        });
      }
      sugerirMontoDepreciacion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantillaId]);

  // El concepto SIEMPRE se calcula automáticamente según la plantilla y sus
  // valores -- no es editable, para evitar inconsistencias en la base de
  // datos (mismo tipo de movimiento siempre queda descrito igual).
  useEffect(() => {
    if (!plantilla) return;
    const sugerido = plantilla.conceptoDefault(valoresPlantilla, cuentas);
    setConcepto(sugerido || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valoresPlantilla, plantillaId]);

  function actualizarValorPlantilla(key, valor) {
    setValoresPlantilla((prev) => ({ ...prev, [key]: valor }));
  }

  const lineasEfectivas = useMemo(() => {
    if (!plantilla) return [];
    const crudas = plantilla.construir(valoresPlantilla);
    return crudas
      .filter((l) => l.monto > 0)
      .map((l) => {
        const cuenta = l.codigoId ? cuentaPorId(l.codigoId) : cuentaPorCodigo(l.codigo);
        return { cuenta_id: cuenta ? cuenta.id : '', monto: l.monto, lado: l.lado };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantilla, valoresPlantilla, cuentas]);

  const totalCargo = lineasEfectivas.reduce(
    (s, l) => s + (l.lado === 'cargo' ? Number(l.monto) || 0 : 0),
    0
  );
  const totalAbono = lineasEfectivas.reduce(
    (s, l) => s + (l.lado === 'abono' ? Number(l.monto) || 0 : 0),
    0
  );
  const cuadra = totalCargo > 0 && Math.abs(totalCargo - totalAbono) < 0.005;
  const todasConCuenta = lineasEfectivas.length > 0 && lineasEfectivas.every((l) => l.cuenta_id);

  async function guardarPoliza(evento) {
    evento.preventDefault();
    setMensaje(null);

    if (!cuadra || !todasConCuenta) {
      setMensaje({
        tipo: 'error',
        texto: !todasConCuenta
          ? 'Falta completar algún campo — no se pudo determinar la cuenta de una o más líneas.'
          : 'La póliza no cuadra: la suma de cargos debe ser igual a la suma de abonos.',
      });
      return;
    }
    if (!concepto.trim()) {
      setMensaje({ tipo: 'error', texto: 'Selecciona un tipo de movimiento válido.' });
      return;
    }
    if (lineasEfectivas.length < 2) {
      setMensaje({ tipo: 'error', texto: 'Se necesitan al menos 2 líneas de movimiento — completa más campos.' });
      return;
    }

    setGuardando(true);
    try {
      const { data: poliza, error: errorPoliza } = await supabase
        .from('polizas')
        .insert({
          fecha,
          tipo: 'diario',
          concepto,
          referencia: referencia || null,
          con_factura: conFactura,
          folio_fiscal: conFactura ? folioFiscal || null : null,
        })
        .select('id')
        .single();
      if (errorPoliza) throw errorPoliza;

      const movimientos = lineasEfectivas.map((l) => ({
        poliza_id: poliza.id,
        cuenta_id: l.cuenta_id,
        cargo: l.lado === 'cargo' ? Number(l.monto) || 0 : 0,
        abono: l.lado === 'abono' ? Number(l.monto) || 0 : 0,
      }));
      const { error: errorMovimientos } = await supabase.from('movimientos').insert(movimientos);
      if (errorMovimientos) throw errorMovimientos;

      setMensaje({ tipo: 'ok', texto: 'Póliza guardada correctamente.' });
      setReferencia('');
      setFolioFiscal('');
      setConFactura(true);
      setValoresPlantilla({});
    } catch (error) {
      setMensaje({ tipo: 'error', texto: `No se pudo guardar: ${error.message}` });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="panel">
      <h2>Capturar movimiento</h2>
      <p className="subtitulo">
        Elige el tipo de movimiento y llena solo los datos relevantes — el sistema arma la póliza contable
        completa por ti. ¿Falta un tipo de movimiento? Créalo en{' '}
        <a href="/tipos-movimiento">Tipos de movimiento</a>.
      </p>

      {mensaje && <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>}

      <form onSubmit={guardarPoliza}>
        <div className="filtro-fecha">
          <div style={{ flex: 1, minWidth: 240 }}>
            <label>Tipo de movimiento</label>
            <select value={plantillaId} onChange={(e) => setPlantillaId(e.target.value)}>
              {PLANTILLAS.length > 0 && (
                <optgroup label="Movimientos comunes">
                  {PLANTILLAS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </optgroup>
              )}
              {plantillasPersonalizadas.length > 0 && (
                <optgroup label="Personalizados">
                  {plantillasPersonalizadas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>

        <div className="filtro-fecha" style={{ marginTop: 14 }}>
          {plantillaId === 'deposito_caja' && valoresPlantilla._saldoCaja !== undefined && (
            <p className="subtitulo" style={{ width: '100%' }}>
              Saldo actual en Caja: {formatoMoneda(valoresPlantilla._saldoCaja)} · regla configurada:
              conservar {valoresPlantilla._pctRetener}% como fondo (ajustable en Configuración)
            </p>
          )}
          {plantillaId === 'depreciacion' && valoresPlantilla._costoActivos !== undefined && (
            <p className="subtitulo" style={{ width: '100%' }}>
              Costo total de activos fijos: {formatoMoneda(valoresPlantilla._costoActivos)} · depreciado
              hasta hoy: {formatoMoneda(valoresPlantilla._depreciacionActual)} · queda por depreciar:{' '}
              {formatoMoneda(valoresPlantilla._restante)} · vida útil configurada:{' '}
              {valoresPlantilla._vidaUtilAnios} años (ajustable en Configuración). El monto sugerido nunca
              supera lo que falta por depreciar.
            </p>
          )}
          {plantilla?.campos.map((campo) => (
            <div key={campo.key} style={{ minWidth: 180 }}>
              <label>
                {campo.label}
                {campo.opcional ? ' (opcional)' : ''}
              </label>
              {campo.tipo === 'monto' && (
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={valoresPlantilla[campo.key] || ''}
                  onChange={(e) => actualizarValorPlantilla(campo.key, e.target.value)}
                />
              )}
              {campo.tipo === 'select' && (
                <select
                  value={valoresPlantilla[campo.key] || ''}
                  onChange={(e) => actualizarValorPlantilla(campo.key, e.target.value)}
                >
                  <option value="">Selecciona…</option>
                  {campo.opciones.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
              {campo.tipo === 'cuenta-gasto' && (
                <select
                  value={valoresPlantilla[campo.key] || ''}
                  onChange={(e) => actualizarValorPlantilla(campo.key, e.target.value)}
                >
                  <option value="">Selecciona…</option>
                  {cuentasGasto.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>

        {lineasEfectivas.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <h2 style={{ fontSize: '0.85rem', color: 'var(--texto-sutil)', textTransform: 'uppercase' }}>
              Vista previa de la póliza
            </h2>
            <table className="reporte">
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th className="monto">Cargo</th>
                  <th className="monto">Abono</th>
                </tr>
              </thead>
              <tbody>
                {lineasEfectivas.map((l, i) => {
                  const cuenta = cuentaPorId(l.cuenta_id);
                  return (
                    <tr key={i}>
                      <td className="nombre">
                        {cuenta ? `${cuenta.codigo} — ${cuenta.nombre}` : '(falta información)'}
                      </td>
                      <td className="monto">{l.lado === 'cargo' ? formatoMoneda(l.monto) : ''}</td>
                      <td className="monto">{l.lado === 'abono' ? formatoMoneda(l.monto) : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <h2 style={{ fontSize: '0.95rem', marginTop: 24 }}>Datos de la póliza</h2>
        <div className="filtro-fecha">
          <div>
            <label>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label>Concepto (automático, según el tipo de movimiento)</label>
            <input type="text" value={concepto} readOnly disabled style={{ background: '#f0ede4' }} />
          </div>
          <div>
            <label>Referencia</label>
            <input
              type="text"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Ej. TICKET-001"
            />
          </div>
          <div>
            <label>
              <input
                type="checkbox"
                checked={conFactura}
                onChange={(e) => setConFactura(e.target.checked)}
                style={{ width: 'auto', marginRight: 6 }}
              />
              Tiene factura (CFDI)
            </label>
          </div>
          {conFactura && (
            <div>
              <label>Folio fiscal (opcional)</label>
              <input
                type="text"
                value={folioFiscal}
                onChange={(e) => setFolioFiscal(e.target.value)}
                placeholder="UUID del CFDI"
              />
            </div>
          )}
        </div>

        <div className="balance-check">
          Cargos: {formatoMoneda(totalCargo)} &nbsp;·&nbsp; Abonos: {formatoMoneda(totalAbono)} &nbsp;·&nbsp;{' '}
          {cuadra && todasConCuenta ? (
            <span className="positivo">Cuadra ✓</span>
          ) : (
            <span className="negativo">No cuadra / falta información</span>
          )}
        </div>

        <button
          type="submit"
          className="boton"
          disabled={guardando || !cuadra || !todasConCuenta}
          style={{ marginTop: 16 }}
        >
          {guardando ? 'Guardando…' : 'Guardar póliza'}
        </button>
      </form>
    </div>
  );
}

export default function Captura() {
  return (
    <Suspense fallback={<div className="panel">Cargando…</div>}>
      <CapturaInterna />
    </Suspense>
  );
}
