import { NextResponse } from 'next/server';

const RUTAS_COMERCIALES = [
  '/',
  '/login',
  '/recuperar-contrasena',
  '/actualizar-contrasena',
  '/reportes/panel-comercial',
  '/reportes/grafica',
  '/reportes/actualizar-barman',
];

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const soloComercial = process.env.APP_COMMERCIAL_ONLY !== 'false';

  if (!soloComercial) return NextResponse.next();

  // Archivos públicos, recursos de Next y metadata.
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // En esta primera entrega ningún endpoint interno de administración/SAT
  // queda publicado. Los archivos siguen existiendo para reactivarlos después.
  if (pathname.startsWith('/api/')) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const permitido = RUTAS_COMERCIALES.some(
    (ruta) => pathname === ruta || (ruta.startsWith('/reportes/') && pathname.startsWith(`${ruta}/`))
  );

  if (!permitido) {
    return NextResponse.redirect(new URL('/reportes/panel-comercial', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/:path*',
};
