"use client";

import { useState } from "react";

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

type ContenedorOpcion = { id: string; nombre: string; estado: string };

export default function CerrarContenedorForm({ contenedores }: { contenedores: ContenedorOpcion[] }) {
  const [origen, setOrigen] = useState(contenedores[0]?.nombre ?? "");
  const [destino, setDestino] = useState(contenedores[1]?.nombre ?? "");
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
    <div>
      <p className="text-steel text-[13.5px] mb-5">
        Herramienta de SUPERADMIN: calcula el pago real que cruza el total del contenedor de origen y, si
        lo confirmas, lo cierra sumando el excedente al saldo inicial del destino y reasignándole los pagos
        posteriores. Úsala paso a paso en cadena, un salto cada vez (origen → el siguiente contenedor real).
      </p>

      <div className="space-y-2 mb-4">
        <select
          value={origen}
          onChange={(e) => setOrigen(e.target.value)}
          className="w-full border border-line rounded-lg px-3 py-2.5 text-[13.5px] bg-white"
        >
          {contenedores.map((c) => (
            <option key={c.id} value={c.nombre}>
              {c.nombre} ({c.estado})
            </option>
          ))}
        </select>
        <div className="text-center text-steel text-[12px]">↓</div>
        <select
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          className="w-full border border-line rounded-lg px-3 py-2.5 text-[13.5px] bg-white"
        >
          {contenedores.map((c) => (
            <option key={c.id} value={c.nombre}>
              {c.nombre} ({c.estado})
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={calcular}
        disabled={cargando || !origen || !destino}
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
              del origen:{" "}
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
          {resultado.sumaReasignadaUsd} $) reasignados a {resultado.destino}. Recarga la página para ver
          los contenedores actualizados en la lista.
        </div>
      )}
    </div>
  );
}
