import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sincronizarPagosRevolut } from "@/lib/revolut/sincronizar";

const USUARIO_CRON = "cron@boomerang";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const usuarioCron = await prisma.usuario.findUnique({ where: { usuario: USUARIO_CRON } });
  if (!usuarioCron) {
    return NextResponse.json(
      { error: `Usuario de sistema '${USUARIO_CRON}' no encontrado en la tabla Usuario.` },
      { status: 500 }
    );
  }

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
