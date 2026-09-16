import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrarActividad } from "@/lib/actividad";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const usuarioId = (session.user as any).id as string;

  const pago = await prisma.pago.findUnique({ where: { id: params.id } });
  if (!pago) {
    return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });
  }

  const actualizado = await prisma.pago.update({
    where: { id: params.id },
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
    entidadId: params.id,
    detalle: `${pago.persona}: quitado del cobrador`,
  });

  return NextResponse.json({ pago: actualizado });
}
