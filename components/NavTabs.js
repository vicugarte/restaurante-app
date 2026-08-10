'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ENLACES = [
  { href: '/', etiqueta: 'Inicio' },
  { href: '/herramientas', etiqueta: 'Herramientas' },
  { href: '/reportes/estado-resultados', etiqueta: 'Estado de Resultados' },
  { href: '/reportes/balance-general', etiqueta: 'Balance General' },
  { href: '/reportes/flujo-caja', etiqueta: 'Flujo de Caja' },
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
