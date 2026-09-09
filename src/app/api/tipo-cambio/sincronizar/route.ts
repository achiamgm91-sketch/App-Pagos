import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ejecutarSincronizacionBCE } from "@/lib/tipoCambio";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const usuarioId = (session.user as any).id as string;

  const resultado = await ejecutarSincronizacionBCE("MANUAL", usuarioId);
  return NextResponse.json(resultado, { status: resultado.exitoso ? 200 : 500 });
}
