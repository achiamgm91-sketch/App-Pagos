"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function DiagnosticoContenedor13Page() {
  const [datos, setDatos] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/diagnostico-contenedor-13")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) setError(data.error || "Error");
        else setDatos(data);
      })
      .catch(() => setError("No se ha podido conectar con el servidor."));
  }, []);

  return (
    <div className="min-h-screen">
      <div className="bg-navy-950 text-white px-4.5 py-4 flex items-center justify-between sticky top-0 z-20">
        <Link href="/dashboard" className="font-mono text-[13px] text-steel-light">
          ← Inicio
        </Link>
        <div className="font-display font-semibold text-base">Diagnóstico Contenedor 13</div>
        <div className="w-10" />
      </div>

      <main className="max-w-xl mx-auto w-full px-4 py-6 text-[13px]">
        {error && <div className="bg-[#FDECEC] p-3 rounded-xl text-[#8A1F1F] mb-4">{error}</div>}
        {!datos && !error && <div>Cargando...</div>}

        {datos && (
          <div className="space-y-5">
            <section className="bg-white border border-line rounded-xl p-3.5">
              <h2 className="font-semibold mb-2">Estado actual</h2>
              <pre className="whitespace-pre-wrap font-mono text-[11.5px]">
                {JSON.stringify(datos.estadoActual, null, 2)}
              </pre>
            </section>

            <section className="bg-[#FFF8E6] border border-[#F0D98C] rounded-xl p-3.5">
              <h2 className="font-semibold mb-2">Por qué no se cierra solo</h2>
              <div>{datos.porQueNoSeCierraSolo}</div>
            </section>

            <section className="bg-white border border-line rounded-xl p-3.5">
              <h2 className="font-semibold mb-2">Filas de Ajuste existentes ({datos.filasDeAjusteExistentes.length})</h2>
              <pre className="whitespace-pre-wrap font-mono text-[11.5px]">
                {JSON.stringify(datos.filasDeAjusteExistentes, null, 2)}
              </pre>
            </section>

            <section className="bg-white border border-line rounded-xl p-3.5">
              <h2 className="font-semibold mb-2">Todos los contenedores (orden por fecha de inicio)</h2>
              <pre className="whitespace-pre-wrap font-mono text-[11.5px]">
                {JSON.stringify(datos.todosLosContenedoresOrdenadosPorFecha, null, 2)}
              </pre>
            </section>

            <section className="bg-white border border-line rounded-xl p-3.5">
              <h2 className="font-semibold mb-2">Actividad relacionada ({datos.actividadRelacionada.length})</h2>
              <pre className="whitespace-pre-wrap font-mono text-[11.5px]">
                {JSON.stringify(datos.actividadRelacionada, null, 2)}
              </pre>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
