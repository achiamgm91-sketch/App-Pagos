import { NextRequest, NextResponse } from "next/server";
import { sincronizarPagosSabadell } from "@/lib/enableBanking/sincronizar";
import { obtenerOcrearUsuarioCron } from "@/lib/usuarioSistema";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const usuarioCron = await obtenerOcrearUsuarioCron();

  try {
    const resultado = await sincronizarPagosSabadell(usuarioCron.id);
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Fallo al sincronizar pagos de Sabadell: ${e.message}` },
      { status: 500 }
    );
  }
}
