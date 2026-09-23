import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrarActividad } from "@/lib/actividad";
import { tienePermiso } from "@/lib/permisos";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!tienePermiso((session.user as any).rol, (session.user as any).permisos, "gestionar_pagos")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const usuarioId = (session.user as any).id as string;
  const body = await req.json();

  const data: Record<string, any> = { actualizadoPorId: usuarioId };

  if (body.fecha !== undefined) {
    const nuevaFecha = new Date(body.fecha);
    if (isNaN(nuevaFecha.getTime())) {
      return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
    }
    data.fecha = nuevaFecha;
  }

  if (body.persona !== undefined) {
    if (!String(body.persona).trim()) {
      return NextResponse.json({ error: "El nombre no puede estar vacío" }, { status: 400 });
    }
    data.persona = String(body.persona).trim();
  }

  if (body.importeEur !== undefined) data.importeEur = body.importeEur;
  if (body.importeUsd !== undefined) data.importeUsd = body.importeUsd;
  if (body.banco !== undefined) data.banco = body.banco;

  const pago = await prisma.pago.update({
    where: { id: params.id },
    data,
    include: { cobrador: true, contenedor: true, cobradorAsignadoPor: true },
  });

  await registrarActividad({
    usuarioId,
    accion: "editar_pago",
    entidad: "Pago",
    entidadId: pago.id,
    detalle: `Editó el pago de "${pago.persona}"`,
  });

  return NextResponse.json({ pago });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!tienePermiso((session.user as any).rol, (session.user as any).permisos, "gestionar_pagos")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const pago = await prisma.pago.findUnique({ where: { id: params.id }, select: { id: true, persona: true } });
  if (!pago) {
    return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });
  }

  await prisma.pago.delete({ where: { id: params.id } });

  const usuarioId = (session.user as any).id as string;
  await registrarActividad({
    usuarioId,
    accion: "eliminar_pago",
    entidad: "Pago",
    entidadId: pago.id,
    detalle: `Eliminó el pago de "${pago.persona}"`,
  });

  return NextResponse.json({ ok: true });
}
