import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrarActividad } from "@/lib/actividad";

const ROLES_ADMIN = ["ADMIN", "SUPERADMIN"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !ROLES_ADMIN.includes((session.user as any).rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const sesionRol = (session.user as any).rol as string;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  const cambios: string[] = [];

  if (typeof body.verTodosPagos === "boolean") {
    data.verTodosPagos = body.verTodosPagos;
    cambios.push(`verTodosPagos=${body.verTodosPagos}`);
  }
  if (body.cobradorId !== undefined) {
    data.cobradorId = body.cobradorId || null;
    cambios.push(`cobradorId=${body.cobradorId || "ninguno"}`);
  }
  const rolesPermitidos = sesionRol === "SUPERADMIN" ? ["ADMIN", "COBRADOR", "SUPERADMIN"] : ["ADMIN", "COBRADOR"];
  if (rolesPermitidos.includes(body.rol)) {
    data.rol = body.rol;
    cambios.push(`rol=${body.rol}`);
    if (body.rol === "ADMIN" || body.rol === "SUPERADMIN") {
      data.cobradorId = null;
      data.verTodosPagos = false;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const actualizado = await prisma.usuario.update({ where: { id: params.id }, data });

  await registrarActividad({
    usuarioId: (session.user as any).id,
    accion: "editar_usuario",
    entidad: "Usuario",
    entidadId: params.id,
    detalle: `Editó a "${actualizado.usuario}": ${cambios.join(", ")}`,
  });

  return NextResponse.json({ ok: true });
}
