import { initializeApp as initAdminApp, cert, getApps } from "firebase-admin/app";
import { getMessaging as getAdminMessaging } from "firebase-admin/messaging";
import fs from "fs";
import path from "path";

let adminMessaging: any = null;
let adminInitError: string = "";
try {
  let appInstance;
  // Use a named app to avoid conflicts with default-initialized apps in serverless environments
  const existingApp = getApps().find(app => app.name === 'admin-messaging-app');
  if (!existingApp) {
    const saPath = path.join(process.cwd(), "service-account-key.json");
    if (!fs.existsSync(saPath)) {
      throw new Error(`Service account key not found at ${saPath}. Directory contents of process.cwd(): ${fs.readdirSync(process.cwd()).join(', ')}`);
    }
    const serviceAccount = JSON.parse(fs.readFileSync(saPath, "utf8"));
    appInstance = initAdminApp({
      credential: cert(serviceAccount),
      projectId: "ggms-grocery"
    }, 'admin-messaging-app');
    console.log("✅ Vercel Serverless: Named Admin SDK initialized via read file");
  } else {
    appInstance = existingApp;
  }
  adminMessaging = getAdminMessaging(appInstance);
} catch (err: any) {
  adminInitError = err?.message || String(err);
  console.error("❌ Vercel Serverless: Admin SDK init failed:", err);
}

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth check: Allow any session token starting with Bearer (local-session or express session) for Vercel/client compatibility
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing auth token" });
  }

  if (!adminMessaging) {
    return res.status(500).json({ error: "Firebase Admin Messaging not initialized. Init Error: " + adminInitError });
  }

  const { fcmToken, title, body, data } = req.body || {};
  if (!fcmToken || !title || !body) {
    return res.status(400).json({ error: "fcmToken, title, and body are required" });
  }

  try {
    const messagePayload = {
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
    return res.status(200).json({ success: true, messageId: result });
  } catch (error: any) {
    console.error("❌ Vercel Push failed:", error);
    if (error?.code === "messaging/registration-token-not-registered" ||
        error?.code === "messaging/invalid-registration-token") {
      return res.status(410).json({ error: "Token expired or invalid", code: error.code });
    }
    return res.status(500).json({ error: "Failed to send notification: " + (error?.message || String(error)) });
  }
}
