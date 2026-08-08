// Cron local para el worker de descarga masiva del SAT.
// Corre este script en su PROPIA ventana de PowerShell, separado del
// navegador -- así la sincronización sigue avanzando aunque cierres la
// pestaña de la app o apagues la pantalla.
//
// Uso recomendado:
//   npm run sat-cron
//
// También puede ejecutarse directamente:
//   node --env-file=.env.local scripts/sat-cron.js
//
// Este script hace DOS cosas en paralelo:
//   1) Cada INTERVALO_MINUTOS minutos: procesa el worker (avanza las
//      solicitudes que ya existen -- enviar, verificar, descargar).
//   2) Todos los días a las HORA_AUTO_SOLICITAR en punto: crea
//      automáticamente las solicitudes nuevas que falten para cada
//      e.firma activa, hasta la fecha de hoy (usa la misma lógica
//      "incremental" del botón manual, así que nunca duplica). Si por
//      cualquier razón esa llamada falla (el servidor no responde, error
//      de red, etc.), se reintenta cada REINTENTO_FALLO_MINUTOS minutos
//      hasta que sí se logre -- no se da por vencido hasta el día
//      siguiente.
//
// Déjalo corriendo (Ctrl+C para detenerlo).

const INTERVALO_MINUTOS = 3;
const HORA_AUTO_SOLICITAR = 3; // 3:00 a.m.
const REINTENTO_FALLO_MINUTOS = 30;

const URL_WORKER =
  process.env.SAT_WORKER_URL ||
  "http://localhost:3000/api/sat/worker";
const URL_AUTO_SOLICITAR =
  process.env.SAT_AUTO_SOLICITAR_URL ||
  "http://localhost:3000/api/sat/auto-solicitar";

const SECRET =
  process.env.SAT_WORKER_SECRET || "";

function encabezados() {
  return {
    "Content-Type": "application/json",
    ...(SECRET ? { "x-worker-secret": SECRET } : {}),
  };
}

async function tick() {
  const hora = new Date().toLocaleTimeString("es-MX");

  try {
    const respuesta = await fetch(URL_WORKER, {
      method: "POST",
      headers: encabezados(),
      body: JSON.stringify({
        limit: 10,
        concurrency: 3,
      }),
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      console.log(
        `[${hora}] Error del worker: ${
          datos.error || respuesta.status
        }`
      );
      return;
    }

    if (datos.procesadas > 0) {
      console.log(
        `[${hora}] Procesadas ${datos.procesadas} solicitud(es):`
      );

      for (const r of datos.results) {
        console.log(
          `   - ${r.id}: ${r.action}${
            r.error ? ` (${r.error})` : ""
          }`
        );
      }
    } else {
      console.log(
        `[${hora}] Sin solicitudes listas para procesar todavía.`
      );
    }
  } catch (error) {
    console.log(
      `[${hora}] No se pudo conectar (¿está corriendo "npm run dev"?): ${error.message}`
    );
  }
}

// Devuelve true si la llamada se logró (sin importar si hubo o no
// solicitudes nuevas que crear) -- false si falló y hay que reintentar.
async function tickAutoSolicitar() {
  const hora = new Date().toLocaleTimeString("es-MX");
  try {
    const respuesta = await fetch(URL_AUTO_SOLICITAR, {
      method: "POST",
      headers: encabezados(),
    });
    const datos = await respuesta.json();

    if (!respuesta.ok) {
      console.log(
        `[${hora}] [auto-solicitar] Error: ${datos.error || respuesta.status}`
      );
      return false;
    }

    console.log(`[${hora}] [auto-solicitar] Revisión diaria de e.firmas activas:`);
    for (const r of datos.resultados || []) {
      console.log(
        `   - ${r.rfc}: ${r.mensaje}${
          r.nuevas ? ` (${r.nuevas} nueva(s))` : ""
        }${r.reintentadas ? ` (${r.reintentadas} reintentada(s))` : ""}`
      );
    }
    return true;
  } catch (error) {
    console.log(`[${hora}] [auto-solicitar] No se pudo conectar: ${error.message}`);
    return false;
  }
}

function proximaHoraFijada() {
  const ahora = new Date();
  const proxima = new Date(ahora);
  proxima.setHours(HORA_AUTO_SOLICITAR, 0, 0, 0);
  if (proxima <= ahora) proxima.setDate(proxima.getDate() + 1);
  return proxima;
}

async function ejecutarAutoSolicitarConReintento() {
  const exito = await tickAutoSolicitar();
  if (exito) {
    programarSiguienteAutoSolicitar();
  } else {
    console.log(
      `   Se reintentará en ${REINTENTO_FALLO_MINUTOS} minutos (hasta que se logre).`
    );
    setTimeout(ejecutarAutoSolicitarConReintento, REINTENTO_FALLO_MINUTOS * 60 * 1000);
  }
}

function programarSiguienteAutoSolicitar() {
  const proxima = proximaHoraFijada();
  const esperaMs = proxima.getTime() - Date.now();
  console.log(
    `   Próxima auto-solicitud programada: ${proxima.toLocaleString("es-MX")}`
  );
  setTimeout(ejecutarAutoSolicitarConReintento, esperaMs);
}

console.log(
  `Cron del SAT iniciado -- worker cada ${INTERVALO_MINUTOS} min, auto-solicitud diaria a las ${HORA_AUTO_SOLICITAR}:00. Ctrl+C para detener.\n`
);

tick();
setInterval(tick, INTERVALO_MINUTOS * 60 * 1000);

// La auto-solicitud corre una vez al arrancar (para confirmar que
// funciona), y luego siempre a la hora fijada -- con reintento cada 30
// min si algo falla.
ejecutarAutoSolicitarConReintento();
