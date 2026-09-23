import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

async function main() {
  const existente = await prisma.usuario.findUnique({ where: { usuario: "admin" } });
  if (!existente) {
    const passwordGenerada = crypto.randomBytes(9).toString("base64url");
    const passwordHash = await bcrypt.hash(passwordGenerada, 10);
    await prisma.usuario.create({
      data: { usuario: "admin", passwordHash, nombre: "Administrador", rol: "ADMIN", debeCambiarPassword: true },
    });
    console.log(`Usuario "admin" creado. Contraseña temporal (cámbiala al entrar): ${passwordGenerada}`);
  }

  for (const nombre of ["Vasallo", "Pedro", "Jose"]) {
    await prisma.cobrador.upsert({ where: { nombre }, update: {}, create: { nombre } });
  }

  await prisma.contenedor.upsert({
    where: { codigo: "MSKU9395463" },
    update: {},
    create: {
      nombre: "Contenedor 9",
      codigo: "MSKU9395463",
      saldoInicial: 171.63,
      monedaSaldoInicial: "USD",
      fechaInicio: new Date("2026-08-11"),
      totalFactura: 93600.0,
      estado: "ACTIVO",
    },
  });

  console.log("Seed completado. Importa los pagos reales con el SQL generado por Claude (boomerang_schema_seed.sql).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
