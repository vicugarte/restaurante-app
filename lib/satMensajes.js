// Traduce los códigos de estado que regresa el SAT a mensajes claros y
// accionables en español -- en vez de mostrar el texto crudo (a veces
// ambiguo o técnico) que regresa el propio servicio.
// Catálogo oficial: "Servicio de Consulta y Recuperación de Comprobantes"
// y documentación del Web Service de Descarga Masiva del SAT.

// Códigos que regresa VerificaSolicitudDescarga (CodigoEstadoSolicitud)
const MENSAJES_CODIGO_ESTADO = {
  '5000': 'Solicitud aceptada correctamente por el SAT.',
  '5002': 'El SAT reportó que se agotaron las solicitudes permitidas para este rango exacto de fechas, incluso después de que el sistema lo reintentó automáticamente con un pequeño ajuste. Puede requerir crear la solicitud manualmente con un rango de fechas ligeramente distinto.',
  '5003': 'La solicitud supera el máximo de comprobantes que el SAT permite entregar en una sola petición. Conviene dividir el período en rangos más chicos.',
  '5004': 'El SAT todavía no tiene información disponible para esta solicitud. El sistema volverá a consultarla automáticamente.',
  '5005': 'Ya existe otra solicitud vigente con exactamente los mismos datos (mismas fechas y tipo). Hay que esperar a que esa termine antes de crear una igual.',
  '5011': 'Se alcanzó el límite de descargas permitidas por folio para el día de hoy. Se puede volver a intentar mañana.',
  '404': 'Ocurrió un error no identificado del lado del SAT. El sistema reintentará automáticamente.',
};

// Códigos que regresa el paso de Autenticación (Autentica) -- normalmente
// llegan como parte del mensaje de error cuando falla antes de poder
// enviar la solicitud.
const MENSAJES_AUTENTICACION = {
  '300': 'El usuario/e.firma no es válido para este trámite.',
  '301': 'Error técnico al construir la solicitud (XML mal formado) -- no depende de tu e.firma, repórtalo.',
  '302': 'Error técnico al firmar la solicitud (sello mal formado) -- no depende de tu e.firma, repórtalo.',
  '303': 'La firma no corresponde con el RFC de la e.firma cargada. Verifica que el certificado (.cer) y la llave privada (.key) sean del mismo trámite.',
  '304': 'El certificado de la e.firma está revocado o caducado. Es necesario renovar la e.firma.',
  '305': 'El certificado no es válido para este servicio. Confirma que sea tu e.firma (no tu Certificado de Sello Digital/CSD), y que no haya sido generado entre el 3 y el 24 de mayo de 2023 (período con falla técnica conocida del SAT).',
};

// Cuando una solicitud termina definitivamente "rechazada" (EstadoSolicitud
// = 5), este es el mensaje que se muestra sin importar el código
// específico que la haya acompañado -- es el resultado final relevante
// para el usuario.
const MENSAJE_RECHAZADA = 'El SAT no encontró CFDI disponibles para los criterios y periodo solicitados.';

export function traducirMensajeVerificacion(codigo, mensajeOriginal, estado) {
  if (estado === 'rechazada') return MENSAJE_RECHAZADA;
  const traducido = MENSAJES_CODIGO_ESTADO[String(codigo)];
  return traducido || mensajeOriginal;
}

export function traducirMensajeAutenticacion(codigo, mensajeOriginal) {
  const traducido = MENSAJES_AUTENTICACION[String(codigo)];
  return traducido || mensajeOriginal;
}
