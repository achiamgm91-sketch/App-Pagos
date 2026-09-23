import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "permisos" TEXT[] NOT NULL DEFAULT '{}'`
  );
  return NextResponse.json({ ok: true });
}
