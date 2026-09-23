import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { recalcularPagosConTasaMejorable } from "@/lib/tipoCambio";
import { tienePermiso } from "@/lib/permisos";
import { registrarActividad } from "@/lib/actividad";

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!tienePermiso((session.user as any).rol, (session.user as any).permisos, "gestionar_pagos")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const usuarioId = (session.user as any).id as string;
  const actualizados = await recalcularPagosConTasaMejorable(usuarioId);

  if (actualizados > 0) {
    await registrarActividad({
      usuarioId,
      accion: "recalcular_pagos",
      entidad: "Pago",
      detalle: `Recalculó ${actualizados} pago(s) con una tasa de cambio mejor`,
    });
  }

  return NextResponse.json({ actualizados });
}
