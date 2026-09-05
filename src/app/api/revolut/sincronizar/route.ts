import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sincronizarPagosRevolut } from "@/lib/revolut/sincronizar";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const usuarioId = (session.user as any).id as string;

  let desde: string | undefined;
  try {
    const body = await req.json();
    desde = body?.desde || undefined;
  } catch {
    // sin body, se usará el valor por defecto
  }

  try {
    const resultado = await sincronizarPagosRevolut(usuarioId, desde);
    return NextResponse.json(resultado);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Error al sincronizar con Revolut" }, { status: 502 });
  }
}
