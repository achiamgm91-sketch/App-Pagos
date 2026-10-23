import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrarActividad } from "@/lib/actividad";
import { tienePermiso } from "@/lib/permisos";
import { cerrarContenedorSiCompleto } from "@/lib/cierreAutomatico";

// "Completar" solía limitarse a cambiar la etiqueta a COMPLETADO sin tocar los pagos,
// lo que dejaba el excedente huérfano (sin abrir el contenedor siguiente ni moverle
// el dinero) cada vez que se usaba sobre un contenedor que de verdad había llegado a
// su total. Ahora, si el contenedor está ACTIVO y alcanza su total, se cierra de
// verdad con cerrarContenedorSiCompleto (crea el siguiente, mueve el excedente).
// Solo si no hay excedente que repartir (o ya se cerró así antes y haría falta
// revisarlo a mano) se limita a marcarlo como completado, como hacía siempre.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!tienePermiso((session.user as any).rol, (session.user as any).permisos, "gestionar_contenedores")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const usuarioId = (session.user as any).id as string;
  const existente = await prisma.contenedor.findUnique({ where: { id } });
  if (!existente) {
    return NextResponse.json({ error: "Contenedor no encontrado" }, { status: 404 });
  }

  if (existente.estado === "ACTIVO") {
    const cierre = await cerrarContenedorSiCompleto(id);
    if (cierre) {
      return NextResponse.json({
        contenedor: { ...existente, estado: "COMPLETADO" },
        cierre,
        mensaje: `Se completó y se abrió "${cierre.abierto}" con ${cierre.excedente} ${cierre.moneda} de saldo inicial.`,
      });
    }
  }

  // No había excedente que repartir (o cerrarContenedorSiCompleto no pudo actuar, p.ej.
  // porque este contenedor ya tiene una fila de Ajuste de un cierre anterior y haría
  // falta revisarlo a mano con la herramienta de SUPERADMIN): solo se marca la etiqueta.
  const contenedor = await prisma.contenedor.update({
    where: { id: id },
    data: { estado: "COMPLETADO", actualizadoPorId: usuarioId },
  });

  await registrarActividad({
    usuarioId,
    accion: "completar_contenedor",
    entidad: "Contenedor",
    entidadId: id,
    detalle: `Marcó "${contenedor.nombre}" como completado`,
  });

  return NextResponse.json({ contenedor });
}
