import crypto from "crypto";

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function normalizarClavePrivada(valor: string): string {
  const conNewlinesReales = valor.replace(/\\n/g, "\n").trim();
  if (conNewlinesReales.includes("-----BEGIN")) {
    return conNewlinesReales;
  }
  // No parece PEM en claro: asumimos que está codificada en base64.
  return Buffer.from(valor.trim(), "base64").toString("utf-8");
}

export function generarClientAssertion(): string {
  const privateKey = process.env.REVOLUT_PRIVATE_KEY;
  const clientId = process.env.REVOLUT_CLIENT_ID;
  const redirectUri = process.env.REVOLUT_REDIRECT_URI || "https://boomerang-brown.vercel.app/api/revolut/callback";

  if (!privateKey || !clientId) {
    throw new Error("Faltan REVOLUT_PRIVATE_KEY o REVOLUT_CLIENT_ID en las variables de entorno");
  }

  const iss = new URL(redirectUri).host;

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss,
    sub: clientId,
    aud: "https://revolut.com",
    exp: Math.floor(Date.now() / 1000) + 300,
  };

  const headerEncoded = base64url(JSON.stringify(header));
  const payloadEncoded = base64url(JSON.stringify(payload));
  const unsigned = `${headerEncoded}.${payloadEncoded}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(normalizarClavePrivada(privateKey));

  return `${unsigned}.${base64url(signature)}`;
}
