import { initializeApp as initAdminApp, cert, getApps } from "firebase-admin/app";
import { getMessaging as getAdminMessaging } from "firebase-admin/messaging";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";

// Embed the service account key directly to ensure 100% compatibility in Vercel Serverless environment
const serviceAccount = {
  type: "service_account",
  project_id: "ggms-grocery",
  private_key_id: "87e763c01232b9b2d3b9693867147a5a13b972b5",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDfyz+C6VutGUEA\nprkcFwIrlkFP6TajpBBg/AAFH6yarXWWT+5bpMjI0pLRUXrmZ+BC1P97ZTZQueL/\nXDkhcka55IODZSELGz69opp0YGte3EEvh4prXQhoQhTQZeTeU0NrI0nkS5+XR62j\nMtGFmDZsAxwUNCQu988pCK6BSnTsHOesoRcVOnRDwxs4PhNc5rv6oAiOdDtbyN+x\nLomZgpbizChMEo66uKmx5ahrVDF9ZmDLtfMlROtLsSDwe0XupNpnOdqcMz89r0bj\n7SCtg7O2vrMiVbVPpxEVvImRItBxDRm1Fz5KCU7Ok+bNUFlg0EqSg792l4gk6Zqm\nFeBGo8GLAgMBAAECggEAJ2EQT+zYIOFsurybngG+dAUAgRs8bhcUerxdFIm6SY10\nP3rZKm8YlZ3YD9USlzB4Gcp5GjF5GUNcWirUMrp1D4jSS3CkG9wzchMGsqu0uQBw\nx/hFtxarwAzAtNr5JtXn6xZOjklwT6JhP3JVw/hAu0jgy/1Q0KLyZPoOGtoLMPCg\n4A/xFzbz7Zpkqxun3bNJtv5mbRVi99GBYKSrkzGcDmsM9duDRZbCHNOV5ZqLHp4j\nEt/z7wVcVAEq9vQ3Won5QfIc22iQ8jQOpjXWwFi0wzl7hZGKC9KqE4DnuDa396+F\nuwwxXLqiQEbT9y5hH81NKn20v24CMOQe5jVkgUS5gQKBgQD1jVU7rrBAwsNju2xA\nV08ZgkKUb1IsL/pxcyA5Xr7yBUhFC7n8uatTc2z8jYCR8i1lSRWPs81vHYonTVBr\nXYzZKfE7PIbWscHIHIxzSn22r8wJJwwMB6f6RoJIPgDlJL8CMr6FoCGfDykVhiPn\nWKp9kgrPsPMTuaEtRyPejs2+GwKBgQDpUOpVP3ftm9pIdXE8khZFcx+eqqLm1K/E\n8uOCOZVl0bmfkX7RBmxxx7aAgemg8FVy1IS13nrfsNPLuhhVOOO1Ufy6bEA/GyJP\nZmaxsHdEmTwJoulqHeQkQicXp4YT0xv6rpz/JcatSR3TXVIWnKZx/Xp2ii0qTGtU\nMJZPAC2BUQKBgQDPl/MNB/y+Y2oosNUt+CJJYJTFRO/lp5JFw5zko7MujUSyCt3s\nSVQMszLauQ6PVH0IeiceXFY7sG+SFoz8mBRxrEHjYKJmc9VuRqR+++UYQ7ttqXNH\n4Fkk/+M5DCJZlx1c0GW+Nsj13i1Pox5LgexxSLyXJfP7Ix6eVtx+VaCfLQKBgCTU\nMfk86IhoRp+Tckl2Ye+aiY45LzeysQAsuv7uagfFgECQ7ey+z9VyCfvlBeTyqvpS\nU5SFxu2ScwxAluC09zTC+VrQBaAwf0z7RBCeY2U/rvtybNfkWgPjMVqJhh+Q/mSm\ntX+NDfyCgyO/IlsRZTCvK2qUyyZXI8YJWWClDYnRAoGAXVa2uyfI1ezQ4RUvmZtr\nCTpK32g9ucvUb181UnjdR0C4XlNIZgR6aeKZk6vCGu+0Ws6v7mt8bDorr3b1cAeg\ncSvHeLmK4t5Vokdf9B5URJiOXdmUHVbjOAR8zyc19ygQHdOywGFy8gvzrPqK/w+h\n8i+bkY+PhNHu/b2RVdp60zg=\n-----END PRIVATE KEY-----\n",
  client_email: "firebase-adminsdk-fbsvc@ggms-grocery.iam.gserviceaccount.com",
  client_id: "106504131814843024715",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40ggms-grocery.iam.gserviceaccount.com",
  universe_domain: "googleapis.com"
};

let adminMessaging: any = null;
let adminDb: any = null;
let adminInitError: string = "";
try {
  let appInstance;
  // Use a named app to avoid conflicts with default-initialized apps in serverless environments
  const existingApp = getApps().find(app => app.name === 'admin-messaging-app');
  if (!existingApp) {
    appInstance = initAdminApp({
      credential: cert(serviceAccount as any),
      projectId: "ggms-grocery"
    }, 'admin-messaging-app');
    console.log("✅ Vercel Serverless: Named Admin SDK initialized via embedded key constant");
  } else {
    appInstance = existingApp;
  }
  adminMessaging = getAdminMessaging(appInstance);
  adminDb = getAdminFirestore(appInstance);
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

  if (!adminMessaging || !adminDb) {
    return res.status(500).json({ error: "Firebase Admin SDK not initialized. Init Error: " + adminInitError });
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
    let targetTokens: { token: string; customerId: string }[] = [];
    let targetValueDescription = "";

    if (target_type === "all") {
      targetValueDescription = "All Customers";
      const customersSnap = await adminDb.collection("customers").get();
      customersSnap.forEach((doc: any) => {
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
        const docSnap = await adminDb.collection("customers").doc(customerId).get();
        if (docSnap.exists) {
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

      const customersSnap = await adminDb.collection("customers").get();
      const ordersSnap = await adminDb.collection("orders").get();
      
      const allCustomers: any[] = [];
      customersSnap.forEach((doc: any) => {
        allCustomers.push({ id: doc.id, ...doc.data() });
      });

      const allOrders: any[] = [];
      ordersSnap.forEach((doc: any) => {
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
          response.responses.forEach((resp: any, idx: number) => {
            if (!resp.success) {
              console.warn(`⚠️ Vercel Bulk send failure for token ${chunk[idx].token}:`, resp.error?.message);
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

    await adminDb.collection("notifications").doc(notificationId).set(newNotification);

    return res.status(200).json({ 
      success: true, 
      notification: newNotification,
      stats: {
        totalAttempted: uniqueTokens.length,
        succeeded: succeededCount,
        failed: failedCount
      }
    });

  } catch (error: any) {
    console.error("❌ Vercel Send bulk notifications failed:", error);
    return res.status(500).json({ error: "Failed to send bulk notifications: " + (error?.message || String(error)) });
  }
}
