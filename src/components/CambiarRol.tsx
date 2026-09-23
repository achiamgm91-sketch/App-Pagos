"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ROLES: { valor: string; etiqueta: string }[] = [
  { valor: "COBRADOR", etiqueta: "Cobrador" },
  { valor: "ADMIN", etiqueta: "Administrador" },
  { valor: "SUPERADMIN", etiqueta: "Superadmin" },
];

export default function CambiarRol({
  usuarioId,
  rolInicial,
  puedeAsignarSuperAdmin,
  deshabilitado,
}: {
  usuarioId: string;
  rolInicial: string;
  puedeAsignarSuperAdmin: boolean;
  deshabilitado?: boolean;
}) {
  const router = useRouter();
  const [rol, setRol] = useState(rolInicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roles = ROLES.filter((r) => r.valor !== "SUPERADMIN" || puedeAsignarSuperAdmin);

  async function cambiar(nuevoRol: string) {
    if (nuevoRol === rol) return;
    if (!confirm(`¿Cambiar el rol a "${ROLES.find((r) => r.valor === nuevoRol)?.etiqueta}"?`)) return;
    const anterior = rol;
    setRol(nuevoRol);
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/usuarios/${usuarioId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rol: nuevoRol }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo cambiar el rol");
      }
      router.refresh();
    } catch (e: any) {
      setRol(anterior);
      setError(e.message || "Error");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="mt-2">
      <div className="text-[10.5px] font-mono uppercase text-steel mb-1.5">Rol</div>
      <div className="flex gap-1.5">
        {roles.map((r) => (
          <button
            key={r.valor}
            onClick={() => cambiar(r.valor)}
            disabled={cargando || deshabilitado}
            className={`px-2.5 py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-50 ${
              rol === r.valor ? "bg-navy-950 text-white" : "bg-white border border-line text-steel"
            }`}
          >
            {r.etiqueta}
          </button>
        ))}
      </div>
      {deshabilitado && <div className="text-[11px] text-steel mt-1">No puedes cambiar tu propio rol.</div>}
      {error && <div className="text-[11px] font-mono text-alert mt-1">{error}</div>}
    </div>
  );
}
