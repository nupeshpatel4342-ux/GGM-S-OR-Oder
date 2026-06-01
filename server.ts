import crypto from "crypto";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { initializeApp as initializeFirebaseApp } from "firebase/app";
import { getFirestore, doc, getDoc, getDocs, collection, setDoc } from "firebase/firestore";
import dotenv from "dotenv";

dotenv.config();

const firebaseConfig = {
  projectId: "ggms-grocery",
  appId: "1:791346737085:web:3d5100d4bb751389dcecd4",
  apiKey: "AIzaSyBPzlJ35Qa69Hdnr0fH-sHh5_Mw70Lm0kQ",
  authDomain: "ggms-grocery.firebaseapp.com",
  storageBucket: "ggms-grocery.firebasestorage.app",
  messagingSenderId: "791346737085",
  measurementId: "G-LT2YR4BK2Q"
};

const firebaseApp = initializeFirebaseApp(firebaseConfig);
const db = getFirestore(firebaseApp);

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
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  app.use(express.json());

  app.post("/api/auth/admin/login", (req, res) => {
    const { username, password } = req.body || {};
    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const token = crypto.randomUUID();
    sessions.set(token, { expiresAt: Date.now() + SESSION_TTL_MS });
    return res.json({ token, expiresInMs: SESSION_TTL_MS });
  });

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

  app.post("/api/ai/chat", async (req, res) => {
    const { message, history } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    try {
      const settingsRef = doc(db, "settings", "global");
      const settingsSnap = await getDoc(settingsRef);
      const settingsData = settingsSnap.exists() ? settingsSnap.data() : {};
      const shopSettings = settingsData.shopSettings || {};

      const aiEnabled = shopSettings.aiEnabled !== false;
      const aiModelName = shopSettings.aiModelName || "gemini-2.5-flash";
      const aiPromptTemplate = shopSettings.aiPromptTemplate || "";
      const aiApiKey = shopSettings.aiApiKey || process.env.GEMINI_API_KEY;

      if (!aiEnabled) {
        return res.json({
          message: "અત્યારે મારો AI આસિસ્ટન્ટ ઓફલાઇન છે. કૃપા કરીને થોડીવાર પછી પ્રયત્ન કરો.",
          products: []
        });
      }

      if (!aiApiKey) {
        return res.status(500).json({ error: "Gemini API key is not configured" });
      }

      const productsRef = collection(db, "products");
      const productsSnap = await getDocs(productsRef);
      const allProducts: any[] = [];
      productsSnap.forEach((doc) => {
        allProducts.push({ id: doc.id, ...doc.data() });
      });

      const inventoryList = allProducts.map((p) => ({
        id: p.id,
        name: p.name,
        gujaratiName: p.gujaratiName || "",
        price: p.price,
        mrp: p.mrp,
        category: p.category,
        unit: p.unit || "pcs",
        inStock: p.inStock !== false
      }));

      const ai = new GoogleGenAI({ apiKey: aiApiKey });

      const formattedContents: any[] = [];
      if (history && Array.isArray(history)) {
        history.forEach((h: any) => {
          formattedContents.push({
            role: h.role === "assistant" ? "model" : "user",
            parts: [{ text: h.text }]
          });
        });
      }
      formattedContents.push({
        role: "user",
        parts: [{ text: message }]
      });

      const defaultInstruction = `You are "AI Grocery Assistant", a friendly and helpful grocery shopping chatbot for our store.
Your goal is to help customers find products, suggest recipes, create shopping lists, and recommend related items.
Always respond in simple, polite, and conversational Gujarati. If the user asks in Hindi or English, respond in Gujarati but feel free to mix in common Hindi/English words.
Avoid very long paragraphs. Use list bullet points and appropriate emojis to make responses readable.

You MUST only recommend products that are available in our store inventory. Here is the list of products currently available in our store:
${JSON.stringify(inventoryList)}

You MUST respond strictly in JSON format using the following JSON schema:
{
  "message": "your conversational reply in Gujarati outlining suggestions, cooking steps, or general help",
  "recommendedProductIds": ["id1", "id2", ...]
}
Verify that the recommendedProductIds contains only valid IDs from the store inventory provided above. Do not invent products outside the list.`;

      const systemInstruction = aiPromptTemplate.trim() ? aiPromptTemplate : defaultInstruction;

      const response = await ai.models.generateContent({
        model: aiModelName,
        contents: formattedContents,
        config: {
          responseMimeType: "application/json",
          systemInstruction: systemInstruction,
          temperature: 0.7,
        }
      });

      const responseText = response.text || "{}";
      let result: { message?: string; recommendedProductIds?: string[] } = {};
      try {
        result = JSON.parse(responseText);
      } catch (err) {
        console.error("Failed to parse Gemini JSON response:", responseText, err);
        result = {
          message: responseText,
          recommendedProductIds: []
        };
      }

      const botMessage = result.message || "હું તમારી વિનંતી સમજી શક્યો નથી. કૃપા કરીને ફરી પૂછો.";
      const recIds = result.recommendedProductIds || [];
      const recommendedProducts = allProducts.filter((p) => recIds.includes(p.id));

      try {
        const logId = `ai-log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        await setDoc(doc(db, "aiChatAnalytics", logId), {
          id: logId,
          query: message,
          responseMessage: botMessage,
          recommendedProductIds: recIds,
          timestamp: new Date().toISOString(),
          status: recIds.length > 0 ? "success" : "failed"
        });
      } catch (logErr) {
        console.error("Failed to write to aiChatAnalytics:", logErr);
      }

      return res.json({
        message: botMessage,
        products: recommendedProducts
      });

    } catch (error) {
      console.error("AI Chatbot Server Error:", error);
      return res.status(500).json({ error: "અંતર્યામી સર્વર ભૂલ: " + (error instanceof Error ? error.message : String(error)) });
    }
  });

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
