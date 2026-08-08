'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function TiposMovimiento() {
  const [cuentas, setCuentas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [nombre, setNombre] = useState('');
  const [cuentaCargo, setCuentaCargo] = useState('');
  const [cuentaAbono, setCuentaAbono] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    setCargando(true);
    const [cuentasRes, tiposRes] = await Promise.all([
      supabase.from('cuentas').select('codigo, nombre, tipo').eq('activa', true).order('codigo'),
      supabase.from('tipos_movimiento_personalizados').select('*').order('nombre'),
    ]);
    if (!cuentasRes.error) setCuentas(cuentasRes.data || []);
    if (!tiposRes.error) setTipos(tiposRes.data || []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  function nombreCuenta(codigo) {
    const c = cuentas.find((x) => x.codigo === codigo);
    return c ? `${c.codigo} — ${c.nombre}` : codigo;
  }

  async function guardar(evento) {
    evento.preventDefault();
    setMensaje(null);
    if (!nombre.trim() || !cuentaCargo || !cuentaAbono) {
      setMensaje({ tipo: 'error', texto: 'Completa la descripción y ambas cuentas.' });
      return;
    }
    if (cuentaCargo === cuentaAbono) {
      setMensaje({ tipo: 'error', texto: 'La cuenta de cargo y la de abono no pueden ser la misma.' });
      return;
    }
    setGuardando(true);
    try {
      const { error } = await supabase.from('tipos_movimiento_personalizados').insert({
        nombre: nombre.trim(),
        cuenta_cargo_codigo: cuentaCargo,
        cuenta_abono_codigo: cuentaAbono,
      });
      if (error) throw error;
      setMensaje({ tipo: 'ok', texto: 'Tipo de movimiento creado. Ya aparece en Capturar movimiento.' });
      setNombre('');
      setCuentaCargo('');
      setCuentaAbono('');
      cargar();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: `No se pudo guardar: ${error.message}` });
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(id) {
    if (!window.confirm('¿Eliminar este tipo de movimiento? Las pólizas ya capturadas con él no se ven afectadas.')) {
      return;
    }
    const { error } = await supabase.from('tipos_movimiento_personalizados').delete().eq('id', id);
    if (!error) setTipos((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="panel">
      <h2>Tipos de movimiento personalizados</h2>
      <p className="subtitulo">
        Crea un nuevo tipo de movimiento (descripción + cuenta a cargo + cuenta a abono). En cuanto lo
        guardes, va a aparecer disponible en Capturar movimiento.
      </p>

      {mensaje && <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>}

      <form onSubmit={guardar} style={{ marginBottom: 28 }}>
        <div className="filtro-fecha">
          <div style={{ flex: 1, minWidth: 220 }}>
            <label>Descripción del movimiento</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Compra de uniformes"
            />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label>Cuenta a cargo</label>
            <select value={cuentaCargo} onChange={(e) => setCuentaCargo(e.target.value)}>
              <option value="">Selecciona…</option>
              {cuentas.map((c) => (
                <option key={c.codigo} value={c.codigo}>
                  {c.codigo} — {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label>Cuenta a abono</label>
            <select value={cuentaAbono} onChange={(e) => setCuentaAbono(e.target.value)}>
              <option value="">Selecciona…</option>
              {cuentas.map((c) => (
                <option key={c.codigo} value={c.codigo}>
                  {c.codigo} — {c.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button type="submit" className="boton" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Crear tipo de movimiento'}
        </button>
      </form>

      <h2 style={{ fontSize: '0.95rem' }}>Tipos personalizados existentes</h2>
      {cargando ? (
        <p className="estado-vacio">Cargando…</p>
      ) : tipos.length === 0 ? (
        <p className="estado-vacio">Todavía no has creado ninguno.</p>
      ) : (
        <table className="reporte">
          <thead>
            <tr>
              <th>Descripción</th>
              <th>Cuenta a cargo</th>
              <th>Cuenta a abono</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tipos.map((t) => (
              <tr key={t.id}>
                <td className="nombre">{t.nombre}</td>
                <td className="nombre">{nombreCuenta(t.cuenta_cargo_codigo)}</td>
                <td className="nombre">{nombreCuenta(t.cuenta_abono_codigo)}</td>
                <td>
                  <button className="boton" style={{ background: 'var(--negativo)' }} onClick={() => eliminar(t.id)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
