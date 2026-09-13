import { obtenerCuentaSabadellAutorizada, llamarEnableBanking } from "./sesion";
import type { PagoDetectado } from "@/lib/importers/revolut";

type TransaccionEB = {
  entry_reference?: string;
  transaction_id?: string;
  transaction_amount: { amount: string; currency: string };
  credit_debit_indicator: "CRDT" | "DBIT";
  booking_date?: string;
  value_date?: string;
  remittance_information?: string[];
  creditor?: { name?: string };
  debtor?: { name?: string };
};

function extraerPersona(t: TransaccionEB): string {
  const nombre = t.debtor?.name?.trim();
  if (nombre) return nombre.toUpperCase();
  const remesa = (t.remittance_information || []).join(" ").trim();
  return remesa.toUpperCase();
}

export async function obtenerTransaccionesSabadell(desde?: string, hasta?: string): Promise<PagoDetectado[]> {
  const accountUid = await obtenerCuentaSabadellAutorizada();

  const params = new URLSearchParams();
  if (desde) params.set("date_from", desde);
  if (hasta) params.set("date_to", hasta);

  const data = await llamarEnableBanking(`/accounts/${accountUid}/transactions?${params.toString()}`);
  const transacciones: TransaccionEB[] = data.transactions || [];

  const resultado: PagoDetectado[] = [];

  for (const t of transacciones) {
    if (t.credit_debit_indicator !== "CRDT") continue;

    const importe = parseFloat(t.transaction_amount.amount);
    if (!importe || importe <= 0) continue;

    const persona = extraerPersona(t);
    if (!persona || persona.includes("BOOMERANG")) continue;

    const fecha = (t.value_date || t.booking_date || "").slice(0, 10);
    if (!fecha) continue;

    const idOrigen = `SABADELL-EB:${t.transaction_id || t.entry_reference}`;

    resultado.push({
      idOrigen,
      fecha,
      persona,
      importe,
      moneda: t.transaction_amount.currency,
      banco: "Sabadell",
    });
  }

  return resultado;
}
