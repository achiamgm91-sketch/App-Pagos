import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE "Pago" ADD COLUMN IF NOT EXISTS "devueltoNota" TEXT`);
  return NextResponse.json({ ok: true });
}
