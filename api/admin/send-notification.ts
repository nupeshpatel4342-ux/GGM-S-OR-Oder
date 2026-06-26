import { initializeApp as initAdminApp, cert, getApps } from "firebase-admin/app";
import { getMessaging as getAdminMessaging } from "firebase-admin/messaging";
import fs from "fs";
import path from "path";

// Initialize Firebase Admin SDK if not already done
let adminMessaging: any = null;
try {
  if (getApps().length === 0) {
    const saPath = path.resolve(process.cwd(), "service-account-key.json");
    if (fs.existsSync(saPath)) {
      initAdminApp({
        credential: cert(saPath),
        projectId: "ggms-grocery"
      });
      console.log("✅ Vercel Serverless: Admin SDK initialized via service-account-key.json");
    } else {
      console.warn("⚠️ Vercel Serverless: Service account key not found at", saPath);
    }
  }
  adminMessaging = getAdminMessaging();
} catch (err) {
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
    return res.status(500).json({ error: "Firebase Admin Messaging not initialized" });
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
