'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

export default function ActualizarContrasenaPage() {
  const router = useRouter();
  const [lista, setLista] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let activo = true;

    supabase.auth.getSession().then(({ data }) => {
      if (activo && data?.session) setLista(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((evento, sesion) => {
      if (!activo) return;
      if (evento === 'PASSWORD_RECOVERY' || sesion) setLista(true);
    });

    const temporizador = setTimeout(() => {
      if (activo) setLista((valor) => valor);
    }, 1200);

    return () => {
      activo = false;
      clearTimeout(temporizador);
      listener?.subscription?.unsubscribe();
    };
  }, []);

  async function guardarPassword(evento) {
    evento.preventDefault();
    setMensaje('');
    setError('');

    if (password.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmacion) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setEnviando(true);
    const { error: errorUpdate } = await supabase.auth.updateUser({ password });
    setEnviando(false);

    if (errorUpdate) {
      setError('El enlace puede haber vencido o no es válido. Solicita uno nuevo e intenta nuevamente.');
      return;
    }

    setMensaje('Contraseña actualizada correctamente.');
    setTimeout(() => router.replace('/reportes/panel-comercial'), 700);
  }

  return (
    <section className="auth-tarjeta">
      <div className="auth-marca">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-charalita.png" alt="Charalita" />
        <div>
          <div className="auth-sobretitulo">Acceso</div>
          <h1>Nueva contraseña</h1>
        </div>
      </div>

      {!lista ? (
        <div className="auth-error">
          No se encontró una sesión de recuperación válida. Abre nuevamente el enlace recibido por correo o solicita uno nuevo.
        </div>
      ) : (
        <form onSubmit={guardarPassword} className="auth-formulario">
          <label>
            Nueva contraseña
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <label>
            Confirmar contraseña
            <input
              type="password"
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          {error && <div className="auth-error" role="alert">{error}</div>}
          {mensaje && <div className="auth-exito" role="status">{mensaje}</div>}

          <button className="boton auth-boton" type="submit" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar nueva contraseña'}
          </button>
        </form>
      )}
    </section>
  );
}
