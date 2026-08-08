import { NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';

export const runtime = 'nodejs';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
});

// c = cuenta código, según forma/método de pago
// Catálogo SAT c_FormaPago — clasificación para efectos de la póliza
const FORMAS_A_BANCOS = ['02', '03', '04', '05', '06', '28', '29', '31'];
const FORMAS_REVISION_MANUAL = ['12', '13', '15', '17', '23', '24', '25', '26', '27'];

function determinarCuentaAbono(metodoPago, formaPago) {
  if (metodoPago === 'PPD') {
    // PPD casi siempre usa forma 99 (Por definir) — la deuda queda como pasivo
    return { codigo: '2101', nombre: 'Proveedores de alimentos y bebidas', aviso: null };
  }
  // PUE
  if (formaPago === '01') {
    return { codigo: '1101', nombre: 'Caja', aviso: null };
  }
  if (FORMAS_A_BANCOS.includes(formaPago)) {
    return { codigo: '1102', nombre: 'Bancos', aviso: null };
  }
  if (formaPago === '30') {
    return {
      codigo: '1105',
      nombre: 'Anticipo a proveedores',
      aviso: 'Forma de pago "Aplicación de anticipos": se asumió que consume un anticipo ya registrado.',
    };
  }
  if (FORMAS_REVISION_MANUAL.includes(formaPago)) {
    return {
      codigo: '',
      nombre: '',
      aviso: `Forma de pago "${formaPago}" es un caso especial (dación en pago, compensación, condonación, etc.). No se asumió cuenta — selecciónala manualmente.`,
    };
  }
  // 08 Vales de despensa, 14 Pago por consignación, u otra no contemplada
  return {
    codigo: '1102',
    nombre: 'Bancos',
    aviso: `Forma de pago "${formaPago}" no tiene regla automática (se asumió Bancos). Revisa esta póliza.`,
  };
}

function redondear(numero) {
  return Math.round((numero + Number.EPSILON) * 100) / 100;
}

function comoArreglo(valor) {
  if (valor === undefined || valor === null) return [];
  return Array.isArray(valor) ? valor : [valor];
}

// Clave de Producto/Servicio del SAT (catálogo c_ClaveProdServ, basado en UNSPSC).
// Método de costo directo (periódico): las compras de insumos van directo a
// costo (5101/5102), no a inventario — el ajuste de existencias se hace
// aparte con un conteo físico mensual.
const SEGMENTOS_CONOCIDOS = {
  '15': { codigo: '6111', nombre: 'Combustibles y lubricantes' },
  '81': { codigo: '6104', nombre: 'Servicios' },
};

const PALABRAS_BEBIDA = [
  'cerveza', 'vino', 'tequila', 'vodka', 'whisky', 'whiskey', 'ron ', 'ginebra',
  'licor', 'refresco', 'agua ', 'jugo', 'bebida', 'cola', 'mezcal', 'brandy',
  'sidra', 'champ', 'coctel', 'cóctel', 'cerveza',
];

function clasificarAlimentoBebida(conceptos) {
  const esBebida = (texto) => {
    const t = (texto || '').toLowerCase();
    return PALABRAS_BEBIDA.some((p) => t.includes(p));
  };
  const bebidas = conceptos.filter((c) => esBebida(c.descripcion));
  if (bebidas.length === conceptos.length) {
    return { codigo: '5102', nombre: 'Costo de bebidas vendidas', aviso: null };
  }
  if (bebidas.length === 0) {
    return { codigo: '5101', nombre: 'Costo de alimentos vendidos', aviso: null };
  }
  return {
    codigo: '',
    nombre: '',
    aviso:
      'Esta factura mezcla alimentos y bebidas. Selecciona la cuenta manualmente (5101 o 5102) o divide la póliza.',
  };
}

