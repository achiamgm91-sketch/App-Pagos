"use client";

import { useState } from "react";
import Link from "next/link";

type Calculo = {
  origen: string;
  estadoOrigenAntes: string;
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
  pagosQueSeReasignaran: {
    cuantos: number;
    sumaUsd: number;
    sumaEur: number;
    primerPago: { persona: string; fecha: string } | null;
    ultimoPago: { persona: string; fecha: string } | null;
  };
};

type Resultado = {
  ok: boolean;
  origenCompletado: string;
  destino: string;
  excedenteMovido: number;
  moneda: string;
  nuevoSaldoInicialDestino: number;
  pagosReasignados: number;
  sumaReasignadaUsd: number;
  sumaReasignadaEur: number;
};

export default function CerrarContenedor13Page() {
  const [origen, setOrigen] = useState("Contenedor 13");
  const [destino, setDestino] = useState("Arroz Boomerang 2");
  const [cargando, setCargando] = useState(false);
  const [calculo, setCalculo] = useState<Calculo | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);

  function url() {
    return `/api/admin/cerrar-contenedor-13?origen=${encodeURIComponent(origen)}&destino=${encodeURIComponent(destino)}`;
  }

  async function calcular() {
    setCargando(true);
    setError(null);
    setCalculo(null);
    setResultado(null);
    try {
      const res = await fetch(url());
      const data = await res.json();
      if (!res.ok) setError(data.error || "Error al calcular");
      else setCalculo(data);
    } catch {
      setError("No se ha podido conectar con el servidor.");
    }
    setCargando(false);
  }

  async function confirmar() {
    if (!confirm(`¿Confirmas cerrar "${origen}" y mover el excedente/pagos a "${destino}"? No se puede deshacer con un clic.`)) return;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(url(), { method: "POST" });
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
          Corrección de un solo uso, paso a paso en cadena: escribe el contenedor de origen y el siguiente
          de verdad en la cadena, calcula, revisa, y confirma. Repite con el siguiente salto si hace falta
          (p.ej. primero Contenedor 13 → Arroz Boomerang 2, luego Arroz Boomerang 2 → Arroz Boomerang 3).
        </p>

        <div className="space-y-2 mb-4">
          <input
            value={origen}
            onChange={(e) => setOrigen(e.target.value)}
            placeholder="Contenedor de origen (exacto)"
            className="w-full border border-line rounded-lg px-3 py-2.5 text-[13.5px]"
          />
          <input
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            placeholder="Contenedor de destino (exacto)"
            className="w-full border border-line rounded-lg px-3 py-2.5 text-[13.5px]"
          />
        </div>

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
              <b>{calculo.origen}</b> (estaba {calculo.estadoOrigenAntes}) → <b>{calculo.destino}</b>
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
            <div className="border-t border-line pt-2 mt-2 bg-[#EFF3FF] -mx-4 px-4 py-2 border-[#CDD9F7]">
              Además, se van a <b>reasignar {calculo.pagosQueSeReasignaran.cuantos} pagos</b> de{" "}
              {calculo.origen} a {calculo.destino} (llegaron después del pago que cruza): suman{" "}
              <b>{calculo.pagosQueSeReasignaran.sumaEur} € / {calculo.pagosQueSeReasignaran.sumaUsd} $</b>.
              {calculo.pagosQueSeReasignaran.primerPago && calculo.pagosQueSeReasignaran.ultimoPago && (
                <div className="font-mono text-[11px] mt-1">
                  Del {calculo.pagosQueSeReasignaran.primerPago.fecha} ({calculo.pagosQueSeReasignaran.primerPago.persona})
                  {" "}al {calculo.pagosQueSeReasignaran.ultimoPago.fecha} ({calculo.pagosQueSeReasignaran.ultimoPago.persona})
                </div>
              )}
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
            sumados al saldo inicial de <b>{resultado.destino}</b> (ahora{" "}
            <b>{resultado.nuevoSaldoInicialDestino} {resultado.moneda}</b>), y{" "}
            <b>{resultado.pagosReasignados} pagos</b> ({resultado.sumaReasignadaEur} € /{" "}
            {resultado.sumaReasignadaUsd} $) reasignados a {resultado.destino}.
          </div>
        )}
      </main>
    </div>
  );
}
