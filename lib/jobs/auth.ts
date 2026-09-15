import { unauthorized } from "../http-errors";

// §12: "Exposed as POST /api/jobs/{name}, authenticated by a Key
// Vault-stored shared secret in an X-Job-Key header ... A missing or
// invalid key returns 401." JOB_API_KEY is that secret's local-dev
// stand-in (a real deployment reads it from Key Vault via managed
// identity, not an App Service setting -- §0.1.8).
export function checkJobKey(request: Request): Response | null {
  const expected = process.env.JOB_API_KEY;
  const provided = request.headers.get("x-job-key");
  if (!expected || !provided || provided !== expected) {
    return unauthorized("Missing or invalid X-Job-Key");
  }
  return null;
}
