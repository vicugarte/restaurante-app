import { NextResponse } from 'next/server';
import { encryptSecret, validateFiel } from '../../../../lib/satCrypto';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const form = await request.formData();
    const cer = form.get('cer');
    const key = form.get('key');
    const password = String(form.get('password') || '');
    const alias = String(form.get('alias') || 'Contribuyente').trim();
    if (!cer || !key || !password) return NextResponse.json({ error: 'Carga .cer, .key y contraseña de la llave.' }, { status: 400 });
    if (!cer.name.toLowerCase().endsWith('.cer') || !key.name.toLowerCase().endsWith('.key')) {
      return NextResponse.json({ error: 'Los archivos deben ser .cer y .key.' }, { status: 400 });
    }

    const cerBuffer = Buffer.from(await cer.arrayBuffer());
    const keyBuffer = Buffer.from(await key.arrayBuffer());
    const info = validateFiel(cerBuffer, keyBuffer, password);
    if (!info.rfc) return NextResponse.json({ error: 'No fue posible extraer el RFC del certificado.' }, { status: 400 });

    const admin = getSupabaseAdmin();
    const { error } = await admin.from('sat_credenciales').upsert({
      rfc: info.rfc,
      alias,
      certificado_encriptado: encryptSecret(cerBuffer),
      llave_encriptada: encryptSecret(keyBuffer),
      password_encriptado: encryptSecret(Buffer.from(password, 'utf8')),
      numero_serie: info.serial,
      huella_sha256: info.fingerprint256,
      vigente_desde: info.validFrom,
      vigente_hasta: info.validTo,
      activa: true,
      actualizado_en: new Date().toISOString(),
    }, { onConflict: 'rfc' });
    if (error) throw error;

    return NextResponse.json({ ok: true, rfc: info.rfc, vigenteHasta: info.validTo });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'No se pudo guardar la e.firma.' }, { status: 400 });
  }
}

export async function GET() {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from('sat_credenciales')
      .select('rfc, alias, numero_serie, vigente_desde, vigente_hasta, activa, actualizado_en')
      .order('actualizado_en', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ credenciales: data || [] });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
