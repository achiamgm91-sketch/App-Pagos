import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

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
    return NextResponse.redirect(new URL("/mi/pendientes", req.url));
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
