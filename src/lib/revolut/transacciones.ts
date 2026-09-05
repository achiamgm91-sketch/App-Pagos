import { obtenerAccessTokenRevolut } from "./tokens";
import type { PagoDetectado } from "@/lib/importers/revolut";
import { extraerPersona } from "@/lib/importers/revolut";

const REVOLUT_BASE_URL = "https://b2b.revolut.com/api/1.0";

type LegRevolut = {
  leg_id: string;
  account_id: string;
  amount: number;
  currency: string;
  description?: string;
  counterparty?: {
    id?: string;
    account_id?: string;
    account_type?: string;
  };
};

type TransaccionRevolut = {
  id: string;
  type: string;
  state: string;
  created_at: string;
  completed_at?: string;
  reference?: string;
  legs: LegRevolut[];
};

const TIPOS_RELEVANTES = new Set(["topup", "transfer"]);

export async function obtenerTransaccionesRevolut(desde?: string, hasta?: string): Promise<PagoDetectado[]> {
  const accessToken = await obtenerAccessTokenRevolut();

  const params = new URLSearchParams({ count: "1000" });
  if (desde) params.set("from", desde);
  if (hasta) params.set("to", hasta);

  const res = await fetch(`${REVOLUT_BASE_URL}/transactions?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const texto = await res.text();
    throw new Error(`Error al consultar transacciones de Revolut: ${res.status} ${texto}`);
  }

  const transacciones: TransaccionRevolut[] = await res.json();
  const resultado: PagoDetectado[] = [];

  for (const t of transacciones) {
    if (t.state !== "completed") continue;
    if (!TIPOS_RELEVANTES.has(t.type)) continue;

    for (const leg of t.legs || []) {
      if (!leg.amount || leg.amount <= 0) continue;

      const persona = extraerPersona(leg.description || t.reference || "", undefined);
      if (persona.toUpperCase().includes("BOOMERANG")) continue;

      const fechaRaw = (t.completed_at || t.created_at || "").slice(0, 10);

      resultado.push({
        idOrigen: t.id,
        fecha: fechaRaw,
        persona,
        importe: leg.amount,
        moneda: leg.currency,
        banco: "Revolut",
      });
    }
  }

  return resultado;
}
