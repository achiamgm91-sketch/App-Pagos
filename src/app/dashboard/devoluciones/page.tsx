import { prisma } from "@/lib/prisma";
import Link from "next/link";
import DevolverPago from "@/components/DevolverPago";
import NotaDevolucion from "@/components/NotaDevolucion";
import { formatMonto } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DevolucionesPage() {
  const devoluciones = await prisma.pago.findMany({
    where: { devuelto: true },
    include: { contenedor: { select: { nombre: true } }, devueltoPor: true },
    orderBy: { devueltoEn: "desc" },
  });

  return (
    <div className="min-h-screen">
      <div className="bg-navy-950 text-white px-4.5 py-4 flex items-center justify-between sticky top-0 z-20">
        <Link href="/dashboard" className="font-mono text-[13px] text-steel-light">
          ← Inicio
        </Link>
        <div className="font-display font-semibold text-base">Devoluciones</div>
        <div className="w-10" />
      </div>

      <main className="max-w-2xl mx-auto w-full px-4 py-6">
        <div className="mb-5">
          <div className="font-mono text-[11px] uppercase text-steel mb-1.5">Superadministrador</div>
          <h2 className="font-display text-[22px] font-semibold">Devoluciones</h2>
          <p className="text-steel text-[13px] mt-1">
            {devoluciones.length} pago(s) devuelto(s). No cuentan en los totales de sus contenedores.
          </p>
        </div>

        {devoluciones.length === 0 && (
          <div className="text-steel text-[13.5px] text-center py-10">Todavía no hay ninguna devolución.</div>
        )}

        {devoluciones.map((p) => {
          const original = p.monedaOriginal === "USD" ? p.importeUsd : p.importeEur;
          const simbolo = p.monedaOriginal === "USD" ? "$" : "€";
          return (
            <div key={p.id} className="bg-white border border-line rounded-xl p-3.5 mb-2.5">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <div className="font-semibold text-[14.5px]">{p.persona}</div>
                  <div className="font-mono text-[11.5px] text-steel mt-0.5">
                    {p.fecha.toLocaleDateString("es-ES")} · {p.banco} · {p.contenedor?.nombre ?? "sin contenedor"}
                  </div>
                  <div className="font-mono text-[11px] text-steel mt-1">
                    Devuelto {p.devueltoEn ? p.devueltoEn.toLocaleString("es-ES") : ""}
                    {p.devueltoPor && ` por ${p.devueltoPor.nombre || p.devueltoPor.usuario}`}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-mono font-bold text-[15.5px]">
                    {original !== null ? formatMonto(Number(original), simbolo) : "—"}
                  </div>
                </div>
              </div>

              <NotaDevolucion pagoId={p.id} notaInicial={p.devueltoNota} />

              <div className="border-t border-line pt-2.5 mt-2.5">
                <DevolverPago pagoId={p.id} persona={p.persona} devuelto={p.devuelto} />
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}
