import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { recalcularPagosConTasaMejorable } from "@/lib/tipoCambio";

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const rol = (session.user as any).rol as string;
  if (!["ADMIN", "SUPERADMIN"].includes(rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const usuarioId = (session.user as any).id as string;
  const actualizados = await recalcularPagosConTasaMejorable(usuarioId);

  return NextResponse.json({ actualizados });
}
