// Cada plantilla define los campos que se le piden al usuario (en lenguaje
// natural) y una función construir() que arma las líneas contables
// (código de cuenta, lado, monto) a partir de esos valores.
// El usuario nunca elige cuentas ni cargo/abono directamente en este modo.

function num(v) {
  return Number(v) || 0;
}

const OPCIONES_FORMA_PAGO = [
  { value: '1101', label: 'Efectivo (Caja)' },
  { value: '1102', label: 'Transferencia/Tarjeta (Bancos)' },
];

export const PLANTILLAS = [
  {
    id: 'reparto_propinas',
    nombre: 'Reparto de propinas a meseros',
    conceptoDefault: () => 'Reparto de propinas a meseros',
    campos: [
      { key: 'monto', label: 'Monto repartido', tipo: 'monto' },
      { key: 'formaPago', label: 'Forma de pago', tipo: 'select', opciones: OPCIONES_FORMA_PAGO },
    ],
    construir: (v) => [
      { codigo: '2107', lado: 'cargo', monto: num(v.monto) },
      { codigo: v.formaPago || '1101', lado: 'abono', monto: num(v.monto) },
    ],
  },
  {
    id: 'pago_imss',
    nombre: 'Pago de IMSS/INFONAVIT',
    conceptoDefault: () => 'Pago de IMSS/INFONAVIT',
    campos: [
      { key: 'monto', label: 'Monto pagado', tipo: 'monto' },
      { key: 'formaPago', label: 'Forma de pago', tipo: 'select', opciones: OPCIONES_FORMA_PAGO },
    ],
    construir: (v) => [
      { codigo: '2104', lado: 'cargo', monto: num(v.monto) },
      { codigo: v.formaPago || '1102', lado: 'abono', monto: num(v.monto) },
    ],
  },
  {
    id: 'pago_isr_retenido',
    nombre: 'Pago de ISR retenido (nómina)',
    conceptoDefault: () => 'Pago de ISR retenido de nómina',
    campos: [
      { key: 'monto', label: 'Monto pagado', tipo: 'monto' },
      { key: 'formaPago', label: 'Forma de pago', tipo: 'select', opciones: OPCIONES_FORMA_PAGO },
    ],
    construir: (v) => [
      { codigo: '2105', lado: 'cargo', monto: num(v.monto) },
      { codigo: v.formaPago || '1102', lado: 'abono', monto: num(v.monto) },
    ],
  },
  {
    id: 'deposito_caja',
    nombre: 'Depósito de efectivo a banco',
    conceptoDefault: () => 'Depósito de efectivo a banco',
    campos: [
      {
        key: 'monto',
        label: 'Monto a depositar (la app te sugiere un monto según tu regla de retención — ajústalo al efectivo real que vayas a depositar)',
        tipo: 'monto',
      },
    ],
    construir: (v) => [
      { codigo: '1102', lado: 'cargo', monto: num(v.monto) },
      { codigo: '1101', lado: 'abono', monto: num(v.monto) },
    ],
  },
  {
    id: 'nomina',
    nombre: 'Devengo de nómina',
    conceptoDefault: (v) =>
      `Nómina (devengo) - ${v.area === '6101' ? 'Cocina' : 'Salón'}`,
    campos: [
      {
        key: 'area',
        label: 'Área',
        tipo: 'select',
        opciones: [
          { value: '6101', label: 'Cocina' },
          { value: '6102', label: 'Salón' },
        ],
      },
      { key: 'bruto', label: 'Sueldo bruto', tipo: 'monto' },
      { key: 'imss', label: 'IMSS/INFONAVIT retenido', tipo: 'monto', opcional: true },
      { key: 'isr', label: 'ISR retenido', tipo: 'monto', opcional: true },
    ],
    construir: (v) => {
      const bruto = num(v.bruto);
      const imss = num(v.imss);
      const isr = num(v.isr);
      const neto = bruto - imss - isr;
      const lineas = [
        { codigo: v.area, lado: 'cargo', monto: bruto },
        { codigo: '2112', lado: 'abono', monto: neto },
      ];
      if (imss > 0) lineas.push({ codigo: '2104', lado: 'abono', monto: imss });
      if (isr > 0) lineas.push({ codigo: '2105', lado: 'abono', monto: isr });
      return lineas;
    },
  },
  {
    id: 'pago_sueldos',
    nombre: 'Pago de sueldos',
    conceptoDefault: () => 'Pago de sueldos',
    campos: [
      { key: 'monto', label: 'Monto pagado', tipo: 'monto' },
      { key: 'formaPago', label: 'Forma de pago', tipo: 'select', opciones: OPCIONES_FORMA_PAGO },
    ],
    construir: (v) => [
      { codigo: '2112', lado: 'cargo', monto: num(v.monto) },
      { codigo: v.formaPago || '1102', lado: 'abono', monto: num(v.monto) },
    ],
  },
  {
    id: 'compra_inventario',
    nombre: 'Compra de inventario',
    conceptoDefault: (v) => `Compra de ${v.tipo === '5101' ? 'alimentos' : 'bebidas'}`,
    campos: [
      {
        key: 'tipo',
        label: 'Tipo',
        tipo: 'select',
        opciones: [
          { value: '5101', label: 'Alimentos' },
          { value: '5102', label: 'Bebidas' },
        ],
      },
      { key: 'subtotal', label: 'Monto (sin IVA)', tipo: 'monto' },
      { key: 'iva', label: 'IVA', tipo: 'monto', opcional: true },
      {
        key: 'ieps',
        label: 'IEPS (bebidas alcohólicas, si aplica — se suma al costo, no es acreditable)',
        tipo: 'monto',
        opcional: true,
      },
      {
        key: 'formaPago',
        label: 'Forma de pago',
        tipo: 'select',
        opciones: [...OPCIONES_FORMA_PAGO, { value: '2101', label: 'A crédito (Proveedores)' }],
      },
    ],
    construir: (v) => {
      const subtotal = num(v.subtotal);
      const iva = num(v.iva);
      const ieps = num(v.ieps);
      // El IEPS que paga el restaurante al comprar ya viene gravado desde el
      // productor/distribuidor y normalmente NO es acreditable para un
      // restaurante que sirve bebida preparada — se suma al costo del insumo.
      const lineas = [{ codigo: v.tipo, lado: 'cargo', monto: subtotal + ieps }];
      if (iva > 0) lineas.push({ codigo: '1106', lado: 'cargo', monto: iva });
      lineas.push({ codigo: v.formaPago || '1102', lado: 'abono', monto: subtotal + iva + ieps });
      return lineas;
    },
  },
  {
    id: 'corte_caja',
    nombre: 'Corte de caja (venta diaria)',
    conceptoDefault: () => 'Corte de caja',
    campos: [
      { key: 'efectivo', label: 'Efectivo', tipo: 'monto', opcional: true },
      { key: 'bancos', label: 'Tarjetas/transferencias (Bancos)', tipo: 'monto', opcional: true },
      { key: 'cxc', label: 'Cuentas por cobrar (CXC)', tipo: 'monto', opcional: true },
      { key: 'alimentos', label: 'Ventas de alimentos (sin IVA)', tipo: 'monto', opcional: true },
      { key: 'bebidas', label: 'Ventas de bebidas (sin IVA)', tipo: 'monto', opcional: true },
      { key: 'iva', label: 'IVA trasladado', tipo: 'monto', opcional: true },
      { key: 'propinas', label: 'Propinas de meseros', tipo: 'monto', opcional: true },
      {
        key: 'anticiposAplicados',
        label: 'Anticipos de clientes aplicados hoy (eventos ya realizados)',
        tipo: 'monto',
        opcional: true,
      },
      {
        key: 'tarjetasCanjeadas',
        label: 'Tarjetas de regalo canjeadas hoy',
        tipo: 'monto',
        opcional: true,
      },
    ],
    construir: (v) => {
      const lineas = [];
      if (num(v.efectivo) > 0) lineas.push({ codigo: '1101', lado: 'cargo', monto: num(v.efectivo) });
      if (num(v.bancos) > 0) lineas.push({ codigo: '1102', lado: 'cargo', monto: num(v.bancos) });
      if (num(v.cxc) > 0) lineas.push({ codigo: '1103', lado: 'cargo', monto: num(v.cxc) });
      // Anticipos y tarjetas de regalo ya cobrados antes: hoy no entra
      // efectivo nuevo por esa parte, se "consume" el pasivo (cargo reduce
      // el saldo de una cuenta acreedora).
      if (num(v.anticiposAplicados) > 0) {
        lineas.push({ codigo: '2109', lado: 'cargo', monto: num(v.anticiposAplicados) });
      }
      if (num(v.tarjetasCanjeadas) > 0) {
        lineas.push({ codigo: '2110', lado: 'cargo', monto: num(v.tarjetasCanjeadas) });
      }
      if (num(v.alimentos) > 0) lineas.push({ codigo: '4101', lado: 'abono', monto: num(v.alimentos) });
      if (num(v.bebidas) > 0) lineas.push({ codigo: '4102', lado: 'abono', monto: num(v.bebidas) });
      if (num(v.iva) > 0) lineas.push({ codigo: '2106', lado: 'abono', monto: num(v.iva) });
      if (num(v.propinas) > 0) lineas.push({ codigo: '2107', lado: 'abono', monto: num(v.propinas) });
      return lineas;
    },
  },
  {
    id: 'gasto',
    nombre: 'Registro de gasto',
    conceptoDefault: (v, cuentas) => {
      const cuenta = cuentas.find((c) => c.id === v.cuentaGasto || c.codigo === v.cuentaGasto);
      return cuenta ? cuenta.nombre : 'Gasto';
    },
    campos: [
      { key: 'cuentaGasto', label: 'Tipo de gasto', tipo: 'cuenta-gasto' },
      { key: 'monto', label: 'Monto (sin IVA)', tipo: 'monto' },
      { key: 'iva', label: 'IVA', tipo: 'monto', opcional: true },
      {
        key: 'formaPago',
        label: 'Forma de pago',
        tipo: 'select',
        opciones: [...OPCIONES_FORMA_PAGO, { value: '2114', label: 'A crédito (Acreedores diversos)' }],
      },
    ],
    construir: (v) => {
      const monto = num(v.monto);
      const iva = num(v.iva);
      const lineas = [{ codigoId: v.cuentaGasto, lado: 'cargo', monto }];
      if (iva > 0) lineas.push({ codigo: '1106', lado: 'cargo', monto: iva });
      lineas.push({ codigo: v.formaPago || '1102', lado: 'abono', monto: monto + iva });
      return lineas;
    },
  },
  {
    id: 'pago_acreedores_diversos',
    nombre: 'Pago a acreedores diversos',
    conceptoDefault: () => 'Pago a acreedores diversos',
    campos: [
      { key: 'monto', label: 'Monto pagado', tipo: 'monto' },
      { key: 'formaPago', label: 'Forma de pago', tipo: 'select', opciones: OPCIONES_FORMA_PAGO },
    ],
    construir: (v) => [
      { codigo: '2114', lado: 'cargo', monto: num(v.monto) },
      { codigo: v.formaPago || '1102', lado: 'abono', monto: num(v.monto) },
    ],
  },
  {
    id: 'activo_fijo',
    nombre: 'Compra de mobiliario o equipo',
    conceptoDefault: (v) => {
      const etiquetas = { '1201': 'equipo de cocina', '1202': 'mobiliario/equipo de salón', '1203': 'equipo de cómputo' };
      return `Compra de ${etiquetas[v.tipo] || 'mobiliario/equipo'}`;
    },
    campos: [
      {
        key: 'tipo',
        label: 'Tipo de activo',
        tipo: 'select',
        opciones: [
          { value: '1201', label: 'Equipo de cocina' },
          { value: '1202', label: 'Mobiliario y equipo de salón (mesas, sillas, TV, decoración)' },
          { value: '1203', label: 'Equipo de cómputo (POS, computadoras)' },
        ],
      },
      { key: 'monto', label: 'Monto (sin IVA)', tipo: 'monto' },
      { key: 'iva', label: 'IVA', tipo: 'monto', opcional: true },
      { key: 'formaPago', label: 'Forma de pago', tipo: 'select', opciones: OPCIONES_FORMA_PAGO },
    ],
    construir: (v) => {
      const monto = num(v.monto);
      const iva = num(v.iva);
      const lineas = [{ codigo: v.tipo, lado: 'cargo', monto }];
      if (iva > 0) lineas.push({ codigo: '1106', lado: 'cargo', monto: iva });
      lineas.push({ codigo: v.formaPago || '1102', lado: 'abono', monto: monto + iva });
      return lineas;
    },
  },
  {
    id: 'venta_delivery',
    nombre: 'Venta por app de delivery',
    conceptoDefault: () => 'Venta por app de delivery',
    campos: [
      { key: 'alimentos', label: 'Venta de alimentos (bruta)', tipo: 'monto', opcional: true },
      { key: 'bebidas', label: 'Venta de bebidas (bruta)', tipo: 'monto', opcional: true },
      { key: 'iva', label: 'IVA trasladado', tipo: 'monto', opcional: true },
      { key: 'comision', label: 'Comisión de la plataforma', tipo: 'monto' },
    ],
    construir: (v) => {
      const alimentos = num(v.alimentos);
      const bebidas = num(v.bebidas);
      const iva = num(v.iva);
      const comision = num(v.comision);
      const bruto = alimentos + bebidas + iva;
      const deposito = bruto - comision;
      const lineas = [];
      if (deposito > 0) lineas.push({ codigo: '1102', lado: 'cargo', monto: deposito });
      if (comision > 0) lineas.push({ codigo: '6112', lado: 'cargo', monto: comision });
      if (alimentos > 0) lineas.push({ codigo: '4101', lado: 'abono', monto: alimentos });
      if (bebidas > 0) lineas.push({ codigo: '4102', lado: 'abono', monto: bebidas });
      if (iva > 0) lineas.push({ codigo: '2106', lado: 'abono', monto: iva });
      return lineas;
    },
  },
  {
    id: 'anticipo_cliente',
    nombre: 'Anticipo de cliente (evento/banquete)',
    conceptoDefault: () => 'Anticipo de cliente',
    campos: [
      { key: 'monto', label: 'Monto recibido', tipo: 'monto' },
      { key: 'formaPago', label: 'Forma de pago', tipo: 'select', opciones: OPCIONES_FORMA_PAGO },
    ],
    construir: (v) => [
      { codigo: v.formaPago || '1102', lado: 'cargo', monto: num(v.monto) },
      { codigo: '2109', lado: 'abono', monto: num(v.monto) },
    ],
  },
  {
    id: 'venta_tarjeta_regalo',
    nombre: 'Venta de tarjeta de regalo',
    conceptoDefault: () => 'Venta de tarjeta de regalo',
    campos: [
      { key: 'monto', label: 'Monto', tipo: 'monto' },
      { key: 'formaPago', label: 'Forma de pago', tipo: 'select', opciones: OPCIONES_FORMA_PAGO },
    ],
    construir: (v) => [
      { codigo: v.formaPago || '1102', lado: 'cargo', monto: num(v.monto) },
      { codigo: '2110', lado: 'abono', monto: num(v.monto) },
    ],
  },
  {
    id: 'otros_ingresos',
    nombre: 'Otros ingresos (intereses, venta de activo, seguro)',
    conceptoDefault: (v) => {
      const etiquetas = {
        '4104': 'Intereses ganados',
        '4105': 'Venta de activo fijo',
        '4103': 'Otro ingreso',
      };
      return etiquetas[v.tipo] || 'Otro ingreso';
    },
    campos: [
      {
        key: 'tipo',
        label: 'Tipo de ingreso',
        tipo: 'select',
        opciones: [
          { value: '4104', label: 'Intereses ganados' },
          { value: '4105', label: 'Utilidad en venta de activo fijo' },
          { value: '4103', label: 'Otro (reembolso de seguro, etc.)' },
        ],
      },
      { key: 'monto', label: 'Monto', tipo: 'monto' },
      { key: 'formaPago', label: 'Cuenta destino', tipo: 'select', opciones: OPCIONES_FORMA_PAGO },
    ],
    construir: (v) => [
      { codigo: v.formaPago || '1102', lado: 'cargo', monto: num(v.monto) },
      { codigo: v.tipo || '4103', lado: 'abono', monto: num(v.monto) },
    ],
  },
  {
    id: 'devolucion_cliente',
    nombre: 'Devolución o descuento a cliente',
    conceptoDefault: () => 'Devolución a cliente',
    campos: [
      { key: 'monto', label: 'Monto devuelto', tipo: 'monto' },
      { key: 'formaPago', label: 'Forma de pago (de dónde sale)', tipo: 'select', opciones: OPCIONES_FORMA_PAGO },
    ],
    construir: (v) => [
      { codigo: '4106', lado: 'cargo', monto: num(v.monto) },
      { codigo: v.formaPago || '1102', lado: 'abono', monto: num(v.monto) },
    ],
  },
  {
    id: 'conteo_inventario',
    nombre: 'Conteo de inventario (ajuste)',
    conceptoDefault: () => 'Conteo físico de inventario',
    campos: [
      { key: 'alimentos', label: 'Alimentos contados (valor en pesos)', tipo: 'monto', opcional: true },
      { key: 'bebidas', label: 'Bebidas contadas (valor en pesos)', tipo: 'monto', opcional: true },
    ],
    construir: (v) => {
      const alimentos = num(v.alimentos);
      const bebidas = num(v.bebidas);
      const lineas = [];
      if (alimentos + bebidas > 0) {
        lineas.push({ codigo: '1104', lado: 'cargo', monto: alimentos + bebidas });
      }
      if (alimentos > 0) lineas.push({ codigo: '5101', lado: 'abono', monto: alimentos });
      if (bebidas > 0) lineas.push({ codigo: '5102', lado: 'abono', monto: bebidas });
      return lineas;
    },
  },
  {
    id: 'determinacion_iva',
    nombre: 'Determinación de IVA del período',
    conceptoDefault: () => 'Determinación de IVA del período',
    campos: [
      { key: 'ivaTrasladado', label: 'IVA trasladado del período (cobrado en ventas)', tipo: 'monto' },
      { key: 'ivaAcreditable', label: 'IVA acreditable del período (pagado en compras)', tipo: 'monto' },
    ],
    construir: (v) => {
      const trasladado = num(v.ivaTrasladado);
      const acreditable = num(v.ivaAcreditable);
      const neto = trasladado - acreditable;
      const lineas = [];
      if (trasladado > 0) lineas.push({ codigo: '2106', lado: 'cargo', monto: trasladado });
      if (acreditable > 0) lineas.push({ codigo: '1106', lado: 'abono', monto: acreditable });
      if (neto >= 0) {
        lineas.push({ codigo: '2111', lado: 'abono', monto: neto });
      } else {
        lineas.push({ codigo: '2111', lado: 'cargo', monto: -neto });
      }
      return lineas;
    },
  },
  {
    id: 'pago_iva_determinado',
    nombre: 'Pago de IVA por pagar',
    conceptoDefault: () => 'Pago de IVA por pagar (declaración mensual)',
    campos: [
      { key: 'monto', label: 'Monto pagado', tipo: 'monto' },
      { key: 'formaPago', label: 'Forma de pago', tipo: 'select', opciones: OPCIONES_FORMA_PAGO },
    ],
    construir: (v) => [
      { codigo: '2111', lado: 'cargo', monto: num(v.monto) },
      { codigo: v.formaPago || '1102', lado: 'abono', monto: num(v.monto) },
    ],
  },
  {
    id: 'pago_impuestos',
    nombre: 'Pago de impuestos (ISR)',
    conceptoDefault: () => 'Pago de impuestos (ISR) - declaración mensual',
    campos: [
      { key: 'monto', label: 'Monto pagado (declaración mensual)', tipo: 'monto' },
      { key: 'formaPago', label: 'Forma de pago', tipo: 'select', opciones: OPCIONES_FORMA_PAGO },
    ],
    construir: (v) => [
      { codigo: '6117', lado: 'cargo', monto: num(v.monto) },
      { codigo: v.formaPago || '1102', lado: 'abono', monto: num(v.monto) },
    ],
  },
  {
    id: 'pago_proveedor',
    nombre: 'Pago a proveedor',
    conceptoDefault: () => 'Pago a proveedor',
    campos: [
      { key: 'monto', label: 'Monto pagado', tipo: 'monto' },
      { key: 'formaPago', label: 'Forma de pago', tipo: 'select', opciones: OPCIONES_FORMA_PAGO },
    ],
    construir: (v) => [
      { codigo: '2101', lado: 'cargo', monto: num(v.monto) },
      { codigo: v.formaPago || '1102', lado: 'abono', monto: num(v.monto) },
    ],
  },
  {
    id: 'renta',
    nombre: 'Renta del local',
    conceptoDefault: () => 'Renta del local',
    campos: [
      { key: 'monto', label: 'Monto (sin IVA)', tipo: 'monto' },
      { key: 'iva', label: 'IVA', tipo: 'monto', opcional: true },
      {
        key: 'formaPago',
        label: 'Forma de pago',
        tipo: 'select',
        opciones: [...OPCIONES_FORMA_PAGO, { value: '2102', label: 'A crédito (Renta por pagar)' }],
      },
    ],
    construir: (v) => {
      const monto = num(v.monto);
      const iva = num(v.iva);
      const lineas = [{ codigo: '6103', lado: 'cargo', monto }];
      if (iva > 0) lineas.push({ codigo: '1106', lado: 'cargo', monto: iva });
      lineas.push({ codigo: v.formaPago || '1102', lado: 'abono', monto: monto + iva });
      return lineas;
    },
  },
  {
    id: 'pago_renta_por_pagar',
    nombre: 'Pago de renta por pagar',
    conceptoDefault: () => 'Pago de renta por pagar',
    campos: [
      { key: 'monto', label: 'Monto pagado', tipo: 'monto' },
      { key: 'formaPago', label: 'Forma de pago', tipo: 'select', opciones: OPCIONES_FORMA_PAGO },
    ],
    construir: (v) => [
      { codigo: '2102', lado: 'cargo', monto: num(v.monto) },
      { codigo: v.formaPago || '1102', lado: 'abono', monto: num(v.monto) },
    ],
  },
  {
    id: 'servicios',
    nombre: 'Servicios (luz, agua, gas, internet)',
    conceptoDefault: (v) => {
      const etiquetas = {
        '6118': 'Luz/CFE',
        '6119': 'Agua',
        '6120': 'Gas',
        '6121': 'Internet/Telefonía',
        '6104': 'Servicios',
      };
      return etiquetas[v.tipoServicio] || 'Servicios';
    },
    campos: [
      {
        key: 'tipoServicio',
        label: 'Tipo de servicio',
        tipo: 'select',
        opciones: [
          { value: '6118', label: 'Luz/CFE' },
          { value: '6119', label: 'Agua' },
          { value: '6120', label: 'Gas' },
          { value: '6121', label: 'Internet/Telefonía' },
          { value: '6104', label: 'Otro/general' },
        ],
      },
      { key: 'monto', label: 'Monto (sin IVA)', tipo: 'monto' },
      { key: 'iva', label: 'IVA', tipo: 'monto', opcional: true },
      {
        key: 'formaPago',
        label: 'Forma de pago',
        tipo: 'select',
        opciones: [...OPCIONES_FORMA_PAGO, { value: '2113', label: 'A crédito (Servicios por pagar)' }],
      },
    ],
    construir: (v) => {
      const monto = num(v.monto);
      const iva = num(v.iva);
      const cuentaGasto = v.tipoServicio || '6104';
      const lineas = [{ codigo: cuentaGasto, lado: 'cargo', monto }];
      if (iva > 0) lineas.push({ codigo: '1106', lado: 'cargo', monto: iva });
      lineas.push({ codigo: v.formaPago || '1102', lado: 'abono', monto: monto + iva });
      return lineas;
    },
  },
  {
    id: 'pago_servicios_por_pagar',
    nombre: 'Pago de servicios por pagar',
    conceptoDefault: () => 'Pago de servicios por pagar',
    campos: [
      { key: 'monto', label: 'Monto pagado', tipo: 'monto' },
      { key: 'formaPago', label: 'Forma de pago', tipo: 'select', opciones: OPCIONES_FORMA_PAGO },
    ],
    construir: (v) => [
      { codigo: '2113', lado: 'cargo', monto: num(v.monto) },
      { codigo: v.formaPago || '1102', lado: 'abono', monto: num(v.monto) },
    ],
  },
  {
    id: 'depreciacion',
    nombre: 'Depreciación mensual',
    conceptoDefault: () => 'Depreciación del mes',
    campos: [{ key: 'monto', label: 'Monto del mes', tipo: 'monto' }],
    construir: (v) => [
      { codigo: '6109', lado: 'cargo', monto: num(v.monto) },
      { codigo: '1204', lado: 'abono', monto: num(v.monto) },
    ],
  },
];
