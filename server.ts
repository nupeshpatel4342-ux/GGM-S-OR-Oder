import crypto from "crypto";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@123456";
const ADMIN_TOTP_SECRET = (process.env.ADMIN_TOTP_SECRET || "JBSWY3DPEHPK3PXP").replace(/\s+/g, "").toUpperCase();
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;

const sessions = new Map<string, { expiresAt: number }>();
const pendingChallenges = new Map<string, { expiresAt: number }>();

function isStrongPassword(password: string): boolean {
  return password.length >= 12 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

function decodeBase32(base32: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of base32) {
    const val = alphabet.indexOf(ch);
    if (val < 0) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTotp(secret: string, offsetSteps = 0): string {
  const step = 30;
  const counter = Math.floor(Date.now() / 1000 / step) + offsetSteps;
  const key = decodeBase32(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[off] & 0x7f) << 24) | ((hmac[off + 1] & 0xff) << 16) | ((hmac[off + 2] & 0xff) << 8) | (hmac[off + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

function verifyTotp(input: string): boolean {
  const code = input.replace(/\s+/g, "");
  return [-1, 0, 1].some((offset) => generateTotp(ADMIN_TOTP_SECRET, offset) === code);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.post("/api/auth/admin/password", (req, res) => {
    const { username, password } = req.body || {};
    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    if (!isStrongPassword(password)) {
      return res.status(403).json({ message: "Configured admin password does not meet strong password policy" });
    }
    const challengeId = crypto.randomUUID();
    pendingChallenges.set(challengeId, { expiresAt: Date.now() + 5 * 60 * 1000 });
    return res.json({ challengeId, requires2FA: true });
  });

  app.post("/api/auth/admin/otp", (req, res) => {
    const { challengeId, otp } = req.body || {};
    const challenge = pendingChallenges.get(challengeId);
    if (!challenge || challenge.expiresAt < Date.now()) {
      return res.status(401).json({ message: "Challenge expired" });
    }
    if (!verifyTotp(String(otp || ""))) {
      return res.status(401).json({ message: "Invalid OTP" });
    }
    pendingChallenges.delete(challengeId);
    const token = crypto.randomUUID();
    sessions.set(token, { expiresAt: Date.now() + SESSION_TTL_MS });
    return res.json({ token, expiresInMs: SESSION_TTL_MS });
  });

  const requireAdminAuth: express.RequestHandler = (req, res, next) => {
    const token = String(req.headers.authorization || "").replace("Bearer ", "");
    const session = sessions.get(token);
    if (!session || session.expiresAt < Date.now()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  };

  app.get("/api/admin/products", requireAdminAuth, (_req, res) => res.json({ ok: true }));
  app.get("/api/admin/orders", requireAdminAuth, (_req, res) => res.json({ ok: true }));
  app.get("/api/admin/settings", requireAdminAuth, (_req, res) => res.json({ ok: true }));
  app.get("/api/admin/reports", requireAdminAuth, (_req, res) => res.json({ ok: true }));

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on http://localhost:${PORT}`));
}

startServer();
