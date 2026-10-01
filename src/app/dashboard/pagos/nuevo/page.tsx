import Link from "next/link";
import { prisma } from "@/lib/prisma";
import PagoManualForm from "@/components/PagoManualForm";

export const dynamic = "force-dynamic";

export default async function NuevoPagoManualPage() {
  const contenedores = await prisma.contenedor.findMany({
    select: { id: true, nombre: true, estado: true },
    orderBy: { fechaInicio: "desc" },
  });

  const bancosExistentes = await prisma.pago.findMany({
    select: { banco: true },
    distinct: ["banco"],
    orderBy: { banco: "asc" },
  });

  const activo = contenedores.find((c) => c.estado === "ACTIVO");

  return (
    <div className="min-h-screen">
      <div className="bg-navy-950 text-white px-4.5 py-4 flex items-center justify-between sticky top-0 z-20">
        <Link href="/dashboard/pagos" className="font-mono text-[13px] text-steel-light">
          ← Pagos
        </Link>
        <div className="font-display font-semibold text-base">Añadir pago a mano</div>
        <div className="w-10" />
      </div>

      <main className="max-w-xl mx-auto w-full px-4 py-6">
        <div className="mb-5 bg-amber/10 border border-amber/30 text-amber-ink rounded-xl p-3.5 text-[13px]">
          Úsalo solo cuando un pago no pueda entrar por el camino normal (p.ej. un banco nuevo sin
          importador todavía). El nombre, la fecha y el importe son responsabilidad tuya — aquí no
          hay ningún extracto del banco que los compruebe.
        </div>

        <PagoManualForm
          contenedores={contenedores.map((c) => ({ id: c.id, nombre: c.nombre, estado: c.estado }))}
          contenedorActivoId={activo?.id ?? ""}
          bancosExistentes={bancosExistentes.map((b) => b.banco)}
        />
      </main>
    </div>
  );
}
