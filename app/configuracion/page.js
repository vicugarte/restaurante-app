'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const CAMPOS = [
  { clave: 'inventario_minimo', label: 'Inventario mínimo (pesos)', sufijo: '$' },
  { clave: 'costo_objetivo_promedio', label: 'Costo objetivo promedio (para estimar consumo de inventario)', sufijo: '%' },
  { clave: 'costo_alimentos_min', label: 'Costo de alimentos — mínimo esperado', sufijo: '%' },
  { clave: 'costo_alimentos_max', label: 'Costo de alimentos — máximo esperado', sufijo: '%' },
  { clave: 'costo_bebidas_min', label: 'Costo de bebidas — mínimo esperado', sufijo: '%' },
  { clave: 'costo_bebidas_max', label: 'Costo de bebidas — máximo esperado', sufijo: '%' },
  { clave: 'nomina_min', label: 'Nómina sobre ventas — mínimo esperado', sufijo: '%' },
  { clave: 'nomina_max', label: 'Nómina sobre ventas — máximo esperado', sufijo: '%' },
  {
    clave: 'isr_regimen',
    label: 'Régimen fiscal (para estimar ISR)',
    tipo: 'select',
    opciones: [
      { value: 0, label: 'Persona Moral (tasa fija)' },
      { value: 1, label: 'Persona Física con Actividad Empresarial (tabla progresiva SAT)' },
    ],
  },
  { clave: 'isr_tasa_estimada', label: 'ISR estimado — tasa fija (solo si el régimen es Persona Moral)', sufijo: '%' },
  { clave: 'iva_tasa_estimada', label: 'IVA estimado (mientras no captures el pago real)', sufijo: '%' },
  { clave: 'caja_pct_retener', label: 'Caja — % a retener como fondo (el resto se sugiere depositar a Bancos)', sufijo: '%' },
  { clave: 'depreciacion_vida_util_anios', label: 'Depreciación — vida útil de mobiliario y equipo', sufijo: 'años' },
];

export default function Configuracion() {
  const [valores, setValores] = useState({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    async function cargar() {
      const { data, error } = await supabase.from('configuracion').select('clave, valor');
      if (!error) {
        const mapa = {};
        for (const fila of data || []) mapa[fila.clave] = fila.valor;
        setValores(mapa);
      }
      setCargando(false);
    }
    cargar();
  }, []);

  async function guardar(evento) {
    evento.preventDefault();
    setGuardando(true);
    setMensaje(null);
    try {
      for (const campo of CAMPOS) {
        const { error } = await supabase
          .from('configuracion')
          .update({ valor: Number(valores[campo.clave]) || 0 })
          .eq('clave', campo.clave);
        if (error) throw error;
      }
      setMensaje({ tipo: 'ok', texto: 'Configuración guardada.' });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: `No se pudo guardar: ${error.message}` });
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <div className="panel">Cargando…</div>;

  return (
    <div className="panel">
      <h2>Configuración</h2>
      <p className="subtitulo">
        Valores usados por el sistema de alertas de inventario y rangos de control. Ajústalos según la
        operación real del restaurante.
      </p>

      {mensaje && <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>}

      <form onSubmit={guardar}>
        {CAMPOS.map((campo) => (
          <div key={campo.clave} style={{ marginBottom: 14, maxWidth: 400 }}>
            <label>{campo.label}</label>
            {campo.tipo === 'select' ? (
              <select
                value={valores[campo.clave] ?? ''}
                onChange={(e) => setValores((prev) => ({ ...prev, [campo.clave]: e.target.value }))}
              >
                {campo.opciones.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  step="0.01"
                  value={valores[campo.clave] ?? ''}
                  onChange={(e) => setValores((prev) => ({ ...prev, [campo.clave]: e.target.value }))}
                  style={{ maxWidth: 160 }}
                />
                <span className="subtitulo" style={{ margin: 0 }}>
                  {campo.sufijo}
                </span>
              </div>
            )}
          </div>
        ))}

        <button type="submit" className="boton" disabled={guardando} style={{ marginTop: 8 }}>
          {guardando ? 'Guardando…' : 'Guardar configuración'}
        </button>
      </form>
    </div>
  );
}
