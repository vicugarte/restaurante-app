'use client';

import Link from 'next/link';

function Icono({ nombre }) {
  const props = {
    width: 26,
    height: 26,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };

  switch (nombre) {
    case 'lapiz':
      return (
        <svg {...props}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      );
    case 'ticket':
      return (
        <svg {...props}>
          <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4Z" />
          <path d="M9 5v14" strokeDasharray="2 3" />
        </svg>
      );
    case 'subir':
      return (
        <svg {...props}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6" />
          <path d="M12 18v-6" />
          <path d="M9.5 14.5 12 12l2.5 2.5" />
        </svg>
      );
    case 'alerta':
      return (
        <svg {...props}>
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      );
    case 'camion':
      return (
        <svg {...props}>
          <path d="M1 3h13v13H1z" />
          <path d="M14 8h4l3 3v5h-7V8Z" />
          <circle cx="6" cy="18.5" r="1.8" />
          <circle cx="17.5" cy="18.5" r="1.8" />
        </svg>
      );
    case 'etiqueta':
      return (
        <svg {...props}>
          <path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.24L3 3v6.59a2 2 0 0 0 .59 1.41l9.58 9.59a2 2 0 0 0 2.83 0l4.59-4.59a2 2 0 0 0 0-2.59Z" />
          <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'engrane':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.31.36.58.63.78.28.2.6.32.94.34H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
      );
    case 'libro':
      return (
        <svg {...props}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
          <path d="M9 7h8" />
          <path d="M9 11h8" />
        </svg>
      );
    case 'reloj':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3.5 2" />
        </svg>
      );
    case 'mas':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      );
    case 'descarga':
      return (
        <svg {...props}>
          <path d="M12 3v12" />
          <path d="M7 10l5 5 5-5" />
          <path d="M4 19h16" />
        </svg>
      );
    default:
      return null;
  }
}

const HERRAMIENTAS = [
  {
    href: '/captura',
    icono: 'lapiz',
    titulo: 'Capturar movimiento',
    descripcion: 'Registra cualquier movimiento por tipo (nómina, compras, gastos, pagos) con plantillas guiadas — el sistema arma la póliza contable solo.',
  },
  {
    href: '/importar-corte',
    icono: 'ticket',
    titulo: 'Importar corte de caja',
    descripcion: 'Sube el PDF del corte de caja del día y genera automáticamente la póliza de venta propuesta para revisar y confirmar.',
  },
  {
    href: '/descarga-sat',
    icono: 'descarga',
    titulo: 'Descargar facturas del SAT',
    descripcion: 'Registra la e.firma de forma cifrada, solicita CFDI emitidos o recibidos y consulta el estado de los paquetes del SAT.',
  },
  {
    href: '/importar-facturas',
    icono: 'subir',
    titulo: 'Importar facturas',
    descripcion: 'Carga masiva de XML de facturas de proveedores (CFDI), con clasificación automática de cuenta según forma y método de pago.',
  },
  {
    href: '/reportes/no-deducibles',
    icono: 'alerta',
    titulo: 'Sin factura',
    descripcion: 'Gastos y costos capturados sin comprobante fiscal en el período — normalmente no deducibles para ISR.',
  },
  {
    href: '/reportes/proveedores',
    icono: 'camion',
    titulo: 'Gasto en insumos por proveedor',
    descripcion: 'Tendencia de compras por proveedor a través del tiempo, con alerta automática de aumentos considerables.',
  },
  {
    href: '/reportes/precio-insumos',
    icono: 'etiqueta',
    titulo: 'Precio por insumo',
    descripcion: 'Evolución del precio unitario de cada producto comprado, para detectar alzas de precio insumo por insumo.',
  },
  {
    href: '/configuracion',
    icono: 'engrane',
    titulo: 'Configuración',
    descripcion: 'Ajusta inventario mínimo, rangos de control (costos y nómina), régimen fiscal, vida útil de depreciación, y más.',
  },
  {
    href: '/diccionario',
    icono: 'libro',
    titulo: 'Diccionario de conceptos',
    descripcion: 'Busca cualquier palabra (ej. "cerveza", "renta", "TV") y encuentra en qué cuenta y plantilla debe capturarse.',
  },
  {
    href: '/reportes/bitacora',
    icono: 'reloj',
    titulo: 'Bitácora de movimientos',
    descripcion: 'Registro cronológico de cada póliza capturada, con fecha y hora exacta de captura, para dar seguimiento y control.',
  },
  {
    href: '/tipos-movimiento',
    icono: 'mas',
    titulo: 'Tipos de movimiento',
    descripcion: 'Crea nuevos tipos de movimiento (descripción + cuenta a cargo + cuenta a abono) — aparecen al instante en Capturar movimiento.',
  },
  {
    href: '/reportes/exportar-excel',
    icono: 'descarga',
    titulo: 'Exportar a Excel',
    descripcion: 'Misma selección de cuentas y métricas que la Gráfica — elige columnas y descarga el reporte en .xlsx.',
  },
];

export default function Herramientas() {
  return (
    <div className="panel">
      <h2>Herramientas</h2>
      <p className="subtitulo">Captura, importación y análisis operativo — todo en un solo lugar.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {HERRAMIENTAS.map((h) => (
          <Link
            key={h.href}
            href={h.href}
            className="tarjeta-acceso"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 16,
              textDecoration: 'none',
              color: 'var(--tinta)',
              border: '1px solid var(--linea)',
              borderRadius: 8,
              padding: '16px 18px',
            }}
          >
            <div
              style={{
                flexShrink: 0,
                width: 44,
                height: 44,
                borderRadius: 8,
                background: 'var(--acento-suave)',
                color: 'var(--acento)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icono nombre={h.icono} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.98rem', marginBottom: 3 }}>{h.titulo}</div>
              <div className="subtitulo" style={{ margin: 0 }}>
                {h.descripcion}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
