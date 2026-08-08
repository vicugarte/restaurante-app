import { NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';

export const runtime = 'nodejs';

function extraerMonto(texto, patron) {
  const coincidencia = texto.match(patron);
  if (!coincidencia) return null;
  return Number(coincidencia[1].replace(/,/g, ''));
}

function extraerFecha(texto) {
  const coincidencia = texto.match(/FECHA:\s*([\d]{4}-[\d]{2}-[\d]{2})/i);
  return coincidencia ? coincidencia[1] : null;
}

function extraerResponsable(texto) {
  const coincidencia = texto.match(/REALIZADO POR:\s*(.+)/i);
  return coincidencia ? coincidencia[1].trim() : null;
}

function redondear(numero) {
  return Math.round((numero + Number.EPSILON) * 100) / 100;
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const archivo = formData.get('archivo');
    if (!archivo) {
      return NextResponse.json({ error: 'No se recibió ningún archivo.' }, { status: 400 });
    }

    const buffer = Buffer.from(await archivo.arrayBuffer());
    const { text } = await pdfParse(buffer);

    const fecha = extraerFecha(text);
    const responsable = extraerResponsable(text);

    const descuentos = extraerMonto(text, /DESCUENTOS\s*\$?([\d,]+\.\d{2})/i) || 0;
    const propinas = extraerMonto(text, /PROPINAS MESEROS\s*\$?([\d,]+\.\d{2})/i) || 0;
    const subtotal = extraerMonto(text, /SUBTOTAL\s*\$?([\d,]+\.\d{2})/i);
    const iva = extraerMonto(text, /\bIVA\s*\$?([\d,]+\.\d{2})/i);
    const total = extraerMonto(text, /\bTOTAL\s*\$?([\d,]+\.\d{2})/i);

    const efectivo = extraerMonto(text, /EFECTIVO\s*\$?([\d,]+\.\d{2})/i) || 0;
    const amex = extraerMonto(text, /AMERICAN EXPRESS\s*\$?([\d,]+\.\d{2})/i) || 0;
    const tarjetaCredito = extraerMonto(text, /TARJETA CR[ÉE]DITO\s*\$?([\d,]+\.\d{2})/i) || 0;
    const tarjetaDebito = extraerMonto(text, /TARJETA D[ÉE]BITO\s*\$?([\d,]+\.\d{2})/i) || 0;
    const cxc = extraerMonto(text, /\bCXC\s*\$?([\d,]+\.\d{2})/i) || 0;

    const alimentos = extraerMonto(text, /ALIMENTOS\s*\$?([\d,]+\.\d{2})/i) || 0;
    const bebidasOl = extraerMonto(text, /BEBIDAS OL\s*\$?([\d,]+\.\d{2})/i) || 0;
    const bebidasRegular = extraerMonto(text, /BEBIDAS(?!\s*OL)\s*\$?([\d,]+\.\d{2})/i) || 0;
    const bebidas = bebidasRegular + bebidasOl;

    if (subtotal === null || iva === null || total === null) {
      return NextResponse.json(
        {
          error: 'No se pudieron leer Subtotal, IVA o Total del PDF. Revisa el formato del archivo.',
          diagnostico: {
            caracteresExtraidos: text.length,
            muestraTexto: text.slice(0, 1500),
          },
        },
        { status: 422 }
      );
    }

    const totalProductos = alimentos + bebidas;
    // Prorratear alimentos/bebidas para que sumen exactamente el subtotal (sin IVA)
    let netoAlimentos = 0;
    let netoBebidas = 0;
    if (totalProductos > 0) {
      netoAlimentos = redondear((alimentos / totalProductos) * subtotal);
      netoBebidas = redondear(subtotal - netoAlimentos);
    } else {
      netoAlimentos = subtotal;
    }

    const bancos = redondear(amex + tarjetaCredito + tarjetaDebito);

    const lineas = [
      { cuenta_codigo: '1101', cuenta_nombre: 'Caja', cargo: efectivo, abono: 0 },
      { cuenta_codigo: '1102', cuenta_nombre: 'Bancos', cargo: bancos, abono: 0 },
      { cuenta_codigo: '1103', cuenta_nombre: 'Cuentas por cobrar', cargo: cxc, abono: 0 },
      { cuenta_codigo: '4101', cuenta_nombre: 'Ventas de alimentos', cargo: 0, abono: netoAlimentos },
      { cuenta_codigo: '4102', cuenta_nombre: 'Ventas de bebidas', cargo: 0, abono: netoBebidas },
      { cuenta_codigo: '2106', cuenta_nombre: 'IVA trasladado', cargo: 0, abono: iva },
    ];

    if (propinas > 0) {
      lineas.push({
        cuenta_codigo: '2107',
        cuenta_nombre: 'Propinas por pagar/repartir',
        cargo: 0,
        abono: propinas,
      });
    }

    const propuesta = {
      fecha,
      concepto: `Corte de caja${responsable ? ' - ' + responsable : ''}`,
      lineas,
      memo: { descuentos, subtotal, iva, total, totalProductos, propinas },
      avisos: [
        'Los descuentos ($' + descuentos.toFixed(2) + ') no se registran aparte: se asumen ya reflejados en el Subtotal.',
        'Las ventas de alimentos y bebidas se prorratearon para excluir el IVA (montos del corte vienen con impuesto incluido).',
      ],
    };

    return NextResponse.json({ propuesta });
  } catch (error) {
    return NextResponse.json({ error: `Error leyendo el PDF: ${error.message}` }, { status: 500 });
  }
}
