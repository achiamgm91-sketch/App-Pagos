import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { tienePermiso } from "@/lib/permisos";
import EliminarContenedor from "@/components/EliminarContenedor";
import { round2, formatUsd } from "@/lib/format";

export const dynamic = "force-dynamic";

const ESTADO_COLOR: Record<string, string> = {
  ACTIVO: "bg-teal-bg text-[#0F5D45]",
  COMPLETADO: "bg-[#EFF3FF] text-[#2A4FB0]",
  FACTURADO: "bg-line text-steel",
};

const ESTADO_LABEL: Record<string, string> = {
  ACTIVO: "Activo",
  COMPLETADO: "Completado",
  FACTURADO: "Facturado",
};

export default async function ContenedoresPage() {
  const session = await getServerSession(authOptions);
  const rol = (session?.user as any)?.rol as string;
  const permisos = (session?.user as any)?.permisos as string[];
  const puedeGestionar = tienePermiso(rol, permisos, "gestionar_contenedores");
  const puedeVerDetalle = rol === "ADMIN" || rol === "SUPERADMIN";
  const inicioHref = rol === "COBRADOR" ? "/mi/pendientes" : "/dashboard";

  const contenedores = await prisma.contenedor.findMany({
    include: { pagos: true },
    orderBy: { creadoEn: "desc" },
  });

  return (
    <div className="min-h-screen">
      <div className="bg-navy-950 text-white px-4.5 py-4 flex items-center justify-between sticky top-0 z-20">
        <Link href={inicioHref} className="font-mono text-[13px] text-steel-light">
          ← Inicio
        </Link>
        <div className="font-display font-semibold text-base">Contenedores</div>
        <div className="w-10" />
      </div>

      <main className="max-w-2xl mx-auto w-full px-4 py-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[11px] uppercase text-steel mb-1.5">Administración</div>
            <h2 className="font-display text-[22px] font-semibold">Contenedores</h2>
          </div>
          {puedeGestionar && (
            <Link
              href="/dashboard/contenedores/nuevo"
              className="flex-shrink-0 px-3.5 py-2.5 bg-navy-950 text-white text-[13px] font-semibold rounded-lg"
            >
              + Nuevo
            </Link>
          )}
        </div>

        {contenedores.map((c) => {
          const saldoInicial = Number(c.saldoInicial);
          const totalFactura = Number(c.totalFactura);
          const recibido = round2(
            saldoInicial +
              c.pagos.filter((p) => !p.devuelto).reduce((sum, p) => sum + (p.importeUsd !== null ? Number(p.importeUsd) : 0), 0)
          );
          const pct = totalFactura > 0 ? Math.min(Math.round((recibido / totalFactura) * 100), 100) : 0;
          const Envoltorio = puedeVerDetalle ? Link : "div";
          const propsEnvoltorio = puedeVerDetalle
            ? { href: `/dashboard?contenedorId=${c.id}`, className: "block active:opacity-70" }
            : {};

          return (
            <div key={c.id} className="bg-white border border-line rounded-xl p-4 mb-3">
              <Envoltorio {...(propsEnvoltorio as any)}>
                <div className="flex items-start justify-between gap-3 mb-2.5">
                  <div>
                    <div className="font-display font-semibold text-[15px]">{c.nombre}</div>
                    <div className="font-mono text-[11.5px] text-steel mt-0.5">
                      {c.codigo || "sin código todavía"}
                    </div>
                  </div>
                  <span
                    className={`font-mono text-[10.5px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full flex-shrink-0 ${
                      ESTADO_COLOR[c.estado] ?? "bg-line text-steel"
                    }`}
                  >
                    {ESTADO_LABEL[c.estado] ?? c.estado}
                  </span>
                </div>
                <div className="h-2 bg-[#EEF1F5] rounded-full overflow-hidden mb-1.5">
                  <div
                    className="h-full bg-gradient-to-r from-amber to-[#3FC79A]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between font-mono text-[11.5px] text-steel">
                  <span>{formatUsd(recibido)} recibidos ({pct}%)</span>
                  <span>Total: {formatUsd(totalFactura)}</span>
                </div>
              </Envoltorio>
              {puedeGestionar && (
                <div className="flex items-center justify-between mt-2.5">
                  <Link
                    href={`/dashboard/contenedores/${c.id}/editar`}
                    className="text-[11.5px] font-mono text-navy-800 underline underline-offset-2"
                  >
                    Editar datos del contenedor
                  </Link>
                  <EliminarContenedor contenedorId={c.id} nombre={c.nombre} numPagos={c.pagos.length} />
                </div>
              )}
            </div>
            );
        })}
      </main>
    </div>
  );
}
