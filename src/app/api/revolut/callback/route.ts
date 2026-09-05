import { NextRequest, NextResponse } from "next/server";
import { intercambiarCodigoPorTokens } from "@/lib/revolut/tokens";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/dashboard/importar?revolutError=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(new URL(`/dashboard/importar?revolutError=missing_code`, req.url));
  }

  try {
    await intercambiarCodigoPorTokens(code);
    return NextResponse.redirect(new URL(`/dashboard/importar?revolutConectado=1`, req.url));
  } catch (e: any) {
    console.error("Error en callback de Revolut:", e);
    return NextResponse.redirect(
      new URL(`/dashboard/importar?revolutError=${encodeURIComponent(e.message || "desconocido")}`, req.url)
    );
  }
}
