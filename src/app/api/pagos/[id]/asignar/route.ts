import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrarActividad } from "@/lib/actividad";
import { tienePermiso } from "@/lib/permisos";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const usuarioId = (session.user as any).id as string;
  const rol = (session.user as any).rol as string;
  const permisos = (session.user as any).permisos as string[];

  const { cobradorId, contenedorId } = await req.json();
  if (!cobradorId && !contenedorId) {
    return NextResponse.json({ error: "Falta cobradorId o contenedorId" }, { status: 400 });
  }

  if (!tienePermiso(rol, permisos, "gestionar_pagos") && contenedorId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const data: Record<string, any> = { actualizadoPorId: usuarioId };
  if (cobradorId) {
    data.cobradorId = cobradorId;
    data.cobradorAsignadoPorId = usuarioId;
    data.cobradorAsignadoEn = new Date();
  }
  if (contenedorId) data.contenedorId = contenedorId;

  const pago = await prisma.pago.update({
    where: { id: params.id },
    data,
    include: { cobrador: true, contenedor: true },
  });

  await registrarActividad({
    usuarioId,
    accion: "asignar_pago",
    entidad: "Pago",
    entidadId: params.id,
    detalle: `${pago.persona}: ${cobradorId ? `asignado a ${pago.cobrador?.nombre}` : ""}${
      contenedorId ? `movido al contenedor ${pago.contenedor?.nombre}` : ""
    }`,
  });

  return NextResponse.json({ pago });
}
