import { NextRequest, NextResponse } from "next/server";
import { sincronizarPagosSabadell } from "@/lib/enableBanking/sincronizar";
import { obtenerOcrearUsuarioCron } from "@/lib/usuarioSistema";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.DIAG_SECRET || auth !== `Bearer ${process.env.DIAG_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const desde = req.nextUrl.searchParams.get("desde") || undefined;
  const usuarioCron = await obtenerOcrearUsuarioCron();

  try {
    const resultado = await sincronizarPagosSabadell(usuarioCron.id, desde);
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e: any) {
    return NextResponse.json({ error: `Fallo al resincronizar Sabadell: ${e.message}` }, { status: 500 });
  }
}
