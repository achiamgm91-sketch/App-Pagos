import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ejecutarSincronizacionBCE } from "@/lib/tipoCambio";
import { tienePermiso } from "@/lib/permisos";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!tienePermiso((session.user as any).rol, (session.user as any).permisos, "importar_pagos")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const usuarioId = (session.user as any).id as string;

  const resultado = await ejecutarSincronizacionBCE("MANUAL", usuarioId);
  return NextResponse.json(resultado, { status: resultado.exitoso ? 200 : 500 });
}
