'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabaseClient';
import { construirCatalogoMasivo } from '../../lib/cargaMasiva';
import { formatoMoneda } from '../../lib/format';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fechaExcelAISO(valor) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor.toISOString().slice(0, 10);
  if (typeof valor === 'number') {
    const parsed = XLSX.SSF.parse_date_code(valor);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const texto = String(valor ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  const partes = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (partes) return `${partes[3]}-${partes[2].padStart(2, '0')}-${partes[1].padStart(2, '0')}`;
  return '';
}

function descargarLibro(libro, nombre) {
  XLSX.writeFile(libro, nombre, { compression: true });
}

export default function CargaMasiva() {
  const [catalogo, setCatalogo] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [cargandoCatalogo, setCargandoCatalogo] = useState(true);
  const [filas, setFilas] = useState([]);
  const [mensaje, setMensaje] = useState(null);
  const [guardando, setGuardando] = useState(false);

  async function consultarCatalogoActual() {
    setCargandoCatalogo(true);
    const [tiposRes, cuentasRes] = await Promise.all([
      supabase.from('tipos_movimiento_personalizados').select('*').order('nombre'),
      supabase.from('cuentas').select('id, codigo, nombre').eq('activa', true).order('codigo'),
    ]);
    if (tiposRes.error || cuentasRes.error) {
      setMensaje({ tipo: 'error', texto: `No se pudo consultar el catálogo actual: ${(tiposRes.error || cuentasRes.error).message}` });
      setCargandoCatalogo(false);
      return [];
    }
    const actual = construirCatalogoMasivo(tiposRes.data || []);
    setCatalogo(actual);
    setCuentas(cuentasRes.data || []);
    setCargandoCatalogo(false);
    return actual;
  }

  useEffect(() => {
    consultarCatalogoActual();
  }, []);

  const catalogoCompatible = useMemo(() => catalogo.filter((m) => m.compatible), [catalogo]);
  const tieneErrores = filas.some((fila) => fila.errores.length > 0);

  async function generarPlantilla() {
    setMensaje(null);
    const actual = await consultarCatalogoActual();
    if (!actual.length) return;

    const instrucciones = [
      ['PLANTILLA PARA CARGA MASIVA DE MOVIMIENTOS'],
      ['La plantilla fue generada con el catálogo vigente al momento de la descarga. No cambies los nombres de las hojas ni de las columnas.'],
      [],
      ['INSTRUCCIONES'],
      ['1. Captura los movimientos únicamente en la hoja "Movimientos", comenzando en la fila 2.'],
      ['2. Tipo de movimiento: escribe el código M### indicado en el catálogo de esta hoja.'],
      ['3. Monto: captura un número mayor a cero, sin signos de moneda ni separadores de texto.'],
      ['4. Forma de pago: escribe 1 para Efectivo/Caja o 2 para Transferencia, tarjeta o Bancos.'],
      ['5. Fecha: usa DD/MM/AAAA o AAAA-MM-DD.'],
      ['6. Cuenta con factura: escribe 1 cuando exista CFDI o 2 cuando no exista factura.'],
      ['7. UUID del CFDI: es obligatorio cuando la columna anterior sea 1 y debe quedar vacío cuando sea 2.'],
      ['8. El sistema validará todas las filas antes de guardar. Si una fila contiene errores, no se registrará ningún movimiento.'],
      ['9. Cada fila genera una póliza balanceada con una línea de cargo y una línea de abono. Caja o Bancos se asignan automáticamente según la forma de pago.'],
      [],
      ['CATÁLOGO VIGENTE'],
      ['Código', 'Tipo de movimiento', 'Cuenta fija', 'Lado de cuenta fija', 'Disponible', 'Observación'],
      ...actual.map((m) => [m.codigoPlantilla, m.nombre, m.cuentaFija || '', m.ladoFijo || '', m.compatible ? 'Sí' : 'No', m.motivo || '']),
      [],
      ['FORMAS DE PAGO'],
      ['1', 'Efectivo / Caja (cuenta 1101)'],
      ['2', 'Transferencia, tarjeta / Bancos (cuenta 1102)'],
      [],
      ['FACTURA'],
      ['1', 'Sí cuenta con factura; UUID obligatorio'],
      ['2', 'No cuenta con factura; UUID debe quedar vacío'],
    ];

    const hojaInstrucciones = XLSX.utils.aoa_to_sheet(instrucciones);
    hojaInstrucciones['!cols'] = [{ wch: 16 }, { wch: 54 }, { wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 60 }];
    hojaInstrucciones['!freeze'] = { xSplit: 0, ySplit: 15 };

    const encabezados = [['Tipo de movimiento', 'Monto', 'Forma de pago', 'Fecha', 'Cuenta con factura', 'UUID del CFDI']];
    const hojaMovimientos = XLSX.utils.aoa_to_sheet(encabezados);
    hojaMovimientos['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 22 }, { wch: 40 }];
    hojaMovimientos['!autofilter'] = { ref: 'A1:F1' };
    hojaMovimientos['!freeze'] = { xSplit: 0, ySplit: 1 };

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hojaInstrucciones, 'Instrucciones');
    XLSX.utils.book_append_sheet(libro, hojaMovimientos, 'Movimientos');
    descargarLibro(libro, `plantilla-carga-masiva-${new Date().toISOString().slice(0, 10)}.xlsx`);
    setMensaje({ tipo: 'ok', texto: 'Plantilla generada con el catálogo vigente.' });
  }

  async function leerArchivo(evento) {
    const archivo = evento.target.files?.[0];
    evento.target.value = '';
    if (!archivo) return;
    setMensaje(null);
    setFilas([]);

    try {
      const actual = await consultarCatalogoActual();
      const mapa = new Map(actual.filter((m) => m.compatible).map((m) => [m.codigoPlantilla.toUpperCase(), m]));
      const datos = await archivo.arrayBuffer();
      const libro = XLSX.read(datos, { type: 'array', cellDates: true });
      const hoja = libro.Sheets.Movimientos;
      if (!hoja) throw new Error('El archivo no contiene la hoja "Movimientos".');
      const registros = XLSX.utils.sheet_to_json(hoja, { defval: '', raw: true });

      const procesadas = registros
        .filter((r) => Object.values(r).some((v) => String(v).trim() !== ''))
        .map((r, indice) => {
          const codigo = String(r['Tipo de movimiento'] ?? '').trim().toUpperCase();
          const tipo = mapa.get(codigo);
          const monto = Number(String(r.Monto ?? '').replace(/,/g, ''));
          const formaPago = Number(r['Forma de pago']);
          const fecha = fechaExcelAISO(r.Fecha);
          const conFacturaValor = Number(r['Cuenta con factura']);
          const uuid = String(r['UUID del CFDI'] ?? '').trim();
          const errores = [];
          if (!tipo) errores.push('Código de tipo de movimiento inexistente o no disponible.');
          if (!Number.isFinite(monto) || monto <= 0) errores.push('El monto debe ser mayor a cero.');
          if (![1, 2].includes(formaPago)) errores.push('La forma de pago debe ser 1 o 2.');
          if (!fecha || Number.isNaN(new Date(`${fecha}T00:00:00`).getTime())) errores.push('La fecha no es válida.');
          if (![1, 2].includes(conFacturaValor)) errores.push('Cuenta con factura debe ser 1 o 2.');
          if (conFacturaValor === 1 && !UUID_RE.test(uuid)) errores.push('El UUID es obligatorio y debe tener formato CFDI válido.');
          if (conFacturaValor === 2 && uuid) errores.push('El UUID debe quedar vacío cuando no existe factura.');
          return { numero: indice + 2, codigo, tipo, monto, formaPago, fecha, conFactura: conFacturaValor === 1, uuid, errores };
        });

      if (!procesadas.length) throw new Error('La hoja "Movimientos" no contiene filas para importar.');
      setFilas(procesadas);
      setMensaje(
        procesadas.some((f) => f.errores.length)
          ? { tipo: 'error', texto: 'Se encontraron errores. Corrige la plantilla y vuelve a cargarla; todavía no se guardó información.' }
          : { tipo: 'ok', texto: `${procesadas.length} movimientos validados. Revisa la vista previa y confirma la carga.` }
      );
    } catch (error) {
      setMensaje({ tipo: 'error', texto: `No se pudo leer la plantilla: ${error.message}` });
    }
  }

  async function guardarTodo() {
    if (!filas.length || tieneErrores) return;
    setGuardando(true);
    setMensaje(null);
    const cuentaPorCodigo = new Map(cuentas.map((c) => [c.codigo, c]));
    let guardadas = 0;

    try {
      for (const fila of filas) {
        const codigoPago = fila.formaPago === 1 ? '1101' : '1102';
        const cuentaFija = cuentaPorCodigo.get(fila.tipo.cuentaFija);
        const cuentaPago = cuentaPorCodigo.get(codigoPago);
        if (!cuentaFija || !cuentaPago) throw new Error(`Fila ${fila.numero}: no se encontró una cuenta contable activa.`);

        const { data: poliza, error: errorPoliza } = await supabase
          .from('polizas')
          .insert({
            fecha: fila.fecha,
            tipo: 'diario',
            concepto: fila.tipo.nombre,
            referencia: 'CARGA MASIVA',
            con_factura: fila.conFactura,
            folio_fiscal: fila.conFactura ? fila.uuid : null,
          })
          .select('id')
          .single();
        if (errorPoliza) throw new Error(`Fila ${fila.numero}: ${errorPoliza.message}`);

        const lineas = [
          {
            poliza_id: poliza.id,
            cuenta_id: cuentaFija.id,
            cargo: fila.tipo.ladoFijo === 'cargo' ? fila.monto : 0,
            abono: fila.tipo.ladoFijo === 'abono' ? fila.monto : 0,
          },
          {
            poliza_id: poliza.id,
            cuenta_id: cuentaPago.id,
            cargo: fila.tipo.ladoPago === 'cargo' ? fila.monto : 0,
            abono: fila.tipo.ladoPago === 'abono' ? fila.monto : 0,
          },
        ];
        const { error: errorMovimientos } = await supabase.from('movimientos').insert(lineas);
        if (errorMovimientos) {
          await supabase.from('polizas').delete().eq('id', poliza.id);
          throw new Error(`Fila ${fila.numero}: ${errorMovimientos.message}`);
        }
        guardadas += 1;
      }
      setFilas([]);
      setMensaje({ tipo: 'ok', texto: `${guardadas} pólizas se registraron correctamente.` });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: `La carga se detuvo después de ${guardadas} pólizas: ${error.message}` });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="panel">
      <h2>Carga masiva de movimientos</h2>
      <p className="subtitulo">
        Descarga una plantilla creada con los tipos de movimiento vigentes, captura una fila por póliza y vuelve a subirla. El sistema valida el archivo y asigna automáticamente Caja o Bancos para que cada partida cuadre.
      </p>

      {mensaje && <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>}

      <div style={{ border: '1px solid var(--linea)', borderRadius: 8, padding: 18, marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>1. Descargar plantilla actualizada</h3>
        <p className="subtitulo">
          Antes de cada carga, descarga una plantilla nueva. La primera pestaña contiene instrucciones, códigos, cuentas y el catálogo consultado directamente en el sistema.
        </p>
        <button className="boton" type="button" onClick={generarPlantilla} disabled={cargandoCatalogo}>
          {cargandoCatalogo ? 'Consultando catálogo…' : 'Descargar plantilla de Excel'}
        </button>
        <p className="subtitulo" style={{ marginTop: 10 }}>
          Tipos disponibles para carga simple: {catalogoCompatible.length}. Los movimientos que requieren IVA, varias cantidades, áreas o selecciones adicionales deben capturarse desde Capturar movimiento.
        </p>
      </div>

      <div style={{ border: '1px solid var(--linea)', borderRadius: 8, padding: 18, marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>2. Cargar y validar archivo</h3>
        <p className="subtitulo">
          Columnas requeridas: Tipo de movimiento, Monto, Forma de pago, Fecha, Cuenta con factura y UUID del CFDI. No se guarda nada durante esta etapa.
        </p>
        <input type="file" accept=".xlsx,.xls" onChange={leerArchivo} />
      </div>

      {filas.length > 0 && (
        <div>
          <h3>Vista previa</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="reporte">
              <thead>
                <tr><th>Fila</th><th>Tipo</th><th className="monto">Monto</th><th>Pago</th><th>Fecha</th><th>Factura</th><th>Resultado</th></tr>
              </thead>
              <tbody>
                {filas.map((fila) => (
                  <tr key={fila.numero}>
                    <td>{fila.numero}</td>
                    <td>{fila.tipo ? `${fila.codigo} — ${fila.tipo.nombre}` : fila.codigo || '(vacío)'}</td>
                    <td className="monto">{Number.isFinite(fila.monto) ? formatoMoneda(fila.monto) : ''}</td>
                    <td>{fila.formaPago === 1 ? 'Efectivo / Caja' : fila.formaPago === 2 ? 'Bancos' : fila.formaPago}</td>
                    <td>{fila.fecha}</td>
                    <td>{fila.conFactura ? 'Sí' : 'No'}</td>
                    <td>{fila.errores.length ? <span className="negativo">{fila.errores.join(' ')}</span> : <span className="positivo">Correcta ✓</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="boton" type="button" onClick={guardarTodo} disabled={guardando || tieneErrores} style={{ marginTop: 16 }}>
            {guardando ? 'Guardando pólizas…' : `Confirmar y guardar ${filas.length} movimientos`}
          </button>
        </div>
      )}
    </div>
  );
}
