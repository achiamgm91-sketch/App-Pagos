"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PERMISOS_DISPONIBLES } from "@/lib/permisos";

export default function GestionarPermisos({
  usuarioId,
  permisosIniciales,
}: {
  usuarioId: string;
  permisosIniciales: string[];
}) {
  const router = useRouter();
  const [permisos, setPermisos] = useState<string[]>(permisosIniciales);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function togglear(clave: string) {
    const anterior = permisos;
    const nuevos = permisos.includes(clave) ? permisos.filter((p) => p !== clave) : [...permisos, clave];
    setPermisos(nuevos);
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/usuarios/${usuarioId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permisos: nuevos }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo guardar el permiso");
      }
      router.refresh();
    } catch (e: any) {
      setPermisos(anterior);
      setError(e.message || "Error");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="mt-2.5">
      <div className="text-[10.5px] font-mono uppercase text-steel mb-1.5">Permisos adicionales</div>
      <div className="space-y-1.5">
        {PERMISOS_DISPONIBLES.map((p) => (
          <label key={p.clave} className="flex items-center gap-2 text-[12.5px]">
            <input
              type="checkbox"
              checked={permisos.includes(p.clave)}
              onChange={() => togglear(p.clave)}
              disabled={cargando}
            />
            {p.etiqueta}
          </label>
        ))}
      </div>
      {error && <div className="text-[11px] font-mono text-alert mt-1">{error}</div>}
    </div>
  );
}
