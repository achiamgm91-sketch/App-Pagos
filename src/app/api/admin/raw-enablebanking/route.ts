import { NextRequest, NextResponse } from "next/server";
import { obtenerCuentasSabadellAutorizadas, llamarEnableBanking } from "@/lib/enableBanking/sesion";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.DIAG_SECRET || auth !== `Bearer ${process.env.DIAG_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const desde = req.nextUrl.searchParams.get("desde") || "2026-09-23";
  const hasta = req.nextUrl.searchParams.get("hasta") || "2026-09-23";

  const accountUids = await obtenerCuentasSabadellAutorizadas();
  const resultado: any[] = [];

  for (const accountUid of accountUids) {
    let continuationKey: string | undefined;
    let paginas = 0;
    const todas: any[] = [];
    do {
      const params = new URLSearchParams({ date_from: desde, date_to: hasta });
      if (continuationKey) params.set("continuation_key", continuationKey);
      const data = await llamarEnableBanking(`/accounts/${accountUid}/transactions?${params.toString()}`);
      paginas++;
      todas.push(...(data.transactions || []));
      continuationKey = data.continuation_key || undefined;
    } while (continuationKey);

    resultado.push({ accountUid, paginas, total: todas.length, transacciones: todas });
  }

  return NextResponse.json({ desde, hasta, cuentas: resultado });
}
