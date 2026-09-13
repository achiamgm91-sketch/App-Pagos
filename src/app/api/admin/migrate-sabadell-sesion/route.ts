import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."SabadellSesion" (
      id text DEFAULT (gen_random_uuid())::text NOT NULL,
      "sessionId" text NOT NULL,
      "accountUid" text NOT NULL,
      "validaHasta" timestamp(3) without time zone NOT NULL,
      "actualizadoEn" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      CONSTRAINT "SabadellSesion_pkey" PRIMARY KEY (id)
    );
  `);

  return NextResponse.json({ ok: true });
}
