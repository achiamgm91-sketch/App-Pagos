import { fetchWise } from "./client";
import type { PagoDetectado } from "@/lib/importers/revolut";

type PerfilWise = { id: number; type: "personal" | "business" };

type BalanceWise = { id: number; currency: string; type: string };

type TransaccionWise = {
  type: "DEBIT" | "CREDIT";
  date: string;
  amount: { value: number; currency: string };
  details: {
    type: string;
    description?: string;
    senderName?: string;
    paymentReference?: string;
  };
  referenceNumber: string;
};

type EstadoCuentaWise = { transactions: TransaccionWise[] };

const TIPOS_INCOMING = new Set(["DEPOSIT", "TRANSFER", "MONEY_ADDED", "INCOMING_CROSS_BALANCE"]);

async function obtenerPerfilNegocioWise(): Promise<number> {
  const res = await fetchWise("/v1/profiles");
  if (!res.ok) {
    throw new Error(`Error al consultar perfiles de Wise: ${res.status} ${await res.text()}`);
  }
  const perfiles: PerfilWise[] = await res.json();
  const negocio = perfiles.find((p) => p.type === "business");
  if (!negocio) throw new Error("No se ha encontrado ningún perfil business en Wise");
  return negocio.id;
}

async function obtenerBalancesWise(profileId: number): Promise<BalanceWise[]> {
  const res = await fetchWise(`/v4/profiles/${profileId}/balances?types=STANDARD`);
  if (!res.ok) {
    throw new Error(`Error al consultar balances de Wise: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function obtenerExtractoWise(
  profileId: number,
  balanceId: number,
  moneda: string,
  desde: string,
  hasta: string
): Promise<EstadoCuentaWise> {
  const params = new URLSearchParams({
    currency: moneda,
    intervalStart: `${desde}T00:00:00.000Z`,
    intervalEnd: `${hasta}T23:59:59.999Z`,
    type: "COMPACT",
  });
  const res = await fetchWise(
    `/v1/profiles/${profileId}/balance-statements/${balanceId}/statement.json?${params.toString()}`
  );
  if (!res.ok) {
    throw new Error(`Error al consultar el extracto de Wise (${moneda}): ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function extraerPersona(t: TransaccionWise): string {
  if (t.details.senderName && t.details.senderName.trim()) return t.details.senderName.trim().toUpperCase();
  if (t.details.paymentReference && t.details.paymentReference.trim())
    return t.details.paymentReference.trim().toUpperCase();
  return (t.details.description || "").trim().toUpperCase();
}

export async function obtenerTransaccionesWise(desde?: string, hasta?: string): Promise<PagoDetectado[]> {
  const hoy = new Date().toISOString().slice(0, 10);
  const fechaDesde = desde || hoy;
  const fechaHasta = hasta || hoy;

  const profileId = await obtenerPerfilNegocioWise();
  const balances = await obtenerBalancesWise(profileId);

  const resultado: PagoDetectado[] = [];

  for (const balance of balances) {
    const extracto = await obtenerExtractoWise(profileId, balance.id, balance.currency, fechaDesde, fechaHasta);

    for (const t of extracto.transactions) {
      if (t.type !== "CREDIT") continue;
      if (!TIPOS_INCOMING.has(t.details.type)) continue;
      if (!t.amount.value || t.amount.value <= 0) continue;

      const persona = extraerPersona(t);
      if (persona.includes("BOOMERANG")) continue; // traspaso interno propio

      resultado.push({
        idOrigen: `WISE:${t.referenceNumber}`,
        fecha: t.date.slice(0, 10),
        persona,
        importe: t.amount.value,
        moneda: t.amount.currency,
        banco: "Wise",
        fechaHoraBanco: t.date,
      });
    }
  }

  return resultado;
}
