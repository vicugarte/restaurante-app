// Define qué movimientos recurrentes debe tener el restaurante y con qué
// frecuencia, para poder avisar cuando falte capturar algo que los reportes
// necesitan para estar completos.

export const RECORDATORIOS = [
  {
    id: 'renta',
    nombre: 'Renta del local',
    cuentasCodigos: ['6103'],
    frecuencia: 'mensual',
    diaLimite: 5,
    plantillaId: 'renta',
  },
  {
    id: 'servicios',
    nombre: 'Servicios (luz, agua, gas, internet)',
    cuentasCodigos: ['6104'],
    frecuencia: 'mensual',
    diaLimite: 10,
    plantillaId: 'servicios',
  },
  {
    id: 'nomina',
    nombre: 'Nómina',
    cuentasCodigos: ['6101', '6102'],
    frecuencia: 'quincenal',
    diaLimiteQ1: 16,
    plantillaId: 'nomina',
  },
  {
    id: 'depreciacion',
    nombre: 'Depreciación mensual',
    cuentasCodigos: ['6109'],
    frecuencia: 'mensual',
    diaLimite: 28,
    plantillaId: 'depreciacion',
  },
];

const NOMBRES_MES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function diasEnMes(anio, mes) {
  return new Date(anio, mes + 1, 0).getDate();
}

function enRango(fechaStr, y, m, d1, d2) {
  const d = new Date(fechaStr + 'T00:00:00');
  return d.getFullYear() === y && d.getMonth() === m && d.getDate() >= d1 && d.getDate() <= d2;
}

// movimientos: [{ fecha: 'YYYY-MM-DD', cuenta_codigo }]
export function evaluarRecordatorios(movimientos, hoy = new Date()) {
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth();
  const diaHoy = hoy.getDate();
  const totalDiasMes = diasEnMes(anio, mes);

  const mesAntDate = new Date(anio, mes - 1, 1);
  const anioAnt = mesAntDate.getFullYear();
  const mesAnt = mesAntDate.getMonth();
  const totalDiasMesAnt = diasEnMes(anioAnt, mesAnt);

  function existeEnRango(codigos, y, m, d1, d2) {
    return movimientos.some((mv) => codigos.includes(mv.cuenta_codigo) && enRango(mv.fecha, y, m, d1, d2));
  }
  function ultimaFecha(codigos) {
    const fechas = movimientos.filter((mv) => codigos.includes(mv.cuenta_codigo)).map((mv) => mv.fecha).sort();
    return fechas.length ? fechas[fechas.length - 1] : null;
  }

  const pendientes = [];

  for (const r of RECORDATORIOS) {
    if (r.frecuencia === 'diario') {
      const ultima = ultimaFecha(r.cuentasCodigos);
      const diasSin = ultima
        ? Math.floor((hoy - new Date(ultima + 'T00:00:00')) / 86400000)
        : Infinity;
      if (diasSin >= r.umbralDias) {
        pendientes.push({
          ...r,
          motivo: ultima ? `Sin capturar desde ${ultima}` : 'Sin capturas registradas',
          critico: diasSin >= r.umbralDias * 2,
        });
      }
    } else if (r.frecuencia === 'mensual') {
      if (!existeEnRango(r.cuentasCodigos, anio, mes, 1, totalDiasMes) && diaHoy >= r.diaLimite) {
        pendientes.push({ ...r, motivo: `Pendiente este mes (esperado antes del día ${r.diaLimite})` });
      }
      if (!existeEnRango(r.cuentasCodigos, anioAnt, mesAnt, 1, totalDiasMesAnt)) {
        pendientes.push({
          ...r,
          motivo: `No se capturó en ${NOMBRES_MES[mesAnt]} ${anioAnt}`,
          critico: true,
        });
      }
    } else if (r.frecuencia === 'quincenal') {
      if (!existeEnRango(r.cuentasCodigos, anio, mes, 1, 15) && diaHoy >= r.diaLimiteQ1) {
        pendientes.push({
          ...r,
          nombre: `${r.nombre} (1a quincena)`,
          motivo: `Pendiente (esperada antes del día ${r.diaLimiteQ1})`,
        });
      }
      if (!existeEnRango(r.cuentasCodigos, anio, mes, 16, totalDiasMes) && diaHoy >= totalDiasMes) {
        pendientes.push({
          ...r,
          nombre: `${r.nombre} (2a quincena)`,
          motivo: 'Pendiente (esperada antes de fin de mes)',
        });
      }
      if (!existeEnRango(r.cuentasCodigos, anioAnt, mesAnt, 1, 15)) {
        pendientes.push({
          ...r,
          nombre: `${r.nombre} (1a quincena)`,
          motivo: `No se capturó en ${NOMBRES_MES[mesAnt]} ${anioAnt}`,
          critico: true,
        });
      }
      if (!existeEnRango(r.cuentasCodigos, anioAnt, mesAnt, 16, totalDiasMesAnt)) {
        pendientes.push({
          ...r,
          nombre: `${r.nombre} (2a quincena)`,
          motivo: `No se capturó en ${NOMBRES_MES[mesAnt]} ${anioAnt}`,
          critico: true,
        });
      }
    }
  }

  return pendientes;
}
