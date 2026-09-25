/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * A stand-in for GoTrue in the end-to-end stack (scripts/lib/e2e-backend.sh): the four
 * endpoints the client uses, signing HS256 tokens with the stack's throwaway secret.
 *   GET  /user                          the verified token's subject, or 401
 *   POST /token?grant_type=password     E2E_ACCOUNTS email → auth id, password E2E_PASSWORD
 *   POST /token?grant_type=refresh_token  always refused (400), as an expired refresh token
 *   POST /logout                        204
 * Test tooling only; never part of a deployment.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const secret = process.env.JWT_SECRET ?? "";
const accounts = JSON.parse(process.env.E2E_ACCOUNTS ?? "{}");
const password = process.env.E2E_PASSWORD ?? "";
const port = Number(process.env.FAKE_GOTRUE_PORT ?? 9998);
if (!secret || !password) throw new Error("fake-gotrue: JWT_SECRET and E2E_PASSWORD are required");

const b64 = (v) => Buffer.from(v).toString("base64url");
const sign = (sub, email) => {
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify({ sub, email, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 }));
  return `${head}.${body}.${createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url")}`;
};
const verify = (tok) => {
  const [head, body, sig] = String(tok).split(".");
  if (!head || !body || !sig) return null;
  const want = Buffer.from(createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url"));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  return claims.exp > Date.now() / 1000 ? claims : null;
};
const send = (res, status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(body === undefined ? "" : JSON.stringify(body)); };

createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    if (req.method === "GET" && url.pathname === "/user") {
      const claims = verify((req.headers.authorization ?? "").replace(/^Bearer /, ""));
      return claims ? send(res, 200, { id: claims.sub, email: claims.email ?? null, aud: "authenticated" }) : send(res, 401, { msg: "invalid JWT" });
    }
    if (req.method === "POST" && url.pathname === "/token") {
      const body = raw ? JSON.parse(raw) : {};
      if (url.searchParams.get("grant_type") === "password") {
        const id = accounts[String(body.email ?? "").toLowerCase()];
        if (!id || body.password !== password) return send(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials" });
        return send(res, 200, { access_token: sign(id, body.email), token_type: "bearer", expires_in: 3600, refresh_token: "e2e-refresh", user: { id, email: body.email } });
      }
      return send(res, 400, { error: "invalid_grant", error_description: "Refresh Token Not Found" });
    }
    if (req.method === "POST" && url.pathname === "/logout") return send(res, 204);
    return send(res, 404, { msg: "not found" });
  });
}).listen(port, "127.0.0.1");
