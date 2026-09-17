import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrarActividad } from "@/lib/actividad";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const rolPatch = (session.user as any).rol as string;
  if (!["ADMIN", "SUPERADMIN"].includes(rolPatch)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const usuarioId = (session.user as any).id as string;
  const body = await req.json();

  const data: Record<string, any> = { actualizadoPorId: usuarioId };

  if (body.nombre !== undefined) {
    if (!String(body.nombre).trim()) {
      return NextResponse.json({ error: "El nombre no puede estar vacío" }, { status: 400 });
    }
    data.nombre = String(body.nombre).trim();
  }

  if (body.codigo !== undefined) data.codigo = body.codigo;

  if (body.saldoInicial !== undefined) data.saldoInicial = body.saldoInicial;
  if (body.monedaSaldoInicial !== undefined) data.monedaSaldoInicial = body.monedaSaldoInicial;

  if (body.fechaInicio !== undefined) {
    const nuevaFecha = new Date(body.fechaInicio);
    if (isNaN(nuevaFecha.getTime())) {
      return NextResponse.json({ error: "Fecha de inicio inválida" }, { status: 400 });
    }
    data.fechaInicio = nuevaFecha;
  }

  if (body.totalFactura !== undefined) data.totalFactura = body.totalFactura;
  if (body.monedaTotalFactura !== undefined) data.monedaTotalFactura = body.monedaTotalFactura;
  if (body.estado !== undefined) data.estado = body.estado;

  const contenedor = await prisma.contenedor.update({
    where: { id: params.id },
    data,
  });

  await registrarActividad({
    usuarioId,
    accion: "editar_contenedor",
    entidad: "Contenedor",
    entidadId: contenedor.id,
    detalle: `Editó el contenedor "${contenedor.nombre}"`,
  });

  return NextResponse.json({ contenedor });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const rol = (session.user as any).rol as string;
  if (!["ADMIN", "SUPERADMIN"].includes(rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const contenedor = await prisma.contenedor.findUnique({
    where: { id: params.id },
    select: { id: true, nombre: true },
  });

  if (!contenedor) {
    return NextResponse.json({ error: "Contenedor no encontrado" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.pago.deleteMany({ where: { contenedorId: params.id } }),
    prisma.contenedor.delete({ where: { id: params.id } }),
  ]);

  const usuarioId = (session.user as any).id as string;
  await registrarActividad({
    usuarioId,
    accion: "eliminar_contenedor",
    entidad: "Contenedor",
    entidadId: contenedor.id,
    detalle: `Eliminó el contenedor "${contenedor.nombre}" (y sus pagos)`,
  });

  return NextResponse.json({ ok: true });
}
