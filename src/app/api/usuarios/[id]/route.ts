import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).rol !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (typeof body.verTodosPagos === "boolean") {
    data.verTodosPagos = body.verTodosPagos;
  }
  if (body.cobradorId !== undefined) {
    data.cobradorId = body.cobradorId || null;
  }
  if (body.rol === "ADMIN" || body.rol === "COBRADOR") {
    data.rol = body.rol;
    if (body.rol === "ADMIN") {
      data.cobradorId = null;
      data.verTodosPagos = false;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  await prisma.usuario.update({ where: { id: params.id }, data });

  return NextResponse.json({ ok: true });
}
