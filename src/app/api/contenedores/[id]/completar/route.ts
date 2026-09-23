import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrarActividad } from "@/lib/actividad";
import { tienePermiso } from "@/lib/permisos";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!tienePermiso((session.user as any).rol, (session.user as any).permisos, "gestionar_contenedores")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const contenedor = await prisma.contenedor.update({
    where: { id: params.id },
    data: { estado: "COMPLETADO", actualizadoPorId: (session.user as any).id },
  });

  await registrarActividad({
    usuarioId: (session.user as any).id,
    accion: "completar_contenedor",
    entidad: "Contenedor",
    entidadId: params.id,
    detalle: `Marcó "${contenedor.nombre}" como completado`,
  });

  return NextResponse.json({ contenedor });
}
