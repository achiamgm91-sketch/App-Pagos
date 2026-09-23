import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrarActividad } from "@/lib/actividad";
import { tienePermiso } from "@/lib/permisos";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const usuarioId = (session.user as any).id as string;
  const rol = (session.user as any).rol as string;
  const permisos = (session.user as any).permisos as string[];
  const cobradorIdSesion = (session.user as any).cobradorId as string | null;

  const pago = await prisma.pago.findUnique({ where: { id: id } });
  if (!pago) {
    return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });
  }

  // Un cobrador puede quitarse a sí mismo de un pago; para quitar el cobrador
  // de otro, hace falta el permiso de gestionar pagos (o ser ADMIN/SUPERADMIN).
  const esSuyo = cobradorIdSesion && pago.cobradorId === cobradorIdSesion;
  if (!esSuyo && !tienePermiso(rol, permisos, "gestionar_pagos")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const actualizado = await prisma.pago.update({
    where: { id: id },
    data: {
      cobradorId: null,
      cobradorAsignadoPorId: null,
      cobradorAsignadoEn: null,
      actualizadoPorId: usuarioId,
    },
  });

  await registrarActividad({
    usuarioId,
    accion: "desasignar_pago",
    entidad: "Pago",
    entidadId: id,
    detalle: `${pago.persona}: quitado del cobrador`,
  });

  return NextResponse.json({ pago: actualizado });
}
