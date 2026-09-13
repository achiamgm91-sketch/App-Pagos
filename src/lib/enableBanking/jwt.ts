import crypto from "crypto";

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generarJwtEnableBanking(): string {
  const applicationId = process.env.ENABLE_BANKING_APPLICATION_ID;
  const privateKey = process.env.ENABLE_BANKING_PRIVATE_KEY;

  if (!applicationId || !privateKey) {
    throw new Error("Faltan ENABLE_BANKING_APPLICATION_ID o ENABLE_BANKING_PRIVATE_KEY en las variables de entorno");
  }

  const header = { typ: "JWT", alg: "RS256", kid: applicationId };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + 3600 };

  const headerEncoded = base64url(JSON.stringify(header));
  const payloadEncoded = base64url(JSON.stringify(payload));
  const unsigned = `${headerEncoded}.${payloadEncoded}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey.replace(/\\n/g, "\n"));

  return `${unsigned}.${base64url(signature)}`;
}
