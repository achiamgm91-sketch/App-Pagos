import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // 1) columna nueva, sin tocar la vieja todavia
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "SabadellSesion" ADD COLUMN IF NOT EXISTS "accountUids" TEXT[] NOT NULL DEFAULT '{}'`
  );
  // 2) migrar el valor existente (si lo hay) a la nueva columna
  await prisma.$executeRawUnsafe(
    `UPDATE "SabadellSesion" SET "accountUids" = ARRAY["accountUid"] WHERE "accountUid" IS NOT NULL AND array_length("accountUids", 1) IS NULL`
  );
  if (req.nextUrl.searchParams.get("accion") === "borrar-columna-vieja") {
    await prisma.$executeRawUnsafe(`ALTER TABLE "SabadellSesion" DROP COLUMN IF EXISTS "accountUid"`);
    return NextResponse.json({ ok: true, borrada: true });
  }

  const filas = await prisma.$queryRawUnsafe<any[]>(`SELECT id, "accountUids" FROM "SabadellSesion"`);
  return NextResponse.json({ ok: true, filas });
}
