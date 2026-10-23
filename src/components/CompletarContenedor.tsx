"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CompletarContenedor({ contenedorId }: { contenedorId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function completar() {
    setLoading(true);
    setMensaje(null);
    const res = await fetch(`/api/contenedores/${contenedorId}/completar`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok) {
      if (data.mensaje) setMensaje(data.mensaje);
      router.refresh();
    }
  }

  return (
    <div>
      <button
        onClick={completar}
        disabled={loading}
        className="text-[13px] font-semibold bg-navy-950 text-white px-4 py-2.5 rounded-lg disabled:opacity-60"
      >
        {loading ? "Completando..." : "Completar contenedor"}
      </button>
      {mensaje && <div className="mt-2 text-[12.5px] text-[#0F5D45]">{mensaje}</div>}
    </div>
  );
}
