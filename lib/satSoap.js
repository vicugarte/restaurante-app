import crypto from 'crypto';
import { SignedXml } from 'xml-crypto';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true, trimValues: true });

const URLS = {
  auth: process.env.SAT_AUTH_URL || 'https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/Autenticacion/Autenticacion.svc',
  request: process.env.SAT_REQUEST_URL || 'https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/SolicitaDescargaService.svc',
  verify: process.env.SAT_VERIFY_URL || 'https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/VerificaSolicitudDescargaService.svc',
  download: process.env.SAT_DOWNLOAD_URL || 'https://cfdidescargamasiva.clouda.sat.gob.mx/DescargaMasivaService.svc',
};

const ACTIONS = {
  auth: 'http://DescargaMasivaTerceros.gob.mx/IAutenticacion/Autentica',
  requestEmitidos: 'http://DescargaMasivaTerceros.sat.gob.mx/ISolicitaDescargaService/SolicitaDescargaEmitidos',
  requestRecibidos: 'http://DescargaMasivaTerceros.sat.gob.mx/ISolicitaDescargaService/SolicitaDescargaRecibidos',
  verify: 'http://DescargaMasivaTerceros.sat.gob.mx/IVerificaSolicitudDescargaService/VerificaSolicitudDescarga',
  download: 'http://DescargaMasivaTerceros.sat.gob.mx/IDescargaMasivaTercerosService/Descargar',
};

