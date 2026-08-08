// Tarifa aplicable durante 2026 para el cálculo de los pagos provisionales
// mensuales de Personas Físicas con Actividad Empresarial y Profesional
// (Artículo 96 LISR, Anexo 8 de la RMF 2026, publicada en el DOF el
// 28 de diciembre de 2025). Valores base MENSUALES — para períodos de
// varios meses se escalan multiplicando límites y cuota fija por el
// número de meses del período (regla del Art. 106 LISR / 175 RLISR).
export const TABLA_ISR_MENSUAL_2026 = [
  { limiteInferior: 0.01, limiteSuperior: 844.59, cuotaFija: 0.0, porcentaje: 1.92 },
  { limiteInferior: 844.6, limiteSuperior: 7168.51, cuotaFija: 16.22, porcentaje: 6.4 },
  { limiteInferior: 7168.52, limiteSuperior: 12598.02, cuotaFija: 420.95, porcentaje: 10.88 },
  { limiteInferior: 12598.03, limiteSuperior: 14644.64, cuotaFija: 1011.68, porcentaje: 16.0 },
  { limiteInferior: 14644.65, limiteSuperior: 17533.64, cuotaFija: 1339.14, porcentaje: 17.92 },
  { limiteInferior: 17533.65, limiteSuperior: 35362.83, cuotaFija: 1856.84, porcentaje: 21.36 },
  { limiteInferior: 35362.84, limiteSuperior: 55736.68, cuotaFija: 5665.16, porcentaje: 23.52 },
  { limiteInferior: 55736.69, limiteSuperior: 106410.5, cuotaFija: 10457.09, porcentaje: 30.0 },
  { limiteInferior: 106410.51, limiteSuperior: 141880.66, cuotaFija: 25659.23, porcentaje: 32.0 },
  { limiteInferior: 141880.67, limiteSuperior: 425641.99, cuotaFija: 37009.69, porcentaje: 34.0 },
  { limiteInferior: 425642.0, limiteSuperior: Infinity, cuotaFija: 133488.54, porcentaje: 35.0 },
];

// Calcula el ISR estimado de Persona Física con Actividad Empresarial para
// un período de `numMeses` meses, escalando la tarifa mensual oficial.
// Simplificación: trata el período elegido como una base independiente
// (no acumula desde enero ni acredita pagos provisionales previos del
// mismo ejercicio) — es un ESTIMADO para planeación, no el cálculo
// definitivo de la declaración.
export function calcularIsrPersonaFisica(baseGravable, numMeses) {
  const base = Math.max(0, baseGravable);
  const meses = Math.max(1, numMeses);
  for (const renglon of TABLA_ISR_MENSUAL_2026) {
    const limInf = renglon.limiteInferior * meses;
    const limSup = renglon.limiteSuperior === Infinity ? Infinity : renglon.limiteSuperior * meses;
    if (base >= limInf && base <= limSup) {
      const cuotaFija = renglon.cuotaFija * meses;
      return cuotaFija + (base - limInf) * (renglon.porcentaje / 100);
    }
  }
  return 0;
}

export function mesesEnPeriodo(fechaInicioISO, fechaFinISO) {
  const inicio = new Date(fechaInicioISO + 'T00:00:00');
  const fin = new Date(fechaFinISO + 'T00:00:00');
  const meses =
    (fin.getFullYear() - inicio.getFullYear()) * 12 + (fin.getMonth() - inicio.getMonth()) + 1;
  return Math.max(1, meses);
}
