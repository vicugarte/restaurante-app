'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

export default function RecuperarContrasenaPage() {
  const [correo, setCorreo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviarRecuperacion(evento) {
    evento.preventDefault();
    setMensaje('');
    setError('');
    setEnviando(true);

    const redirectTo = `${window.location.origin}/actualizar-contrasena`;
    const { error: errorReset } = await supabase.auth.resetPasswordForEmail(correo.trim(), { redirectTo });

    setEnviando(false);

    if (errorReset) {
      setError('No fue posible enviar el correo de recuperación. Revisa el correo e intenta nuevamente.');
      return;
    }

    setMensaje('Si el correo pertenece a una cuenta autorizada, recibirás un enlace para crear una nueva contraseña.');
  }

  return (
    <section className="auth-tarjeta">
      <div className="auth-marca">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-charalita.png" alt="Charalita" />
        <div>
          <div className="auth-sobretitulo">Acceso</div>
          <h1>Recuperar contraseña</h1>
        </div>
      </div>

      <p className="auth-descripcion">
        Escribe el correo asociado a tu usuario. Te enviaremos un enlace seguro para cambiar tu contraseña.
      </p>

      <form onSubmit={enviarRecuperacion} className="auth-formulario">
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

        {error && <div className="auth-error" role="alert">{error}</div>}
        {mensaje && <div className="auth-exito" role="status">{mensaje}</div>}

        <button className="boton auth-boton" type="submit" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar enlace de recuperación'}
        </button>
      </form>

      <Link className="auth-enlace" href="/login">Volver al inicio de sesión</Link>
    </section>
  );
}
