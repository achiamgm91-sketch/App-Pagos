import { prisma } from "@/lib/prisma";
import { bancosSoportados } from "@/lib/importers";
import { calcularFechaSugeridaRevolut } from "@/lib/revolut/sincronizar";
import { calcularFechaSugeridaSabadell } from "@/lib/enableBanking/sincronizar";
import ImportarClient from "@/components/ImportarClient";
import { ORDEN_BANCO_DESC, ORDEN_BANCO_ASC } from "@/lib/pagosBanco";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

function serializarEjecucion(e: any) {
  if (!e) return null;
  return {
    origen: e.origen as "CRON" | "MANUAL",
    ejecutadoEn: e.ejecutadoEn.toISOString(),
    exitoso: e.exitoso,
    mensajeError: e.mensajeError,
    nuevos: e.nuevos,
    actualizados: e.actualizados,
    existentes: e.existentes,
    ultimaFecha: e.ultimaFecha ? e.ultimaFecha.toISOString().slice(0, 10) : null,
    usuarioNombre: e.usuario?.nombre ?? e.usuario?.usuario ?? null,
  };
}

export default async function ImportarPage() {
  const session = await getServerSession(authOptions);
  const inicioHref = (session?.user as any)?.rol === "COBRADOR" ? "/mi/pendientes" : "/dashboard";

  const ultimo = await prisma.tipoCambioDia.aggregate({ _max: { fecha: true } });
  const ultimaFechaTipoCambio = ultimo._max.fecha ? ultimo._max.fecha.toISOString().slice(0, 10) : null;

  const bancos = bancosSoportados();
  const ultimosPorBanco = await Promise.all(
    bancos.map(async (banco) => {
      const p = await prisma.pago.findFirst({
        where: { banco },
        orderBy: ORDEN_BANCO_DESC,
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
  const fechaSugeridaSabadell = await calcularFechaSugeridaSabadell();
  const sesionSabadell = await prisma.sabadellSesion.findFirst();
  const sabadellConectado = !!sesionSabadell && sesionSabadell.validaHasta.getTime() > Date.now();

  const ultimaEjecucionCronRaw = await prisma.cronEjecucion.findFirst({
    where: { origen: "CRON" },
    orderBy: { ejecutadoEn: "desc" },
  });
  const ultimaEjecucionManualRaw = await prisma.cronEjecucion.findFirst({
    where: { origen: "MANUAL" },
    orderBy: { ejecutadoEn: "desc" },
    include: { usuario: { select: { nombre: true, usuario: true } } },
  });

  return (
    <ImportarClient
      inicioHref={inicioHref}
      ultimaFechaTipoCambio={ultimaFechaTipoCambio}
      ultimosPorBanco={ultimosPorBanco}
      fechaSugeridaRevolut={fechaSugeridaRevolut}
      fechaSugeridaSabadell={fechaSugeridaSabadell}
      sabadellConectado={sabadellConectado}
      ultimaEjecucionCron={serializarEjecucion(ultimaEjecucionCronRaw)}
      ultimaEjecucionManual={serializarEjecucion(ultimaEjecucionManualRaw)}
    />
  );
}
