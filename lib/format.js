export function formatoMoneda(valor) {
  const numero = Number(valor) || 0;
  return numero.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  });
}

export function formatoFecha(fecha) {
  if (!fecha) return '—';
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export const NOMBRES_TIPO = {
  activo: 'Activo',
  pasivo: 'Pasivo',
  capital: 'Capital',
  ingreso: 'Ingresos',
  costo: 'Costos',
  gasto: 'Gastos',
  operacion: 'Operación',
  inversion: 'Inversión',
  financiamiento: 'Financiamiento',
};
