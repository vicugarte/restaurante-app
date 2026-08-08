export const MOVIMIENTOS_MASIVOS_BASE = [
  { id: 'reparto_propinas', nombre: 'Reparto de propinas a meseros', cuentaFija: '2107', ladoFijo: 'cargo', ladoPago: 'abono' },
  { id: 'pago_imss', nombre: 'Pago de IMSS/INFONAVIT', cuentaFija: '2104', ladoFijo: 'cargo', ladoPago: 'abono' },
  { id: 'pago_isr_retenido', nombre: 'Pago de ISR retenido (nómina)', cuentaFija: '2105', ladoFijo: 'cargo', ladoPago: 'abono' },
  { id: 'pago_sueldos', nombre: 'Pago de sueldos', cuentaFija: '2112', ladoFijo: 'cargo', ladoPago: 'abono' },
  { id: 'pago_acreedores_diversos', nombre: 'Pago a acreedores diversos', cuentaFija: '2114', ladoFijo: 'cargo', ladoPago: 'abono' },
  { id: 'anticipo_cliente', nombre: 'Anticipo de cliente (evento/banquete)', cuentaFija: '2109', ladoFijo: 'abono', ladoPago: 'cargo' },
  { id: 'venta_tarjeta_regalo', nombre: 'Venta de tarjeta de regalo', cuentaFija: '2110', ladoFijo: 'abono', ladoPago: 'cargo' },
  { id: 'devolucion_cliente', nombre: 'Devolución o descuento a cliente', cuentaFija: '4106', ladoFijo: 'cargo', ladoPago: 'abono' },
  { id: 'pago_iva_determinado', nombre: 'Pago de IVA por pagar', cuentaFija: '2111', ladoFijo: 'cargo', ladoPago: 'abono' },
  { id: 'pago_impuestos', nombre: 'Pago de impuestos (ISR)', cuentaFija: '6117', ladoFijo: 'cargo', ladoPago: 'abono' },
  { id: 'pago_proveedor', nombre: 'Pago a proveedor', cuentaFija: '2101', ladoFijo: 'cargo', ladoPago: 'abono' },
  { id: 'pago_renta_por_pagar', nombre: 'Pago de renta por pagar', cuentaFija: '2102', ladoFijo: 'cargo', ladoPago: 'abono' },
  { id: 'pago_servicios_por_pagar', nombre: 'Pago de servicios por pagar', cuentaFija: '2113', ladoFijo: 'cargo', ladoPago: 'abono' },
];

export function construirCatalogoMasivo(tiposPersonalizados = []) {
  const personalizados = tiposPersonalizados.map((tipo) => {
    const cargoEsPago = ['1101', '1102'].includes(tipo.cuenta_cargo_codigo);
    const abonoEsPago = ['1101', '1102'].includes(tipo.cuenta_abono_codigo);
    const compatible = cargoEsPago !== abonoEsPago;

    return {
      id: `custom_${tipo.id}`,
      nombre: tipo.nombre,
      cuentaFija: cargoEsPago ? tipo.cuenta_abono_codigo : tipo.cuenta_cargo_codigo,
      ladoFijo: cargoEsPago ? 'abono' : 'cargo',
      ladoPago: cargoEsPago ? 'cargo' : 'abono',
      compatible,
      motivo: compatible
        ? ''
        : 'El tipo personalizado debe usar Caja (1101) o Bancos (1102) en exactamente una de sus dos cuentas.',
    };
  });

  return [...MOVIMIENTOS_MASIVOS_BASE.map((m) => ({ ...m, compatible: true, motivo: '' })), ...personalizados]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map((movimiento, indice) => ({ ...movimiento, codigoPlantilla: `M${String(indice + 1).padStart(3, '0')}` }));
}
