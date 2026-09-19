import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import QuitarAsignacion from "@/components/QuitarAsignacion";
import { round2, formatUsd, formatEur } from "@/lib/format";
import { ORDEN_BANCO_DESC, ORDEN_BANCO_ASC } from "@/lib/pagosBanco";

export const dynamic = "force-dynamic";

const AVATAR_COLOR: Record<string, string> = {
  Vasallo: "bg-[#2A4FB0]",
  Pedro: "bg-teal",
  Adrian: "bg-[#B0662A]",
};

function formatImporte(pago: { importeUsd: any; importeEur: any }) {
  if (pago.importeUsd !== null) return formatUsd(Number(pago.importeUsd));
  if (pago.importeEur !== null) return formatEur(Number(pago.importeEur)) + " (sin tasa)";
  return "—";
}

export default async function DetalleCobradorPage({ params }: { params: { id: string } }) {
  const cobrador = await prisma.cobrador.findUnique({ where: { id: params.id } });
  if (!cobrador) notFound();

  const pagos = await prisma.pago.findMany({
    where: { cobradorId: params.id },
    include: { contenedor: true, cobradorAsignadoPor: true },
    orderBy: ORDEN_BANCO_DESC,
  });

  const total = round2(
    pagos.reduce((sum, p) => sum + (p.importeUsd !== null ? Number(p.importeUsd) : 0), 0)
  );

  return (
    <div className="min-h-screen">
      <div className="bg-navy-950 text-white px-4.5 py-4 flex items-center justify-between sticky top-0 z-20">
        <Link href="/dashboard" className="font-mono text-[13px] text-steel-light">
          ← Inicio
        </Link>
        <div className="font-display font-semibold text-base">{cobrador.nombre}</div>
        <div className="w-10" />
      </div>

      <main className="max-w-2xl mx-auto w-full px-4 py-6">
        <div className="flex items-center gap-3.5 mb-5">
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center font-display font-semibold text-white text-lg flex-shrink-0 ${
              AVATAR_COLOR[cobrador.nombre] ?? "bg-steel"
            }`}
          >
            {cobrador.nombre[0]}
          </div>
          <div className="flex-1">
            <div className="font-display text-lg font-semibold">{cobrador.nombre}</div>
            <div className="font-mono text-[12px] text-steel">{pagos.length} pago(s) asignados</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[11px] text-steel uppercase">Total</div>
            <div className="font-mono font-bold text-lg">{formatUsd(total)}</div>
          </div>
        </div>

        {pagos.length === 0 ? (
          <div className="text-center text-steel text-[13.5px] py-10">
            {cobrador.nombre} todavía no tiene ningún pago asignado.
          </div>
        ) : (
          <div className="bg-white border border-line rounded-xl px-4">
            {pagos.map((pago) => (
              <div
                key={pago.id}
                className="flex justify-between items-center py-3 border-b border-line last:border-0 gap-2.5"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-[13.5px] truncate">{pago.persona}</div>
                  <div className="font-mono text-xs text-steel mt-0.5">
                    {pago.fecha.toLocaleDateString("es-ES")} · {pago.banco} ·{" "}
                    {pago.contenedor?.nombre ?? "sin contenedor"}
                    {pago.cobradorAsignadoPor && (
                      <>
                        {" "}
                        ·{" "}
                        {pago.cobradorAsignadoPor.rol === "ADMIN"
                          ? "asignado por Admin"
                          : pago.cobradorAsignadoPor.cobradorId === pago.cobradorId
                          ? "autoasignado"
                          : `asignado por ${pago.cobradorAsignadoPor.nombre ?? "otro cobrador"}`}
                      </>
                    )}
                  </div>
                </div>
                <div className="font-mono font-semibold whitespace-nowrap text-[13.5px] flex-shrink-0 flex items-center gap-2">
                  {formatImporte(pago)}
                  <QuitarAsignacion pagoId={pago.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
