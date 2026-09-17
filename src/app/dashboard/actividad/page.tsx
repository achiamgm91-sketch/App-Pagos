import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

const ACCION_LABEL: Record<string, string> = {
  crear_usuario: "Creó un usuario",
  editar_usuario: "Editó un usuario",
  resetear_password: "Reseteó una contraseña",
  asignar_pago: "Asignó un pago",
  desasignar_pago: "Desasignó un pago",
  editar_pago: "Editó un pago",
  eliminar_pago: "Eliminó un pago",
  crear_contenedor: "Creó un contenedor",
  editar_contenedor: "Editó un contenedor",
  eliminar_contenedor: "Eliminó un contenedor",
  completar_contenedor: "Completó un contenedor",
  recalcular_pagos: "Recalculó pagos con nueva tasa",
  importar_pagos: "Importó pagos desde un fichero",
};

function formatFechaHora(d: Date) {
  return d.toLocaleString("es-ES", { dateStyle: "short", timeStyle: "medium" });
}

export default async function ActividadPage() {
  const actividades = await prisma.registroActividad.findMany({
    include: { usuario: true },
    orderBy: { creadoEn: "desc" },
    take: 300,
  });

  return (
    <div className="min-h-screen">
      <div className="bg-navy-950 text-white px-4.5 py-4 flex items-center justify-between sticky top-0 z-20">
        <Link href="/dashboard" className="font-mono text-[13px] text-steel-light">
          ← Inicio
        </Link>
        <div className="font-display font-semibold text-base">Supervisión</div>
        <div className="w-10" />
      </div>

      <main className="max-w-2xl mx-auto w-full px-4 py-6">
        <div className="mb-5">
          <div className="font-mono text-[11px] uppercase text-steel mb-1.5">Superadministrador</div>
          <h2 className="font-display text-[22px] font-semibold">Supervisión</h2>
          <p className="text-steel text-[13px] mt-1">
            Últimos {actividades.length} cambios hechos por cualquier usuario, incluidos los administradores.
          </p>
        </div>

        {actividades.length === 0 && (
          <div className="text-steel text-[13.5px] text-center py-10">Todavía no hay actividad registrada.</div>
        )}

        {actividades.map((a) => (
          <div key={a.id} className="bg-white border border-line rounded-xl p-3.5 mb-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-[13.5px]">
                  {a.usuario?.nombre ?? a.usuario?.usuario ?? "Sistema"}
                </div>
                <div className="text-[12.5px] text-steel mt-0.5">
                  {ACCION_LABEL[a.accion] ?? a.accion}
                  {a.detalle && <span> — {a.detalle}</span>}
                </div>
              </div>
              <div className="font-mono text-[11px] text-steel whitespace-nowrap flex-shrink-0">
                {formatFechaHora(a.creadoEn)}
              </div>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
