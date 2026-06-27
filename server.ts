import crypto from "crypto";
import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { initializeApp as initializeFirebaseApp } from "firebase/app";
import { getFirestore, doc, getDoc, getDocs, collection, setDoc, deleteDoc } from "firebase/firestore";
import { initializeApp as initAdminApp, cert } from "firebase-admin/app";
import { getAuth as getAdminAuth, type Auth as AdminAuth } from "firebase-admin/auth";
import { getMessaging as getAdminMessaging } from "firebase-admin/messaging";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import dotenv from "dotenv";

dotenv.config();

// ─── Firebase Admin SDK Initialization ────────────────────────────────
// Password reset mate Firebase Admin SDK jaruri chhe.
// Service account JSON file nu path GOOGLE_APPLICATION_CREDENTIALS env var ma set karo
// ATHVA service-account-key.json file project root ma muko.
let adminAuth: AdminAuth | null = null;
let adminMessaging: ReturnType<typeof getAdminMessaging> | null = null;
let adminDb: ReturnType<typeof getAdminFirestore> | null = null;
try {
  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./service-account-key.json";
  if (fs.existsSync(saPath)) {
    initAdminApp({
      credential: cert(saPath),
      projectId: "ggms-grocery"
    });
    adminAuth = getAdminAuth();
    adminMessaging = getAdminMessaging();
    adminDb = getAdminFirestore();
    console.log("✅ Firebase Admin SDK initialized — push notifications & password reset enabled.");
  } else {
    console.warn("⚠️  Service account key not found at:", saPath);
    console.warn("   Password reset & push notifications will NOT work.");
  }
} catch (err) {
  console.warn("⚠️  Firebase Admin SDK init failed:", err);
  console.warn("   Password reset & push notifications will NOT work.");
}

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

// Helper functions that automatically use adminDb if available to bypass security rules
async function dbGetDocs(collectionName: string) {
  if (adminDb) {
    const snap = await adminDb.collection(collectionName).get();
    const docsList: any[] = [];
    snap.forEach((d) => {
      docsList.push({
        id: d.id,
        data: () => d.data()
      });
    });
    return {
      forEach: (callback: (doc: any) => void) => docsList.forEach(callback),
      size: snap.size
    };
  } else {
    return await getDocs(collection(db, collectionName));
  }
}

async function dbGetDoc(collectionName: string, docId: string) {
  if (adminDb) {
    const d = await adminDb.collection(collectionName).doc(docId).get();
    return {
      exists: () => d.exists,
      data: () => d.data()
    };
  } else {
    return await getDoc(doc(db, collectionName, docId));
  }
}

