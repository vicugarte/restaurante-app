'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import NavTabs from './NavTabs';
import { supabase } from '../lib/supabaseClient';

const RUTAS_PUBLICAS = ['/login', '/recuperar-contrasena', '/actualizar-contrasena'];

export default function AuthShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const esPublica = RUTAS_PUBLICAS.includes(pathname);
  const [sesion, setSesion] = useState(null);
  const [cargando, setCargando] = useState(!esPublica);

  useEffect(() => {
    let activo = true;

    async function revisarSesion() {
      const { data } = await supabase.auth.getSession();
      if (!activo) return;

      const actual = data?.session || null;
      setSesion(actual);

      if (!esPublica && !actual) {
        const destino = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
        router.replace(`/login${destino}`);
      }
      setCargando(false);
    }

    revisarSesion();

    const { data: listener } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      if (!activo) return;
      setSesion(nuevaSesion || null);
      if (!esPublica && !nuevaSesion) router.replace('/login');
    });

    return () => {
      activo = false;
      listener?.subscription?.unsubscribe();
    };
  }, [esPublica, pathname, router]);

  if (esPublica) {
    return <main className="auth-pagina">{children}</main>;
  }

  if (cargando || !sesion) {
    return (
      <main className="auth-cargando">
        <div className="auth-cargando-contenido">Validando acceso…</div>
      </main>
    );
  }

  return (
    <>
      <header className="barra-superior">
        <div className="interior">
          <div className="marca-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-charalita.png" alt="Charalita — Mariscos, chelas y compas" />
          </div>
          <div>
            <div className="marca">Charalita · Mariscos, chelas y compas</div>
            <h1>Panel Comercial</h1>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pescado-icono.png" alt="" className="pez-decorativo" />
        </div>
      </header>
      <div className="barra-nav">
        <div className="interior-nav">
          <NavTabs usuario={sesion.user} />
        </div>
      </div>
      <div className="contenedor">{children}</div>
    </>
  );
}
