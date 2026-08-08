import crypto from 'crypto';

function masterKey() {
  const raw = process.env.SAT_CREDENTIALS_MASTER_KEY || '';
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('SAT_CREDENTIALS_MASTER_KEY debe ser una clave Base64 de 32 bytes.');
  return key;
}

export function encryptSecret(buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptSecret(payload) {
  const data = Buffer.from(payload, 'base64');
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export function validateFiel(cerDer, keyDer, keyPassword) {
  const certificate = new crypto.X509Certificate(cerDer);
  const privateKey = crypto.createPrivateKey({
    key: keyDer,
    format: 'der',
    type: 'pkcs8',
    passphrase: keyPassword,
  });

  const challenge = crypto.randomBytes(48);
  const signature = crypto.sign('sha256', challenge, privateKey);
  const valid = crypto.verify('sha256', challenge, certificate.publicKey, signature);
  if (!valid) throw new Error('La llave privada no corresponde al certificado seleccionado.');

  const validFrom = new Date(certificate.validFrom);
  const validTo = new Date(certificate.validTo);
  const now = new Date();
  if (now < validFrom || now > validTo) throw new Error('El certificado de e.firma no está vigente.');

  const subject = certificate.subject || '';
  const rfcMatch = subject.match(/(?:^|\n|,\s*)x500UniqueIdentifier=([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/i)
    || subject.match(/(?:^|\n|,\s*)serialNumber=([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/i);

  return {
    rfc: rfcMatch?.[1]?.toUpperCase() || null,
    serial: certificate.serialNumber,
    validFrom: validFrom.toISOString(),
    validTo: validTo.toISOString(),
    fingerprint256: certificate.fingerprint256,
  };
}
