import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export const USUARIO_CRON = "cron@boomerang";

export async function obtenerOcrearUsuarioCron() {
  const existente = await prisma.usuario.findUnique({ where: { usuario: USUARIO_CRON } });
  if (existente) return existente;

  const passwordHash = bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), 10);

  return prisma.usuario.create({
    data: {
      usuario: USUARIO_CRON,
      passwordHash,
      nombre: "Sistema (Cron)",
      rol: "ADMIN",
    },
  });
}
