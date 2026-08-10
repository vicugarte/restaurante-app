'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ENLACES = [
  // Fase 1: solo lo que corresponde a información de ventas ya disponible.
  // El resto de páginas (Inicio, Herramientas, Estado de Resultados,
  // Balance General, Flujo de Caja) siguen existiendo y funcionando --
  // solo se ocultaron del menú mientras se incorporan costos (fase 2).
  { href: '/reportes/grafica', etiqueta: 'Gráfica' },
  { href: '/reportes/panel-comercial', etiqueta: 'Panel Comercial' },
  { href: '/reportes/pareto', etiqueta: 'Pareto' },
];

export default function NavTabs() {
  const pathname = usePathname();

  return (
    <nav className="tabs">
      {ENLACES.map((enlace) => (
        <Link
          key={enlace.href}
          href={enlace.href}
          className={pathname === enlace.href ? 'activo' : ''}
        >
          {enlace.etiqueta}
        </Link>
      ))}
    </nav>
  );
}
