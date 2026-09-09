import { NextRequest, NextResponse } from "next/server";
import { ejecutarSincronizacionBCE } from "@/lib/tipoCambio";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const resultado = await ejecutarSincronizacionBCE("CRON", null);
  return NextResponse.json(resultado, { status: resultado.exitoso ? 200 : 500 });
}
