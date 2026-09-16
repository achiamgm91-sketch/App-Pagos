"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PermisoVerTodo({ usuarioId, valorInicial }: { usuarioId: string; valorInicial: boolean }) {
  const router = useRouter();
  const [valor, setValor] = useState(valorInicial);
  const [cargando, setCargando] = useState(false);

  async function cambiar(nuevo: boolean) {
    setValor(nuevo);
    setCargando(true);
    const res = await fetch(`/api/usuarios/${usuarioId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verTodosPagos: nuevo }),
    });
    setCargando(false);
    if (res.ok) {
      router.refresh();
    } else {
      setValor(!nuevo);
    }
  }

  return (
    <label className="flex items-center gap-2 text-[12px] mt-2 cursor-pointer">
      <input
        type="checkbox"
        checked={valor}
        disabled={cargando}
        onChange={(e) => cambiar(e.target.checked)}
        className="w-3.5 h-3.5"
      />
      Ver los pagos de todos los cobradores
    </label>
  );
}