function determinarCuentaCargo(conceptos) {
  const segmentos = new Set(conceptos.map((c) => (c.claveProdServ || '').slice(0, 2)));
  const esInsumo = segmentos.has('50');

  if (esInsumo && segmentos.size === 1) {
    return clasificarAlimentoBebida(conceptos);
  }

  const otrosConocidos = [...segmentos].filter((s) => SEGMENTOS_CONOCIDOS[s]);
  if (!esInsumo && otrosConocidos.length === 1 && segmentos.size === 1) {
    return { ...SEGMENTOS_CONOCIDOS[otrosConocidos[0]], aviso: null };
  }

  if (segmentos.size > 1) {
    return {
      codigo: '',
      nombre: '',
      aviso:
        'Esta factura mezcla productos de distintas categorías (ej. alimentos y otro tipo de gasto). Selecciona la cuenta manualmente o divide la póliza.',
    };
  }

  return {
    codigo: '',
    nombre: '',
    aviso:
      'Los productos de esta factura no coinciden con ninguna categoría conocida (alimentos, combustible, servicios). No se asumió cuenta de cargo — selecciónala manualmente.',
  };
}

function procesarXml(nombreArchivo, xmlTexto) {
  try {
    const obj = parser.parse(xmlTexto);
    const comp = obj.Comprobante;
    if (!comp) {
      return { nombreArchivo, error: 'No se encontró el nodo Comprobante. ¿Es un CFDI válido?' };
    }

    const total = parseFloat(comp['@_Total']);
    const subtotal = parseFloat(comp['@_SubTotal']);
    const metodoPago = comp['@_MetodoPago'] || 'PUE';
    const formaPago = comp['@_FormaPago'] || '99';
    const fecha = (comp['@_Fecha'] || '').slice(0, 10);
    const emisorNombre = comp.Emisor?.['@_Nombre'] || 'Proveedor';
    const emisorRfc = comp.Emisor?.['@_Rfc'] || '';
    const moneda = comp['@_Moneda'] || 'MXN';
    const tipoCambio = comp['@_TipoCambio'] ? parseFloat(comp['@_TipoCambio']) : null;
    const serie = comp['@_Serie'] || null;
    const folio = comp['@_Folio'] || null;
    const usoCfdi = comp.Receptor?.['@_UsoCFDI'] || null;

    if (isNaN(total) || isNaN(subtotal)) {
      return { nombreArchivo, error: 'No se pudieron leer Total/SubTotal del XML.' };
    }
    if (Math.abs(total) < 0.01) {
      return {
        nombreArchivo,
        error: `Factura con Total de $${total.toFixed(2)} (prácticamente $0). No se generó póliza automáticamente — revisa si aplica registrarla manualmente.`,
      };
    }

    // Traslados: separar IVA (002) de IEPS (003) — siempre desde el desglose
    // fiscal real del XML, nunca inferido por diferencia (Total - SubTotal).
    const traslados = comoArreglo(comp.Impuestos?.Traslados?.Traslado);
    let iva = 0;
    let ieps = 0;
    let ivaDesconocido = false;

    if (traslados.length > 0) {
      for (const t of traslados) {
        const importe = parseFloat(t['@_Importe']) || 0;
        if (t['@_Impuesto'] === '002') iva += importe;
        else if (t['@_Impuesto'] === '003') ieps += importe;
      }
    } else {
      // No hay desglose de Traslados. Si el nodo Impuestos trae el total ya
      // sumado, lo usamos (se asume IVA, que es lo más común); si no hay
      // ningún dato fiscal, se deja en $0 y se avisa — nunca se infiere.
      const totalTrasladados = comp.Impuestos?.['@_TotalImpuestosTrasladados'];
      if (totalTrasladados !== undefined) {
        iva = parseFloat(totalTrasladados) || 0;
      } else if (Math.abs(total - subtotal) > 0.01) {
        ivaDesconocido = true;
      }
    }
    iva = Math.max(0, redondear(iva));
    ieps = Math.max(0, redondear(ieps));

    const uuid = comp.Complemento?.TimbreFiscalDigital?.['@_UUID'] || null;

    const cuentaAbono = determinarCuentaAbono(metodoPago, formaPago);

    const conceptos = comoArreglo(comp.Conceptos?.Concepto).map((c) => ({
      claveProdServ: c['@_ClaveProdServ'] || null,
      descripcion: c['@_Descripcion'] || '',
      cantidad: parseFloat(c['@_Cantidad']) || 1,
      claveUnidad: c['@_ClaveUnidad'] || null,
      valorUnitario: parseFloat(c['@_ValorUnitario']) || 0,
      importe: parseFloat(c['@_Importe']) || 0,
    }));

    const cuentaCargo = determinarCuentaCargo(conceptos);

    // El Total del CFDI es la fuente de verdad. El IEPS de compras de un
    // restaurante normalmente NO es acreditable (solo lo sería si el propio
    // restaurante causara IEPS en sus ventas, que no aplica al vender bebida
    // preparada) — por eso se suma al costo del insumo en vez de ir a una
    // cuenta de IEPS acreditable. El neto se ajusta para que la póliza cuadre
    // exacto (cubre descuentos y redondeos sin necesidad de una línea aparte).
    const netoPrincipal = redondear(total - iva);

    const lineas = [
      { cuenta_codigo: cuentaCargo.codigo, cuenta_nombre: cuentaCargo.nombre, cargo: netoPrincipal, abono: 0 },
    ];
    if (iva > 0) {
      lineas.push({ cuenta_codigo: '1106', cuenta_nombre: 'IVA acreditable', cargo: redondear(iva), abono: 0 });
    }
    lineas.push({
      cuenta_codigo: cuentaAbono.codigo,
      cuenta_nombre: cuentaAbono.nombre,
      cargo: 0,
      abono: redondear(total),
    });

    const avisos = [];
    if (cuentaCargo.aviso) avisos.push(cuentaCargo.aviso);
    if (cuentaAbono.aviso) avisos.push(cuentaAbono.aviso);
    if (ieps > 0) {
      avisos.push(
        `Esta factura trae IEPS ($${ieps.toFixed(2)}), incluido dentro del monto de "${cuentaCargo.nombre || 'la cuenta principal'}" como costo (no se registró como acreditable — revisa con tu contador si tu caso es distinto).`
      );
    }
    if (ivaDesconocido) {
      avisos.push(
        `Total ($${total.toFixed(2)}) y SubTotal ($${subtotal.toFixed(2)}) no coinciden y el XML no trae desglose de impuestos. No se asumió IVA — revisa manualmente si esta factura lleva impuesto.`
      );
    }
    if (moneda !== 'MXN') {
      avisos.push(
        `Factura en ${moneda}${tipoCambio ? ` (tipo de cambio ${tipoCambio})` : ''}. Los montos de la póliza vienen tal cual del XML — verifica si necesitas convertir a MXN.`
      );
    }

    return {
      nombreArchivo,
      propuesta: {
        fecha,
        concepto: `Compra a ${emisorNombre}`,
        folioFiscal: uuid,
        metodoPago,
        formaPago,
        proveedorNombre: emisorNombre,
        proveedorRfc: emisorRfc,
        usoCfdi,
        moneda,
        tipoCambio,
        serie,
        folio,
        lineas,
        conceptos,
        avisos,
      },
    };
  } catch (error) {
    return { nombreArchivo, error: `No se pudo leer el XML: ${error.message}` };
  }
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const archivos = formData.getAll('archivos');

    if (!archivos || archivos.length === 0) {
      return NextResponse.json({ error: 'No se recibió ningún archivo.' }, { status: 400 });
    }

    const resultados = [];
    for (const archivo of archivos) {
      const nombreArchivo = archivo.name || 'archivo.xml';
      if (!nombreArchivo.toLowerCase().endsWith('.xml')) {
        resultados.push({ nombreArchivo, error: 'No es un archivo .xml, se omitió.' });
        continue;
      }
      const texto = await archivo.text();
      resultados.push(procesarXml(nombreArchivo, texto));
    }

    return NextResponse.json({ resultados });
  } catch (error) {
    return NextResponse.json({ error: `Error procesando los archivos: ${error.message}` }, { status: 500 });
  }
}
