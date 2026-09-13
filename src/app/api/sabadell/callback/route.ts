import { NextRequest, NextResponse } from "next/server";
import { intercambiarCodigoPorSesion } from "@/lib/enableBanking/sesion";

const COOKIE_STATE = "sabadell_oauth_state";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const state = req.nextUrl.searchParams.get("state");
  const stateEsperado = req.cookies.get(COOKIE_STATE)?.value;

  if (error) {
    return NextResponse.redirect(
      new URL(`/dashboard/importar?sabadellError=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(new URL(`/dashboard/importar?sabadellError=missing_code`, req.url));
  }

  if (!stateEsperado || state !== stateEsperado) {
    return NextResponse.redirect(new URL(`/dashboard/importar?sabadellError=invalid_state`, req.url));
  }

  try {
    await intercambiarCodigoPorSesion(code);
    const res = NextResponse.redirect(new URL(`/dashboard/importar?sabadellConectado=1`, req.url));
    res.cookies.delete(COOKIE_STATE);
    return res;
  } catch (e: any) {
    console.error("Error en callback de Sabadell:", e);
    return NextResponse.redirect(
      new URL(`/dashboard/importar?sabadellError=${encodeURIComponent(e.message || "desconocido")}`, req.url)
    );
  }
}
