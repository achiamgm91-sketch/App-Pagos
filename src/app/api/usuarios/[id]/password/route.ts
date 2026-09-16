import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrarActividad } from "@/lib/actividad";
import bcrypt from "bcryptjs";

const ROLES_ADMIN = ["ADMIN", "SUPERADMIN"];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !ROLES_ADMIN.includes((session.user as any).rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { password } = await req.json();
  if (!password || String(password).length < 6) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const usuario = await prisma.usuario.update({
    where: { id: params.id },
    data: { passwordHash, debeCambiarPassword: true },
  });

  await registrarActividad({
    usuarioId: (session.user as any).id,
    accion: "resetear_password",
    entidad: "Usuario",
    entidadId: params.id,
    detalle: `Reseteó la contraseña de "${usuario.usuario}"`,
  });

  return NextResponse.json({ ok: true });
}
