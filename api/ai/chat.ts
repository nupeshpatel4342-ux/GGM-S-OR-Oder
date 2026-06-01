import { GoogleGenAI } from "@google/genai";
import { initializeApp as initializeFirebaseApp } from "firebase/app";
import { getFirestore, doc, getDoc, getDocs, collection, setDoc } from "firebase/firestore";
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

export default async function handler(req: any, res: any) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed" });
  }

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
}
