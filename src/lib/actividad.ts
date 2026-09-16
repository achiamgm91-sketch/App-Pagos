import { prisma } from "@/lib/prisma";

export async function registrarActividad(params: {
  usuarioId: string | null;
  accion: string;
  entidad: string;
  entidadId?: string | null;
  detalle?: string | null;
}) {
  await prisma.registroActividad.create({
    data: {
      usuarioId: params.usuarioId,
      accion: params.accion,
      entidad: params.entidad,
      entidadId: params.entidadId ?? null,
      detalle: params.detalle ?? null,
    },
  });
}
