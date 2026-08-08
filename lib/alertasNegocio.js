// Alertas de negocio: estimación de inventario y rangos de control (KPIs).
// Ambas usan valores configurables (tabla `configuracion`), no están fijas
// en el código.

export function estimarInventario({ conteoValor, comprasDesdeConteo, ventasDesdeConteo, costoObjetivoPct }) {
  const consumoEstimado = ventasDesdeConteo * (costoObjetivoPct / 100);
  return conteoValor + comprasDesdeConteo - consumoEstimado;
}

export function evaluarAlertaInventario({ conteo, comprasDesdeConteo, ventasDesdeConteo, config }) {
  if (!conteo) {
    return {
      tipo: 'inventario',
      nombre: 'Inventario',
      motivo: 'Nunca se ha registrado un conteo físico de inventario — no se puede estimar el nivel actual.',
      plantillaId: 'conteo_inventario',
      critico: false,
    };
  }
  const estimado = estimarInventario({
    conteoValor: conteo.valor,
    comprasDesdeConteo,
    ventasDesdeConteo,
    costoObjetivoPct: config.costo_objetivo_promedio,
  });
  if (estimado < config.inventario_minimo) {
    return {
      tipo: 'inventario',
      nombre: 'Inventario estimado bajo',
      motivo: `Estimado ~$${estimado.toFixed(0)} (mínimo configurado: $${config.inventario_minimo.toFixed(0)}). Basado en el conteo del ${conteo.fecha} más compras y ventas desde entonces — revisa físicamente o registra compras/conteo pendientes.`,
      plantillaId: 'conteo_inventario',
      critico: estimado < 0,
    };
  }
  return null;
}

function calcularPorcentaje(numerador, denominador) {
  if (!denominador || denominador <= 0) return null;
  return (numerador / denominador) * 100;
}

// porCodigo: { [codigoCuenta]: montoAcumuladoDelMes }
export function evaluarRangos(porCodigo, config) {
  const alertas = [];

  const ventasAlimentos = porCodigo['4101'] || 0;
  const costoAlimentos = porCodigo['5101'] || 0;
  const pctAlimentos = calcularPorcentaje(costoAlimentos, ventasAlimentos);
  if (pctAlimentos !== null && (pctAlimentos < config.costo_alimentos_min || pctAlimentos > config.costo_alimentos_max)) {
    alertas.push({
      tipo: 'rango',
      nombre: 'Costo de alimentos fuera de rango',
      motivo: `${pctAlimentos.toFixed(1)}% de las ventas de alimentos (rango esperado ${config.costo_alimentos_min}%–${config.costo_alimentos_max}%). Puede ser un error de captura o un cambio real en costos.`,
      critico: false,
    });
  }

  const ventasBebidas = porCodigo['4102'] || 0;
  const costoBebidas = porCodigo['5102'] || 0;
  const pctBebidas = calcularPorcentaje(costoBebidas, ventasBebidas);
  if (pctBebidas !== null && (pctBebidas < config.costo_bebidas_min || pctBebidas > config.costo_bebidas_max)) {
    alertas.push({
      tipo: 'rango',
      nombre: 'Costo de bebidas fuera de rango',
      motivo: `${pctBebidas.toFixed(1)}% de las ventas de bebidas (rango esperado ${config.costo_bebidas_min}%–${config.costo_bebidas_max}%). Puede ser un error de captura o un cambio real en costos.`,
      critico: false,
    });
  }

  const ventasTotales = ventasAlimentos + ventasBebidas + (porCodigo['4103'] || 0);
  const nomina = (porCodigo['6101'] || 0) + (porCodigo['6102'] || 0);
  const pctNomina = calcularPorcentaje(nomina, ventasTotales);
  if (pctNomina !== null && (pctNomina < config.nomina_min || pctNomina > config.nomina_max)) {
    alertas.push({
      tipo: 'rango',
      nombre: 'Nómina fuera de rango',
      motivo: `${pctNomina.toFixed(1)}% de las ventas totales (rango esperado ${config.nomina_min}%–${config.nomina_max}%). Puede ser un error de captura o un cambio real en la operación.`,
      critico: false,
    });
  }

  return alertas;
}
