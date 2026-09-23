import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

// Páginas de /dashboard que un COBRADOR puede ver si tiene el permiso indicado.
// Las que no aparecen aquí (inicio, usuarios, actividad, devoluciones...) siguen
// siendo solo para ADMIN/SUPERADMIN. Las rutas más específicas van primero.
const RUTAS_CON_PERMISO: { prefijo: string; permisos: string[] }[] = [
  { prefijo: "/dashboard/contenedores/nuevo", permisos: ["gestionar_contenedores"] },
  { prefijo: "/dashboard/contenedores", permisos: ["ver_contenedores", "gestionar_contenedores"] },
  { prefijo: "/dashboard/pagos", permisos: ["ver_pagos", "gestionar_pagos"] },
  { prefijo: "/dashboard/estadisticas", permisos: ["ver_estadisticas"] },
  { prefijo: "/dashboard/importar", permisos: ["importar_pagos"] },
];

function permisosAceptados(pathname: string): string[] {
  if (/^\/dashboard\/contenedores\/[^/]+\/editar/.test(pathname)) return ["gestionar_contenedores"];
  const regla = RUTAS_CON_PERMISO.find((r) => pathname.startsWith(r.prefijo));
  return regla?.permisos ?? [];
}

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = req.nextUrl;

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  if (token.debeCambiarPassword && pathname !== "/cambiar-password") {
    return NextResponse.redirect(new URL("/cambiar-password", req.url));
  }

  if (pathname.startsWith("/dashboard") && token.rol !== "ADMIN" && token.rol !== "SUPERADMIN") {
    const aceptados = permisosAceptados(pathname);
    const permisos = (token.permisos as string[]) ?? [];
    if (aceptados.length === 0 || !aceptados.some((p) => permisos.includes(p))) {
      return NextResponse.redirect(new URL("/mi/pendientes", req.url));
    }
  }

  if (
    (pathname.startsWith("/dashboard/actividad") || pathname.startsWith("/dashboard/devoluciones")) &&
    token.rol !== "SUPERADMIN"
  ) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/mi/:path*", "/cambiar-password", "/api/pagos/:path*", "/api/contenedores/:path*"],
};
