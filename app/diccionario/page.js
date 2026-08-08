'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { PLANTILLAS } from '../../lib/plantillas';

function normalizar(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // quita acentos
}

export default function Diccionario() {
  const [terminos, setTerminos] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [nuevoTermino, setNuevoTermino] = useState('');
  const [nuevasPalabras, setNuevasPalabras] = useState('');
  const [nuevaCuenta, setNuevaCuenta] = useState('');
  const [nuevaPlantilla, setNuevaPlantilla] = useState('');
  const [nuevaNota, setNuevaNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  async function cargar() {
    setCargando(true);
    const [dicc, cuentasRes] = await Promise.all([
      supabase.from('diccionario_conceptos').select('*').order('termino'),
      supabase.from('cuentas').select('codigo, nombre').eq('activa', true).order('codigo'),
    ]);
    if (!dicc.error) setTerminos(dicc.data || []);
    if (!cuentasRes.error) setCuentas(cuentasRes.data || []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  function cuentaPorCodigo(codigo) {
    return cuentas.find((c) => c.codigo === codigo);
  }
  function plantillaPorId(id) {
    return PLANTILLAS.find((p) => p.id === id);
  }

  const resultados = useMemo(() => {
    const q = normalizar(busqueda.trim());
    if (!q) return terminos;
    return terminos.filter((t) => {
      const enTermino = normalizar(t.termino).includes(q);
      const enPalabras = (t.palabras_clave || []).some((p) => normalizar(p).includes(q));
      const enCuenta = normalizar(cuentaPorCodigo(t.cuenta_codigo)?.nombre).includes(q);
      return enTermino || enPalabras || enCuenta;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, terminos, cuentas]);

  async function guardarNuevoTermino(evento) {
    evento.preventDefault();
    if (!nuevoTermino.trim() || !nuevaCuenta) {
      setMensaje({ tipo: 'error', texto: 'Completa al menos el concepto y la cuenta.' });
      return;
    }
    setGuardando(true);
    setMensaje(null);
    try {
      const palabras = nuevasPalabras
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      const { error } = await supabase.from('diccionario_conceptos').insert({
        termino: nuevoTermino.trim(),
        palabras_clave: palabras,
        cuenta_codigo: nuevaCuenta,
        plantilla_id: nuevaPlantilla || null,
        nota: nuevaNota || null,
      });
      if (error) throw error;
      setMensaje({ tipo: 'ok', texto: 'Concepto agregado.' });
      setNuevoTermino('');
      setNuevasPalabras('');
      setNuevaCuenta('');
      setNuevaPlantilla('');
      setNuevaNota('');
      cargar();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: `No se pudo guardar: ${error.message}` });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="panel">
      <h2>Diccionario de conceptos</h2>
      <p className="subtitulo">
        Escribe cualquier palabra relacionada a un gasto o ingreso (ej. &quot;cerveza&quot;, &quot;renta&quot;,
        &quot;televisión&quot;) y te muestra a qué cuenta y plantilla corresponde.
      </p>

      <div className="filtro-fecha">
        <div style={{ flex: 1, minWidth: 260 }}>
          <label>Buscar</label>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Ej. cerveza, renta, televisión, gasolina…"
            autoFocus
          />
        </div>
      </div>

      {cargando ? (
        <p className="estado-vacio">Cargando…</p>
      ) : resultados.length === 0 ? (
        <p className="estado-vacio">
          No se encontró nada para &quot;{busqueda}&quot;. Puedes agregarlo abajo para la próxima vez.
        </p>
      ) : (
        <table className="reporte">
          <thead>
            <tr>
              <th>Concepto</th>
              <th>Cuenta sugerida</th>
              <th>Plantilla</th>
              <th>Nota</th>
            </tr>
          </thead>
          <tbody>
            {resultados.map((t) => {
              const cuenta = cuentaPorCodigo(t.cuenta_codigo);
              const plantilla = plantillaPorId(t.plantilla_id);
              return (
                <tr key={t.id}>
                  <td className="nombre">{t.termino}</td>
                  <td className="nombre">{cuenta ? `${cuenta.codigo} — ${cuenta.nombre}` : '—'}</td>
                  <td className="nombre">
                    {plantilla ? (
                      <Link href={`/captura?plantilla=${plantilla.id}`}>{plantilla.nombre}</Link>
                    ) : (
                      'Manual'
                    )}
                  </td>
                  <td className="nombre">{t.nota || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <button
        type="button"
        className="boton"
        style={{ marginTop: 20 }}
        onClick={() => setMostrarFormulario((v) => !v)}
      >
        {mostrarFormulario ? 'Ocultar' : '+ Agregar concepto nuevo'}
      </button>

      {mostrarFormulario && (
        <form onSubmit={guardarNuevoTermino} style={{ marginTop: 16 }}>
          {mensaje && <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>}
          <div className="filtro-fecha">
            <div style={{ flex: 1, minWidth: 200 }}>
              <label>Concepto</label>
              <input
                type="text"
                value={nuevoTermino}
                onChange={(e) => setNuevoTermino(e.target.value)}
                placeholder="Ej. Renta de lona para evento"
              />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label>Palabras clave (separadas por coma)</label>
              <input
                type="text"
                value={nuevasPalabras}
                onChange={(e) => setNuevasPalabras(e.target.value)}
                placeholder="lona, toldo, carpa"
              />
            </div>
          </div>
          <div className="filtro-fecha">
            <div style={{ flex: 1, minWidth: 200 }}>
              <label>Cuenta correspondiente</label>
              <select value={nuevaCuenta} onChange={(e) => setNuevaCuenta(e.target.value)}>
                <option value="">Selecciona…</option>
                {cuentas.map((c) => (
                  <option key={c.codigo} value={c.codigo}>
                    {c.codigo} — {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label>Plantilla recomendada (opcional)</label>
              <select value={nuevaPlantilla} onChange={(e) => setNuevaPlantilla(e.target.value)}>
                <option value="">Ninguna (captura manual)</option>
                {PLANTILLAS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label>Nota (opcional)</label>
            <input
              type="text"
              value={nuevaNota}
              onChange={(e) => setNuevaNota(e.target.value)}
              placeholder="Cualquier aclaración útil"
            />
          </div>
          <button type="submit" className="boton" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar concepto'}
          </button>
        </form>
      )}
    </div>
  );
}
