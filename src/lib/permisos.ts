export const PERMISOS_DISPONIBLES = [
  { clave: "ver_pagos", etiqueta: "Ver el historial de pagos" },
  { clave: "ver_contenedores", etiqueta: "Ver el historial de contenedores" },
  { clave: "ver_estadisticas", etiqueta: "Ver estadísticas" },
  { clave: "importar_pagos", etiqueta: "Importar pagos (fichero y sincronizar bancos)" },
  { clave: "gestionar_contenedores", etiqueta: "Crear, editar, completar y eliminar contenedores" },
  { clave: "gestionar_pagos", etiqueta: "Editar, eliminar y reasignar pagos entre contenedores" },
] as const;

export type PermisoClave = (typeof PERMISOS_DISPONIBLES)[number]["clave"];

const CLAVES_VALIDAS = new Set<string>(PERMISOS_DISPONIBLES.map((p) => p.clave));

export function esPermisoValido(clave: string): clave is PermisoClave {
  return CLAVES_VALIDAS.has(clave);
}

/** ADMIN y SUPERADMIN tienen todos los permisos implícitamente. */
export function tienePermiso(rol: string, permisos: string[] | undefined | null, clave: PermisoClave): boolean {
  if (rol === "ADMIN" || rol === "SUPERADMIN") return true;
  return (permisos ?? []).includes(clave);
}

const PERMISO_A_PESTANA: Partial<Record<PermisoClave, { href: string; etiqueta: string }>> = {
  ver_pagos: { href: "/dashboard/pagos", etiqueta: "Pagos" },
  ver_contenedores: { href: "/dashboard/contenedores", etiqueta: "Contenedores" },
  ver_estadisticas: { href: "/dashboard/estadisticas", etiqueta: "Estadísticas" },
  importar_pagos: { href: "/dashboard/importar", etiqueta: "Importar" },
};

/** Pestañas extra que un COBRADOR con permisos adicionales puede ver desde /mi/*. */
export function pestanasExtra(rol: string, permisos: string[] | undefined | null): { href: string; etiqueta: string }[] {
  if (rol !== "COBRADOR") return [];
  const vistas = new Set<string>();
  const resultado: { href: string; etiqueta: string }[] = [];
  for (const clave of permisos ?? []) {
    const pestana = PERMISO_A_PESTANA[clave as PermisoClave];
    if (pestana && !vistas.has(pestana.href)) {
      vistas.add(pestana.href);
      resultado.push(pestana);
    }
  }
  return resultado;
}
