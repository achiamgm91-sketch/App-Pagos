import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const rol = (session.user as any).rol as string;
  if (!["ADMIN", "SUPERADMIN"].includes(rol)) {
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

  return NextResponse.json({ pago });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const rol = (session.user as any).rol as string;
  if (!["ADMIN", "SUPERADMIN"].includes(rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  await prisma.pago.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
