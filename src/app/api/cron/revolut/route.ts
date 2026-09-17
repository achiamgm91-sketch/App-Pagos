import { NextRequest, NextResponse } from "next/server";
import { sincronizarPagosRevolut } from "@/lib/revolut/sincronizar";
import { obtenerOcrearUsuarioCron } from "@/lib/usuarioSistema";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const usuarioCron = await obtenerOcrearUsuarioCron();

  try {
    const resultado = await sincronizarPagosRevolut(usuarioCron.id);
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Fallo al sincronizar pagos de Revolut: ${e.message}` },
      { status: 500 }
    );
  }
}
