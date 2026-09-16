import { prisma } from "@/lib/prisma";
import Link from "next/link";
import CambiarPassword from "@/components/CambiarPassword";
import CrearUsuario from "@/components/CrearUsuario";
import PermisoVerTodo from "@/components/PermisoVerTodo";

export const dynamic = "force-dynamic";

const ROL_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  COBRADOR: "Cobrador",
};

const ROL_COLOR: Record<string, string> = {
  ADMIN: "bg-amber/15 text-amber-ink",
  COBRADOR: "bg-teal-bg text-[#0F5D45]",
};

export default async function UsuariosPage() {
  const usuarios = await prisma.usuario.findMany({
    include: { cobrador: true },
    orderBy: { creadoEn: "asc" },
  });
  const cobradores = await prisma.cobrador.findMany({
    where: { activo: true },
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });

  return (
    <div className="min-h-screen">
      <div className="bg-navy-950 text-white px-4.5 py-4 flex items-center justify-between sticky top-0 z-20">
        <Link href="/dashboard" className="font-mono text-[13px] text-steel-light">
          ← Inicio
        </Link>
        <div className="font-display font-semibold text-base">Usuarios</div>
        <div className="w-10" />
      </div>

      <main className="max-w-2xl mx-auto w-full px-4 py-6">
        <div className="mb-5">
          <div className="font-mono text-[11px] uppercase text-steel mb-1.5">Administración</div>
          <h2 className="font-display text-[22px] font-semibold">Usuarios</h2>
          <p className="text-steel text-[13px] mt-1">{usuarios.length} usuario(s) dado(s) de alta</p>
        </div>

        <CrearUsuario cobradores={cobradores} />

        {usuarios.map((u) => (
          <div key={u.id} className="bg-white border border-line rounded-xl p-4 mb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-[14.5px]">{u.nombre ?? u.usuario}</div>
                <div className="font-mono text-[12px] text-steel mt-0.5">@{u.usuario}</div>
                {u.cobrador && (
                  <div className="font-mono text-[11px] text-steel mt-0.5">
                    Vinculado al cobrador: {u.cobrador.nombre}
                  </div>
                )}
              </div>
              <span
                className={`font-mono text-[10.5px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full flex-shrink-0 ${
                  ROL_COLOR[u.rol] ?? "bg-line text-steel"
                }`}
              >
                {ROL_LABEL[u.rol] ?? u.rol}
              </span>
            </div>

            {u.debeCambiarPassword && (
              <div className="text-[11px] font-mono text-amber-ink mt-1.5">
                ⏳ Pendiente de que cambie su contraseña
              </div>
            )}

            {u.rol === "COBRADOR" && <PermisoVerTodo usuarioId={u.id} valorInicial={u.verTodosPagos} />}

            <CambiarPassword usuarioId={u.id} nombre={u.nombre ?? u.usuario} />
          </div>
        ))}
      </main>
    </div>
  );
}
