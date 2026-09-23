import { prisma } from "@/lib/prisma";
import { generarJwtEnableBanking } from "./jwt";

const EB_BASE_URL = "https://api.enablebanking.com";
const ASPSP_NOMBRE = "Banco de Sabadell";
const ASPSP_PAIS = "ES";

function redirectUri(): string {
  return process.env.ENABLE_BANKING_REDIRECT_URI || "https://boomerang-brown.vercel.app/api/sabadell/callback";
}

async function llamarEnableBanking(path: string, init?: RequestInit) {
  const jwt = generarJwtEnableBanking();
  const res = await fetch(`${EB_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const texto = await res.text();
    if (res.status === 429 && texto.includes("ASPSP_RATE_LIMIT_EXCEEDED")) {
      throw new Error("Se han excedido el límite de las cuatro consultas diarias que permite Sabadell. Vuelve a intentarlo mañana.");
    }
    throw new Error(`Error al llamar a Enable Banking (${path}): ${res.status} ${texto}`);
  }
  return res.json();
}

export async function iniciarAutorizacionSabadell(state: string): Promise<string> {
  const validoHasta = new Date();
  validoHasta.setDate(validoHasta.getDate() + 179);

  const data = await llamarEnableBanking("/auth", {
    method: "POST",
    body: JSON.stringify({
      access: { valid_until: validoHasta.toISOString() },
      aspsp: { name: ASPSP_NOMBRE, country: ASPSP_PAIS },
      state,
      redirect_url: redirectUri(),
      psu_type: "business",
    }),
  });

  return data.url as string;
}

export async function intercambiarCodigoPorSesion(code: string) {
  const data = await llamarEnableBanking("/sessions", {
    method: "POST",
    body: JSON.stringify({ code }),
  });

  const cuentas: string[] = (data.accounts || []).map((c: any) => c.uid).filter(Boolean);
  if (cuentas.length === 0) {
    throw new Error("Enable Banking no ha devuelto ninguna cuenta autorizada");
  }

  const existente = await prisma.sabadellSesion.findFirst();
  const valores = {
    sessionId: data.session_id as string,
    accountUids: cuentas,
    validaHasta: new Date(data.access.valid_until),
  };

  if (existente) {
    await prisma.sabadellSesion.update({ where: { id: existente.id }, data: valores });
  } else {
    await prisma.sabadellSesion.create({ data: valores });
  }

  return valores;
}

/** Puede haber varias cuentas autorizadas (p.ej. una en EUR y otra en USD). */
export async function obtenerCuentasSabadellAutorizadas(): Promise<string[]> {
  const sesion = await prisma.sabadellSesion.findFirst();
  if (!sesion) {
    throw new Error(
      "No hay ninguna conexión con Sabadell todavía. Es necesario autorizar la aplicación primero en /api/sabadell/authorize"
    );
  }
  if (sesion.validaHasta.getTime() < Date.now()) {
    throw new Error(
      "La autorización con Sabadell ha caducado. Es necesario volver a conectar en /api/sabadell/authorize"
    );
  }
  return sesion.accountUids;
}

export { llamarEnableBanking };
