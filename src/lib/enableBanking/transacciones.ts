import { obtenerCuentasSabadellAutorizadas, llamarEnableBanking } from "./sesion";
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

// Hora de Madrid (AAAA, MM, DD, hh, mm, ss) -> instante UTC en ISO.
function madridAUtcISO(y: number, mo: number, d: number, h: number, mi: number, s: number): string {
  const supuesto = Date.UTC(y, mo - 1, d, h, mi, s);
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(supuesto));
  const v = (t: string) => Number(partes.find((p) => p.type === t)!.value);
  const comoLocal = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second"));
  return new Date(supuesto - (comoLocal - supuesto)).toISOString();
}

function extraerPersona(t: TransaccionEB): string {
  const nombre = t.debtor?.name?.trim();
  if (nombre) return nombre.toUpperCase();
  const remesa = (t.remittance_information || []).join(" ").trim();
  return remesa.toUpperCase();
}

export async function obtenerTransaccionesSabadell(desde?: string, hasta?: string): Promise<PagoDetectado[]> {
  const accountUids = await obtenerCuentasSabadellAutorizadas();

  const params = new URLSearchParams();
  if (desde) params.set("date_from", desde);
  if (hasta) params.set("date_to", hasta);

  const resultado: PagoDetectado[] = [];

  // Puede haber varias cuentas autorizadas (p.ej. una en EUR y otra en USD); cada una
  // cuenta como una consulta más contra el límite diario de Sabadell.
  for (const accountUid of accountUids) {
    const data = await llamarEnableBanking(`/accounts/${accountUid}/transactions?${params.toString()}`);
    const transacciones: TransaccionEB[] = data.transactions || [];

    for (const t of transacciones) {
      if (t.credit_debit_indicator !== "CRDT") continue;

      const importe = parseFloat(t.transaction_amount.amount);
      if (!importe || importe <= 0) continue;

      const persona = extraerPersona(t);
      if (!persona || persona.includes("BOOMERANG")) continue;

      const fecha = (t.value_date || t.booking_date || "").slice(0, 10);
      if (!fecha) continue;

      const refBanco = String(t.transaction_id || t.entry_reference || "");
      const idOrigen = `SABADELL-EB:${refBanco}`;

      // La referencia de Sabadell empieza por AAAAMMDDHHMMSS (hora de España): es el orden real del banco.
      const m = refBanco.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
      const fechaHoraBanco = m ? madridAUtcISO(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]) : undefined;

      resultado.push({
        idOrigen,
        fecha,
        persona,
        importe,
        moneda: t.transaction_amount.currency,
        banco: "Sabadell",
        fechaHoraBanco,
      });
    }
  }

  return resultado;
}
