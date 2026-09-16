import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).rol !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await req.json();
  const usuario = String(body.usuario || "").trim();
  const nombre = body.nombre ? String(body.nombre).trim() : null;
  const password = String(body.password || "");
  const rol = body.rol === "COBRADOR" ? "COBRADOR" : "ADMIN";
  const cobradorId = rol === "COBRADOR" && body.cobradorId ? String(body.cobradorId) : null;
  const verTodosPagos = rol === "COBRADOR" ? !!body.verTodosPagos : false;

  if (!usuario || usuario.length < 3) {
    return NextResponse.json({ error: "El usuario debe tener al menos 3 caracteres" }, { status: 400 });
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
  }

  const existente = await prisma.usuario.findUnique({ where: { usuario } });
  if (existente) {
    return NextResponse.json({ error: "Ya existe un usuario con ese nombre" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const nuevo = await prisma.usuario.create({
    data: {
      usuario,
      nombre,
      passwordHash,
      rol,
      cobradorId,
      verTodosPagos,
      debeCambiarPassword: true,
    },
  });

  return NextResponse.json({ ok: true, id: nuevo.id });
}
