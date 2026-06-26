import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getMessaging, getToken, onMessage, isSupported, type Messaging } from 'firebase/messaging';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
// Use default Firestore database (no named database ID needed)
export const db = getFirestore(app);
export const auth = getAuth(app);

// Firebase Cloud Messaging — lazy init (only in supported browsers)
let messaging: Messaging | null = null;
export const getFirebaseMessaging = async (): Promise<Messaging | null> => {
  if (messaging) return messaging;
  const supported = await isSupported();
  if (supported) {
    messaging = getMessaging(app);
    return messaging;
  }
  console.warn('⚠️ Firebase Messaging is not supported in this browser');
  return null;
};

export { getToken, onMessage };

// Test connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'settings', 'global'));
    console.log("✅ Firebase connection successful - ggms-grocery project");
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("❌ Firebase: Client is offline. Check internet connection.");
    } else if (error instanceof Error && error.message.includes('NOT_FOUND')) {
      console.log("ℹ️ Firebase connected but settings doc not found yet (will be created on first use)");
    } else {
      console.error("❌ Firebase connection test failed:", error);
    }
  }
}

testConnection();
