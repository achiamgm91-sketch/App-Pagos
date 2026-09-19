import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import PendientesCobrador from "@/components/PendientesCobrador";
import SignOutButton from "@/components/SignOutButton";
import CompletarContenedor from "@/components/CompletarContenedor";
import SelectorContenedor from "@/components/SelectorContenedor";
import { round2, formatUsd, formatEur } from "@/lib/format";
import { ORDEN_BANCO_DESC, ORDEN_BANCO_ASC } from "@/lib/pagosBanco";

export const dynamic = "force-dynamic";

const AVATAR_COLOR: Record<string, string> = {
  Vasallo: "bg-[#2A4FB0]",
  Pedro: "bg-teal",
  Adrián: "bg-[#B0662A]",
};

function formatEnMoneda(valorUsd: number, moneda: string, tasaUsdPorEur: number | null) {
  if (moneda === "EUR" && tasaUsdPorEur) {
    return formatEur(valorUsd / tasaUsdPorEur);
  }
  return formatUsd(valorUsd);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { contenedorId?: string };
}) {
  const session = await getServerSession(authOptions);

  const includePagos = {
    pagos: {
      include: { cobrador: true, cobradorAsignadoPor: true },
      orderBy: ORDEN_BANCO_DESC,
    },
  };

  let contenedor = searchParams.contenedorId
    ? await prisma.contenedor.findUnique({
        where: { id: searchParams.contenedorId },
        include: includePagos,
      })
    : null;

  if (!contenedor) {
    contenedor = await prisma.contenedor.findFirst({
      where: { estado: "ACTIVO" },
      include: includePagos,
    });
  }

  const cobradores = await prisma.cobrador.findMany({ where: { activo: true } });
  const todosLosContenedores = await prisma.contenedor.findMany({
    select: { id: true, nombre: true, estado: true },
    orderBy: { creadoEn: "desc" },
  });

  const ultimoTipoCambio = await prisma.tipoCambioDia.findFirst({ orderBy: { fecha: "desc" } });
  const ultimaFechaTipoCambio = ultimoTipoCambio ? ultimoTipoCambio.fecha.toLocaleDateString("es-ES") : null;
  const ultimaTasa = ultimoTipoCambio ? Number(ultimoTipoCambio.usdPorEur) : null;

  if (!contenedor) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="font-display text-lg mb-2">No hay ningún contenedor todavía</p>
          <p className="text-steel text-sm">Da de alta un contenedor para empezar a registrar pagos.</p>
        </div>
      </div>
    );
  }

  const saldoInicial = Number(contenedor.saldoInicial);
  const totalFactura = Number(contenedor.totalFactura);
  const monedaTotalFactura = contenedor.monedaTotalFactura;

  const pagosDelContenedor = contenedor.pagos.filter((p) => p.importeUsd !== null);
  const pagosSinConversion = contenedor.pagos.filter((p) => p.importeUsd === null);
  const sumaPagos = round2(pagosDelContenedor.reduce((sum, p) => sum + Number(p.importeUsd), 0));
  const recibido = sumaPagos; // solo la suma de pagos, sin el saldo inicial
  const totalConSaldoInicial = round2(saldoInicial + recibido);
  const falta = round2(Math.max(totalFactura - saldoInicial - recibido, 0));
  const excedente = round2(Math.max(totalConSaldoInicial - totalFactura, 0));
  const pct = totalFactura > 0 ? Math.min(Math.round((totalConSaldoInicial / totalFactura) * 100), 100) : 0;

  const pendientes = contenedor.pagos.filter((p) => !p.cobradorId);

  const objetivoPorCobrador = cobradores.length > 0 ? round2(totalFactura / cobradores.length) : 0;
  const desglose = cobradores.map((c) => {
    const pagosDeCobrador = pagosDelContenedor.filter((p) => p.cobradorId === c.id);
    const total = round2(pagosDeCobrador.reduce((sum, p) => sum + Number(p.importeUsd), 0));
    return { cobrador: c, total, count: pagosDeCobrador.length };
  });

  const pagosSinAsignarDelContenedor = pagosDelContenedor.filter((p) => !p.cobradorId);
  const totalSinAsignar = round2(pagosSinAsignarDelContenedor.reduce((sum, p) => sum + Number(p.importeUsd), 0));

  return (
    <div className="min-h-screen pb-20 md:pb-0 md:grid md:grid-cols-[240px_1fr]">
      <div className="bg-navy-950 text-white px-4.5 py-4 flex items-center justify-between sticky top-0 z-20 md:col-span-2">
        <div className="font-display font-semibold text-base flex items-center gap-2">
          <span className="w-2 h-2 bg-amber rounded-sm" /> BOOMERANG
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-steel-light">
            <span className="w-[22px] h-[22px] rounded-full bg-amber text-[#241500] font-bold text-[11px] flex items-center justify-center font-body">
              {(session?.user?.name ?? "A")[0].toUpperCase()}
            </span>
            {session?.user?.name}
          </div>
          <SignOutButton />
        </div>
      </div>

      <div className="hidden md:flex flex-col gap-1 bg-navy-950 text-white p-5.5">
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-amber/10 text-white text-[13.5px] font-medium">
          <span>▤</span> Inicio
        </div>
        <Link
          href="/dashboard/importar"
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-steel-light text-[13.5px] font-medium hover:bg-white/5"
        >
          <span>⇩</span> Importar pagos
        </Link>
        <Link
          href="/dashboard/pagos"
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-steel-light text-[13.5px] font-medium hover:bg-white/5"
        >
          <span>📅</span> Pagos por fecha
        </Link>
        <Link
          href="/dashboard/contenedores"
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-steel-light text-[13.5px] font-medium hover:bg-white/5"
        >
          <span>📦</span> Contenedores
        </Link>
        <Link
          href="/dashboard/usuarios"
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-steel-light text-[13.5px] font-medium hover:bg-white/5"
        >
          <span>👤</span> Usuarios
        </Link>
        <Link
          href="/dashboard/estadisticas"
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-steel-light text-[13.5px] font-medium hover:bg-white/5"
        >
          <span>📈</span> Estadísticas
        </Link>
        {(session?.user as any)?.rol === "SUPERADMIN" && (
          <Link
            href="/dashboard/actividad"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-steel-light text-[13.5px] font-medium hover:bg-white/5"
          >
            <span>🕵️</span> Supervisión
          </Link>
        )}
      </div>

      <main className="max-w-3xl mx-auto md:mx-0 w-full px-4 py-5 md:px-10 md:py-8">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[11px] uppercase text-steel mb-1.5">
              {new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })}
            </div>
            <h2 className="font-display text-[22px] font-semibold">Inicio</h2>
          </div>
          <div className="flex-shrink-0 flex items-center gap-2">
            <Link
              href="/dashboard/contenedores"
              className="flex items-center gap-1.5 px-3.5 py-2.5 border border-line bg-white text-[13px] font-semibold rounded-lg"
            >
              📦
            </Link>
            <Link
              href="/dashboard/usuarios"
              className="flex items-center gap-1.5 px-3.5 py-2.5 border border-line bg-white text-[13px] font-semibold rounded-lg"
            >
              👤
            </Link>
            <Link
              href="/dashboard/pagos"
              className="flex items-center gap-1.5 px-3.5 py-2.5 border border-line bg-white text-[13px] font-semibold rounded-lg"
            >
              📅
            </Link>
            <Link
              href="/dashboard/estadisticas"
              className="flex items-center gap-1.5 px-3.5 py-2.5 border border-line bg-white text-[13px] font-semibold rounded-lg"
            >
              📈
            </Link>
            <Link
              href="/dashboard/importar"
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-navy-950 text-white text-[13px] font-semibold rounded-lg"
            >
              ⇩ Importar
            </Link>
          </div>
        </div>

        <div className="bg-gradient-to-br from-navy-950 to-navy-800 text-white rounded-2xl p-5 mb-5">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="font-display font-semibold text-[19px]">{contenedor.nombre}</div>
              <div className="font-mono text-[11.5px] text-steel-light mt-0.5">
                {contenedor.codigo || "sin código todavía"}
              </div>
              <div className="font-mono text-[11px] text-steel-light mt-1">
                Pagos desde el {contenedor.fechaInicio.toLocaleDateString("es-ES")}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`/api/contenedores/${contenedor.id}/exportar`}
                title="Descargar Excel de este contenedor"
                className="w-7 h-7 flex items-center justify-center rounded-md border border-white/15 bg-white/5 hover:bg-white/10 text-white/90"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </a>
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded border border-[#3FC79A] text-[#3FC79A] bg-teal/20">
                {contenedor.estado === "ACTIVO" ? "Activo" : contenedor.estado}
              </span>
            </div>
          </div>

          <div className="mb-4">
            <SelectorContenedor contenedorId={contenedor.id} contenedores={todosLosContenedores} />
          </div>

          <div className="flex justify-between items-baseline mb-2.5">
            <div>
              <div className="font-mono text-[11px] text-amber mb-0.5">
                {excedente > 0 ? "EXCEDENTE" : "FALTA POR COBRAR"}
              </div>
              <div className="font-mono text-[26px] font-semibold">
                {formatEnMoneda(excedente > 0 ? excedente : falta, monedaTotalFactura, ultimaTasa)}
              </div>
              {excedente === 0 && (
                <div className="font-mono text-[10px] text-steel-light mt-1 opacity-80">
                  Total factura − saldo inicial − recibido
                </div>
              )}
            </div>
            <div className="text-right font-mono text-[13px] text-steel-light">
              RECIBIDO
              <div className="text-base text-white">
                {formatEnMoneda(recibido, monedaTotalFactura, ultimaTasa)}
              </div>
            </div>
          </div>
          <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber to-[#3FC79A]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-[11.5px] text-steel-light font-mono">
            <span>
              {pct}% cobrado · saldo inicial {formatEnMoneda(saldoInicial, monedaTotalFactura, ultimaTasa)}
            </span>
            <span>Total factura: {formatEnMoneda(totalFactura, monedaTotalFactura, ultimaTasa)}</span>
          </div>
        </div>

        {contenedor.estado !== "ACTIVO" && (
          <div className="bg-[#EFF3FF] border border-[#CDD9F7] rounded-xl p-3.5 mb-4 text-[13px] text-[#2A4FB0]">
            Estás viendo un contenedor que no es el activo — los pagos que importes siempre van al
            contenedor activo, no a este.
          </div>
        )}

        {excedente > 0 && (
          <div className="bg-teal-bg border border-[#CDE9DF] rounded-xl p-4 mb-4">
            <div className={`text-[13px] text-[#0F5D45] ${contenedor.estado === "ACTIVO" ? "mb-3" : ""}`}>
              Este contenedor tenía un saldo inicial de{" "}
              <b className="font-mono">{formatEnMoneda(saldoInicial, monedaTotalFactura, ultimaTasa)}</b>, y se
              le han asociado <b className="font-mono">{pagosDelContenedor.length}</b> pago(s) por un importe
              total de <b className="font-mono">{formatEnMoneda(recibido, monedaTotalFactura, ultimaTasa)}</b>.
              Por lo tanto alcanza el total de factura (
              <b className="font-mono">{formatEnMoneda(totalFactura, monedaTotalFactura, ultimaTasa)}</b>) y
              queda un excedente de{" "}
              <b className="font-mono">{formatEnMoneda(excedente, monedaTotalFactura, ultimaTasa)}</b> que
              puedes mover al siguiente contenedor cuando lo des de alta.
              {contenedor.estado === "ACTIVO" && " Marca este como completado."}
            </div>
            {contenedor.estado === "ACTIVO" && <CompletarContenedor contenedorId={contenedor.id} />}
          </div>
        )}

        {pagosSinConversion.length > 0 && (
          <div className="bg-amber/10 border border-amber/30 rounded-xl p-3.5 mb-4 text-[13px] text-amber-ink">
            <b className="font-mono">{pagosSinConversion.length} pago(s)</b> sin tipo de cambio ese día
            todavía — no cuentan en el total recibido hasta que se cargue la tasa correspondiente.
            {ultimaFechaTipoCambio && (
              <div className="mt-1 opacity-80">Tipo de cambio cargado hasta el {ultimaFechaTipoCambio}.</div>
            )}
          </div>
        )}

        {pendientes.length > 0 && (
          <div className="bg-alert-bg border border-[#F3C9C9] rounded-xl p-3.5 mb-4 flex items-center gap-2.5">
            <span>⚠️</span>
            <span className="text-[13px] text-[#8A2E2E]">
              <b className="font-mono">{pendientes.length} pago(s)</b> todavía sin cobrador asignado
            </span>
          </div>
        )}

        {pendientes.length > 0 && (
          <>
            <div className="font-mono text-[11.5px] uppercase tracking-wide text-steel my-6 flex items-center gap-2 after:content-[''] after:flex-1 after:h-px after:bg-line">
              Pendientes de asignar cobrador
            </div>
            <PendientesCobrador
              pagos={pendientes.map((p) => ({
                id: p.id,
                persona: p.persona,
                fecha: p.fecha.toISOString().slice(0, 10),
                fechaStr: p.fecha.toLocaleDateString("es-ES"),
                banco: p.banco,
                importeUsd: p.importeUsd !== null ? Number(p.importeUsd) : null,
                importeEur: p.importeEur !== null ? Number(p.importeEur) : null,
                tasaCambio: p.tasaCambio !== null ? Number(p.tasaCambio) : null,
                fechaTasaCambio: p.fechaTasaCambio ? p.fechaTasaCambio.toISOString().slice(0, 10) : null,
                monedaOriginal: p.monedaOriginal,
              }))}
              cobradores={cobradores}
            />
          </>
        )}

        <div className="font-mono text-[11.5px] uppercase tracking-wide text-steel my-6 flex items-center gap-2 after:content-[''] after:flex-1 after:h-px after:bg-line">
          Desglose por cobrador
        </div>
        <div className="bg-white border border-line rounded-xl p-3.5 mb-2.5 flex items-center justify-between">
          <div>
            <div className="font-semibold text-[14.5px]">Total recibido</div>
            <div className="font-mono text-[11.5px] text-steel mt-0.5">
              {pendientes.length > 0 ? `${pendientes.length} pago(s) sin asignar` : "todos los pagos asignados"}
            </div>
          </div>
          <div className="font-mono font-bold text-base">{formatUsd(recibido)}</div>
        </div>
        {desglose.map(({ cobrador, total, count }) => (
          <Link
            key={cobrador.id}
            href={`/dashboard/cobradores/${cobrador.id}`}
            className="bg-white border border-line rounded-xl p-3.5 mb-2.5 flex items-center gap-3.5 active:bg-[#FAFBFC]"
          >
            <div
              className={`w-[38px] h-[38px] rounded-[10px] flex items-center justify-center font-display font-semibold text-sm text-white flex-shrink-0 ${
                AVATAR_COLOR[cobrador.nombre] ?? "bg-steel"
              }`}
            >
              {cobrador.nombre[0]}
            </div>
            <div className="flex-1">
              <div className="font-semibold text-[14.5px]">{cobrador.nombre}</div>
              <div className="font-mono text-[11.5px] text-steel mt-0.5">{count} pagos asignados</div>
            </div>
            <div className="text-right">
              <div className="font-mono font-bold text-base">{formatUsd(total)}</div>
              <div className="font-mono text-[11px] text-steel mt-0.5">objetivo {formatUsd(objetivoPorCobrador)}</div>
            </div>
          </Link>
        ))}
        {pagosSinAsignarDelContenedor.length > 0 && (
          <div className="bg-white border border-[#F3C9C9] border-l-[3px] border-l-alert rounded-xl p-3.5 mb-2.5 flex items-center gap-3.5">
            <div className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center font-display font-semibold text-sm text-white flex-shrink-0 bg-alert">
              ?
            </div>
            <div className="flex-1">
              <div className="font-semibold text-[14.5px]">Sin asignar</div>
              <div className="font-mono text-[11.5px] text-steel mt-0.5">
                {pagosSinAsignarDelContenedor.length} pago(s) sin asignar
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono font-bold text-base">{formatUsd(totalSinAsignar)}</div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
