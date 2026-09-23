import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "intentosFallidos" INTEGER NOT NULL DEFAULT 0`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "bloqueadoHasta" TIMESTAMP(3)`);
  return NextResponse.json({ ok: true });
}
