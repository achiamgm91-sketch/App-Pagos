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

  const { password } = await req.json();
  if (!password || String(password).length < 6) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const usuarioId = (session.user as any).id as string;

  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { passwordHash, debeCambiarPassword: false },
  });

  return NextResponse.json({ ok: true });
}