async function dbSetDoc(collectionName: string, docId: string, data: any) {
  if (adminDb) {
    await adminDb.collection(collectionName).doc(docId).set(data, { merge: true });
  } else {
    await setDoc(doc(db, collectionName, docId), data, { merge: true });
  }
}

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

  // ─── New Order Notification Endpoint (Public/Customer Triggered) ──────
  app.post("/api/admin/notify-new-order", async (req, res) => {
    if (!adminMessaging) {
      return res.status(500).json({ error: "Firebase Admin Messaging not initialized" });
    }

    const { orderId, customerName, amount } = req.body || {};
    if (!orderId || !customerName || !amount) {
      return res.status(400).json({ error: "orderId, customerName, and amount are required" });
    }

    try {
      // Fetch store settings from Firestore
      const settingsSnap = await dbGetDoc("settings", "global");
      const settingsData = settingsSnap.exists() ? settingsSnap.data() : {};
      const shopSettings = (settingsData as any)?.shopSettings || {};
      const configuredWhatsapp = shopSettings.whatsapp ? String(shopSettings.whatsapp).replace(/\D/g, '') : "";

      const customersSnap = await dbGetDocs("customers");
      const adminTokens: string[] = [];
      customersSnap.forEach((doc) => {
        const data = doc.data();
        if (data && data.fcmToken) {
          const cleanPhone = data.phone ? String(data.phone).replace(/\D/g, '') : "";
          
          // Match the configured store WhatsApp number (last 10 digits for reliability)
          const isConfiguredAdmin = configuredWhatsapp && cleanPhone && 
            (cleanPhone === configuredWhatsapp || 
             (cleanPhone.length >= 10 && configuredWhatsapp.length >= 10 && 
              cleanPhone.endsWith(configuredWhatsapp.slice(-10))));
              
          // Keep hardcoded fallback admins for safety in case settings match fails
          const isFallbackAdmin = cleanPhone === "919724557728" || 
                                  cleanPhone === "hpatel4342" || 
                                  data.name?.toLowerCase().includes("admin") || 
                                  data.name?.toLowerCase().includes("nupesh");

          if (isConfiguredAdmin || isFallbackAdmin) {
            adminTokens.push(data.fcmToken);
          }
        }
      });

      if (adminTokens.length === 0) {
        console.warn("⚠️ No admin FCM tokens found to notify.");
        return res.json({ success: true, message: "No admins registered for push alerts." });
      }

      const title = "New Order - GGMS Grocery";
      const body = `${customerName} નો ₹${amount} નો ઓર્ડર મળ્યો છે (ID: #${orderId.substring(0, 8)})`;

      const messages = adminTokens.map((token) => ({
        token,
        notification: { title, body },
        webpush: {
          notification: {
            title,
            body,
            icon: "/icon-192.png",
            badge: "/icon-192.png",
            vibrate: [200, 100, 200, 100, 200],
            sound: "/sounds/ggms_attention_order_gu.mp3"
          },
          fcmOptions: {
            link: "/admin"
          }
        },
        data: {
          url: "/admin",
          sound: "ggms_attention_order_gu"
        }
      }));

      const response = await adminMessaging.sendEach(messages);
      console.log(`✅ New order notifications sent to ${response.successCount} admin devices.`);

      return res.json({ success: true, sentCount: response.successCount });
    } catch (error: any) {
      console.error("❌ Send new order notification failed:", error);
      return res.status(500).json({ error: "Failed to send new order notification: " + (error?.message || String(error)) });
    }
  });

  // ─── Push Notification Endpoint ──────────────────────────────────────
  app.post("/api/admin/send-notification", requireAdminAuth, async (req, res) => {
    if (!adminMessaging) {
      return res.status(500).json({ error: "Firebase Admin Messaging not initialized" });
    }

    const { fcmToken, title, body, data } = req.body || {};
    if (!fcmToken || !title || !body) {
      return res.status(400).json({ error: "fcmToken, title, and body are required" });
    }

    try {
      const messagePayload: any = {
        token: fcmToken,
        notification: { title, body },
        webpush: {
          notification: {
            title,
            body,
            icon: "/icon-192.png",
            badge: "/icon-192.png",
            vibrate: [100, 50, 100],
          },
          fcmOptions: {
            link: data?.url || "/"
          }
        },
        data: data || {}
      };

      const result = await adminMessaging.send(messagePayload);
      console.log("✅ Push notification sent:", result);
      return res.json({ success: true, messageId: result });
    } catch (error: any) {
      console.error("❌ Push notification failed:", error?.message || error);
      // Token is invalid/expired — return specific error so client can clean up
      if (error?.code === "messaging/registration-token-not-registered" ||
          error?.code === "messaging/invalid-registration-token") {
        return res.status(410).json({ error: "Token expired or invalid", code: error.code });
      }
      return res.status(500).json({ error: "Failed to send notification: " + (error?.message || String(error)) });
    }
  });

  // ─── Bulk Push Notification Endpoint ──────────────────────────────────────
  app.post("/api/admin/send-notification-bulk", requireAdminAuth, async (req, res) => {
    if (!adminMessaging) {
      return res.status(500).json({ error: "Firebase Admin Messaging not initialized" });
    }

    const { 
      type, 
      title, 
      message, 
      image, 
      buttonText, 
      buttonLink, 
      target_type, 
      selected_customer_ids,
      segment_type 
    } = req.body || {};

    if (!type || !title || !message || !target_type) {
      return res.status(400).json({ error: "type, title, message, and target_type are required" });
    }

    try {
      let targetTokens = [];
      let targetValueDescription = "";

      if (target_type === "all") {
        targetValueDescription = "All Customers";
        const customersSnap = await dbGetDocs("customers");
        customersSnap.forEach((doc) => {
          const data = doc.data();
          if (data && data.fcmToken) {
            targetTokens.push({ token: data.fcmToken, customerId: doc.id });
          }
        });
      } else if (target_type === "selected") {
        if (!Array.isArray(selected_customer_ids) || selected_customer_ids.length === 0) {
          return res.status(400).json({ error: "selected_customer_ids must be a non-empty array for target_type 'selected'" });
        }
        targetValueDescription = `${selected_customer_ids.length} Selected Customer(s)`;
        
        for (const customerId of selected_customer_ids) {
          const docSnap = await dbGetDoc("customers", customerId);
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data && data.fcmToken) {
              targetTokens.push({ token: data.fcmToken, customerId });
            }
          }
        }
      } else if (target_type === "segment") {
        if (!segment_type) {
          return res.status(400).json({ error: "segment_type is required for target_type 'segment'" });
        }

        const customersSnap = await dbGetDocs("customers");
        const ordersSnap = await dbGetDocs("orders");
        
        const allCustomers = [];
        customersSnap.forEach((doc) => {
          allCustomers.push({ id: doc.id, ...doc.data() });
        });

        const allOrders = [];
        ordersSnap.forEach((doc) => {
          allOrders.push({ id: doc.id, ...doc.data() });
        });

        let filteredCustomers = [];
        const now = Date.now();

        if (segment_type === "new") {
          targetValueDescription = "New Customers (Registered <= 7 days)";
          filteredCustomers = allCustomers.filter((c) => {
            if (!c.createdAt) return false;
            const diffDays = (now - new Date(c.createdAt).getTime()) / (1000 * 60 * 60 * 24);
            return diffDays <= 7;
          });
        } else if (segment_type === "regular") {
          targetValueDescription = "Regular Customers (> 3 orders)";
          filteredCustomers = allCustomers.filter((c) => {
            const count = allOrders.filter((o) => o.customerId === c.id).length;
            return count > 3;
          });
        } else if (segment_type === "inactive") {
          targetValueDescription = "Inactive Customers (No order or > 15 days ago)";
          filteredCustomers = allCustomers.filter((c) => {
            const userOrders = allOrders.filter((o) => o.customerId === c.id);
            if (userOrders.length === 0) {
              if (!c.createdAt) return true;
              const diffDays = (now - new Date(c.createdAt).getTime()) / (1000 * 60 * 60 * 24);
              return diffDays > 15;
            }
            userOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            const latestOrder = userOrders[0];
            const diffDays = (now - new Date(latestOrder.createdAt).getTime()) / (1000 * 60 * 60 * 24);
            return diffDays > 15;
          });
        } else if (segment_type === "high_value") {
          targetValueDescription = "High Value Customers (Spent > ₹1500)";
          filteredCustomers = allCustomers.filter((c) => {
            const totalSpent = allOrders
              .filter((o) => o.customerId === c.id)
              .reduce((sum, o) => sum + (Number(o.total) || 0), 0);
            return totalSpent > 1500;
          });
        } else {
          return res.status(400).json({ error: `Unknown segment_type: ${segment_type}` });
        }

        filteredCustomers.forEach((c) => {
          if (c.fcmToken) {
            targetTokens.push({ token: c.fcmToken, customerId: c.id });
          }
        });
      } else {
        return res.status(400).json({ error: `Unknown target_type: ${target_type}` });
      }

      const uniqueTokens = Array.from(new Set(targetTokens.map(t => t.token)));
      let succeededCount = 0;
      let failedCount = 0;

      if (uniqueTokens.length > 0) {
        const messages = uniqueTokens.map((token) => {
          const payload: any = {
            token,
            notification: { 
              title, 
              body: message 
            },
            webpush: {
              notification: {
                title,
                body: message,
                icon: "/icon-192.png",
                badge: "/icon-192.png",
                vibrate: [100, 50, 100],
              },
              fcmOptions: {
                link: buttonLink || "/"
              }
            },
            data: {
              url: buttonLink || "/"
            }
          };

          if (image) {
            payload.notification.imageUrl = image;
            payload.webpush.notification.image = image;
            payload.data.image = image;
          }
          if (buttonText && buttonLink) {
            payload.data.buttonText = buttonText;
            payload.data.buttonLink = buttonLink;
          }

          return payload;
        });

        const chunkSize = 500;
        for (let i = 0; i < messages.length; i += chunkSize) {
          const chunk = messages.slice(i, i + chunkSize);
          const response = await adminMessaging.sendEach(chunk);
          succeededCount += response.successCount;
          failedCount += response.failureCount;
          
          if (response.failureCount > 0) {
            response.responses.forEach((resp, idx) => {
              if (!resp.success) {
                console.warn(`⚠️ Bulk send failure for token ${chunk[idx].token}:`, resp.error?.message);
              }
            });
          }
        }
      }

      const notificationId = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newNotification = {
        id: notificationId,
        type,
        title,
        message,
        image: image || "",
        target_type,
        target_value: targetValueDescription,
        selected_customer_ids: selected_customer_ids || [],
        sent_count: succeededCount,
        created_at: new Date().toISOString(),
        buttonText: buttonText || "",
        buttonLink: buttonLink || "",
        status: "sent"
      };

      await dbSetDoc("notifications", notificationId, newNotification);

      return res.json({ 
        success: true, 
        notification: newNotification,
        stats: {
          totalAttempted: uniqueTokens.length,
          succeeded: succeededCount,
          failed: failedCount
        }
      });

    } catch (error) {
      console.error("❌ Send bulk notifications failed:", error);
      return res.status(500).json({ error: "Failed to send bulk notifications: " + (error?.message || String(error)) });
    }
  });


  app.post("/api/ai/chat", async (req, res) => {
    const { message, history } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    try {
      const settingsSnap = await dbGetDoc("settings", "global");
      const settingsData = settingsSnap.exists() ? settingsSnap.data() : {};
      const shopSettings = (settingsData as any).shopSettings || {};

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

      const productsSnap = await dbGetDocs("products");
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
        await dbSetDoc("aiChatAnalytics", logId, {
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
