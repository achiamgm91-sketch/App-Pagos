"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AsignarCobrador from "@/components/AsignarCobrador";
import QuitarAsignacion from "@/components/QuitarAsignacion";
import ReasignarContenedor from "@/components/ReasignarContenedor";
import DevolverPago from "@/components/DevolverPago";
import { round2, formatMonto } from "@/lib/format";

type Pago = {
  id: string;
  fecha: string;
  persona: string;
  banco: string;
  contenedorId: string | null;
  cobradorNombre: string | null;
  etiquetaAsignacion: string | null;
  importeUsd: number | null;
  importeEur: number | null;
  tasaCambio: number | null;
  fechaTasaCambio: string | null;
  monedaOriginal: string;
  devuelto: boolean;
};

function importeOriginal(p: Pago) {
  return p.monedaOriginal === "USD" ? p.importeUsd : p.importeEur;
}
function simboloOriginal(p: Pago) {
  return p.monedaOriginal === "USD" ? "$" : "€";
}
function importeConvertido(p: Pago) {
  return p.monedaOriginal === "USD" ? p.importeEur : p.importeUsd;
}
function simboloConvertido(p: Pago) {
  return p.monedaOriginal === "USD" ? "€" : "$";
}

export default function TarjetaPago({
  pago,
  contenedores,
  cobradores,
  esSuperAdmin,
}: {
  pago: Pago;
  contenedores: { id: string; nombre: string }[];
  cobradores: { id: string; nombre: string }[];
  esSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const original = importeOriginal(pago);
  const convertido = importeConvertido(pago);

  const [nuevaFecha, setNuevaFecha] = useState(pago.fecha);
  const [nuevaPersona, setNuevaPersona] = useState(pago.persona);
  const [nuevoImporte, setNuevoImporte] = useState(original !== null ? String(original) : "");

  function entrarEnEdicion() {
    setNuevaFecha(pago.fecha);
    setNuevaPersona(pago.persona);
    setNuevoImporte(original !== null ? String(original) : "");
    setError(null);
    setEditando(true);
    setMenuAbierto(false);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const body: Record<string, any> = { fecha: nuevaFecha, persona: nuevaPersona };
      const importeNum = parseFloat(nuevoImporte.replace(",", "."));
      if (!isNaN(importeNum)) {
        if (pago.monedaOriginal === "USD") body.importeUsd = importeNum;
        else body.importeEur = importeNum;
      }

      const res = await fetch(`/api/pagos/${pago.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo guardar el pago");
      }
      setEditando(false);
      router.refresh();
    } catch (e: any) {
      setError(e.message || "Error al guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!confirm(`¿Seguro que quieres eliminar el pago de ${pago.persona}? Esta acción no se puede deshacer.`)) return;
    setEliminando(true);
    try {
      const res = await fetch(`/api/pagos/${pago.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo eliminar el pago");
      }
      router.refresh();
    } catch (e: any) {
      setError(e.message || "Error al eliminar");
      setEliminando(false);
    }
  }

  if (editando) {
    return (
      <div className="bg-white border border-line rounded-xl p-3.5 mb-2.5">
        <div className="space-y-2 mb-3">
          <input
            type="date"
            value={nuevaFecha}
            onChange={(e) => setNuevaFecha(e.target.value)}
            className="w-full px-2.5 py-2 bg-white border border-line rounded-lg text-[13px] outline-none focus:border-navy-800"
          />
          <input
            type="text"
            value={nuevaPersona}
            onChange={(e) => setNuevaPersona(e.target.value)}
            placeholder="Persona"
            className="w-full px-2.5 py-2 bg-white border border-line rounded-lg text-[13.5px] outline-none focus:border-navy-800"
          />
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={nuevoImporte}
              onChange={(e) => setNuevoImporte(e.target.value)}
              className="flex-1 px-2.5 py-2 bg-white border border-line rounded-lg text-[13.5px] font-mono outline-none focus:border-navy-800"
            />
            <span className="font-mono text-[13px] text-steel flex-shrink-0">{simboloOriginal(pago)}</span>
          </div>
          <div className="text-[10.5px] text-steel">
            El importe convertido y la tasa de cambio no se recalculan automáticamente al editar.
          </div>
        </div>

        {error && <div className="text-[11.5px] font-mono text-alert mb-2">{error}</div>}

        <div className="flex gap-2">
          <button
            onClick={guardar}
            disabled={guardando}
            className="flex-1 py-2 bg-navy-950 text-white rounded-lg text-[13px] font-semibold disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
          <button
            onClick={() => {
              setEditando(false);
              setError(null);
            }}
            className="flex-1 py-2 bg-white border border-line rounded-lg text-[13px] font-semibold"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-white border rounded-xl p-3.5 mb-2.5 ${
        pago.devuelto
          ? "border-line opacity-60"
          : pago.cobradorNombre
          ? "border-line"
          : "border-[#F3C9C9] border-l-[3px] border-l-alert"
      }`}
    >
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="font-semibold text-[14.5px]">
            {pago.persona}
            {pago.devuelto && (
              <span className="ml-1.5 inline-block bg-alert/10 text-alert text-[10px] font-mono font-semibold uppercase px-1.5 py-0.5 rounded align-middle">
                Devuelto
              </span>
            )}
          </div>
          <div className="font-mono text-[11.5px] text-steel mt-0.5">
            {new Date(pago.fecha).toLocaleDateString("es-ES")} · {pago.banco}
          </div>
        </div>
        <div className="flex items-start gap-2">
          <div className="text-right">
            <div className="font-mono font-bold text-[15.5px]">
              {original !== null ? formatMonto(original, simboloOriginal(pago)) : "—"}
            </div>
            {convertido !== null ? (
              <div className="font-mono text-[10.5px] text-steel mt-0.5">
                {formatMonto(convertido, simboloConvertido(pago))}
                {pago.tasaCambio !== null && (
                  <>
                    {" "}
                    · tasa {pago.tasaCambio.toLocaleString("es-ES", { minimumFractionDigits: 4 })}
                    {pago.fechaTasaCambio && (
                      <> ({new Date(pago.fechaTasaCambio).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" })})</>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="font-mono text-[10.5px] text-steel mt-0.5">sin tasa ese día</div>
            )}
          </div>

          <div className="relative flex-shrink-0">
            <button
              onClick={() => setMenuAbierto((v) => !v)}
              className="w-6 h-6 flex items-center justify-center text-steel"
              aria-label="Más acciones"
            >
              ⋮
            </button>

            {menuAbierto && (
              <div className="absolute right-0 top-7 z-10 w-56 bg-white border border-line rounded-lg shadow-lg p-3">
                <div className="mb-3">
                  <div className="text-[10.5px] font-mono uppercase text-steel mb-1.5">Contenedor</div>
                  <ReasignarContenedor pagoId={pago.id} contenedorId={pago.contenedorId} contenedores={contenedores} />
                </div>
                <div className="flex gap-2 border-t border-line pt-2.5">
                  <button
                    onClick={entrarEnEdicion}
                    className="flex-1 py-2 bg-white border border-line rounded-lg text-[12.5px] font-semibold"
                  >
                    Editar
                  </button>
                  <button
                    onClick={eliminar}
                    disabled={eliminando}
                    className="flex-1 py-2 bg-white border border-line rounded-lg text-[12.5px] font-semibold text-alert disabled:opacity-50"
                  >
                    {eliminando ? "..." : "Eliminar"}
                  </button>
                </div>
                {esSuperAdmin && pago.banco !== "Ajuste" && (
                  <div className="border-t border-line pt-2.5 mt-2.5">
                    <DevolverPago pagoId={pago.id} persona={pago.persona} devuelto={pago.devuelto} />
                  </div>
                )}
                {error && <div className="text-[10.5px] font-mono text-alert mt-2">{error}</div>}
              </div>
            )}
          </div>
        </div>
      </div>

      {pago.cobradorNombre ? (
        <div className="flex items-center justify-between pt-3 border-t border-line">
          <span className="inline-flex items-center gap-1.5 bg-teal-bg text-[#0F5D45] text-xs font-semibold px-2.5 py-1.5 rounded-full font-mono before:content-['✓'] before:text-[11px]">
            {pago.cobradorNombre}
            {pago.etiquetaAsignacion && (
              <span className="opacity-60 font-normal"> · {pago.etiquetaAsignacion}</span>
            )}
          </span>
          <QuitarAsignacion pagoId={pago.id} />
        </div>
      ) : pago.banco === "Ajuste" ? null : (
        <AsignarCobrador pagoId={pago.id} cobradores={cobradores} />
      )}
    </div>
  );
}
