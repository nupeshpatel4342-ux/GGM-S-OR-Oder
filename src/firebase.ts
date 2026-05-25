import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
// Use default Firestore database (no named database ID needed)
export const db = getFirestore(app);
export const auth = getAuth(app);

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
