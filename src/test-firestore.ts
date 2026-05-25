import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testWriteRead() {
  const testDocRef = doc(db, 'products', 'test-connection-id');
  try {
    console.log("Attempting to write test document to 'products' collection...");
    await setDoc(testDocRef, {
      name: 'Test Product',
      category: 'Test Category',
      price: 10,
      unit: 'pcs',
      createdAt: new Date().toISOString()
    });
    console.log("SUCCESS: Write to Firestore products collection succeeded!");

    console.log("Attempting to read test document...");
    const snap = await getDoc(testDocRef);
    if (snap.exists()) {
      console.log("SUCCESS: Read from Firestore succeeded! Data:", snap.data());
    } else {
      console.log("FAIL: Document does not exist after write.");
    }

    console.log("Attempting to delete test document...");
    await deleteDoc(testDocRef);
    console.log("SUCCESS: Delete from Firestore succeeded!");
  } catch (error) {
    console.error("ERROR: Firestore test failed:", error);
  }
}

testWriteRead();
