"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DevolverPago({
  pagoId,
  persona,
  devuelto,
}: {
  pagoId: string;
  persona: string;
  devuelto: boolean;
}) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function togglear() {
    const mensaje = devuelto
      ? `¿Deshacer la devolución del pago de ${persona}? Volverá a contar en los totales.`
      : `¿Marcar como devuelto el pago de ${persona}? Dejará de contar en los totales del contenedor y, si hace falta, se recuadrará con el siguiente contenedor.`;
    if (!confirm(mensaje)) return;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/pagos/${pagoId}/devolucion`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo registrar la devolución");
      const incompleto = (data.pasos || []).find((p: any) => !p.completo);
      if (incompleto) {
        alert(
          `Ojo: no se pudo recuadrar del todo entre "${incompleto.contenedor}" y "${incompleto.siguiente}". Revísalo a mano.`
        );
      }
      router.refresh();
    } catch (e: any) {
      setError(e.message || "Error");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div>
      <button
        onClick={togglear}
        disabled={cargando}
        className={`w-full py-2 border rounded-lg text-[12.5px] font-semibold disabled:opacity-50 ${
          devuelto ? "border-line text-steel" : "border-alert/40 text-alert"
        }`}
      >
        {cargando ? "..." : devuelto ? "Deshacer devolución" : "Devolución"}
      </button>
      {error && <div className="text-[10.5px] font-mono text-alert mt-1.5">{error}</div>}
    </div>
  );
}
