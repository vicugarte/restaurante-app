'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';

// Primera entrega comercial:
// Los demás módulos siguen existiendo en el proyecto, pero se mantienen
// fuera de la navegación hasta la siguiente etapa.
const ENLACES = [
  { href: '/reportes/panel-comercial', etiqueta: 'Panel Comercial' },
  { href: '/reportes/grafica', etiqueta: 'Gráfica' },
];

export default function NavTabs({ usuario }) {
  const pathname = usePathname();
  const router = useRouter();

  async function cerrarSesion() {
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="nav-con-sesion">
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
      <div className="sesion-usuario">
        <span title={usuario?.email || ''}>{usuario?.email || 'Usuario'}</span>
        <button type="button" className="boton-sesion" onClick={cerrarSesion}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
