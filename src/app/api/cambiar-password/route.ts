import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { password, passwordActual } = await req.json();
  if (!password || String(password).length < 6) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
  }
  if (!passwordActual) {
    return NextResponse.json({ error: "Introduce tu contraseña actual" }, { status: 400 });
  }

  const usuarioId = (session.user as any).id as string;
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }
  const valida = await bcrypt.compare(passwordActual, usuario.passwordHash);
  if (!valida) {
    return NextResponse.json({ error: "La contraseña actual no es correcta" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { passwordHash, debeCambiarPassword: false },
  });

  return NextResponse.json({ ok: true });
}