function escapeXml(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function pemCertificate(cerDer) {
  const b64 = Buffer.from(cerDer).toString('base64');
  return `-----BEGIN CERTIFICATE-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`;
}

function readKeys(cerDer, keyDer, password) {
  const certificate = new crypto.X509Certificate(cerDer);
  const privateKey = crypto.createPrivateKey({ key: keyDer, format: 'der', type: 'pkcs8', passphrase: password });
  return {
    certificate,
    privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    publicCert: pemCertificate(cerDer),
    certificateB64: Buffer.from(cerDer).toString('base64'),
  };
}

function serialDecimal(certificate) {
  const serialHex = String(certificate.serialNumber || '').replace(/[^0-9a-f]/gi, '');
  if (!serialHex) throw new Error('El certificado no contiene un número de serie válido.');

  // X509SerialNumber debe contener el valor decimal del INTEGER ASN.1 completo.
  // Aunque el hexadecimal del certificado SAT pueda representar caracteres ASCII,
  // el servicio espera su conversión numérica hexadecimal -> decimal, tal como
  // aparece en los ejemplos oficiales de XMLDSig del SAT.
  return BigInt(`0x${serialHex}`).toString(10);
}

function issuerName(certificate) {
  return certificate.issuer.split('\n').join(', ');
}

async function soapPost(url, action, body, token = null) {
  const headers = {
    'Content-Type': 'text/xml; charset=utf-8',
    SOAPAction: `"${action}"`,
    Accept: 'text/xml',
  };
  if (token) headers.Authorization = `WRAP access_token="${token}"`;
  const response = await fetch(url, { method: 'POST', headers, body, cache: 'no-store', signal: AbortSignal.timeout(60000) });
  const text = await response.text();
  if (!response.ok) {
    const contentType = response.headers.get('content-type') || 'sin content-type';
    const server = response.headers.get('server') || 'servidor no identificado';
    const requestId = response.headers.get('request-id') || response.headers.get('x-request-id') || '';
    const detail = text.trim() ? text.replace(/\s+/g, ' ').slice(0, 700) : 'respuesta sin contenido';
    throw new Error(`SAT respondió HTTP ${response.status} (${contentType}; ${server}${requestId ? `; request-id ${requestId}` : ''}): ${detail}`);
  }
  if (/<(?:\w+:)?Fault[\s>]/i.test(text)) {
    const fault = parseSoap(text);
    const message = findDeep(fault, ['faultstring', 'Reason', 'Text']) || text.slice(0, 700);
    throw new Error(`Falla SOAP del SAT: ${typeof message === 'string' ? message : JSON.stringify(message)}`);
  }
  return text;
}

function parseSoap(xml) {
  return parser.parse(xml);
}

function findDeep(value, keys) {
  if (!value || typeof value !== 'object') return null;
  for (const key of keys) if (value[key] !== undefined) return value[key];
  for (const child of Object.values(value)) {
    const found = findDeep(child, keys);
    if (found !== null && found !== undefined) return found;
  }
  return null;
}

function signedXmlElement(unsignedElement, keys) {
  const sig = new SignedXml({
    privateKey: keys.privateKey,
    publicCert: keys.publicCert,
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    getKeyInfoContent: () => `<X509Data><X509IssuerSerial><X509IssuerName>${escapeXml(issuerName(keys.certificate))}</X509IssuerName><X509SerialNumber>${serialDecimal(keys.certificate)}</X509SerialNumber></X509IssuerSerial><X509Certificate>${keys.certificateB64}</X509Certificate></X509Data>`,
  });
  sig.addReference({
    xpath: "//*[local-name(.)='solicitud' or local-name(.)='peticionDescarga'][1]",
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature'],
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
  });
  sig.computeSignature(unsignedElement, { location: { reference: "//*[local-name(.)='solicitud' or local-name(.)='peticionDescarga'][1]", action: 'append' } });
  return sig.getSignedXml();
}

function extractAuthenticationToken(xml) {
  const parsed = parseSoap(xml);
  const candidate = findDeep(parsed, ['AutenticaResult']);

  if (typeof candidate === 'string' && candidate.trim()) {
    return candidate.trim();
  }

  if (candidate && typeof candidate === 'object') {
    const text = candidate['#text'] ?? candidate.__text ?? candidate.text;
    if (typeof text === 'string' && text.trim()) return text.trim();
  }

  // Respaldo para respuestas WCF con prefijos o espacios de nombres distintos.
  const match = xml.match(/<(?:\w+:)?AutenticaResult(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?AutenticaResult>/i);
  if (match?.[1]) {
    return match[1]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }

  return '';
}

const tokenCache = new Map(); // rfc -> { token, keys, expiresAt }
const TOKEN_MARGEN_MS = 4.5 * 60 * 1000; // el token dura 5 min; renovamos con margen

export async function authenticateSat(credentials, rfc = 'default') {
  const cached = tokenCache.get(rfc);
  if (cached && cached.expiresAt > Date.now()) {
    return { token: cached.token, keys: cached.keys };
  }

  const keys = readKeys(credentials.cerDer, credentials.keyDer, credentials.password);
  const created = new Date();
  const expires = new Date(created.getTime() + 5 * 60 * 1000);
  const timestampId = '_0';
  const tokenId = `uuid-${crypto.randomUUID()}-1`;
  const authUrl = URLS.auth;

  const envelope = `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:u="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"><s:Header><o:Security s:mustUnderstand="1" xmlns:o="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"><u:Timestamp u:Id="${timestampId}"><u:Created>${created.toISOString()}</u:Created><u:Expires>${expires.toISOString()}</u:Expires></u:Timestamp><o:BinarySecurityToken u:Id="${tokenId}" ValueType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3" EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${keys.certificateB64}</o:BinarySecurityToken></o:Security></s:Header><s:Body><Autentica xmlns="http://DescargaMasivaTerceros.gob.mx" /></s:Body></s:Envelope>`;

  const sig = new SignedXml({
    privateKey: keys.privateKey,
    canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    getKeyInfoContent: () => `<o:SecurityTokenReference xmlns:o="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"><o:Reference ValueType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3" URI="#${tokenId}"/></o:SecurityTokenReference>`,
  });

  sig.addReference({
    xpath: `//*[@*[local-name(.)='Id']='${timestampId}']`,
    transforms: ['http://www.w3.org/2001/10/xml-exc-c14n#'],
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    uri: `#${timestampId}`,
  });

  sig.computeSignature(envelope, {
    location: { reference: "//*[local-name(.)='BinarySecurityToken']", action: 'after' },
    prefix: '',
  });

  const response = await soapPost(authUrl, ACTIONS.auth, sig.getSignedXml());
  const token = extractAuthenticationToken(response);

  if (!token) {
    const compactResponse = response.replace(/\s+/g, ' ').slice(0, 900);
    throw new Error(`El SAT no devolvió un token de autenticación válido. Respuesta: ${compactResponse}`);
  }

  tokenCache.set(rfc, { token, keys, expiresAt: Date.now() + TOKEN_MARGEN_MS });
  return { token, keys };
}

function envelope(operation, signedElement) {
  return `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Header/><s:Body>${operation.replace('{{ELEMENT}}', signedElement)}</s:Body></s:Envelope>`;
}

export async function requestDownload(credentials, solicitud, desfaseSegundos = 0) {
  const { token, keys } = await authenticateSat(credentials, solicitud.rfc);
  const esRecibidos = solicitud.tipo === 'recibidos';
  const operation = esRecibidos ? 'SolicitaDescargaRecibidos' : 'SolicitaDescargaEmitidos';
  const tipoSolicitud = solicitud.contenido === 'metadata' ? 'Metadata' : 'CFDI';
  // El SAT no permite incluir CFDI cancelados cuando se solicitan archivos XML.
  // Para Metadata sí puede consultarse el universo completo.
  const estadoComprobante = tipoSolicitud === 'CFDI' ? 'Vigente' : 'Todos';
  const action = esRecibidos ? ACTIONS.requestRecibidos : ACTIONS.requestEmitidos;

  // El SAT rechaza (código 5002) volver a pedir EXACTAMENTE el mismo rango
  // de fechas más de dos veces. Si ya se agotó, se puede volver a intentar
  // corriendo la hora de inicio unos segundos -- para el SAT ya es un
  // periodo "distinto" aunque en la práctica cubra el mismo día completo.
  const segundosInicial = String(Math.min(Math.max(desfaseSegundos, 0), 59)).padStart(2, '0');

  // Desde la versión 1.5, el SAT separa las operaciones para CFDI recibidos y emitidos.
  // Recibidos usa RfcReceptor; emitidos usa RfcEmisor. RfcSolicitante ya no forma
  // parte del elemento de solicitud de estas operaciones.
  const attrs = [
    `FechaInicial="${escapeXml(`${solicitud.fecha_inicial}T00:00:${segundosInicial}`)}"`,
    `FechaFinal="${escapeXml(`${solicitud.fecha_final}T23:59:59`)}"`,
    `EstadoComprobante="${estadoComprobante}"`,
    esRecibidos
      ? `RfcReceptor="${escapeXml(solicitud.rfc)}"`
      : `RfcEmisor="${escapeXml(solicitud.rfc)}"`,
    `TipoSolicitud="${tipoSolicitud}"`,
  ].join(' ');

  const signed = signedXmlElement(
    `<solicitud xmlns="http://DescargaMasivaTerceros.sat.gob.mx" ${attrs}></solicitud>`,
    keys,
  );
  const xml = envelope(
    `<${operation} xmlns="http://DescargaMasivaTerceros.sat.gob.mx">{{ELEMENT}}</${operation}>`,
    signed,
  );
  const response = await soapPost(URLS.request, action, xml, token);
  const data = parseSoap(response);
  return {
    idSolicitud: findDeep(data, ['IdSolicitud', '@_IdSolicitud']),
    codigo: findDeep(data, ['CodEstatus', '@_CodEstatus']),
    mensaje: findDeep(data, ['Mensaje', '@_Mensaje']),
    raw: response,
  };
}

export async function verifyDownload(credentials, solicitud) {
  const { token, keys } = await authenticateSat(credentials, solicitud.rfc);
  const signed = signedXmlElement(`<solicitud xmlns="http://DescargaMasivaTerceros.sat.gob.mx" IdSolicitud="${escapeXml(solicitud.id_solicitud_sat)}" RfcSolicitante="${escapeXml(solicitud.rfc)}"></solicitud>`, keys);
  const xml = envelope(`<VerificaSolicitudDescarga xmlns="http://DescargaMasivaTerceros.sat.gob.mx">{{ELEMENT}}</VerificaSolicitudDescarga>`, signed);
  const response = await soapPost(URLS.verify, ACTIONS.verify, xml, token);
  const data = parseSoap(response);
  const ids = findDeep(data, ['IdsPaquetes', 'IdsPaquete']);
  return {
    estadoSolicitud: Number(findDeep(data, ['EstadoSolicitud', '@_EstadoSolicitud']) || 0),
    codigoEstadoSolicitud: findDeep(data, ['CodigoEstadoSolicitud', '@_CodigoEstadoSolicitud']),
    numeroCfdi: Number(findDeep(data, ['NumeroCFDIs', '@_NumeroCFDIs']) || 0),
    codigo: findDeep(data, ['CodEstatus', '@_CodEstatus']),
    mensaje: findDeep(data, ['Mensaje', '@_Mensaje']),
    idsPaquetes: !ids ? [] : Array.isArray(ids) ? ids.map(String) : typeof ids === 'object' ? Object.values(ids).flat().map(String) : [String(ids)],
    raw: response,
  };
}

function extractPackageContent(response, data) {
  const candidate = findDeep(data, ['Paquete', 'PaqueteResponse']);
  if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  if (candidate && typeof candidate === 'object') {
    const text = candidate['#text'] ?? candidate.__text ?? candidate.text;
    if (typeof text === 'string' && text.trim()) return text.trim();
  }

  const match = response.match(/<(?:\w+:)?Paquete(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?Paquete>/i);
  if (match?.[1]) {
    return match[1]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }
  return '';
}

export async function downloadPackage(credentials, rfc, packageId) {
  const { token, keys } = await authenticateSat(credentials, rfc);
  const signed = signedXmlElement(`<peticionDescarga xmlns="http://DescargaMasivaTerceros.sat.gob.mx" IdPaquete="${escapeXml(packageId)}" RfcSolicitante="${escapeXml(rfc)}"></peticionDescarga>`, keys);
  const xml = envelope(`<PeticionDescargaMasivaTercerosEntrada xmlns="http://DescargaMasivaTerceros.sat.gob.mx">{{ELEMENT}}</PeticionDescargaMasivaTercerosEntrada>`, signed);
  const response = await soapPost(URLS.download, ACTIONS.download, xml, token);
  const data = parseSoap(response);
  const paquete = extractPackageContent(response, data);
  const codigo = findDeep(data, ['CodEstatus', '@_CodEstatus']);
  const mensaje = findDeep(data, ['Mensaje', '@_Mensaje']);

  if (!paquete) {
    const error = new Error(String(mensaje || 'El paquete todavía no contiene datos descargables.'));
    error.code = 'SAT_PACKAGE_NOT_READY';
    error.satCode = codigo ? String(codigo) : '';
    throw error;
  }

  const zip = Buffer.from(paquete.replace(/\s/g, ''), 'base64');
  if (!zip.length) {
    const error = new Error('El paquete fue informado por el SAT, pero todavía está vacío.');
    error.code = 'SAT_PACKAGE_NOT_READY';
    error.satCode = codigo ? String(codigo) : '';
    throw error;
  }

  return { zip, codigo, mensaje };
}
