"use client";

import { useState } from "react";
import Link from "next/link";

type Calculo = {
  origen: string;
  destino: string;
  ajustesPreviosQueSeSustituiran: { id: string; fecha: string; importeEur: number | null; importeUsd: number | null; idOrigen: string }[];
  totalFacturaOrigen: number;
  monedaOrigen: string;
  pagoQueCruza: { persona: string; fecha: string; importeEur: number | null; importeUsd: number | null; banco: string };
  excedente: number;
  monedaDestino: string;
  excedenteEnMonedaDestino: number;
  saldoInicialActualDestino: number;
  saldoInicialNuevoDestino: number;
};

type Resultado = {
  ok: boolean;
  origenCompletado: string;
  destino: string;
  excedenteMovido: number;
  moneda: string;
  nuevoSaldoInicialDestino: number;
};

export default function CerrarContenedor13Page() {
  const [cargando, setCargando] = useState(false);
  const [calculo, setCalculo] = useState<Calculo | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function calcular() {
    setCargando(true);
    setError(null);
    setCalculo(null);
    try {
      const res = await fetch("/api/admin/cerrar-contenedor-13");
      const data = await res.json();
      if (!res.ok) setError(data.error || "Error al calcular");
      else setCalculo(data);
    } catch {
      setError("No se ha podido conectar con el servidor.");
    }
    setCargando(false);
  }

  async function confirmar() {
    if (!confirm("¿Confirmas cerrar el Contenedor 13 y mover el excedente a Arroz Boomerang 3? No se puede deshacer con un clic.")) return;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cerrar-contenedor-13", { method: "POST" });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Error al confirmar");
      else setResultado(data);
    } catch {
      setError("No se ha podido conectar con el servidor.");
    }
    setCargando(false);
  }

  return (
    <div className="min-h-screen">
      <div className="bg-navy-950 text-white px-4.5 py-4 flex items-center justify-between sticky top-0 z-20">
        <Link href="/dashboard" className="font-mono text-[13px] text-steel-light">
          ← Inicio
        </Link>
        <div className="font-display font-semibold text-base">Cerrar Contenedor 13</div>
        <div className="w-10" />
      </div>

      <main className="max-w-xl mx-auto w-full px-4 py-6">
        <p className="text-steel text-[13.5px] mb-5">
          Corrección de un solo uso: calcula el pago real que cruza el total del Contenedor 13 y, si lo
          confirmas, lo cierra sumando su excedente al saldo inicial de Arroz Boomerang 3 (sin pisarlo).
        </p>

        <button
          onClick={calcular}
          disabled={cargando}
          className="w-full text-[13px] font-semibold bg-navy-950 text-white px-4 py-3 rounded-lg disabled:opacity-60 mb-4"
        >
          {cargando ? "Calculando..." : "1. Calcular (no escribe nada)"}
        </button>

        {error && (
          <div className="bg-[#FDECEC] border border-[#F3B8B8] rounded-xl p-3.5 mb-4 text-[13px] text-[#8A1F1F]">
            {error}
          </div>
        )}

        {calculo && !resultado && (
          <div className="bg-white border border-line rounded-xl p-4 mb-4 text-[13.5px] space-y-2">
            <div>
              <b>{calculo.origen}</b> → <b>{calculo.destino}</b>
            </div>
            {calculo.ajustesPreviosQueSeSustituiran.length > 0 && (
              <div className="bg-[#FFF8E6] border border-[#F0D98C] rounded-lg p-2.5">
                Se va a sustituir {calculo.ajustesPreviosQueSeSustituiran.length} fila(s) de Ajuste antigua(s)
                (del cierre del 6/10):{" "}
                {calculo.ajustesPreviosQueSeSustituiran.map((a) => (
                  <div key={a.id} className="font-mono text-[11px]">
                    {a.fecha} · {a.importeEur} € / {a.importeUsd} $
                  </div>
                ))}
              </div>
            )}
            <div>Total factura origen: {calculo.totalFacturaOrigen} {calculo.monedaOrigen}</div>
            <div className="border-t border-line pt-2 mt-2">
              Pago que cruza: <b>{calculo.pagoQueCruza.persona}</b> ({calculo.pagoQueCruza.fecha},{" "}
              {calculo.pagoQueCruza.banco}) — {calculo.pagoQueCruza.importeEur} € /{" "}
              {calculo.pagoQueCruza.importeUsd} $
            </div>
            <div className="border-t border-line pt-2 mt-2">
              Excedente: <b>{calculo.excedente} {calculo.monedaOrigen}</b> ({calculo.excedenteEnMonedaDestino}{" "}
              {calculo.monedaDestino} en la moneda del destino)
            </div>
            <div>
              Saldo inicial de {calculo.destino}: {calculo.saldoInicialActualDestino} {calculo.monedaDestino} →{" "}
              <b>{calculo.saldoInicialNuevoDestino} {calculo.monedaDestino}</b>
            </div>

            <button
              onClick={confirmar}
              disabled={cargando}
              className="w-full text-[13px] font-semibold bg-[#0F5D45] text-white px-4 py-3 rounded-lg disabled:opacity-60 mt-3"
            >
              {cargando ? "Aplicando..." : "2. Confirmar y cerrar de verdad"}
            </button>
          </div>
        )}

        {resultado && (
          <div className="bg-teal-bg border border-[#CDE9DF] rounded-xl p-4 text-[13.5px] text-[#0F5D45]">
            Hecho. <b>{resultado.origenCompletado}</b> completado. {resultado.excedenteMovido} {resultado.moneda}{" "}
            movidos a <b>{resultado.destino}</b>, que ahora tiene{" "}
            <b>{resultado.nuevoSaldoInicialDestino} {resultado.moneda}</b> de saldo inicial.
          </div>
        )}
      </main>
    </div>
  );
}
