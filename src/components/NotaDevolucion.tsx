"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NotaDevolucion({ pagoId, notaInicial }: { pagoId: string; notaInicial: string | null }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [nota, setNota] = useState(notaInicial ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/pagos/${pagoId}/devolucion`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nota }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo guardar la nota");
      }
      setEditando(false);
      router.refresh();
    } catch (e: any) {
      setError(e.message || "Error");
    } finally {
      setGuardando(false);
    }
  }

  if (!editando) {
    return (
      <div className="mt-2">
        {notaInicial ? (
          <p className="text-[12.5px] text-steel-light italic">"{notaInicial}"</p>
        ) : (
          <p className="text-[12.5px] text-steel">Sin nota</p>
        )}
        <button
          onClick={() => setEditando(true)}
          className="text-[11px] font-mono text-steel underline underline-offset-2 mt-1"
        >
          {notaInicial ? "Editar nota" : "Añadir nota"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <textarea
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="¿Por qué se devolvió este pago?"
        className="w-full px-2.5 py-2 bg-white border border-line rounded-lg text-[13px] outline-none focus:border-navy-800 resize-none"
      />
      {error && <div className="text-[11px] font-mono text-alert mt-1">{error}</div>}
      <div className="flex gap-2 mt-1.5">
        <button
          onClick={guardar}
          disabled={guardando}
          className="px-3 py-1.5 bg-navy-950 text-white rounded-lg text-[12px] font-semibold disabled:opacity-50"
        >
          {guardando ? "Guardando..." : "Guardar"}
        </button>
        <button
          onClick={() => {
            setEditando(false);
            setNota(notaInicial ?? "");
            setError(null);
          }}
          className="px-3 py-1.5 bg-white border border-line rounded-lg text-[12px] font-semibold"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
