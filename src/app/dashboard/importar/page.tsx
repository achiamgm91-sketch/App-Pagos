import { prisma } from "@/lib/prisma";
import { bancosSoportados } from "@/lib/importers";
import { calcularFechaSugeridaRevolut } from "@/lib/revolut/sincronizar";
import ImportarClient from "@/components/ImportarClient";

export const dynamic = "force-dynamic";

export default async function ImportarPage() {
  const ultimo = await prisma.tipoCambioDia.aggregate({ _max: { fecha: true } });
  const ultimaFechaTipoCambio = ultimo._max.fecha ? ultimo._max.fecha.toISOString().slice(0, 10) : null;

  const bancos = bancosSoportados();
  const ultimosPorBanco = await Promise.all(
    bancos.map(async (banco) => {
      const p = await prisma.pago.findFirst({
        where: { banco },
        orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }],
      });
      return {
        banco,
        ultimaFecha: p ? p.fecha.toISOString().slice(0, 10) : null,
        persona: p?.persona ?? null,
        importeUsd: p?.importeUsd !== null && p?.importeUsd !== undefined ? Number(p.importeUsd) : null,
        importeEur: p?.importeEur !== null && p?.importeEur !== undefined ? Number(p.importeEur) : null,
      };
    })
  );

  const fechaSugeridaRevolut = await calcularFechaSugeridaRevolut();

  return (
    <ImportarClient
      ultimaFechaTipoCambio={ultimaFechaTipoCambio}
      ultimosPorBanco={ultimosPorBanco}
      fechaSugeridaRevolut={fechaSugeridaRevolut}
    />
  );
}
