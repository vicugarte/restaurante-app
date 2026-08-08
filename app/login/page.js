'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

function FormularioLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) router.replace('/reportes/panel-comercial');
    });
  }, [router]);

  async function iniciarSesion(evento) {
    evento.preventDefault();
    setMensaje('');
    setEnviando(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: correo.trim(),
      password,
    });

    setEnviando(false);

    if (error) {
      setMensaje('Correo o contraseña incorrectos. Verifica tus datos e intenta nuevamente.');
      return;
    }

    const next = searchParams.get('next');
    const destino = next && next.startsWith('/') ? next : '/reportes/panel-comercial';
    router.replace(destino);
    router.refresh();
  }

  return (
    <section className="auth-tarjeta">
      <div className="auth-marca">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-charalita.png" alt="Charalita" />
        <div>
          <div className="auth-sobretitulo">Charalita</div>
          <h1>Panel Comercial</h1>
        </div>
      </div>

      <p className="auth-descripcion">Ingresa con tu cuenta autorizada para consultar ventas e indicadores.</p>

      <form onSubmit={iniciarSesion} className="auth-formulario">
        <label>
          Correo electrónico
          <input
            type="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            autoComplete="email"
            required
          />
        </label>

        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {mensaje && <div className="auth-error" role="alert">{mensaje}</div>}

        <button className="boton auth-boton" type="submit" disabled={enviando}>
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>

      <Link className="auth-enlace" href="/recuperar-contrasena">
        ¿Olvidaste tu contraseña?
      </Link>
    </section>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="auth-cargando-contenido">Cargando…</div>}>
      <FormularioLogin />
    </Suspense>
  );
}
