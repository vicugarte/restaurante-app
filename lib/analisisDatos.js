// Lógica de agregación por período, compartida entre la vista Gráfica y
// la exportación a Excel — para que ambas usen exactamente los mismos
// cálculos y no se desincronicen.

export const METRICAS = [
  { id: 'ventas_netas', label: 'Ventas netas', esPct: false },
  { id: 'costo_ventas', label: 'Costo de ventas', esPct: false },
  { id: 'utilidad_bruta', label: 'Utilidad bruta', esPct: false },
  { id: 'gastos_operacion', label: 'Gastos de operación', esPct: false },
  { id: 'utilidad_operacion', label: 'Utilidad de operación', esPct: false },
  { id: 'utilidad_antes_impuestos', label: 'Utilidad antes de impuestos', esPct: false },
  { id: 'utilidad_neta', label: 'Utilidad neta (impuestos reales del período, si existen)', esPct: false },
  { id: 'margen_bruto_pct', label: 'Margen bruto %', esPct: true },
  { id: 'margen_neto_pct', label: 'Margen neto %', esPct: true },
];

export const CODIGOS_NOMINA = ['6101', '6102'];
export const CODIGOS_SERVICIOS = ['6104', '6118', '6119', '6120', '6121'];
export const CODIGOS_COMPRA_INVENTARIO = ['5101', '5102'];

export const NOMBRE_TIPO = {
  activo: 'Activo',
  pasivo: 'Pasivo',
  capital: 'Capital',
  ingreso: 'Ingresos',
  costo: 'Costos',
  gasto: 'Gastos',
};

export function claveDePeriodo(fechaISO, periodicidad) {
  if (periodicidad === 'dia') return fechaISO;
  if (periodicidad === 'anio') return fechaISO.slice(0, 4);
  return fechaISO.slice(0, 7);
}

export function slugProveedor(nombre) {
  return 'prov__' + nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_');
}

export function etiquetaSerie(id, cuentaPorCodigo) {
  const metrica = METRICAS.find((m) => m.id === id);
  if (metrica) return metrica.label;
  if (id === 'grp_compra_inventario') return 'Compra de inventario (total)';
  if (id === 'grp_nomina') return 'Nómina (total)';
  if (id === 'grp_servicios') return 'Servicios (total)';
  if (id.startsWith('prov__')) return id.replace('prov__', '').replace(/_/g, ' ');
  const cuenta = cuentaPorCodigo[id];
  return cuenta ? `${cuenta.codigo} — ${cuenta.nombre}` : id;
}

export function esPorcentaje(id) {
  return METRICAS.find((m) => m.id === id)?.esPct || false;
}

// Construye una fila por período con todas las métricas calculadas, más
// una columna por cada cuenta y por cada proveedor detectado.
export function construirDatosPorPeriodo(movimientos, comprasProveedor, periodicidad, cuentaPorCodigo) {
  const porPeriodo = {};

  function obtenerBucket(clave) {
    if (!porPeriodo[clave]) {
      porPeriodo[clave] = {
        porCuenta: {},
        porProveedor: {},
        porSeccion: { ventas: 0, devolucion: 0, costo_ventas: 0, gasto_operacion: 0 },
        otrosFinIngreso: 0,
        otrosFinGasto: 0,
        impuestos: 0,
      };
    }
    return porPeriodo[clave];
  }

  for (const mv of movimientos) {
    const clave = claveDePeriodo(mv.fecha, periodicidad);
    const bucket = obtenerBucket(clave);
    bucket.porCuenta[mv.codigo] = (bucket.porCuenta[mv.codigo] || 0) + Number(mv.saldo);

    const cuenta = cuentaPorCodigo[mv.codigo];
    const seccion = cuenta?.seccion_reporte;
    if (seccion === 'ventas') bucket.porSeccion.ventas += Number(mv.saldo);
    else if (seccion === 'devolucion') bucket.porSeccion.devolucion += Number(mv.saldo);
    else if (seccion === 'costo_ventas') bucket.porSeccion.costo_ventas += Number(mv.saldo);
    else if (seccion === 'gasto_operacion') bucket.porSeccion.gasto_operacion += Number(mv.saldo);
    else if (seccion === 'otros_financieros') {
      if (cuenta.tipo === 'ingreso') bucket.otrosFinIngreso += Number(mv.saldo);
      else bucket.otrosFinGasto += Number(mv.saldo);
    } else if (seccion === 'impuestos') {
      bucket.impuestos += Number(mv.saldo);
    }
  }

  for (const c of comprasProveedor) {
    const clave = claveDePeriodo(c.fecha, periodicidad);
    const bucket = obtenerBucket(clave);
    const slug = slugProveedor(c.proveedor_nombre);
    bucket.porProveedor[slug] = (bucket.porProveedor[slug] || 0) + Number(c.monto);
  }

  const claves = Object.keys(porPeriodo).sort((a, b) => a.localeCompare(b));

  return claves.map((clave) => {
    const b = porPeriodo[clave];
    const ventasNetas = b.porSeccion.ventas + b.porSeccion.devolucion;
    const costoVentas = b.porSeccion.costo_ventas;
    const utilidadBruta = ventasNetas - costoVentas;
    const gastosOperacion = b.porSeccion.gasto_operacion;
    const utilidadOperacion = utilidadBruta - gastosOperacion;
    const otrosFinancierosNeto = b.otrosFinIngreso - b.otrosFinGasto;
    const utilidadAntesImpuestos = utilidadOperacion + otrosFinancierosNeto;
    const utilidadNeta = utilidadAntesImpuestos - b.impuestos;
    const margenBrutoPct = ventasNetas !== 0 ? (utilidadBruta / ventasNetas) * 100 : null;
    const margenNetoPct = ventasNetas !== 0 ? (utilidadNeta / ventasNetas) * 100 : null;

    const fila = {
      periodo: clave,
      ventas_netas: ventasNetas,
      costo_ventas: costoVentas,
      utilidad_bruta: utilidadBruta,
      gastos_operacion: gastosOperacion,
      utilidad_operacion: utilidadOperacion,
      utilidad_antes_impuestos: utilidadAntesImpuestos,
      utilidad_neta: utilidadNeta,
      margen_bruto_pct: margenBrutoPct === null ? null : Number(margenBrutoPct.toFixed(2)),
      margen_neto_pct: margenNetoPct === null ? null : Number(margenNetoPct.toFixed(2)),
    };
    for (const [codigo, valor] of Object.entries(b.porCuenta)) {
      fila[codigo] = Number(valor.toFixed(2));
    }
    for (const [slug, valor] of Object.entries(b.porProveedor)) {
      fila[slug] = Number(valor.toFixed(2));
    }
    fila.grp_compra_inventario = CODIGOS_COMPRA_INVENTARIO.reduce((s, cod) => s + (fila[cod] || 0), 0);
    fila.grp_nomina = CODIGOS_NOMINA.reduce((s, cod) => s + (fila[cod] || 0), 0);
    fila.grp_servicios = CODIGOS_SERVICIOS.reduce((s, cod) => s + (fila[cod] || 0), 0);
    return fila;
  });
}
