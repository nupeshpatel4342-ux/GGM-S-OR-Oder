/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, ChangeEvent, FormEvent, useCallback, useRef } from 'react';
import { Agentation } from 'agentation';
// Flag to prevent multiple tabs/devices from re-seeding Firestore
let hasSeededProducts = false;
let hasSeededCategories = false;
let hasSeededBanners = false;
let hasSeededSettings = false;
import { 
  ShoppingCart, Search, Package, Smartphone, Plus, Trash2, ChevronLeft, 
  ChevronRight, MapPin, Phone, User, Send, LayoutDashboard, Camera, X, 
  Image as ImageIcon, LogOut, ArrowLeft, 
  CheckCircle, Settings, ClipboardList, 
  TrendingUp, IndianRupee, AlertCircle, Edit, Store,
  Download, Upload, Database, GripVertical, Truck, Home,
  Heart, Eye, EyeOff, Lock, UserPlus, Clock, Bookmark, RotateCcw, Tag,
  Gift, Percent, Sun, Moon, Monitor, ShoppingBag, Mic, Sparkles, Bot, MessageSquare,
  Bell, WifiOff, Award
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { Routes, Route, useNavigate, useLocation, useParams } from 'react-router-dom';
import { CategoryItem, Product, CartItem, CustomerDetails, Order, OrderStatus, Banner, CustomerProfile, SavedAddress, ToastMessage, Coupon, CouponUsage, ProductVariant, VoiceSearchRecord } from './types.ts';
import { collection, doc, onSnapshot, setDoc, deleteDoc, getDoc, query, where } from 'firebase/firestore';
import { db, auth } from './firebase.ts';
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, type User as FirebaseAuthUser } from 'firebase/auth';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleLocalDataError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  };
  console.error('Local Data Error: ', JSON.stringify(errInfo));
}

const compressImage = (
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality: number,
  callback: (base64: string) => void
) => {
  const reader = new FileReader();
  reader.onloadend = () => {
    const img = new Image();
    img.src = reader.result as string;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        callback(canvas.toDataURL('image/jpeg', quality));
      } else {
        callback(reader.result as string);
      }
    };
  };
  reader.readAsDataURL(file);
};

interface VoiceIntent {
  product: string;
  quantity?: number;
  unit?: string;
}

const parseTextNumber = (text: string): number => {
  if (!isNaN(Number(text))) return Number(text);
  switch (text.toLowerCase()) {
    case 'one': return 1;
    case 'two': return 2;
    case 'three': return 3;
    case 'four': return 4;
    case 'five': return 5;
    case 'ten': return 10;
    case 'half':
    case 'અડધો':
    case 'આધા':
      return 0.5;
    default: return 1;
  }
};

const parseVoiceIntent = (text: string): VoiceIntent => {
  const normalizedText = text
    .toLowerCase()
    .trim()
    .replace(/[૧]/g, '1')
    .replace(/[૨]/g, '2')
    .replace(/[૩]/g, '3')
    .replace(/[૪]/g, '4')
    .replace(/[૫]/g, '5')
    .replace(/[૬]/g, '6')
    .replace(/[૭]/g, '7')
    .replace(/[૮]/g, '8')
    .replace(/[૯]/g, '9')
    .replace(/[૦]/g, '0');

  const numRegex = /(?:\d+(?:\.\d+)?|one|two|three|four|five|ten|half|અડધો|આધા)/;
  const unitRegex = /(?:kilo|kilos|kg|grams|gram|gm|g|litres|litre|liter|ltr|ltrs|l|ml|packet|packets|pack|packs|box|boxes|bottle|bottles|dozen|pcs|pc|piece|pieces|કિલો|કીલો|ગ્રામ|લિટર|લીટર|પેકેટ|નંગ|બોટલ|ડબ્બો|ડબ્બા|किलो|ग्राम|लीटर|पैकेट|नंग|बोतल|डिब्बा)/;

  const qtyUnitPattern = new RegExp(`(${numRegex.source})\\s*(${unitRegex.source})`, 'i');
  const justQtyPattern = new RegExp(`\\b(${numRegex.source})\\b`, 'i');

  let quantity: number | undefined;
  let unit: string | undefined;
  let product = normalizedText;

  const match = normalizedText.match(qtyUnitPattern);
  if (match) {
    const rawNum = match[1];
    const rawUnit = match[2];
    
    quantity = parseTextNumber(rawNum);
    unit = rawUnit;

    product = normalizedText.replace(match[0], '').replace(/\s+/g, ' ').trim();
  } else {
    const numMatch = normalizedText.match(justQtyPattern);
    if (numMatch) {
      const rawNum = numMatch[1];
      quantity = parseTextNumber(rawNum);
      product = normalizedText.replace(numMatch[0], '').replace(/\s+/g, ' ').trim();
    }
  }

  product = product
    .replace(/^\s*(of|with|for|અને|और|&)\s+/i, '')
    .replace(/\s+(of|with|for|અને|और|&)\s*$/i, '')
    .trim();

  return { product, quantity, unit };
};

const SUGGESTIONS_MAP: Record<string, string[]> = {
  'tea': ['Tea Powder', 'Sugar', 'Biscuit'],
  'coffee': ['Milk', 'Sugar', 'Cookies'],
  'milk': ['Bread', 'Butter', 'Eggs'],
  'sugar': ['Tea Powder', 'Coffee Powder', 'Milk'],
  'bread': ['Butter', 'Jam', 'Cheese'],
  'doodh': ['Bread', 'Butter', 'Amul Butter'],
  'દૂધ': ['બ્રેડ', 'માખણ', 'ચા'],
  'oil': ['Masala', 'Salt', 'Spices'],
  'rice': ['Pulses', 'Salt', 'Ghee']
};

const getSmartSuggestions = (query: string): string[] => {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  for (const [key, suggestions] of Object.entries(SUGGESTIONS_MAP)) {
    if (q.includes(key) || key.includes(q)) {
      return suggestions;
    }
  }
  return [];
};

const DEFAULT_CATEGORIES = [
  { name: 'KARIYANU', gujaratiName: 'કરિયાણું', image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=60&w=400' },
  { name: 'SARBAT & ICE CREAM POWDER', gujaratiName: 'સરબત અને આઈસ્ક્રીમ પાવડર', image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&q=60&w=400' },
  { name: 'SOAP', gujaratiName: 'સાબુ', image: 'https://images.unsplash.com/photo-1600857062241-98e5dba7f214?auto=format&fit=crop&q=60&w=400' },
  { name: 'TALCUM POWDER', gujaratiName: 'ટેલ્કમ પાવડર', image: 'https://images.unsplash.com/photo-1590439471364-192aa70c0c53?auto=format&fit=crop&q=60&w=400' },
  { name: 'SHAMPOO & CONDITIONER', gujaratiName: 'શેમ્પૂ અને કંડિશનર', image: 'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?auto=format&fit=crop&q=60&w=400' },
  { name: 'TOOTHPASTE', gujaratiName: 'ટૂથપેસ્ટ', image: 'https://images.unsplash.com/photo-1559591964-fdec9c56ba16?auto=format&fit=crop&q=60&w=400' },
  { name: 'DRY FRUITS', gujaratiName: 'ડ્રાય ફ્રૂટ્સ', image: 'https://images.unsplash.com/photo-1596591606975-97ee5cef3a1e?auto=format&fit=crop&q=60&w=400' },
  { name: 'DETERGENT & LIQUID', gujaratiName: 'ડિટર્જન્ટ અને લિક્વિડ', image: 'https://images.unsplash.com/photo-1563453392212-326f5e854473?auto=format&fit=crop&q=60&w=400' },
  { name: 'FACE WASH', gujaratiName: 'ફેસ વોશ', image: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&q=60&w=400' },
  { name: 'BODY LOTION & CREAM', gujaratiName: 'બોડી લોશન અને ક્રીમ', image: 'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?auto=format&fit=crop&q=60&w=400' },
  { name: 'MASALA & HALDAR', gujaratiName: 'મસાલા અને હળદર', image: 'https://images.unsplash.com/photo-1532336414038-cf19250c5757?auto=format&fit=crop&q=60&w=400' },
  { name: 'DRY MASALA & GARAM MASALA', gujaratiName: 'ડ્રાય મસાલા અને ગરમ મસાલા', image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&q=60&w=400' },
  { name: 'BODY WASH', gujaratiName: 'બોડી વોશ', image: 'https://images.unsplash.com/photo-1559591937-e43598762f0f?auto=format&fit=crop&q=60&w=400' },
  { name: 'HAIR COLOUR & SHAVING CREAM', gujaratiName: 'હેર કલર અને શેવિંગ ક્રીમ', image: 'https://images.unsplash.com/photo-1626285861696-9f0bf5a49c6d?auto=format&fit=crop&q=60&w=400' },
  { name: 'MOSQUITO LIQUID & SPRAY', gujaratiName: 'મચ્છર ના પ્રવાહી', image: 'https://images.unsplash.com/photo-1650893540026-6218d227f277?auto=format&fit=crop&q=60&w=400' },
  { name: 'CHOCOLATES', gujaratiName: 'ચોકલેટ્સ', image: 'https://images.unsplash.com/photo-1511381939415-e44015466834?auto=format&fit=crop&q=60&w=400' },
  { name: 'MASALA (MR-10)', gujaratiName: 'મસાલા (MR-10)', image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&q=60&w=400' },
  { name: 'MUKHVASH', gujaratiName: 'મુખવાસ', image: 'https://images.unsplash.com/photo-1589113331629-9e8538ad26da?auto=format&fit=crop&q=60&w=400' },
  { name: 'OTHERS ITEM', gujaratiName: 'અન્ય વસ્તુઓ', image: 'https://images.unsplash.com/photo-1534452203294-49c8913c7c7c?auto=format&fit=crop&q=60&w=400' },
  { name: 'PLASTIC ITEMS', gujaratiName: 'પ્લાસ્ટિકની વસ્તુઓ', image: 'https://images.unsplash.com/photo-1605600659908-0ef719419d41?auto=format&fit=crop&q=60&w=400' },
  { name: 'STATIONERY', gujaratiName: 'સ્ટેશનરી', image: 'https://images.unsplash.com/photo-1456735190827-d1262f71b8a3?auto=format&fit=crop&q=60&w=400' },
  { name: 'AGARBATI & DHOOP', gujaratiName: 'અગરબત્તી અને ધૂપ', image: 'https://images.unsplash.com/photo-1602166549272-84d0937c569f?auto=format&fit=crop&q=60&w=400' },
  { name: 'INSTANT FOOD & MASALA', gujaratiName: 'ઇન્સ્ટન્ટ ફૂડ અને મસાલા', image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&q=60&w=400' },
  { name: 'HAIR OIL', gujaratiName: 'હેર ઓઇલ', image: 'https://images.unsplash.com/photo-1617897903246-719242758050?auto=format&fit=crop&q=60&w=400' },
  { name: 'TOOTH BRUSH', gujaratiName: 'ટૂથ બ્રશ', image: 'https://images.unsplash.com/photo-1552044084-4511444005bc?auto=format&fit=crop&q=60&w=400' },
  { name: 'TOSS & KHARI', gujaratiName: 'ટોસ અને ખારી', image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=60&w=400' },
  { name: 'RICE', gujaratiName: 'ચોખા', image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=60&w=400' },
  { name: 'SAUCES & CHUTNI & SOUP', gujaratiName: 'સોસ, ચટણી અને સૂપ', image: 'https://images.unsplash.com/photo-1528750800310-85f949c812d4?auto=format&fit=crop&q=60&w=400' },
  { name: 'TEA & COFFEE', gujaratiName: 'ચા અને કોફી', image: 'https://images.unsplash.com/photo-1544787210-2211d7c309c7?auto=format&fit=crop&q=60&w=400' },
  { name: 'SHING & DARIYA & REVDI', gujaratiName: 'સીંગ, દરિયા અને રેવડી', image: 'https://images.unsplash.com/photo-1596591606975-97ee5cef3a1e?auto=format&fit=crop&q=60&w=400' },
  { name: 'PICKLES', gujaratiName: 'અથાણું', image: 'https://images.unsplash.com/photo-1626132647523-66f5bf380027?auto=format&fit=crop&q=60&w=400' },
  { name: 'MAGGI & NOODLES & PASTA', gujaratiName: 'મેગી, નૂડલ્સ અને પાસ્તા', image: 'https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?auto=format&fit=crop&q=60&w=400' },
  { name: 'SANITARY PADS', gujaratiName: 'સેનિટરી પેડ્સ', image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=60&w=400' },
  { name: 'BALM & MOOV TUBES', gujaratiName: 'બામ અને ટ્યુબ', image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&q=60&w=400' },
  { name: 'FARADI ITEMS', gujaratiName: 'ફરાળી વસ્તુઓ', image: 'https://images.unsplash.com/photo-1585932231552-29877e5d50f1?auto=format&fit=crop&q=60&w=400' },
  { name: 'SNACKS', gujaratiName: 'નાસ્તો', image: 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?auto=format&fit=crop&q=60&w=400' },
  { name: 'BALAJI NAMKIN', gujaratiName: 'બાલાજી નમકીન', image: 'https://images.unsplash.com/photo-1601050690597-df056fb01793?auto=format&fit=crop&q=60&w=400' },
  { name: 'GOPAL NAMKIN', gujaratiName: 'ગોપાલ નમકીન', image: 'https://images.unsplash.com/photo-1589476993333-f55b84301219?auto=format&fit=crop&q=60&w=400' },
  { name: 'GHEE & OIL', gujaratiName: 'ઘી & તેલ', image: 'https://images.unsplash.com/photo-1474979266404-7eaacabc8805?auto=format&fit=crop&q=60&w=400' },
  { name: 'PERFUME & SPRAY', gujaratiName: 'પરફ્યુમ અને સ્પ્રે', image: 'https://images.unsplash.com/photo-1541604193435-225878996233?auto=format&fit=crop&q=60&w=400' },
  { name: 'BABY PRODUCT', gujaratiName: 'બેબી પ્રોડક્ટ', image: 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&q=60&w=400' },
  { name: 'BISCUITS', gujaratiName: 'બિસ્કિટ', image: 'https://images.unsplash.com/photo-1558961363-fa4f23236e10?auto=format&fit=crop&q=60&w=400' },
  { name: 'HANDWASH', gujaratiName: 'હેન્ડવોશ', image: 'https://images.unsplash.com/photo-1584622781564-1d9876a13d00?auto=format&fit=crop&q=60&w=400' },
  { name: 'FACE CREAM & SERUM', gujaratiName: 'ફેસ કરીમ અને સીરમ', image: 'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?auto=format&fit=crop&q=60&w=400' },
  { name: 'ROOM SPRAY & CAR SPRAY', gujaratiName: 'રૂમ સ્પ્રે અને કાર સ્પ્રે', image: 'https://images.unsplash.com/photo-1595433707802-6806f3fabe2b?auto=format&fit=crop&q=60&w=400' },
  { name: 'PAPAD & WAFERS', gujaratiName: 'પાપડ અને વેફર્સ', image: 'https://images.unsplash.com/photo-1606491956689-2ea8c5119c85?auto=format&fit=crop&q=60&w=400' }
];

const SEED_PRODUCTS = [
  { name: 'PREMIUM BASMATI RICE', category: 'RICE', price: 110, mrp: 130, unit: 'kg', gujaratiName: 'પ્રીમિયમ બાસમતી ચોખા', image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=60&w=400' },
  { name: 'SING TEL (GROUNDNUT OIL) 15L', category: 'GHEE & OIL', price: 2850, mrp: 3000, unit: 'pcs', gujaratiName: 'સીંગતેલ ડબ્બો ૧૫ લીટર', image: 'https://images.unsplash.com/photo-1474979266404-7eaacabc8805?auto=format&fit=crop&q=60&w=400' },
  { name: 'GOPAL TIKHA MITHA MIX', category: 'GOPAL NAMKIN', price: 30, mrp: 35, unit: 'pack', gujaratiName: 'ગોપાલ તીખા મીઠા મિક્સ', image: 'https://images.unsplash.com/photo-1601050690597-df056fb01793?auto=format&fit=crop&q=60&w=400' },
  { name: 'TAJ MAHAL TEA 250G', category: 'TEA & COFFEE', price: 195, mrp: 220, unit: 'pcs', gujaratiName: 'તાજ મહેલ ચા ૨૫૦ ગ્રામ', image: 'https://images.unsplash.com/photo-1544787210-2211d7c309c7?auto=format&fit=crop&q=60&w=400' },
  { name: 'ALMOND (BADAM) 500G', category: 'DRY FRUITS', price: 420, mrp: 480, unit: 'pcs', gujaratiName: 'બદામ ૫૦૦ ગ્રામ', image: 'https://images.unsplash.com/photo-1596591606975-97ee5cef3a1e?auto=format&fit=crop&q=60&w=400' },
  { name: 'KABULI CHANA PREMIUM 1KG', category: 'KARIYANU', price: 140, mrp: 160, unit: 'kg', gujaratiName: 'કાબુલી ચણા ૧ કિલો', image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=60&w=400' },
  { name: 'DETTOL LIQUID SOAP 250ML', category: 'SOAP', price: 99, mrp: 105, unit: 'pcs', gujaratiName: 'ડેટોલ પ્રવાહી સાબુ ૨૫૦ મીલી', image: 'https://images.unsplash.com/photo-1600857062241-98e5dba7f214?auto=format&fit=crop&q=60&w=400' }
];

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  // App settings state
  const [shopSettings, setShopSettings] = useState(() => {
    const saved = localStorage.getItem('shopSettings');
    const settings = saved ? JSON.parse(saved) : {
      shopName: 'GGM&S Grocery',
      tagline: 'Wholesale & Retail',
      mobile: '+91 97245 5778',
      whatsapp: '91972455778',
      address: '123 Market Road, Rajkot, Gujarat',
      announcementText: '🚚 મહત્વની સૂચના: ₹2000 થી વધુ ની ખરીદી પર જ હોમ ડિલિવરી મળશે. ₹2000 થી ઓછી ખરીદી માટે ઓર્ડર આપીને દુકાનેથી રૂબરૂ (Pick Up) લઈ જવાનું રહેશે.',
      defaultTheme: 'system',
      festivalThemeActive: 'none',
      aiEnabled: true,
      aiModelName: 'gemini-2.5-flash',
      aiPromptTemplate: '',
      aiApiKey: '',
    };
    // Auto-migrate if old dummy number is in local storage
    if (settings.whatsapp === '919876543210') {
      settings.whatsapp = '91972455778';
      settings.mobile = '+91 97245 5778';
      localStorage.setItem('shopSettings', JSON.stringify(settings));
    }
    if (!settings.announcementText) {
      settings.announcementText = '🚚 મહત્વની સૂચના: ₹2000 થી વધુ ની ખરીદી પર જ હોમ ડિલિવરી મળશે. ₹2000 થી ઓછી ખરીદી માટે ઓર્ડર આપીને દુકાનેથી રૂબરૂ (Pick Up) લઈ જવાનું રહેશે.';
      localStorage.setItem('shopSettings', JSON.stringify(settings));
    }
    if (!settings.defaultTheme) {
      settings.defaultTheme = 'system';
      localStorage.setItem('shopSettings', JSON.stringify(settings));
    }
    if (!settings.festivalThemeActive) {
      settings.festivalThemeActive = 'none';
      localStorage.setItem('shopSettings', JSON.stringify(settings));
    }
    if (settings.aiEnabled === undefined) {
      settings.aiEnabled = true;
      settings.aiModelName = 'gemini-2.5-flash';
      settings.aiPromptTemplate = '';
      settings.aiApiKey = '';
      localStorage.setItem('shopSettings', JSON.stringify(settings));
    }
    return settings;
  });

  const [products, setProducts] = useState<Product[]>(() => {
    const storedProducts = localStorage.getItem('products');
    if (storedProducts) {
      return JSON.parse(storedProducts);
    } else {
      localStorage.setItem('products', JSON.stringify(SEED_PRODUCTS));
      return SEED_PRODUCTS.map((p, idx) => ({ ...p, id: `seed-${idx}` }));
    }
  });

  const [categoryItems, setCategoryItems] = useState<CategoryItem[]>(() => {
    const storedCategories = localStorage.getItem('categories');
    if (storedCategories) {
      const items = JSON.parse(storedCategories) as CategoryItem[];
      items.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      return items;
    } else {
      const formatted = DEFAULT_CATEGORIES.map((cat, idx) => ({
        id: cat.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-'),
        name: cat.name,
        gujaratiName: cat.gujaratiName,
        image: cat.image,
        order: idx
      }));
      localStorage.setItem('categories', JSON.stringify(formatted));
      return formatted;
    }
  });

  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    const storedSettings = localStorage.getItem('settings');
    if (storedSettings) {
      const data = JSON.parse(storedSettings);
      return data.customCategories || [];
    }
    return [];
  });

  const [customUnits, setCustomUnits] = useState<string[]>(() => {
    const storedSettings = localStorage.getItem('settings');
    if (storedSettings) {
      const data = JSON.parse(storedSettings);
      return data.customUnits || [];
    }
    return [];
  });

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const storedCart = localStorage.getItem('ggms_cart');
      return storedCart ? JSON.parse(storedCart) : [];
    } catch {
      return [];
    }
  });

  // PWA & Network States
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  // Premium Mobile App States
  const [showSplash, setShowSplash] = useState(true);
  const [showIntro, setShowIntro] = useState(() => {
    return localStorage.getItem('ggms_intro_seen') !== 'true';
  });
  const [introStep, setIntroStep] = useState(0);
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('ggms_recently_viewed') || '[]');
    } catch {
      return [];
    }
  });
  const [loyaltyPoints, setLoyaltyPoints] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('ggms_loyalty_points');
      return stored ? parseInt(stored) : 120;
    } catch {
      return 120;
    }
  });
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showRateAppPopup, setShowRateAppPopup] = useState(false);

  const addRecentlyViewed = useCallback((productId: string) => {
    setRecentlyViewed(prev => {
      const filtered = prev.filter(id => id !== productId);
      const updated = [productId, ...filtered].slice(0, 5);
      localStorage.setItem('ggms_recently_viewed', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const addLoyaltyPoints = useCallback((points: number) => {
    setLoyaltyPoints(prev => {
      const updated = prev + points;
      localStorage.setItem('ggms_loyalty_points', String(updated));
      return updated;
    });
  }, []);

  const [orders, setOrders] = useState<Order[]>(() => {
    const storedOrders = localStorage.getItem('orders');
    return storedOrders ? JSON.parse(storedOrders) : [];
  });

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Voice Search States
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceErrorText, setVoiceErrorText] = useState('');

  const [voiceIntent, setVoiceIntent] = useState<VoiceIntent | null>(null);
  const [voiceSearchHistory, setVoiceSearchHistory] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('voiceSearchHistory') || '[]');
    } catch {
      return [];
    }
  });
  const [voiceSearchAnalytics, setVoiceSearchAnalytics] = useState<VoiceSearchRecord[]>([]);
  const [aiChatLogs, setAiChatLogs] = useState<any[]>([]);

  const [qrValue, setQrValue] = useState<string>(() => {
    const storedSettings = localStorage.getItem('settings');
    if (storedSettings) {
      const data = JSON.parse(storedSettings);
      if (data.qrValue) return data.qrValue;
    }
    return localStorage.getItem('qrValue') || window.location.origin + '/';
  });

  const [banners, setBanners] = useState<Banner[]>(() => {
    const stored = localStorage.getItem('banners');
    if (stored) {
      return JSON.parse(stored);
    } else {
      const defaultBanners = [
        {
          id: 'default-1',
          imageUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=1200&h=400',
          title: 'Premium Grocery / પ્રીમિયમ કરિયાણું',
          linkUrl: '',
          isActive: true,
          order: 0
        },
        {
          id: 'default-2',
          imageUrl: 'https://images.unsplash.com/photo-1573244514399-904ec1120a14?auto=format&fit=crop&q=80&w=1200&h=400',
          title: 'Fresh Vegetables / તાજા શાકભાજી',
          linkUrl: '',
          isActive: true,
          order: 1
        },
        {
          id: 'default-3',
          imageUrl: 'https://images.unsplash.com/photo-1596591606975-97ee5cef3a1e?auto=format&fit=crop&q=80&w=1200&h=400',
          title: 'Dry Fruits / ડ્રાય ફ્રૂટ્સ',
          linkUrl: '',
          isActive: true,
          order: 2
        }
      ];
      localStorage.setItem('banners', JSON.stringify(defaultBanners));
      return defaultBanners;
    }
  });

  // Admin tab navigation state
  const [adminTab, setAdminTab] = useState<'dashboard' | 'products' | 'categories' | 'orders' | 'settings' | 'qr' | 'banners' | 'coupons' | 'voice' | 'ai_assistant'>('dashboard');

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);

  // AI Assistant Chatbot State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<any[]>(() => [
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'નમસ્તે! હું તમારો એઆઈ ગ્રોસરી મદદગાર છું. 🛒\nતમને આજે રસોઈ બનાવવા માટે અથવા ખરીદી માટે શું મદદ કરું? (ઉદાહરણ તરીકે પૂછો: "ચા બનાવવા શું જોઈએ?")',
      timestamp: new Date().toISOString()
    }
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSpeechListening, setChatSpeechListening] = useState(false);

  // Admin Auth state
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(() => Boolean(localStorage.getItem('adminSession')));

  const isAdminView = location.pathname.startsWith('/admin');

  // Customer Auth state
  const [customerUser, setCustomerUser] = useState<FirebaseAuthUser | null>(null);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authRedirectAction, setAuthRedirectAction] = useState<(() => void) | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [customerAuthLoading, setCustomerAuthLoading] = useState(true);

  // Theme state
  const [preferredTheme, setPreferredTheme] = useState<'light' | 'dark' | 'system' | 'time_based'>(() => {
    return (localStorage.getItem('preferredTheme') as any) || 'system';
  });

  const checkSystemIsDark = (): boolean => {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  };

  const checkIsNightTime = (): boolean => {
    const hours = new Date().getHours();
    return hours >= 19 || hours < 6;
  };

  const [systemIsDark, setSystemIsDark] = useState(() => checkSystemIsDark());
  const [isNightTime, setIsNightTime] = useState(() => checkIsNightTime());
  
  // Real-time listener for OS system theme changes and night time hours
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = (e: MediaQueryListEvent) => {
      setSystemIsDark(e.matches);
    };
    mediaQuery.addEventListener('change', handleSystemChange);

    const interval = setInterval(() => {
      setIsNightTime(checkIsNightTime());
    }, 60000);

    return () => {
      mediaQuery.removeEventListener('change', handleSystemChange);
      clearInterval(interval);
    };
  }, []);

  const effectivePreference = preferredTheme || shopSettings.defaultTheme || 'system';

  const activeBaseTheme: 'light' | 'dark' = useMemo(() => {
    if (effectivePreference === 'light') return 'light';
    if (effectivePreference === 'dark') return 'dark';
    if (effectivePreference === 'time_based') return isNightTime ? 'dark' : 'light';
    return systemIsDark ? 'dark' : 'light';
  }, [effectivePreference, systemIsDark, isNightTime]);

  // Apply appropriate classes to document element
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'theme-diwali', 'theme-navratri', 'theme-newyear');
    
    if (activeBaseTheme === 'dark') {
      root.classList.add('dark');
    }
    
    const festival = shopSettings.festivalThemeActive;
    if (festival && festival !== 'none') {
      if (festival === 'diwali') root.classList.add('theme-diwali');
      else if (festival === 'navratri') root.classList.add('theme-navratri');
      else if (festival === 'new_year') root.classList.add('theme-newyear');
    }
  }, [activeBaseTheme, shopSettings.festivalThemeActive]);

  // Handler to change theme preference and sync with profile
  const handleThemeChange = async (newTheme: 'light' | 'dark' | 'system' | 'time_based') => {
    setPreferredTheme(newTheme);
    localStorage.setItem('preferredTheme', newTheme);
    
    if (customerUser) {
      try {
        const customerRef = doc(db, 'customers', customerUser.uid);
        const updateData = {
          preferredTheme: newTheme,
          lastThemeChanged: new Date().toISOString()
        };
        await setDoc(customerRef, updateData, { merge: true });
        
        if (customerProfile) {
          setCustomerProfile({
            ...customerProfile,
            ...updateData
          });
        }
      } catch (error) {
        console.error("Error updating preferred theme:", error);
      }
    }
  };

  // Hide splash screen after delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // Handle Android back button exit confirmation
  useEffect(() => {
    const handleBackButton = (e: PopStateEvent) => {
      if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
        e.preventDefault();
        window.history.pushState(null, '', window.location.href);
        setShowExitConfirm(true);
      }
    };
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handleBackButton);
    return () => {
      window.removeEventListener('popstate', handleBackButton);
    };
  }, []);

  // Synchronize network status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Listen for custom install prompt event
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowInstallPrompt(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // Sync cart to localStorage
  useEffect(() => {
    localStorage.setItem('ggms_cart', JSON.stringify(cart));
  }, [cart]);

  // Install PWA Helper Function
  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`PWA Installation Outcome: ${outcome}`);
    setDeferredPrompt(null);
    setShowInstallPrompt(false);
  };

  // Push Notifications permissions setup
  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') return;
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === 'granted') {
        showToast('Notifications enabled successfully! / સૂચનાઓ સક્રિય થઈ ગઈ છે!', 'success');
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.ready;
          console.log('Ready for push manager subscription:', reg);
        }
      } else {
        showToast('Notification permission denied. / સૂચનાઓની પરવાનગી નકારી કાઢવામાં આવી.', 'error');
      }
    } catch (err) {
      console.error('Failed to request notification permission:', err);
    }
  };



  useEffect(() => {
    if (!isAdminUnlocked) return;
    const unsub = onSnapshot(collection(db, 'voiceSearches'), (snapshot) => {
      const list: VoiceSearchRecord[] = [];
      snapshot.forEach((doc) => {
        list.push({ ...doc.data(), id: doc.id } as VoiceSearchRecord);
      });
      list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setVoiceSearchAnalytics(list);
    }, (error) => {
      console.error("Firestore voiceSearches read error:", error);
    });
    return () => unsub();
  }, [isAdminUnlocked]);

  useEffect(() => {
    if (!isAdminUnlocked) return;
    const unsub = onSnapshot(collection(db, 'aiChatAnalytics'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ ...doc.data(), id: doc.id });
      });
      list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setAiChatLogs(list);
    }, (error) => {
      console.error("Firestore aiChatAnalytics read error:", error);
    });
    return () => unsub();
  }, [isAdminUnlocked]);



  const popularProducts = useMemo(() => {
    const counts: Record<string, number> = {};
    voiceSearchAnalytics.forEach(v => {
      if (v.extractedProduct) {
        const p = v.extractedProduct.toLowerCase().trim();
        counts[p] = (counts[p] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([product, count]) => ({ product, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [voiceSearchAnalytics]);

  // Coupon System state
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponUsages, setCouponUsages] = useState<CouponUsage[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);

  // Real-time Firestore synchronization listeners
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'products'), (snapshot) => {
      if (!snapshot.empty) {
        // Firestore has data – always use it
        const list: Product[] = [];
        snapshot.forEach((d) => {
          list.push({ ...d.data(), id: d.id } as Product);
        });
        list.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        setProducts(list);
        localStorage.setItem('products', JSON.stringify(list));
        hasSeededProducts = true; // data exists, no need to seed
      } else if (!snapshot.metadata.fromCache && !hasSeededProducts) {
        // Collection is genuinely empty on server – seed once
        hasSeededProducts = true;
        const saved = localStorage.getItem('products');
        const initial: Product[] = saved ? JSON.parse(saved) : SEED_PRODUCTS.map((p, idx) => ({ ...p, id: `seed-${idx}`, order: idx }));
        initial.forEach((p) => {
          setDoc(doc(db, 'products', p.id), p).catch(err => console.error("Error seeding product:", err));
        });
      }
      // If fromCache && empty → do nothing, wait for server response
    }, (error) => {
      console.error("Firestore products read error:", error);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'categories'), (snapshot) => {
      if (!snapshot.empty) {
        const list: CategoryItem[] = [];
        snapshot.forEach((d) => {
          list.push({ ...d.data(), id: d.id } as CategoryItem);
        });
        list.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        setCategoryItems(list);
        localStorage.setItem('categories', JSON.stringify(list));
        hasSeededCategories = true;
      } else if (!snapshot.metadata.fromCache && !hasSeededCategories) {
        hasSeededCategories = true;
        const saved = localStorage.getItem('categories');
        const formatted: CategoryItem[] = saved ? JSON.parse(saved) : DEFAULT_CATEGORIES.map((cat, idx) => ({
          id: cat.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-'),
          name: cat.name,
          gujaratiName: cat.gujaratiName,
          image: cat.image,
          order: idx
        }));
        formatted.forEach((cat) => {
          setDoc(doc(db, 'categories', cat.id), cat).catch(err => console.error("Error seeding category:", err));
        });
      }
    }, (error) => {
      console.error("Firestore categories read error:", error);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'banners'), (snapshot) => {
      if (!snapshot.empty) {
        const list: Banner[] = [];
        snapshot.forEach((d) => {
          list.push({ ...d.data(), id: d.id } as Banner);
        });
        list.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        setBanners(list);
        localStorage.setItem('banners', JSON.stringify(list));
        hasSeededBanners = true;
      } else if (!snapshot.metadata.fromCache && !hasSeededBanners) {
        hasSeededBanners = true;
        const saved = localStorage.getItem('banners');
        const defaultBanners: Banner[] = saved ? JSON.parse(saved) : [
          {
            id: 'default-1',
            imageUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=1200&h=400',
            title: 'Premium Grocery / પ્રીમિયમ કરિયાણું',
            linkUrl: '',
            isActive: true,
            order: 0
          },
          {
            id: 'default-2',
            imageUrl: 'https://images.unsplash.com/photo-1573244514399-904ec1120a14?auto=format&fit=crop&q=80&w=1200&h=400',
            title: 'Fresh Vegetables / તાજા શાકભાજી',
            linkUrl: '',
            isActive: true,
            order: 1
          },
          {
            id: 'default-3',
            imageUrl: 'https://images.unsplash.com/photo-1596591606975-97ee5cef3a1e?auto=format&fit=crop&q=80&w=1200&h=400',
            title: 'Dry Fruits / ડ્રાય ફ્રૂટ્સ',
            linkUrl: '',
            isActive: true,
            order: 2
          }
        ];
        defaultBanners.forEach((b) => {
          setDoc(doc(db, 'banners', b.id), b).catch(err => console.error("Error seeding banner:", err));
        });
      }
    }, (error) => {
      console.error("Firestore banners read error:", error);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'orders'), (snapshot) => {
      const list: Order[] = [];
      snapshot.forEach((doc) => {
        list.push({ ...doc.data(), id: doc.id } as Order);
      });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setOrders(list);
      localStorage.setItem('orders', JSON.stringify(list));
    }, (error) => {
      console.error("Firestore orders read error:", error);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        hasSeededSettings = true;
        const data = snapshot.data();
        if (data.shopSettings) {
          const settingsObj = {
            aiEnabled: true,
            aiModelName: 'gemini-2.5-flash',
            aiPromptTemplate: '',
            aiApiKey: '',
            ...data.shopSettings,
            defaultTheme: data.shopSettings.defaultTheme || 'system',
            festivalThemeActive: data.shopSettings.festivalThemeActive || 'none',
          };
          setShopSettings(settingsObj);
          localStorage.setItem('shopSettings', JSON.stringify(settingsObj));
        }
        if (data.customCategories) {
          setCustomCategories(data.customCategories);
        }
        if (data.customUnits) {
          setCustomUnits(data.customUnits);
        }
        if (data.qrValue) {
          setQrValue(data.qrValue);
          localStorage.setItem('qrValue', data.qrValue);
        }
        localStorage.setItem('settings', JSON.stringify({
          customCategories: data.customCategories || [],
          customUnits: data.customUnits || [],
          qrValue: data.qrValue || ''
        }));
      } else if (!snapshot.metadata.fromCache && !hasSeededSettings) {
        // Document genuinely doesn't exist on server – seed once
        hasSeededSettings = true;
        const savedShop = localStorage.getItem('shopSettings');
        const shopSettingsInit = savedShop ? JSON.parse(savedShop) : {
          shopName: 'GGM&S Grocery',
          tagline: 'Wholesale & Retail',
          mobile: '+91 97245 5778',
          whatsapp: '91972455778',
          address: '123 Market Road, Rajkot, Gujarat',
          announcementText: '🚚 મહત્વની સૂચના: ₹2000 થી વધુ ની ખરીદી પર જ હોમ ડિલિવરી મળશે. ₹2000 થી ઓછી ખરીદી માટે ઓર્ડર આપીને દુકાનેથી રૂબરૂ (Pick Up) લઈ જવાનું રહેશે.',
          defaultTheme: 'system',
          festivalThemeActive: 'none',
          aiEnabled: true,
          aiModelName: 'gemini-2.5-flash',
          aiPromptTemplate: '',
          aiApiKey: '',
        };
        if (!shopSettingsInit.announcementText) {
          shopSettingsInit.announcementText = '🚚 મહત્વની સૂચના: ₹2000 થી વધુ ની ખરીદી પર જ હોમ ડિલિવરી મળશે. ₹2000 થી ઓછી ખરીદી માટે ઓર્ડર આપીને દુકાનેથી રૂબરૂ (Pick Up) લઈ જવાનું રહેશે.';
        }
        if (!shopSettingsInit.defaultTheme) shopSettingsInit.defaultTheme = 'system';
        if (!shopSettingsInit.festivalThemeActive) shopSettingsInit.festivalThemeActive = 'none';
        if (shopSettingsInit.aiEnabled === undefined) shopSettingsInit.aiEnabled = true;
        if (!shopSettingsInit.aiModelName) shopSettingsInit.aiModelName = 'gemini-2.5-flash';
        if (shopSettingsInit.aiPromptTemplate === undefined) shopSettingsInit.aiPromptTemplate = '';
        if (shopSettingsInit.aiApiKey === undefined) shopSettingsInit.aiApiKey = '';

        const savedSettings = localStorage.getItem('settings');
        const settingsInit = savedSettings ? JSON.parse(savedSettings) : {};
        const defaultSettings = {
          shopSettings: shopSettingsInit,
          customCategories: settingsInit.customCategories || [],
          customUnits: settingsInit.customUnits || [],
          qrValue: settingsInit.qrValue || localStorage.getItem('qrValue') || (window.location.origin + '/')
        };
        setDoc(doc(db, 'settings', 'global'), defaultSettings).catch(err => console.error("Error seeding settings:", err));
      }
      // If fromCache && !exists → do nothing, wait for server
    }, (error) => {
      console.error("Firestore settings read error:", error);
    });
    return () => unsub();
  }, []); // Subscribe once – onSnapshot receives all real-time updates automatically

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'coupons'), (snapshot) => {
      const list: Coupon[] = [];
      snapshot.forEach((doc) => {
        list.push({ ...doc.data(), id: doc.id } as Coupon);
      });
      setCoupons(list);
    }, (error) => {
      console.error("Firestore coupons read error:", error);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'couponUsages'), (snapshot) => {
      const list: CouponUsage[] = [];
      snapshot.forEach((doc) => {
        list.push({ ...doc.data(), id: doc.id } as CouponUsage);
      });
      setCouponUsages(list);
    }, (error) => {
      console.error("Firestore couponUsages read error:", error);
    });
    return () => unsub();
  }, []);

  // Customer Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCustomerUser(user);
      if (user) {
        try {
          const profileSnap = await getDoc(doc(db, 'customers', user.uid));
          let profile: CustomerProfile;
          if (profileSnap.exists()) {
            profile = profileSnap.data() as CustomerProfile;
            setCustomerProfile(profile);
            if (profile.preferredTheme) {
              setPreferredTheme(profile.preferredTheme);
              localStorage.setItem('preferredTheme', profile.preferredTheme);
            }
          } else {
            profile = {
              uid: user.uid,
              name: user.displayName || 'Customer',
              phone: user.email ? user.email.split('@')[0].slice(-10) : '',
              createdAt: new Date().toISOString(),
              savedAddresses: [],
              wishlist: []
            };
            await setDoc(doc(db, 'customers', user.uid), profile);
            setCustomerProfile(profile);
          }
          const cartSnap = await getDoc(doc(db, 'customerCarts', user.uid));
          if (cartSnap.exists() && cartSnap.data().items?.length > 0) {
            setCart(cartSnap.data().items);
          } else {
            try {
              const storedCart = localStorage.getItem('ggms_cart');
              if (storedCart) {
                const parsed = JSON.parse(storedCart);
                if (parsed.length > 0) {
                  await setDoc(doc(db, 'customerCarts', user.uid), {
                    items: parsed,
                    updatedAt: new Date().toISOString()
                  });
                  setCart(parsed);
                }
              }
            } catch (err) {
              console.error('Error syncing local cart with Firestore:', err);
            }
          }
        } catch (error) {
          console.error('Error loading customer data:', error);
        }
      } else {
        setCustomerProfile(null);
        setCart([]);
        localStorage.removeItem('ggms_cart');
      }
      setCustomerAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Persist cart to Firestore (debounced)
  const cartSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!customerUser) return;
    if (cartSaveTimerRef.current) clearTimeout(cartSaveTimerRef.current);
    cartSaveTimerRef.current = setTimeout(() => {
      setDoc(doc(db, 'customerCarts', customerUser.uid), {
        items: cart,
        updatedAt: new Date().toISOString()
      }).catch(console.error);
    }, 1500);
    return () => { if (cartSaveTimerRef.current) clearTimeout(cartSaveTimerRef.current); };
  }, [cart, customerUser]);

  // Toast notification helper
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  // Wishlist toggle
  const toggleWishlist = async (productId: string) => {
    if (!customerUser || !customerProfile) {
      setAuthRedirectAction(() => () => toggleWishlist(productId));
      setShowAuthModal(true);
      return;
    }
    const currentWishlist = customerProfile.wishlist || [];
    const isWishlisted = currentWishlist.includes(productId);
    const newWishlist = isWishlisted
      ? currentWishlist.filter((id: string) => id !== productId)
      : [...currentWishlist, productId];
    try {
      await setDoc(doc(db, 'customers', customerUser.uid), { wishlist: newWishlist }, { merge: true });
      setCustomerProfile(prev => prev ? { ...prev, wishlist: newWishlist } : null);
      showToast(isWishlisted ? 'Wishlist માંથી દૂર કર્યું' : 'Wishlist માં ઉમેર્યું ❤️', isWishlisted ? 'info' : 'success');
    } catch (error) {
      showToast('Error updating wishlist', 'error');
    }
  };

  // Customer logout
  const handleCustomerLogout = async () => {
    try {
      await signOut(auth);
      setCustomerUser(null);
      setCustomerProfile(null);
      setCart([]);
      showToast('Successfully logged out / સફળતાપૂર્વક લૉગ આઉટ થયા', 'info');
      navigate('/');
    } catch (error) {
      showToast('Logout failed', 'error');
    }
  };

  const handleCartClick = () => {
    if (location.pathname !== '/') {
      navigate('/');
      setTimeout(() => {
        const basket = document.getElementById('customer-basket');
        basket?.scrollIntoView({ behavior: 'smooth' });
      }, 250);
    } else {
      const basket = document.getElementById('customer-basket');
      basket?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const addCategory = async (cat: Omit<CategoryItem, 'id'>) => {
    const id = cat.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
    try {
      const cleanCat = Object.fromEntries(
        Object.entries(cat).filter(([, v]) => v !== undefined)
      );
      const payload = { ...cleanCat, id } as CategoryItem;
      await setDoc(doc(db, 'categories', id), payload);
    } catch (error) {
      handleLocalDataError(error, OperationType.CREATE, `categories/${id}`);
    }
  };

  const syncCategories = async () => {
    const fromProducts: string[] = Array.from(new Set(products.map(p => p.category)));
    let addedCount = 0;
    for (const name of fromProducts) {
      if (!categoryItems.some(c => c.name === name)) {
        await addCategory({ name, gujaratiName: '', order: categoryItems.length + addedCount });
        addedCount++;
      }
    }
    if (addedCount > 0) {
      alert(`Synced ${addedCount} missing categories from products.`);
    } else {
      alert('Categories are already in sync.');
    }
  };

  const seedCategories = useCallback(async (silent = false) => {
    if (!silent && !window.confirm('This will add/update all default categories. Continue?')) return;
    let addedCount = 0;
    for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
      const cat = DEFAULT_CATEGORIES[i];
      const existing = categoryItems.find(item => item.name === cat.name);
      if (!existing || (!existing.image && cat.image)) {
        await addCategory({ ...cat, order: i });
        addedCount++;
      }
    }
    if (!silent && addedCount > 0) alert(`Seeded ${addedCount} categories.`);
  }, [categoryItems]);

  const allCategories = useMemo(() => {
    const fromItems = categoryItems.map(c => c.name);
    const fromProducts = products.map(p => p.category);
    const uniqueNames = Array.from(new Set([...fromItems, ...fromProducts]));
    
    return uniqueNames.map(name => {
      const item = categoryItems.find(c => c.name === name);
      return {
        name,
        item,
        order: item?.order ?? 999
      };
    }).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.name.localeCompare(b.name);
    });
  }, [products, categoryItems]);

  const categories = useMemo(() => ['All Products', ...allCategories.map(c => c.name)], [allCategories]);

  const units = useMemo(() => {
    const base = ['kg', 'L', 'gm', 'ml', 'pcs', 'pack', 'dozen'];
    return Array.from(new Set([...base, ...customUnits, ...products.map(p => p.unit)]));
  }, [products, customUnits]);

  const filteredProducts = useMemo(() => {
    let result = products;
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      const subQueries = q.split(/\band\b|\bऔर\b|\bઅને\b|\+|,/).map(item => item.trim()).filter(Boolean);
      
      if (subQueries.length > 1) {
        result = result.filter(p => {
          return subQueries.some(subQ => 
            p.name.toLowerCase().includes(subQ) || 
            p.category.toLowerCase().includes(subQ) ||
            (p.gujaratiName && p.gujaratiName.toLowerCase().includes(subQ)) ||
            (p.hindiName && p.hindiName.toLowerCase().includes(subQ)) ||
            (p.voiceKeywords && p.voiceKeywords.some(keyword => keyword.toLowerCase().includes(subQ) || subQ.includes(keyword.toLowerCase())))
          );
        });
      } else {
        result = result.filter(p => 
          p.name.toLowerCase().includes(q) || 
          p.category.toLowerCase().includes(q) ||
          (p.gujaratiName && p.gujaratiName.toLowerCase().includes(q)) ||
          (p.hindiName && p.hindiName.toLowerCase().includes(q)) ||
          (p.voiceKeywords && p.voiceKeywords.some(keyword => keyword.toLowerCase().includes(q) || q.includes(keyword.toLowerCase())))
        );
      }
    } else if (selectedCategory && selectedCategory !== 'All Products') {
      result = result.filter(p => p.category === selectedCategory);
    }
    return result;
  }, [products, selectedCategory, searchQuery]);

  const validateCoupon = (code: string, currentCart: CartItem[], currentCartTotal: number): { valid: boolean; message: string; coupon?: Coupon } => {
    const cleanCode = code.trim().toUpperCase();
    const coupon = coupons.find(c => c.code.toUpperCase() === cleanCode);

    if (!coupon) {
      return { valid: false, message: 'ખોટો કૂપન કોડ / Invalid Coupon Code' };
    }

    if (!coupon.activeStatus) {
      return { valid: false, message: 'આ કૂપન અત્યારે બંધ છે / Coupon is currently inactive' };
    }

    // Expiry check
    const todayStr = new Date().toISOString().split('T')[0];
    if (coupon.expiryDate < todayStr) {
      return { valid: false, message: 'કૂપન એક્સપાયર થઈ ગઈ છે / Coupon has expired' };
    }

    // Usage limit check
    if (coupon.totalUsed >= coupon.usageLimit) {
      return { valid: false, message: 'કૂપનની વપરાશ મર્યાદા પૂરી થઈ ગઈ છે / Coupon usage limit reached' };
    }

    // Minimum order amount
    if (currentCartTotal < coupon.minOrderAmount) {
      return { valid: false, message: `ન્યૂનતમ ₹${coupon.minOrderAmount} નો ઓર્ડર જરૂરી છે / Minimum order value of ₹${coupon.minOrderAmount} required` };
    }

    // Check if customer already used it (onePerCustomer)
    if (customerUser && coupon.onePerCustomer) {
      const hasUsed = couponUsages.some(u => u.customerId === customerUser.uid && u.couponCode.toUpperCase() === cleanCode);
      if (hasUsed) {
        return { valid: false, message: 'તમે આ કૂપન વાપરી ચૂક્યા છો / You have already used this coupon' };
      }
    }

    // Check if first order only
    if (customerUser && coupon.firstOrderOnly) {
      const userOrders = orders.filter(o => o.customerId === customerUser.uid);
      if (userOrders.length > 0) {
        return { valid: false, message: 'આ કૂપન ફક્ત પ્રથમ ઓર્ડર માટે જ છે / Coupon only valid for first order' };
      }
    }

    // Customer Specific coupon
    if (customerUser && coupon.customerSpecific) {
      const cleanCustomerSpecific = coupon.customerSpecific.replace(/\D/g, '');
      const cleanCustomerPhone = (customerProfile?.phone || '').replace(/\D/g, '');
      if (cleanCustomerSpecific !== cleanCustomerPhone) {
        return { valid: false, message: 'આ કૂપન તમારા માટે એલિજિબલ નથી / You are not eligible for this coupon' };
      }
    }

    // Category specific
    if (coupon.discountType === 'category' && coupon.category) {
      const hasCategoryItem = currentCart.some(item => item.category === coupon.category);
      if (!hasCategoryItem) {
        return { valid: false, message: `આ કૂપન ફક્ત ${coupon.category} કેટેગરી માટે છે / Coupon valid only for ${coupon.category} category` };
      }
    }

    return { valid: true, message: 'કૂપન સફળતાપૂર્વક લાગુ થઈ ગઈ! / Coupon applied successfully! 🎉', coupon };
  };

  const handleApplyCoupon = (code: string) => {
    if (!customerUser) {
      setAuthRedirectAction(() => () => handleApplyCoupon(code));
      setShowAuthModal(true);
      return;
    }
    const result = validateCoupon(code, cart, cartTotal);
    if (result.valid && result.coupon) {
      setAppliedCoupon(result.coupon);
      showToast(result.message, 'success');
    } else {
      showToast(result.message, 'error');
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCodeInput('');
    showToast('કૂપન દૂર કરી / Coupon removed successfully', 'info');
  };

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }, [cart]);

  const couponDiscount = useMemo(() => {
    if (!appliedCoupon) return 0;
    if (cartTotal < appliedCoupon.minOrderAmount) return 0;

    let discount = 0;
    if (appliedCoupon.discountType === 'flat') {
      discount = appliedCoupon.discountValue;
    } else if (appliedCoupon.discountType === 'percentage') {
      discount = cartTotal * (appliedCoupon.discountValue / 100);
      if (appliedCoupon.maxDiscount && discount > appliedCoupon.maxDiscount) {
        discount = appliedCoupon.maxDiscount;
      }
    } else if (appliedCoupon.discountType === 'category' && appliedCoupon.category) {
      const categoryTotal = cart
        .filter(item => item.category === appliedCoupon.category)
        .reduce((sum, item) => sum + (item.price * item.quantity), 0);
      discount = categoryTotal * (appliedCoupon.discountValue / 100);
      if (appliedCoupon.maxDiscount && discount > appliedCoupon.maxDiscount) {
        discount = appliedCoupon.maxDiscount;
      }
    }
    return Math.min(discount, cartTotal);
  }, [appliedCoupon, cart, cartTotal]);

  const finalTotal = useMemo(() => {
    return Math.max(0, cartTotal - couponDiscount);
  }, [cartTotal, couponDiscount]);

  const addProduct = async (product: Omit<Product, 'id'>) => {
    try {
      const cleanProduct = Object.fromEntries(
        Object.entries(product).filter(([, v]) => v !== undefined)
      );
      const id = Date.now().toString();
      const newProduct: Product = { ...cleanProduct as Omit<Product, 'id'>, id };
      await setDoc(doc(db, 'products', id), newProduct);
    } catch (error) {
      handleLocalDataError(error, OperationType.CREATE, 'products');
    }
  };

  const updateProduct = async (id: string, product: Omit<Product, 'id'>) => {
    try {
      // Build a complete document – replace undefined with empty/null so fields are cleared
      const fullProduct: Record<string, any> = {
        id,
        name: product.name,
        category: product.category,
        price: product.price,
        unit: product.unit,
        image: product.image || '',
        gujaratiName: product.gujaratiName || '',
        mrp: product.mrp ?? null,
        order: product.order ?? null,
        variants: product.variants || null,
      };
      // Full overwrite – ensures name/photo/all fields are properly updated
      await setDoc(doc(db, 'products', id), fullProduct);
      setEditingProduct(null);
      alert('✅ Product updated successfully! / પ્રોડક્ટ સફળતાપૂર્વક અપડેટ થઈ!');
    } catch (error) {
      handleLocalDataError(error, OperationType.UPDATE, `products/${id}`);
      alert('❌ Error updating product / પ્રોડક્ટ અપડેટ કરવામાં ભૂલ: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const deleteProduct = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    try {
      await deleteDoc(doc(db, 'products', id));
    } catch (error) {
      handleLocalDataError(error, OperationType.DELETE, `products/${id}`);
    }
  };

  const updateCategory = async (id: string, cat: Omit<CategoryItem, 'id'>) => {
    try {
      // Build a complete document – replace undefined with empty so fields are cleared
      const fullCat: Record<string, any> = {
        id,
        name: cat.name,
        gujaratiName: cat.gujaratiName || '',
        image: cat.image || '',
        order: cat.order ?? null,
      };
      // Full overwrite – ensures name/photo/all fields are properly updated
      await setDoc(doc(db, 'categories', id), fullCat);
      setEditingCategory(null);
      alert('✅ Category updated successfully! / કેટેગરી સફળતાપૂર્વક અપડેટ થઈ!');
    } catch (error) {
      handleLocalDataError(error, OperationType.UPDATE, `categories/${id}`);
      alert('❌ Error updating category / કેટેગરી અપડેટ કરવામાં ભૂલ: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const deleteCategory = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this category?')) return;
    try {
      await deleteDoc(doc(db, 'categories', id));
    } catch (error) {
      handleLocalDataError(error, OperationType.DELETE, `categories/${id}`);
    }
  };

  // ─── Drag & Drop Reorder ───────────────────────────────────────────────────
  // We store the dragging index in a ref (avoids stale-closure bugs) and use
  // a separate dragOver state for the visual drop indicator.
  const dragCatRef = useRef<number | null>(null);
  const [dragOverCatIndex, setDragOverCatIndex] = useState<number | null>(null);

  const dragProdRef = useRef<number | null>(null);
  const [dragOverProdIndex, setDragOverProdIndex] = useState<number | null>(null);

  // Categories
  const onCatDragStart = (idx: number, e: React.DragEvent) => {
    dragCatRef.current = idx;
    e.dataTransfer.effectAllowed = 'move';
    // small timeout so the dragged element still renders before going ghost
    setTimeout(() => setDragOverCatIndex(idx), 0);
  };
  const onCatDragOver = (idx: number, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCatIndex(idx);
  };
  const onCatDrop = async (targetIdx: number) => {
    const fromIdx = dragCatRef.current;
    setDragOverCatIndex(null);
    dragCatRef.current = null;
    if (fromIdx === null || fromIdx === targetIdx) return;
    // Optimistic local update
    const newList = [...categoryItems];
    const [moved] = newList.splice(fromIdx, 1);
    newList.splice(targetIdx, 0, moved);
    setCategoryItems(newList);
    // Persist to Firestore
    for (let i = 0; i < newList.length; i++) {
      try {
        await setDoc(doc(db, 'categories', newList[i].id), { order: i }, { merge: true });
      } catch (error) {
        handleLocalDataError(error, OperationType.UPDATE, `categories/${newList[i].id}`);
      }
    }
  };
  const onCatDragEnd = () => {
    dragCatRef.current = null;
    setDragOverCatIndex(null);
  };

  // Products
  const onProdDragStart = (idx: number, e: React.DragEvent) => {
    dragProdRef.current = idx;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => setDragOverProdIndex(idx), 0);
  };
  const onProdDragOver = (idx: number, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverProdIndex(idx);
  };
  const onProdDrop = async (targetIdx: number) => {
    const fromIdx = dragProdRef.current;
    setDragOverProdIndex(null);
    dragProdRef.current = null;
    if (fromIdx === null || fromIdx === targetIdx) return;
    // Optimistic local update
    const newList = [...products];
    const [moved] = newList.splice(fromIdx, 1);
    newList.splice(targetIdx, 0, moved);
    setProducts(newList);
    // Persist to Firestore
    for (let i = 0; i < newList.length; i++) {
      try {
        await setDoc(doc(db, 'products', newList[i].id), { order: i }, { merge: true });
      } catch (error) {
        handleLocalDataError(error, OperationType.UPDATE, `products/${newList[i].id}`);
      }
    }
  };
  const onProdDragEnd = () => {
    dragProdRef.current = null;
    setDragOverProdIndex(null);
  };
  // ──────────────────────────────────────────────────────────────────────────

  const addBanner = async (banner: Omit<Banner, 'id'>) => {
    try {
      const id = Date.now().toString();
      const newBanner: Banner = { 
        ...banner, 
        id,
        order: banners.length
      };
      await setDoc(doc(db, 'banners', id), newBanner);
    } catch (error) {
      handleLocalDataError(error, OperationType.CREATE, 'banners');
    }
  };

  const updateBanner = async (id: string, banner: Omit<Banner, 'id'>) => {
    try {
      const fullBanner: Record<string, any> = {
        id,
        imageUrl: banner.imageUrl || '',
        title: banner.title || '',
        linkUrl: banner.linkUrl || '',
        isActive: banner.isActive ?? true,
        order: banner.order ?? 0,
      };
      await setDoc(doc(db, 'banners', id), fullBanner);
      setEditingBanner(null);
    } catch (error) {
      handleLocalDataError(error, OperationType.UPDATE, `banners/${id}`);
    }
  };

  const deleteBanner = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this banner?')) return;
    try {
      await deleteDoc(doc(db, 'banners', id));
    } catch (error) {
      handleLocalDataError(error, OperationType.DELETE, `banners/${id}`);
    }
  };

  const addCoupon = async (coupon: Omit<Coupon, 'id' | 'createdAt' | 'totalUsed'>) => {
    try {
      const code = coupon.code.toUpperCase().trim();
      const newCoupon: Coupon = {
        ...coupon,
        id: code,
        code,
        totalUsed: 0,
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'coupons', code), newCoupon);
      showToast('કૂપન સફળતાપૂર્વક ઉમેરાઈ ગઈ / Coupon created successfully', 'success');
    } catch (error) {
      handleLocalDataError(error, OperationType.CREATE, `coupons/${coupon.code}`);
      showToast('કૂપન ઉમેરવામાં ભૂલ આવી / Error creating coupon: ' + (error instanceof Error ? error.message : String(error)), 'error');
    }
  };

  const updateCoupon = async (id: string, coupon: Omit<Coupon, 'id' | 'createdAt' | 'totalUsed'>) => {
    try {
      const code = coupon.code.toUpperCase().trim();
      const existing = coupons.find(c => c.id === id);
      const updatedCoupon: Coupon = {
        ...coupon,
        code,
        id,
        createdAt: existing?.createdAt || new Date().toISOString(),
        totalUsed: existing?.totalUsed || 0,
      };
      await setDoc(doc(db, 'coupons', id), updatedCoupon);
      setEditingCoupon(null);
      showToast('કૂપન સફળતાપૂર્વક અપડેટ થઈ ગઈ / Coupon updated successfully', 'success');
    } catch (error) {
      handleLocalDataError(error, OperationType.UPDATE, `coupons/${id}`);
      showToast('કૂપન અપડેટ કરવામાં ભૂલ આવી / Error updating coupon: ' + (error instanceof Error ? error.message : String(error)), 'error');
    }
  };

  const deleteCoupon = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this coupon? / શું તમે ખરેખર આ કૂપન ડીલીટ કરવા માંગો છો?')) return;
    try {
      await deleteDoc(doc(db, 'coupons', id));
      showToast('કૂપન સફળતાપૂર્વક ડીલીટ થઈ ગઈ / Coupon deleted successfully', 'success');
    } catch (error) {
      handleLocalDataError(error, OperationType.DELETE, `coupons/${id}`);
      showToast('કૂપન ડીલીટ કરવામાં ભૂલ આવી / Error deleting coupon: ' + (error instanceof Error ? error.message : String(error)), 'error');
    }
  };

  const updateQrValue = async (val: string) => {
    try {
      await setDoc(doc(db, 'settings', 'global'), { qrValue: val }, { merge: true });
    } catch (error) {
      handleLocalDataError(error, OperationType.WRITE, 'settings/global');
    }
  };

  const updateCustomCategories = async (cats: string[]) => {
    for (const name of cats) {
      if (!categoryItems.some(c => c.name === name)) {
        await addCategory({ name, gujaratiName: '', order: categoryItems.length });
      }
    }
    try {
      const newCats = Array.from(new Set([...customCategories, ...cats]));
      await setDoc(doc(db, 'settings', 'global'), { customCategories: newCats }, { merge: true });
    } catch (error) {
      handleLocalDataError(error, OperationType.WRITE, 'settings/global');
    }
  };

  const updateCustomUnits = async (u: string[]) => {
    try {
      const newUnits = Array.from(new Set([...customUnits, ...u]));
      await setDoc(doc(db, 'settings', 'global'), { customUnits: newUnits }, { merge: true });
    } catch (error) {
      handleLocalDataError(error, OperationType.WRITE, 'settings/global');
    }
  };

  const addToCartInternal = (product: Product, quantity: number, selectedVariant?: ProductVariant) => {
    setCart(prev => {
      const existing = prev.find(item => 
        item.id === product.id && 
        ((!item.selectedVariant && !selectedVariant) || (item.selectedVariant?.id === selectedVariant?.id))
      );
      if (existing) {
        return prev.map(item =>
          item.id === product.id && 
          ((!item.selectedVariant && !selectedVariant) || (item.selectedVariant?.id === selectedVariant?.id))
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      
      const finalPrice = selectedVariant ? selectedVariant.price : product.price;
      const finalMrp = selectedVariant ? selectedVariant.mrp : product.mrp;
      const finalUnit = selectedVariant ? selectedVariant.name : product.unit;

      return [...prev, { 
        ...product, 
        price: finalPrice, 
        mrp: finalMrp, 
        unit: finalUnit, 
        selectedVariant, 
        quantity 
      }];
    });
  };

  const addToCart = (product: Product, quantity: number, selectedVariant?: ProductVariant) => {
    if (!customerUser) {
      setAuthRedirectAction(() => () => addToCartInternal(product, quantity, selectedVariant));
      setShowAuthModal(true);
      return;
    }
    addToCartInternal(product, quantity, selectedVariant);
  };

  const updateCartQuantity = (cartItemId: string, delta: number) => {
    setCart(prev => prev.flatMap(item => {
      const currentKey = item.id + (item.selectedVariant ? '-' + item.selectedVariant.id : '');
      if (currentKey !== cartItemId) return item;
      const newQty = item.quantity + delta;
      if (newQty <= 0) return [];
      return { ...item, quantity: newQty };
    }));
  };

  // Admin lock/unlock handlers
  const handleAdminUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/admin/login', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ username: adminUsername, password: adminPassword }) 
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('adminSession', data.token);
        setIsAdminUnlocked(true);
        setAdminPassword('');
        return;
      }
    } catch (error) {
      console.warn('API authentication failed, trying client-side fallback:', error);
    }

    // Client-side fallback for static web hosting deployments (Vercel, GitHub Pages, etc.)
    if (adminUsername === 'admin' && adminPassword === 'Admin@123456') {
      const token = 'local-session-' + Math.random().toString(36).substring(2);
      localStorage.setItem('adminSession', token);
      setIsAdminUnlocked(true);
      setAdminPassword('');
    } else {
      alert('Invalid username or password');
    }
  };

  const handleAdminLock = () => {
    setIsAdminUnlocked(false);
    localStorage.removeItem('adminSession');
    navigate('/');
  };

  // Order state functions
  const handleUpdateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
      await setDoc(doc(db, 'orders', orderId), { status: newStatus }, { merge: true });
      if (viewingOrder && viewingOrder.id === orderId) {
        setViewingOrder({ ...viewingOrder, status: newStatus });
      }
    } catch (error) {
      handleLocalDataError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!window.confirm('Delete this order permanently?')) return;
    try {
      await deleteDoc(doc(db, 'orders', orderId));
      setViewingOrder(null);
    } catch (error) {
      handleLocalDataError(error, OperationType.DELETE, `orders/${orderId}`);
    }
  };

  // Place Order function linking customer checkout
  const handleCreateOrder = async (customerDetails: CustomerDetails) => {
    if (cart.length === 0) return;

    const deliveryMode = customerDetails.deliveryMode || 'pickup';
    const cleanCustomer: CustomerDetails = {
      name: customerDetails.name || '',
      phone: customerDetails.phone || '',
      address: customerDetails.address || '',
      ...(customerDetails.deliveryMode ? { deliveryMode: customerDetails.deliveryMode } : {})
    };

    const newOrder: Order = {
      id: `ORD-${Date.now().toString().slice(-6)}`,
      items: [...cart],
      customer: cleanCustomer,
      total: finalTotal,
      status: 'pending',
      createdAt: new Date().toISOString(),
      deliveryMode: deliveryMode,
      ...(customerUser?.uid ? { customerId: customerUser.uid } : {}),
      ...(appliedCoupon ? { couponCode: appliedCoupon.code } : {}),
      ...(couponDiscount > 0 ? { couponDiscount } : {})
    };

    try {
      await setDoc(doc(db, 'orders', newOrder.id), newOrder);
      
      // Update coupon usage if applicable
      if (appliedCoupon && customerUser) {
        const usageId = `usage-${Date.now().toString()}-${Math.random().toString(36).substring(2, 9)}`;
        const usageLog: CouponUsage = {
          id: usageId,
          customerId: customerUser.uid,
          customerPhone: customerDetails.phone,
          couponCode: appliedCoupon.code,
          orderId: newOrder.id,
          discountAmount: couponDiscount,
          usedAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'couponUsages', usageId), usageLog);

        // Increment coupon use count
        await setDoc(doc(db, 'coupons', appliedCoupon.code), {
          totalUsed: (appliedCoupon.totalUsed || 0) + 1
        }, { merge: true });
      }
    } catch (error) {
      handleLocalDataError(error, OperationType.CREATE, 'orders');
      showToast('ઓર્ડર સેવ કરવામાં ભૂલ આવી / Error saving order: ' + (error instanceof Error ? error.message : String(error)), 'error');
    }

    // Construct WhatsApp message
    const deliveryLabel = deliveryMode === 'home_delivery' ? '🚚 Home Delivery' : '🏪 Pick Up At Store';
    let msg = `*📦 NEW ORDER: ${shopSettings.shopName}*\n\n`;
    msg += `*📋 Delivery Mode: ${deliveryLabel}*\n\n`;
    msg += `*👤 Customer Details:*\n`;
    msg += `• Name: ${customerDetails.name}\n`;
    msg += `• Phone: ${customerDetails.phone}\n`;
    if (deliveryMode === 'home_delivery') {
      msg += `• Address: ${customerDetails.address}\n\n`;
    } else {
      msg += `• (Pick Up At Store)\n\n`;
    }
    msg += `*🛒 Items Ordered:*\n`;
    cart.forEach((item, index) => {
      const displayUnit = item.selectedVariant ? `${item.quantity} x ${item.unit}` : `${item.quantity} ${item.unit}`;
      msg += `${index + 1}. ${item.name} (${displayUnit}) - ₹${(item.price * item.quantity).toFixed(2)}\n`;
    });
    
    if (appliedCoupon && couponDiscount > 0) {
      msg += `\n*🏷️ Coupon Discount (${appliedCoupon.code}): -₹${couponDiscount.toFixed(0)}*`;
      msg += `\n*💰 GRAND TOTAL: ₹${finalTotal.toFixed(0)}*\n\n`;
    } else {
      msg += `\n*💰 GRAND TOTAL: ₹${cartTotal.toFixed(0)}*\n\n`;
    }
    
    msg += `Thank you for shopping with us!`;
    msg += `\n\n━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `*📝 મહત્વની નોંધ:*\n\n`;
    msg += `1️⃣ ઓર્ડરનું પેમેન્ટ ઓર્ડર આપવા આવો ત્યારે આપવાનું રહેશે.\n\n`;
    msg += `2️⃣ ઓર્ડર ડિલિવર થયા પછી જો કોઈ વસ્તુ પાછી આપવાની હોય તો 24 કલાકમાં વસ્તુ આપવા રૂબરૂ શોપ પર આવવાનું રહેશે.`;

    const cleanWhatsappNumber = shopSettings.whatsapp.replace(/\D/g, '');
    let finalWhatsapp = cleanWhatsappNumber;
    if (finalWhatsapp.length === 10 && (finalWhatsapp.startsWith('7') || finalWhatsapp.startsWith('8') || finalWhatsapp.startsWith('9') || finalWhatsapp.startsWith('6'))) {
      finalWhatsapp = '91' + finalWhatsapp;
    } else if (finalWhatsapp.length === 9 && (finalWhatsapp.startsWith('7') || finalWhatsapp.startsWith('8') || finalWhatsapp.startsWith('9') || finalWhatsapp.startsWith('6'))) {
      finalWhatsapp = '91' + finalWhatsapp;
    }
    const url = `https://wa.me/${finalWhatsapp}?text=${encodeURIComponent(msg)}`;
    
    // Reset cart and coupon
    setCart([]);
    setAppliedCoupon(null);
    setCouponCodeInput('');
    addLoyaltyPoints(50);
    setTimeout(() => {
      setShowRateAppPopup(true);
    }, 1500);
    
    alert(deliveryMode === 'home_delivery' 
      ? 'Order placed successfully! Home Delivery selected. Redirecting to WhatsApp...'
      : 'Order placed successfully! Pick up at store selected. Redirecting to WhatsApp...'
    );
    window.open(url, '_blank');
  };

  const saveSettings = async (updated: typeof shopSettings) => {
    try {
      await setDoc(doc(db, 'settings', 'global'), { shopSettings: updated }, { merge: true });
      alert('Shop settings updated successfully!');
    } catch (error) {
      handleLocalDataError(error, OperationType.WRITE, 'settings/global');
      alert('Error updating shop settings: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleDownloadBackup = () => {
    try {
      const backupData = {
        version: "1.0",
        backupDate: new Date().toISOString(),
        data: {
          products: products,
          categories: categoryItems,
          orders: orders,
          shopSettings: shopSettings,
          banners: banners,
          settings: {
            customCategories,
            customUnits,
            qrValue
          }
        }
      };

      const dataStr = JSON.stringify(backupData, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

      const exportFileDefaultName = `ggms_store_backup_${new Date().toISOString().slice(0, 10)}.json`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
    } catch (error) {
      alert('Error exporting data: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleUploadBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    const file = event.target.files?.[0];
    if (!file) return;

    fileReader.onload = async (e) => {
      try {
        const content = e.target?.result;
        if (typeof content !== 'string') {
          throw new Error('Could not read file content / ફાઈલ વાંચી શકાઈ નથી');
        }

        const parsed = JSON.parse(content);
        
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Invalid file format / ખોટું ફાઈલ ફોર્મેટ');
        }

        const data = parsed.data || parsed;

        if (!data.products || !Array.isArray(data.products)) {
          throw new Error('Backup file must contain products array / બેકઅપ ફાઇલમાં પ્રોડક્ટ્સ લિસ્ટ હોવું જરૂરી છે');
        }
        if (!data.categories || !Array.isArray(data.categories)) {
          throw new Error('Backup file must contain categories array / બેકઅપ ફાઇલમાં કેટેગરીઝ લિસ્ટ હોવું જરૂરી છે');
        }

        const confirmRestore = window.confirm(
          "WARNING: This will overwrite all your current products, categories, orders, and shop settings! This action cannot be undone.\n\n" +
          "ચેતવણી: આ તમારા વર્તમાન તમામ ઉત્પાદનો, કેટેગરીઝ, ઓર્ડર્સ અને સ્ટોર સેટિંગ્સને બદલી નાખશે! આ ક્રિયા પાછી વાળી શકાશે નહીં.\n\n" +
          "Do you want to proceed? / શું તમે આગળ વધવા માંગો છો?"
        );

        if (!confirmRestore) {
          event.target.value = '';
          return;
        }

        // Upload Products
        for (const p of data.products) {
          await setDoc(doc(db, 'products', p.id), p);
        }

        // Upload Categories
        for (const cat of data.categories) {
          await setDoc(doc(db, 'categories', cat.id), cat);
        }

        // Upload Orders
        if (data.orders && Array.isArray(data.orders)) {
          for (const ord of data.orders) {
            await setDoc(doc(db, 'orders', ord.id), ord);
          }
        }

        // Upload Banners
        if (data.banners && Array.isArray(data.banners)) {
          for (const b of data.banners) {
            await setDoc(doc(db, 'banners', b.id), b);
          }
        }

        // Upload Shop Settings
        const settingsPayload: any = {};
        if (data.shopSettings) {
          settingsPayload.shopSettings = data.shopSettings;
        }
        if (data.settings) {
          if (data.settings.customCategories) {
            settingsPayload.customCategories = data.settings.customCategories;
          }
          if (data.settings.customUnits) {
            settingsPayload.customUnits = data.settings.customUnits;
          }
          if (data.settings.qrValue) {
            settingsPayload.qrValue = data.settings.qrValue;
          }
        }
        if (Object.keys(settingsPayload).length > 0) {
          await setDoc(doc(db, 'settings', 'global'), settingsPayload, { merge: true });
        }

        alert(
          "Data restored successfully! / ડેટા સફળતાપૂર્વક રીસ્ટોર કરવામાં આવ્યો છે!\n\n" +
          "The application will reload to apply all changes."
        );
        window.location.reload();

      } catch (err) {
        alert('Restore failed / રીસ્ટોર નિષ્ફળ ગયું: ' + (err instanceof Error ? err.message : String(err)));
        event.target.value = '';
      }
    };

    fileReader.readAsText(file);
  };

  // Admin Stats Calculations
  const stats = useMemo(() => {
    const totalRevenue = orders
      .filter(ord => ord.status === 'delivered')
      .reduce((sum, ord) => sum + ord.total, 0);

    const pendingOrders = orders.filter(ord => ord.status === 'pending').length;
    const activeOrders = orders.filter(ord => ord.status === 'processing').length;
    
    return {
      revenue: totalRevenue,
      totalOrders: orders.length,
      pendingOrders,
      activeOrders,
      productsCount: products.length,
      categoriesCount: categoryItems.length
    };
  }, [orders, products, categoryItems]);



  // Redesigned Administrative Dashboard Layout
  const renderAdminContent = () => (
    <div className="grid lg:grid-cols-12 gap-8 items-start">
      {!isAdminUnlocked ? (
        <div className="lg:col-span-12 flex flex-col items-center justify-center py-20">
          <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-2xl max-w-md w-full text-center">
            <div className="w-20 h-20 bg-emerald-50 rounded-[28px] flex items-center justify-center mb-6 mx-auto shadow-inner">
              <Store className="w-10 h-10 text-primary-green" />
            </div>
            <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">Admin Terminal</h2>
            <p className="text-slate-500 mb-8 text-sm font-medium leading-relaxed">
              Log in to manage shop products, view reports, and track incoming orders.
            </p>
            
            <form onSubmit={handleAdminUnlock} className="flex flex-col gap-4">
              <div className="text-left">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">Username</label>
                <input 
                  type="text" 
                  value={adminUsername} 
                  onChange={(e) => setAdminUsername(e.target.value)} 
                  placeholder="e.g. admin" 
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-bold focus:border-primary-green transition-all outline-hidden" 
                />
              </div>
              <div className="text-left">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">Password</label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-bold focus:border-primary-green transition-all outline-hidden"
                  autoFocus
                />
              </div>
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                type="submit"
                className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg mt-2"
              >
                Log In
              </motion.button>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="w-full text-slate-400 text-xs font-bold uppercase tracking-widest hover:text-slate-600 py-2 mt-1"
              >
                Cancel & Exit
              </button>
            </form>
          </div>
        </div>
      ) : (
        <>
          {/* Admin Navigation Sidebar */}
          <div className="lg:col-span-3 bg-white border border-slate-200 rounded-[28px] p-5 shadow-xs flex flex-col gap-1.5">
            <div className="px-4 py-3 mb-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                <Store className="w-5 h-5 text-emerald-700" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm leading-tight">Admin Console</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Backoffice</p>
              </div>
            </div>
            
            <button onClick={() => setAdminTab('dashboard')} className={`admin-sidebar-btn ${adminTab === 'dashboard' ? 'active' : ''}`}>
              <TrendingUp className="w-4 h-4" /> DASHBOARD
            </button>
            <button onClick={() => setAdminTab('orders')} className={`admin-sidebar-btn ${adminTab === 'orders' ? 'active' : ''}`}>
              <ClipboardList className="w-4 h-4" /> ORDERS ({orders.filter(o => o.status === 'pending').length})
            </button>
            <button onClick={() => setAdminTab('products')} className={`admin-sidebar-btn ${adminTab === 'products' ? 'active' : ''}`}>
              <Package className="w-4 h-4" /> INVENTORY ({products.length})
            </button>
            <button onClick={() => setAdminTab('categories')} className={`admin-sidebar-btn ${adminTab === 'categories' ? 'active' : ''}`}>
              <LayoutDashboard className="w-4 h-4" /> CATEGORIES ({categoryItems.length})
            </button>
            <button onClick={() => setAdminTab('banners')} className={`admin-sidebar-btn ${adminTab === 'banners' ? 'active' : ''}`}>
              <ImageIcon className="w-4 h-4" /> AD SLIDER BANNERS ({banners.length})
            </button>
            <button onClick={() => setAdminTab('coupons')} className={`admin-sidebar-btn ${adminTab === 'coupons' ? 'active' : ''}`}>
              <Tag className="w-4 h-4" /> COUPONS & OFFERS ({coupons.length})
            </button>
            <button onClick={() => setAdminTab('qr')} className={`admin-sidebar-btn ${adminTab === 'qr' ? 'active' : ''}`}>
              <Smartphone className="w-4 h-4" /> COUNTER QR
            </button>
            <button onClick={() => setAdminTab('voice')} className={`admin-sidebar-btn ${adminTab === 'voice' ? 'active' : ''}`}>
              <Mic className="w-4 h-4" /> VOICE SEARCH ANALYTICS
            </button>
            <button onClick={() => setAdminTab('ai_assistant')} className={`admin-sidebar-btn ${adminTab === 'ai_assistant' ? 'active' : ''}`}>
              <Sparkles className="w-4 h-4 text-purple-500" /> AI ASSISTANT
            </button>
            <button onClick={() => setAdminTab('settings')} className={`admin-sidebar-btn ${adminTab === 'settings' ? 'active' : ''}`}>
              <Settings className="w-4 h-4" /> SHOP SETTINGS
            </button>
            
            <div className="pt-4 mt-6 border-t border-slate-100">
              <button 
                onClick={handleAdminLock}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-red-500 hover:bg-red-50 w-full transition-all"
              >
                <LogOut className="w-4 h-4" /> LOGOUT
              </button>
            </div>
          </div>

          {/* Admin Panel Main Content */}
          <div className="lg:col-span-9 space-y-6">
            
            {/* Dashboard Tab */}
            {adminTab === 'dashboard' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="admin-stat-card">
                    <span className="text-slate-400 text-[10px] font-black uppercase tracking-wider">Total Sales</span>
                    <span className="text-2xl font-black text-slate-900 flex items-center">
                      <IndianRupee className="w-5 h-5 text-emerald-600 inline" /> {stats.revenue.toFixed(0)}
                    </span>
                  </div>
                  <div className="admin-stat-card">
                    <span className="text-slate-400 text-[10px] font-black uppercase tracking-wider">Total Orders</span>
                    <span className="text-2xl font-black text-slate-900">{stats.totalOrders}</span>
                  </div>
                  <div className="admin-stat-card">
                    <span className="text-slate-400 text-[10px] font-black uppercase tracking-wider">Pending Orders</span>
                    <span className={`text-2xl font-black ${stats.pendingOrders > 0 ? 'text-amber-500' : 'text-slate-900'}`}>{stats.pendingOrders}</span>
                  </div>
                  <div className="admin-stat-card">
                    <span className="text-slate-400 text-[10px] font-black uppercase tracking-wider">Live Items</span>
                    <span className="text-2xl font-black text-slate-900">{stats.productsCount}</span>
                  </div>
                </div>

                <div className="grid md:grid-cols-12 gap-6">
                  {/* Stock Breakdown */}
                  <div className="md:col-span-6 bg-white border border-slate-200 rounded-[24px] p-6">
                    <h4 className="font-extrabold text-slate-900 text-sm mb-4">Stock Breakdown</h4>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto no-scrollbar">
                      {categoryItems.map(cat => {
                        const count = products.filter(p => p.category === cat.name).length;
                        return (
                          <div key={cat.id} className="flex justify-between items-center text-xs">
                            <span className="font-semibold text-slate-600 truncate mr-2">{cat.name}</span>
                            <span className="font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">{count} items</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Recent Orders */}
                  <div className="md:col-span-6 bg-white border border-slate-200 rounded-[24px] p-6 flex flex-col justify-between">
                    <div>
                      <h4 className="font-extrabold text-slate-900 text-sm mb-4">Recent Orders</h4>
                      <div className="divide-y divide-slate-100 overflow-x-auto">
                        {orders.length === 0 ? (
                          <p className="text-sm italic text-slate-400 py-8 text-center">No orders registered yet.</p>
                        ) : (
                          orders.slice(0, 5).map(ord => (
                            <div key={ord.id} className="py-3 flex justify-between items-center text-xs gap-4">
                              <div className="min-w-0">
                                <span className="font-black text-slate-800 block truncate">{ord.id}</span>
                                <p className="text-[10px] text-slate-400 font-bold truncate">{ord.customer.name}</p>
                              </div>
                              <span className="font-black text-slate-900 shrink-0">₹{ord.total.toFixed(0)}</span>
                              <span className={`status-badge status-${ord.status} shrink-0`}>{ord.status}</span>
                              <button 
                                onClick={() => { setViewingOrder(ord); setAdminTab('orders'); }}
                                className="text-xs font-black text-primary-green hover:underline shrink-0"
                              >
                                View
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                    {orders.length > 5 && (
                      <button onClick={() => setAdminTab('orders')} className="text-xs font-black text-primary-green text-center w-full pt-4 hover:underline">
                        View All Orders
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Orders Tab */}
            {adminTab === 'orders' && (
              <div className="bg-white border border-slate-200 rounded-[24px] overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="font-black text-slate-900 text-lg">Manage Shop Orders</h3>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{orders.length} Total Orders</span>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left admin-table border-collapse">
                    <thead>
                      <tr>
                        <th>Order ID</th>
                        <th>Customer</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Created At</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {orders.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center italic text-slate-400 py-12">
                            No orders found in database.
                          </td>
                        </tr>
                      ) : (
                        orders.map(ord => (
                          <tr key={ord.id}>
                            <td className="font-black text-slate-900">{ord.id}</td>
                            <td>
                              <p className="font-bold text-slate-900">{ord.customer.name}</p>
                              <p className="text-[10px] text-slate-400">{ord.customer.phone}</p>
                            </td>
                            <td className="font-black text-slate-900">₹{ord.total.toFixed(2)}</td>
                            <td>
                              <span className={`status-badge status-${ord.status}`}>{ord.status}</span>
                            </td>
                            <td className="text-xs text-slate-400 font-semibold">
                              {new Date(ord.createdAt).toLocaleDateString()} {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => setViewingOrder(ord)}
                                  className="text-xs font-black text-primary-green hover:bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 transition-all"
                                >
                                  Open
                                </button>
                                <button
                                  onClick={() => handleDeleteOrder(ord.id)}
                                  className="text-xs font-black text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 transition-all"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Order Details Modal Overlay */}
                {viewingOrder && (
                  <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-[28px] border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 md:p-8 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Order Details</span>
                            <h3 className="text-2xl font-black text-slate-900">{viewingOrder.id}</h3>
                          </div>
                          <button onClick={() => setViewingOrder(null)} className="p-2 hover:bg-slate-100 rounded-full transition-all">
                            <X className="w-5 h-5 text-slate-400" />
                          </button>
                        </div>

                        {/* Customer details in modal */}
                        <div className="grid md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-6">
                          <div>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Name</span>
                            <span className="text-sm font-bold text-slate-800">{viewingOrder.customer.name}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Mobile</span>
                            <span className="text-sm font-bold text-slate-800">{viewingOrder.customer.phone}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Address</span>
                            <span className="text-xs font-semibold text-slate-600 block line-clamp-2">{viewingOrder.customer.address}</span>
                          </div>
                        </div>

                        {/* Items summary */}
                        <div className="mb-6">
                          <h4 className="font-black text-slate-900 text-xs uppercase tracking-wider mb-3">Items Summary</h4>
                          <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden bg-white max-h-[250px] overflow-y-auto no-scrollbar">
                            {viewingOrder.items.map(item => (
                              <div key={item.id} className="p-3.5 flex justify-between items-center text-xs">
                                <div>
                                  <p className="font-bold text-slate-800 uppercase">{item.name}</p>
                                  <p className="text-[10px] text-slate-400 font-bold">{item.quantity} {item.unit} x ₹{item.price.toFixed(0)}</p>
                                </div>
                                <span className="font-black text-slate-900">₹{(item.price * item.quantity).toFixed(0)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Status management block */}
                      <div className="border-t border-slate-100 pt-6 mt-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-black text-slate-900 uppercase tracking-widest">Update Status:</span>
                          <select
                            value={viewingOrder.status}
                            onChange={(e) => handleUpdateOrderStatus(viewingOrder.id, e.target.value as OrderStatus)}
                            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:border-primary-green outline-hidden cursor-pointer"
                          >
                            <option value="pending">Pending</option>
                            <option value="processing">Processing</option>
                            <option value="delivered">Delivered</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </div>
                        
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              // Share/resend to whatsapp
                              let txt = `*Order Status Update: ${viewingOrder.id}*\n`;
                              txt += `Status has been updated to: *${viewingOrder.status.toUpperCase()}*`;
                              window.open(`https://wa.me/${viewingOrder.customer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(txt)}`, '_blank');
                            }}
                            className="bg-slate-900 text-white text-xs font-black uppercase tracking-widest px-5 py-3.5 rounded-xl hover:bg-slate-800 transition-all flex items-center gap-2"
                          >
                            <Send className="w-3.5 h-3.5" /> Share Update
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Inventory Tab */}
            {adminTab === 'products' && (
              <div className="grid lg:grid-cols-12 gap-8">
                {/* Form column */}
                <div className="lg:col-span-4 bg-white border border-slate-200 rounded-[24px] p-6 shadow-xs h-fit">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black text-slate-900 text-base">{editingProduct ? 'Edit Item' : 'New Product'}</h3>
                    {editingProduct && (
                      <button onClick={() => setEditingProduct(null)} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600">
                        Cancel
                      </button>
                    )}
                  </div>

                  <ProductForm 
                    key={editingProduct?.id || 'new'}
                    onAdd={addProduct} 
                    onUpdate={(p) => editingProduct && updateProduct(editingProduct.id, p)}
                    initialData={editingProduct || undefined}
                    availableCategories={categories.filter(c => c !== 'All Products')}
                    availableUnits={units}
                    onAddNewCategory={(cat) => updateCustomCategories([cat])}
                    onAddNewUnit={(u) => updateCustomUnits([u])}
                  />
                </div>

                {/* Listing column */}
                <div className="lg:col-span-8 bg-white border border-slate-200 rounded-[24px] overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-black text-slate-900 text-base">Active Products</h3>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">↕ Drag to reorder position</span>
                  </div>

                  <div className="divide-y divide-slate-100 overflow-y-auto no-scrollbar max-h-[600px]">
                    {products.length === 0 ? (
                      <p className="text-center py-12 italic text-slate-400 text-sm">No items in shop inventory.</p>
                    ) : (
                      products.map((p, idx) => (
                        <div
                          key={p.id}
                          className={[
                            'drag-item p-4 flex items-center gap-3 hover:bg-slate-50',
                            dragProdRef.current === idx ? 'dragging' : '',
                            dragOverProdIndex === idx && dragProdRef.current !== null && dragProdRef.current !== idx
                              ? (dragProdRef.current > idx ? 'drag-over-top' : 'drag-over-bottom')
                              : ''
                          ].join(' ')}
                          draggable
                          onDragStart={(e) => onProdDragStart(idx, e)}
                          onDragOver={(e) => onProdDragOver(idx, e)}
                          onDrop={() => onProdDrop(idx)}
                          onDragEnd={onProdDragEnd}
                        >
                          {/* Drag Handle */}
                          <div className="drag-handle flex flex-col items-center shrink-0 p-1.5 rounded-lg text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 transition-all">
                            <GripVertical className="w-5 h-5" />
                            <span className="text-[8px] font-black select-none leading-none mt-0.5">{idx + 1}</span>
                          </div>

                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-xl overflow-hidden flex items-center justify-center shrink-0">
                              {p.image ? (
                                <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                              ) : (
                                <ImageIcon className="w-5 h-5 text-slate-300" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <span className="text-[8px] font-black text-primary-green uppercase tracking-wider block mb-0.5">{p.category}</span>
                              <h4 className="font-bold text-slate-900 text-sm uppercase truncate">{p.name}</h4>
                              <p className="text-[10px] text-slate-400 font-semibold">
                                {p.variants && p.variants.length > 0 
                                  ? `${p.variants.length} Sizes (e.g. ${p.variants[0].name})` 
                                  : p.unit} • ₹{p.price}
                              </p>
                            </div>
                          </div>

                          <div className="flex gap-1.5 shrink-0">
                            <button
                              onClick={() => { setEditingProduct(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                              className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all border border-transparent hover:border-emerald-100"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteProduct(p.id)}
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Categories Tab */}
            {adminTab === 'categories' && (
              <div className="grid lg:grid-cols-12 gap-8">
                {/* Form column */}
                <div className="lg:col-span-4 bg-white border border-slate-200 rounded-[24px] p-6 shadow-xs h-fit">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black text-slate-900 text-base">{editingCategory ? 'Edit Category' : 'New Category'}</h3>
                    {editingCategory && (
                      <button onClick={() => setEditingCategory(null)} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600">
                        Cancel
                      </button>
                    )}
                  </div>

                  <CategoryForm 
                    key={editingCategory?.id || 'new'}
                    onAdd={addCategory}
                    onUpdate={(c) => editingCategory && updateCategory(editingCategory.id, c)}
                    initialData={editingCategory || undefined}
                    nextOrder={categoryItems.length}
                  />
                </div>

                {/* Listing column */}
                <div className="lg:col-span-8 bg-white border border-slate-200 rounded-[24px] overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <h3 className="font-black text-slate-900 text-base">Categories</h3>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">↕ Reorder</span>
                    </div>
                    <div className="flex gap-4">
                      <button onClick={syncCategories} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600">
                        Sync
                      </button>
                      <button onClick={() => seedCategories()} className="text-[10px] font-black text-primary-green uppercase tracking-widest hover:underline">
                        Seed Defaults
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100 overflow-y-auto no-scrollbar max-h-[600px]">
                    {categoryItems.length === 0 ? (
                      <p className="text-center py-12 italic text-slate-400 text-sm">No categories registered.</p>
                    ) : (
                      categoryItems.map((cat, idx) => (
                        <div
                          key={cat.id}
                          className={[
                            'drag-item p-4 flex items-center gap-3 hover:bg-slate-50',
                            dragCatRef.current === idx ? 'dragging' : '',
                            dragOverCatIndex === idx && dragCatRef.current !== null && dragCatRef.current !== idx
                              ? (dragCatRef.current > idx ? 'drag-over-top' : 'drag-over-bottom')
                              : ''
                          ].join(' ')}
                          draggable
                          onDragStart={(e) => onCatDragStart(idx, e)}
                          onDragOver={(e) => onCatDragOver(idx, e)}
                          onDrop={() => onCatDrop(idx)}
                          onDragEnd={onCatDragEnd}
                        >
                          {/* Drag Handle */}
                          <div className="drag-handle flex flex-col items-center shrink-0 p-1.5 rounded-lg text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 transition-all">
                            <GripVertical className="w-5 h-5" />
                            <span className="text-[8px] font-black select-none leading-none mt-0.5">{idx + 1}</span>
                          </div>

                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-xl overflow-hidden flex items-center justify-center shrink-0">
                              {cat.image ? (
                                <img src={cat.image} alt={cat.name} className="w-full h-full object-cover" />
                              ) : (
                                <ImageIcon className="w-5 h-5 text-slate-300" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-bold text-slate-900 text-sm uppercase truncate">{cat.name}</h4>
                              <p className="text-xs text-slate-500 font-semibold">{cat.gujaratiName || 'No Gujarati translation'}</p>
                            </div>
                          </div>

                          <div className="flex gap-1.5 shrink-0">
                            <button
                              onClick={() => { setEditingCategory(cat); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                              className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all border border-transparent hover:border-emerald-100"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteCategory(cat.id)}
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Shop QR Tab */}
            {adminTab === 'qr' && (
              <div className="bg-white border border-slate-200 rounded-[24px] p-8 text-center max-w-xl mx-auto shadow-xs">
                <div className="mb-6">
                  <span className="tag bg-emerald-100 text-emerald-800 mb-2 inline-block">Counter Setup</span>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Counter Order QR</h3>
                  <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">Place this QR at your shop counter. Customers can scan to load the mobile storefront instantly.</p>
                </div>

                <div className="inline-block p-6 bg-white border-2 border-dashed border-emerald-100 rounded-[28px] shadow-sm mb-6">
                  <QRCodeSVG value={qrValue} size={200} level="H" includeMargin={true} />
                </div>

                <div className="text-left space-y-4 max-w-sm mx-auto">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block pl-1">Target Redirect URL</label>
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-emerald-500 shrink-0" />
                      <input
                        type="text"
                        value={qrValue}
                        onChange={(e) => updateQrValue(e.target.value)}
                        placeholder="https://..."
                        className="w-full bg-transparent text-xs font-bold text-slate-800 border-none focus:ring-0 p-0 outline-hidden"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Settings Tab */}
            {adminTab === 'settings' && (
              <div className="bg-white border border-slate-200 rounded-[24px] p-6 max-w-xl mx-auto">
                <h3 className="font-black text-slate-900 text-lg mb-6">General Store Settings</h3>
                
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    saveSettings({
                      shopName: fd.get('shopName') as string,
                      tagline: fd.get('tagline') as string,
                      mobile: fd.get('mobile') as string,
                      whatsapp: fd.get('whatsapp') as string,
                      address: fd.get('address') as string,
                      announcementText: fd.get('announcementText') as string,
                      defaultTheme: fd.get('defaultTheme') as 'light' | 'dark' | 'system',
                      festivalThemeActive: fd.get('festivalThemeActive') as 'none' | 'diwali' | 'navratri' | 'new_year',
                    });
                  }}
                  className="space-y-4"
                >
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Store Name</label>
                      <input required type="text" name="shopName" defaultValue={shopSettings.shopName} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:border-primary-green outline-hidden" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Tagline/Type</label>
                      <input required type="text" name="tagline" defaultValue={shopSettings.tagline} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:border-primary-green outline-hidden" />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Display Phone / ફોન નંબર</label>
                      <input required type="text" name="mobile" defaultValue={shopSettings.mobile} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:border-primary-green outline-hidden" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">WhatsApp Order Number / વોટ્સએપ ઓર્ડર નંબર</label>
                      <input required type="text" name="whatsapp" defaultValue={shopSettings.whatsapp} placeholder="Country code + number (91972455778)" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:border-primary-green outline-hidden" />
                      <span className="text-[10px] text-slate-400 block pl-1">ઓર્ડર મોકલવા માટેનો મોબાઈલ નંબર અહીંથી બદલો (ઉદાહરણ: 91972455778)</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Physical Store Address / દુકાનનું સરનામું</label>
                    <textarea required name="address" defaultValue={shopSettings.address} rows={3} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:border-primary-green outline-hidden resize-none" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Scrolling Announcement Text / પટ્ટી માં ચાલતું લખાણ</label>
                    <input required type="text" name="announcementText" defaultValue={shopSettings.announcementText || ""} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:border-primary-green outline-hidden" />
                    <span className="text-[10px] text-slate-400 block pl-1">હોમ પેજ પર ચાલતી પટ્ટીમાં જે લખાણ બતાવવું હોય તે અહીં લખો.</span>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Default Shop Theme / ડિફોલ્ટ શોપ થીમ</label>
                      <select name="defaultTheme" defaultValue={shopSettings.defaultTheme || 'system'} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:border-primary-green outline-hidden">
                        <option value="light">Light Mode / લાઈટ મોડ ☀️</option>
                        <option value="dark">Dark Mode / ડાર્ક મોડ 🌙</option>
                        <option value="system">System Match / સિસ્ટમ મુજબ 🖥️</option>
                      </select>
                      <span className="text-[10px] text-slate-400 block pl-1">નવા ગ્રાહકો માટે ડિફોલ્ટ થીમ સેટ કરો.</span>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Festival Branding Override / તહેવારની થીમ</label>
                      <select name="festivalThemeActive" defaultValue={shopSettings.festivalThemeActive || 'none'} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:border-primary-green outline-hidden">
                        <option value="none">None / સામાન્ય થીમ 🛍️</option>
                        <option value="diwali">Diwali / દિવાળી ઉત્સવ 🪔</option>
                        <option value="navratri">Navratri / નવરાત્રી ઉત્સવ 💃</option>
                        <option value="new_year">New Year / નવું વર્ષ ✨</option>
                      </select>
                      <span className="text-[10px] text-slate-400 block pl-1">આખી વેબસાઈટ પર તહેવારની રંગપદ્ધતિ ચાલુ કરો.</span>
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    type="submit"
                    className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg mt-4"
                  >
                    Save Store Settings
                  </motion.button>
                </form>

                <div className="border-t border-slate-100 my-8"></div>

                <div className="space-y-4">
                  <h4 className="font-black text-slate-900 text-md flex items-center gap-2">
                    <Database className="w-5 h-5 text-emerald-600" />
                    Backup & Restore / ડેટા બેકઅપ અને રીસ્ટોર
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed pl-1">
                    Download all products, categories, orders, and settings as a file to prevent data loss. You can upload it here to restore everything if the app is reset.
                    <br />
                    ડેટા ગુમાવવાથી બચવા માટે તમામ પ્રોડક્ટ્સ, કેટેગરીઝ, ઓર્ડર્સ અને સેટિંગ્સને ફાઈલ તરીકે ડાઉનલોડ કરો. જો એપ્લિકેશન રીસેટ થઈ જાય તો બધું પુનઃસ્થાપિત કરવા માટે તમે તેને અહીં અપલોડ કરી શકો છો.
                  </p>

                  <div className="grid sm:grid-cols-2 gap-4 pt-2">
                    {/* Download Button */}
                    <button
                      type="button"
                      onClick={handleDownloadBackup}
                      className="flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 py-3.5 px-4 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all"
                    >
                      <Download className="w-4 h-4" />
                      <div>
                        Download Backup
                        <span className="block text-[9px] font-normal lowercase">(ડાઉનલોડ બેકઅપ)</span>
                      </div>
                    </button>

                    {/* Upload / Restore Button */}
                    <label className="flex items-center justify-center gap-2 bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 py-3.5 px-4 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer text-center">
                      <Upload className="w-4 h-4" />
                      <div>
                        Upload Backup
                        <span className="block text-[9px] font-normal lowercase">(અપલોડ બેકઅપ)</span>
                      </div>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleUploadBackup}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* AI Assistant Settings and Analytics Tab */}
            {adminTab === 'ai_assistant' && (
              <div className="space-y-6 max-w-4xl mx-auto">
                <div className="bg-white border border-slate-200 rounded-[24px] p-6">
                  <h3 className="font-black text-slate-900 text-lg mb-6 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-500" />
                    AI Grocery Assistant Settings
                  </h3>
                  
                  <form 
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      const updatedSettings = {
                        ...shopSettings,
                        aiEnabled: fd.get('aiEnabled') === 'true',
                        aiModelName: fd.get('aiModelName') as string,
                        aiPromptTemplate: fd.get('aiPromptTemplate') as string,
                        aiApiKey: fd.get('aiApiKey') as string,
                      };
                      await saveSettings(updatedSettings);
                    }}
                    className="space-y-4"
                  >
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Enable AI Chatbot / એઆઈ મદદગાર ચાલુ કરો</label>
                        <select name="aiEnabled" defaultValue={String(shopSettings.aiEnabled ?? true)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:border-primary-green outline-hidden">
                          <option value="true">Enabled / ચાલુ</option>
                          <option value="false">Disabled / બંધ</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">AI Model Name / એઆઈ મોડલ</label>
                        <select name="aiModelName" defaultValue={shopSettings.aiModelName || 'gemini-2.5-flash'} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:border-primary-green outline-hidden">
                          <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recommended)</option>
                          <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Gemini API Key Override (Optional) / એપીઆઈ કી</label>
                      <input type="password" name="aiApiKey" defaultValue={shopSettings.aiApiKey || ''} placeholder="Leave blank to use environment default GEMINI_API_KEY" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:border-primary-green outline-hidden" />
                      <span className="text-[10px] text-slate-400 block pl-1">જો ખાલી રાખશો, તો સર્વર તેના પોતાના ડિફોલ્ટ એન્વાયરમેન્ટ કીનો ઉપયોગ કરશે.</span>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Custom System Instructions / કસ્ટમ સૂચનાઓ (Prompt)</label>
                      <textarea name="aiPromptTemplate" defaultValue={shopSettings.aiPromptTemplate || ''} rows={6} placeholder="Describe store rules, specialized recipe ingredients, promo contexts, etc. If left blank, default grocery instructions will be used." className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:border-primary-green outline-hidden resize-none" />
                      <span className="text-[10px] text-slate-400 block pl-1">એઆઈ આસિસ્ટન્ટને વર્તન અને પ્રી-સેટ જવાબો કસ્ટમાઇઝ કરવા માટે સૂચનાઓ આપો.</span>
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      type="submit"
                      className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg mt-4"
                    >
                      Save AI Settings
                    </motion.button>
                  </form>
                </div>

                {/* Analytics Section */}
                <div className="bg-white border border-slate-200 rounded-[24px] p-6 space-y-4">
                  <h3 className="font-black text-slate-900 text-md flex items-center gap-2">
                    <Bot className="w-5 h-5 text-indigo-600" />
                    AI Assistant Chat Analytics / ચેટ વિશ્લેષણ
                  </h3>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                      <span className="text-slate-400 text-[10px] font-black uppercase tracking-wider block">Total Questions</span>
                      <span className="text-2xl font-black text-slate-900">{aiChatLogs.length}</span>
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                      <span className="text-slate-400 text-[10px] font-black uppercase tracking-wider block">Matched Products</span>
                      <span className="text-2xl font-black text-emerald-600">
                        {aiChatLogs.filter(log => log.status === 'success').length}
                      </span>
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                      <span className="text-slate-400 text-[10px] font-black uppercase tracking-wider block">Failed / General Queries</span>
                      <span className="text-2xl font-black text-amber-500">
                        {aiChatLogs.filter(log => log.status === 'failed').length}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Recent Chat Log Interactions</h4>
                    
                    {aiChatLogs.length === 0 ? (
                      <p className="text-xs text-slate-400 italic pl-1">No AI chat queries logged yet.</p>
                    ) : (
                      <div className="max-h-[300px] overflow-y-auto space-y-3 pr-1">
                        {aiChatLogs.map((log) => (
                          <div key={log.id} className="border border-slate-150 rounded-2xl p-4 bg-slate-50/50 hover:bg-slate-50 transition-all space-y-2">
                            <div className="flex justify-between items-start gap-2">
                              <span className="text-xs font-black text-slate-800 bg-white border border-slate-200 px-3 py-1 rounded-full flex items-center gap-1">
                                <User className="w-3 h-3 text-slate-400" />
                                User: "{log.query}"
                              </span>
                              <span className="text-[9px] font-bold text-slate-400 shrink-0 mt-1">
                                {new Date(log.timestamp).toLocaleString()}
                              </span>
                            </div>
                            <div className="text-xs text-slate-600 leading-relaxed bg-white border border-slate-150 p-3 rounded-xl">
                              <span className="font-extrabold text-indigo-600 flex items-center gap-1 mb-1">
                                <Bot className="w-3.5 h-3.5" /> AI Response:
                              </span>
                              {log.responseMessage}
                            </div>
                            {log.recommendedProductIds && log.recommendedProductIds.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 items-center pt-1">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Recommended:</span>
                                {log.recommendedProductIds.map((pId: string) => {
                                  const prod = products.find(p => p.id === pId);
                                  return (
                                    <span key={pId} className="text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-md">
                                      {prod?.name || pId}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Banners Tab */}
            {adminTab === 'banners' && (
              <div className="grid lg:grid-cols-12 gap-8">
                {/* Form column */}
                <div className="lg:col-span-4 bg-white border border-slate-200 rounded-[24px] p-6 shadow-xs h-fit">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black text-slate-900 text-base">{editingBanner ? 'Edit Banner' : 'New Ad Banner'}</h3>
                    {editingBanner && (
                      <button onClick={() => setEditingBanner(null)} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600">
                        Cancel
                      </button>
                    )}
                  </div>

                  <BannerForm 
                    key={editingBanner?.id || 'new'}
                    onAdd={addBanner} 
                    onUpdate={(b) => editingBanner && updateBanner(editingBanner.id, b)}
                    initialData={editingBanner || undefined}
                    availableCategories={categories.filter(c => c !== 'All Products')}
                  />
                </div>

                {/* Listing column */}
                <div className="lg:col-span-8 bg-white border border-slate-200 rounded-[24px] overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-black text-slate-900 text-base">Active Ad Banners</h3>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{banners.length} Banners</span>
                  </div>

                  <div className="divide-y divide-slate-100 overflow-y-auto no-scrollbar max-h-[600px]">
                    {banners.length === 0 ? (
                      <p className="text-center py-12 italic text-slate-400 text-sm">No banners created yet.</p>
                    ) : (
                      banners.map(b => (
                        <div key={b.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-all gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-20 h-10 bg-slate-50 border border-slate-100 rounded-lg overflow-hidden flex items-center justify-center shrink-0">
                              {b.imageUrl ? (
                                <img src={b.imageUrl} alt={b.title || 'Banner'} className="w-full h-full object-cover" />
                              ) : (
                                <ImageIcon className="w-5 h-5 text-slate-300" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-bold text-slate-900 text-sm truncate">{b.title || 'No Title'}</h4>
                              <div className="flex gap-2 items-center mt-0.5">
                                {b.linkUrl && (
                                  <span className="text-[8px] font-black text-primary-green uppercase tracking-wider bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                    Links to: {b.linkUrl}
                                  </span>
                                )}
                                <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${b.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                                  {b.isActive ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-1.5 shrink-0 items-center">
                            <button
                              onClick={() => {
                                // Toggle active status
                                const updated = { ...b, isActive: !b.isActive };
                                updateBanner(b.id, updated);
                              }}
                              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${b.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                            >
                              {b.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              onClick={() => { setEditingBanner(b); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                              className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all border border-transparent hover:border-emerald-100"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteBanner(b.id)}
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Coupons Tab */}
            {adminTab === 'coupons' && (
              <AdminCouponsPanel
                coupons={coupons}
                couponUsages={couponUsages}
                onAdd={addCoupon}
                onUpdate={updateCoupon}
                onDelete={deleteCoupon}
                availableCategories={categoryItems.map(c => c.name)}
                editingCoupon={editingCoupon}
                setEditingCoupon={setEditingCoupon}
                showToast={showToast}
              />
            )}

            {/* Voice Search Analytics Tab */}
            {adminTab === 'voice' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="admin-stat-card">
                    <span className="text-slate-400 text-[10px] font-black uppercase tracking-wider">Total Voice Searches</span>
                    <span className="text-2xl font-black text-slate-900">{voiceSearchAnalytics.length}</span>
                  </div>
                  <div className="admin-stat-card">
                    <span className="text-slate-400 text-[10px] font-black uppercase tracking-wider">Success Rate</span>
                    <span className="text-2xl font-black text-emerald-600">
                      {voiceSearchAnalytics.length > 0 
                        ? `${(voiceSearchAnalytics.filter(v => v.status === 'success').length / voiceSearchAnalytics.length * 100).toFixed(0)}%`
                        : '0%'
                      }
                    </span>
                  </div>
                  <div className="admin-stat-card">
                    <span className="text-slate-400 text-[10px] font-black uppercase tracking-wider">Successful Searches</span>
                    <span className="text-2xl font-black text-emerald-500">
                      {voiceSearchAnalytics.filter(v => v.status === 'success').length}
                    </span>
                  </div>
                  <div className="admin-stat-card">
                    <span className="text-slate-400 text-[10px] font-black uppercase tracking-wider">Failed (No Match)</span>
                    <span className="text-2xl font-black text-rose-500">
                      {voiceSearchAnalytics.filter(v => v.status === 'failed').length}
                    </span>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Popular Spoken Products */}
                  <div className="bg-white border border-slate-200 rounded-[24px] p-6 shadow-xs">
                    <h4 className="font-extrabold text-slate-900 text-sm mb-4 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                      <span>Most Spoken Products / લોકપ્રિય પ્રોડક્ટ્સ</span>
                    </h4>
                    <div className="space-y-3">
                      {popularProducts.length === 0 ? (
                        <p className="text-xs italic text-slate-400 py-6 text-center">No product matches yet.</p>
                      ) : (
                        popularProducts.map((p, idx) => (
                          <div key={p.product} className="flex justify-between items-center text-xs">
                            <span className="font-semibold text-slate-600 uppercase flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center font-bold text-[10px] text-slate-500">{idx + 1}</span>
                              {p.product}
                            </span>
                            <span className="font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">{p.count} searches</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Failed Voice Searches (Opportunities) */}
                  <div className="bg-white border border-slate-200 rounded-[24px] p-6 shadow-xs flex flex-col justify-between">
                    <div>
                      <h4 className="font-extrabold text-slate-900 text-sm mb-4 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-500" />
                        <span>Failed Searches / વણઉકેલાયેલી પૂછપરછ</span>
                      </h4>
                      <div className="space-y-3 max-h-[220px] overflow-y-auto no-scrollbar">
                        {voiceSearchAnalytics.filter(v => v.status === 'failed').length === 0 ? (
                          <p className="text-xs italic text-slate-400 py-6 text-center">No failed searches recorded! Perfect matching.</p>
                        ) : (
                          voiceSearchAnalytics.filter(v => v.status === 'failed').slice(0, 7).map(v => (
                            <div key={v.id} className="flex justify-between items-center text-xs py-1 border-b border-slate-55">
                              <span className="font-semibold text-slate-600 truncate mr-2">“{v.query}”</span>
                              <span className="text-[10px] bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full font-bold">Failed</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="border-t border-slate-100 pt-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider text-center mt-4">
                      💡 Tip: Add these as alternate pronunciations to matching products to improve search accuracy.
                    </div>
                  </div>
                </div>

                {/* Recent Voice Searches Table */}
                <div className="bg-white border border-slate-200 rounded-[24px] overflow-hidden shadow-xs">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-black text-slate-900 text-base">Recent Voice Searches</h3>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{voiceSearchAnalytics.length} total requests</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left admin-table border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                          <th className="p-4">Timestamp</th>
                          <th className="p-4">Spoken Query</th>
                          <th className="p-4">Extracted Intent</th>
                          <th className="p-4">Lang</th>
                          <th className="p-4">Match Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {voiceSearchAnalytics.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-8 text-center italic text-slate-400">No voice search logs found.</td>
                          </tr>
                        ) : (
                          voiceSearchAnalytics.slice(0, 20).map(log => (
                            <tr key={log.id} className="hover:bg-slate-50">
                              <td className="p-4 text-slate-500 font-semibold">{new Date(log.timestamp).toLocaleString()}</td>
                              <td className="p-4 font-bold text-slate-800">“{log.query}”</td>
                              <td className="p-4 text-slate-600">
                                {log.extractedProduct ? (
                                  <span className="inline-flex flex-col">
                                    <span className="font-bold text-slate-800 uppercase">{log.extractedProduct}</span>
                                    {log.extractedQuantity && (
                                      <span className="text-[10px] text-slate-400">Qty: {log.extractedQuantity} {log.extractedUnit}</span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-slate-300 italic">None</span>
                                )}
                              </td>
                              <td className="p-4 font-bold uppercase text-slate-500">{log.language}</td>
                              <td className="p-4">
                                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${log.status === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                  {log.status === 'success' ? 'Match Successful' : 'No Match'}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

          </div>
        </>
      )}
    </div>
  );

  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef('');

  const handleSendChatMessage = async (textToSend?: string) => {
    const text = (textToSend ?? chatInput).trim();
    if (!text) return;

    const userMsg = {
      id: `msg-${Date.now()}-user`,
      sender: 'user' as const,
      text,
      timestamp: new Date().toISOString()
    };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);

    try {
      const history = chatMessages.slice(-10).map(m => ({
        role: m.sender,
        text: m.text
      }));

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history })
      });

      if (!res.ok) {
        throw new Error('સર્વર સાથે જોડાણ થઈ શક્યું નથી.');
      }

      const data = await res.json();
      
      const botMsg = {
        id: `msg-${Date.now()}-bot`,
        sender: 'assistant' as const,
        text: data.message,
        products: data.products || [],
        timestamp: new Date().toISOString()
      };

      setChatMessages(prev => [...prev, botMsg]);
    } catch (err) {
      console.error("AI chat error:", err);
      const errorMsg = {
        id: `msg-${Date.now()}-err`,
        sender: 'assistant' as const,
        text: 'માફ કરશો, એઆઈ સર્વરમાં કોઈ ખામી સર્જાઈ છે. કૃપા કરીને થોડીવાર પછી ફરી પ્રયત્ન કરો.',
        timestamp: new Date().toISOString()
      };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setChatLoading(false);
    }
  };

  const startChatVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast('Speech recognition not supported / વોઈસ ઇનપુટ ઉપલબ્ધ નથી', 'error');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'gu-IN';

    recognition.onstart = () => {
      setChatSpeechListening(true);
    };

    recognition.onresult = (event: any) => {
      const resultText = event.results[0][0].transcript;
      setChatInput(resultText);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setChatSpeechListening(false);
    };

    recognition.onend = () => {
      setChatSpeechListening(false);
    };

    recognition.start();
  };

  const startVoiceSearch = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceErrorText('Speech recognition not supported on this browser.');
      showToast('Speech recognition not supported / વોઈસ સર્ચ ઉપલબ્ધ નથી', 'error');
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.continuous = false;
    recognition.interimResults = true;

    // Use gu-IN for bilingual (Gujarati & English) recognition
    recognition.lang = 'gu-IN';

    recognition.onstart = () => {
      setVoiceListening(true);
      setVoiceTranscript('');
      transcriptRef.current = '';
      setVoiceErrorText('');
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const activeText = finalTranscript || interimTranscript;
      setVoiceTranscript(activeText);
      transcriptRef.current = activeText;
      
      // Update the search query inline in real-time
      setSearchQuery(activeText);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'no-speech') {
        setVoiceErrorText('Could not hear properly. Try again. / સરખી રીતે સંભળાયું નથી. ફરી બોલો.');
      } else if (event.error === 'not-allowed') {
        setVoiceErrorText('Microphone permission blocked. Please enable it. / માઈક્રોફોન પરમિશન બ્લોક છે.');
      } else {
        setVoiceErrorText('Try again / ફરી પ્રયાસ કરો');
      }
      setVoiceListening(false);
    };

    recognition.onend = () => {
      setVoiceListening(false);
      if (transcriptRef.current.trim()) {
        handleVoiceSearchComplete(transcriptRef.current);
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.error('Failed to start speech recognition:', e);
      setVoiceErrorText('Could not access microphone.');
    }
  };

  const stopVoiceSearch = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    setVoiceListening(false);
  };

  const GUJARATI_TO_ENGLISH_MAP: Record<string, string> = {
    'મિલ્ક': 'milk',
    'સુગર': 'sugar',
    'બટર': 'butter',
    'ચીઝ': 'cheese',
    'કોલ્ડ્રિંક': 'cold drink',
    'કોલ્ડ્રિંક્સ': 'cold drinks',
    'બિસ્કિટ': 'biscuit',
    'બિસ્કીટ': 'biscuit',
    'કોફી': 'coffee',
    'બ્રેડ': 'bread',
    'પાવડર': 'powder',
    'સાબુ': 'soap',
    'શેમ્પૂ': 'shampoo',
    'ડ્રાય ફ્રૂટ્સ': 'dry fruits',
    'નાસ્તો': 'snacks',
    'તેલ': 'oil',
    'ઘી': 'ghee',
    'ચોખા': 'rice',
    'ચા': 'tea',
    'ખાંડ': 'sugar',
    'દૂધ': 'milk',
    'અથાણું': 'pickle',
    'પાપડ': 'papad',
    'બદામ': 'almond',
    'કાજુ': 'cashew',
    'દ્રાક્ષ': 'raisin',
    'મસાલા': 'masala',
    'હળદર': 'haldar',
    'નમકીન': 'namkeen'
  };

  const handleVoiceSearchComplete = async (transcriptText: string) => {
    if (!transcriptText.trim()) return;

    const { product, quantity, unit } = parseVoiceIntent(transcriptText);

    // Map Gujarati terms/phonetic sounds to English and query both
    let searchTerms = [product];
    const trimmedProduct = product.trim().toLowerCase();
    for (const [guj, eng] of Object.entries(GUJARATI_TO_ENGLISH_MAP)) {
      if (trimmedProduct.includes(guj)) {
        searchTerms.push(eng);
      }
    }
    const finalSearchQuery = searchTerms.join(' + ');

    const intent: VoiceIntent = { product, quantity, unit };
    setVoiceIntent(intent);

    setSearchQuery(finalSearchQuery);
    setSelectedCategory(null);

    const queryStr = transcriptText.trim();
    setVoiceSearchHistory(prev => {
      const updated = [queryStr, ...prev.filter(item => item !== queryStr)].slice(0, 5);
      localStorage.setItem('voiceSearchHistory', JSON.stringify(updated));
      return updated;
    });

    const normalizedQuery = product.toLowerCase();
    const hasMatch = products.some(p => 
      p.name.toLowerCase().includes(normalizedQuery) ||
      p.category.toLowerCase().includes(normalizedQuery) ||
      (p.gujaratiName && p.gujaratiName.toLowerCase().includes(normalizedQuery)) ||
      (p.hindiName && p.hindiName.toLowerCase().includes(normalizedQuery)) ||
      (p.voiceKeywords && p.voiceKeywords.some(kw => kw.toLowerCase().includes(normalizedQuery)))
    );

    const newRecord: VoiceSearchRecord = {
      id: `voice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      query: queryStr,
      extractedProduct: product,
      extractedQuantity: quantity,
      extractedUnit: unit,
      timestamp: new Date().toISOString(),
      status: hasMatch ? 'success' : 'failed',
      language: 'gu'
    };

    try {
      await setDoc(doc(db, 'voiceSearches', newRecord.id), newRecord);
    } catch (e) {
      console.error('Failed to log voice search analytic:', e);
    }
  };

  return (
    <div className="min-h-screen bg-bg-page">
      <div className="max-w-7xl mx-auto px-4 py-6">
        
        {/* Responsive Navbar - Professional Mobile Header */}
        <header className="flex items-center justify-between px-1 py-3 mb-1 gap-2">
          {/* Left: Logo + Shop Name */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2.5 cursor-pointer min-w-0 flex-1"
            onClick={() => navigate('/')}
          >
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary-green rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-primary-green/20 shrink-0">
              <ShoppingCart className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight leading-tight truncate">
                {shopSettings.shopName}
              </h1>
              <p className="text-[9px] sm:text-xs text-slate-400 font-bold uppercase tracking-widest truncate">
                {shopSettings.tagline}
              </p>
            </div>
          </motion.div>

          {/* Right: Action Buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {isAdminView && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/')}
                className="flex items-center gap-1.5 px-3 sm:px-6 py-2 sm:py-2.5 rounded-full text-[10px] sm:text-xs font-black shadow-xs transition-all border-2 bg-white text-emerald-600 border-emerald-600 hover:bg-emerald-50"
              >
                <Store className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">View Customer Shop</span>
                <span className="sm:hidden">Shop</span>
              </motion.button>
            )}
            {!isAdminView && (
              <>
                {/* Cart Icon */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleCartClick}
                  className="relative p-2 sm:p-2.5 bg-white border border-slate-200 rounded-full text-slate-600 hover:text-emerald-600 hover:border-emerald-100 hover:bg-emerald-50/30 transition-all cursor-pointer shadow-xs shrink-0"
                >
                  <ShoppingCart className="w-[18px] h-[18px] sm:w-5 sm:h-5" />
                  {cart.length > 0 && (
                    <span className="absolute -top-1 -right-1 sm:-top-1.5 sm:-right-1.5 bg-red-500 text-white text-[8px] sm:text-[9px] font-black w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center border-2 border-white shadow-xs font-mono">
                      {cart.reduce((sum, item) => sum + item.quantity, 0)}
                    </span>
                  )}
                </motion.button>

                {/* Account Button */}
                {customerUser ? (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate('/account')}
                    className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-full text-[10px] sm:text-xs font-black transition-all bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100/50 max-w-[140px] sm:max-w-none"
                  >
                    {customerProfile?.profileImage ? (
                      <img 
                        src={customerProfile.profileImage} 
                        alt="Profile" 
                        className="w-5 h-5 sm:w-6 sm:h-6 rounded-full object-cover shrink-0 border border-emerald-250" 
                      />
                    ) : (
                      <User className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-emerald-650 shrink-0" />
                    )}
                    <span className="truncate hidden sm:inline">{customerProfile?.name || customerUser.displayName || 'My Account'}</span>
                  </motion.button>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowAuthModal(true)}
                    className="flex items-center gap-1.5 px-3 sm:px-5 py-2 sm:py-2.5 rounded-full text-[10px] sm:text-xs font-black transition-all bg-emerald-600 text-white shadow-md hover:bg-[#00884F]"
                  >
                    <UserPlus className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                    <span className="hidden sm:inline">Login / લૉગિન</span>
                    <span className="sm:hidden">Login</span>
                  </motion.button>
                )}
              </>
            )}
          </div>
        </header>

        {/* Offline Banner */}
        <AnimatePresence>
          {!isOnline && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-rose-600 dark:bg-rose-700 text-white text-xs font-black text-center py-3 px-4 flex items-center justify-center gap-2 shadow-inner shrink-0 z-50 rounded-2xl mb-4"
            >
              <WifiOff className="w-4 h-4 text-white animate-pulse" />
              <span>તમે ઓફલાઇન છો - ઇન્ટરનેટ કનેક્શન તપાસો / You are offline - check connection</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Custom Install App Promo Prompt */}
        <AnimatePresence>
          {showInstallPrompt && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="bg-slate-900 dark:bg-slate-950 text-white rounded-[24px] p-4.5 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 border border-slate-800 shadow-xl"
            >
              <div className="flex items-center gap-3.5 text-left w-full">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center shrink-0">
                  <Store className="w-6 h-6 text-emerald-450" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm leading-tight text-white flex items-center gap-1.5">
                    GGM&S Grocery App
                    <span className="text-[8px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">Fast & Offline</span>
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-1 leading-normal">હોમ સ્ક્રીન પર એપ ડાઉનલોડ કરો / Install for the best mobile experience</p>
                </div>
              </div>
              <div className="flex gap-2.5 w-full sm:w-auto shrink-0 justify-end">
                <button
                  type="button"
                  onClick={() => setShowInstallPrompt(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-400 hover:text-white transition-colors cursor-pointer border-none bg-transparent"
                >
                  નહિ, આભાર / Dismiss
                </button>
                <button
                  type="button"
                  onClick={handleInstallApp}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border-none shadow-md"
                >
                  ડાઉનલોડ કરો / Install
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* View Routing */}
        <AnimatePresence mode="wait">
          <Routes>
            {/* Admin View Routes */}
            <Route path="/admin/*" element={
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="pb-16"
              >
                {renderAdminContent()}
              </motion.div>
            } />

            {/* Product Detail view route */}
            <Route path="/product/:id" element={
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="pb-16"
              >
                <ProductDetailPageWrapper products={products} addToCart={addToCart} onViewProduct={addRecentlyViewed} />
              </motion.div>
            } />

            {/* Customer Account Dashboard route */}
            <Route path="/account" element={
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="pb-16"
              >
                {customerUser ? (
                  <MyAccountPage 
                    customerUser={customerUser}
                    customerProfile={customerProfile}
                    setCustomerProfile={setCustomerProfile}
                    showToast={showToast}
                    products={products}
                    onAdd={addToCart}
                    onLogout={handleCustomerLogout}
                    cart={cart}
                    setCart={setCart}
                    cartTotal={cartTotal}
                    updateCartQuantity={updateCartQuantity}
                    shopSettings={shopSettings}
                    preferredTheme={preferredTheme}
                    handleThemeChange={handleThemeChange}
                    voiceIntent={voiceIntent}
                    notificationPermission={notificationPermission}
                    requestNotificationPermission={requestNotificationPermission}
                    loyaltyPoints={loyaltyPoints}
                  />
                ) : (
                  <div className="py-24 text-center bg-white border border-slate-200 rounded-[32px] p-6 max-w-md mx-auto space-y-4">
                    <Lock className="w-12 h-12 text-slate-300 mx-auto" />
                    <h3 className="text-slate-900 font-black text-lg">લૉગિન કરવું જરૂરી છે / Login Required</h3>
                    <p className="text-slate-400 text-xs">તમારું એકાઉન્ટ અને ઓર્ડર ઇતિહાસ જોવા માટે લૉગિન કરવું જરૂરી છે.</p>
                    <button
                      onClick={() => {
                        setAuthRedirectAction(() => () => navigate('/account'));
                        setShowAuthModal(true);
                      }}
                      className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all"
                    >
                      Login / લૉગિન કરો
                    </button>
                  </div>
                )}
              </motion.div>
            } />

            {/* Customer main shop route */}
            <Route path="*" element={
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-8 pb-32 lg:pb-12"
              >
                {/* Search Bar - Sticky */}
                <div className="sticky top-0 z-40 bg-bg-page/95 backdrop-blur-md -mx-4 px-4 py-2.5 sm:py-3">
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Search className="h-5 w-5 text-slate-400 group-focus-within:text-primary-green transition-colors" />
                    </div>
                    <input
                      type="text"
                      placeholder={voiceListening ? "🎤 Listening... speak now / બોલો..." : "Search pantry items, spices, pulses..."}
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        if (!e.target.value.trim()) setVoiceIntent(null);
                      }}
                      className={`w-full bg-white border rounded-xl sm:rounded-2xl pl-12 pr-20 py-3 sm:py-3.5 text-sm focus:ring-4 outline-hidden transition-all shadow-xs ${voiceListening ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/5' : 'border-slate-200 focus:border-primary-green focus:ring-primary-green/5'}`}
                    />
                    {searchQuery.trim() && (
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setVoiceIntent(null);
                        }}
                        className="absolute inset-y-0 right-10 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors w-8 h-full"
                        type="button"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (voiceListening) {
                          stopVoiceSearch();
                        } else {
                          startVoiceSearch();
                        }
                      }}
                      className={`absolute inset-y-0 right-0 pr-4 flex items-center justify-center transition-all w-10 h-full ${voiceListening ? 'text-rose-500 animate-pulse scale-110' : 'text-slate-400 hover:text-primary-green active:scale-95'}`}
                      title="Voice Search / વોઈસ સર્ચ"
                      id="voice-search-mic-btn"
                    >
                      <Mic className="h-5 w-5" />
                    </button>
                  </div>

                  {/* Smart suggestions container */}
                  {searchQuery.trim() && getSmartSuggestions(searchQuery).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2 items-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                        Suggested / સંબંધિત:
                      </span>
                      {getSmartSuggestions(searchQuery).map(suggestion => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => {
                            setSearchQuery(suggestion);
                            setVoiceIntent(null);
                          }}
                          className="text-[10px] font-bold bg-white hover:bg-emerald-50 hover:text-emerald-600 border border-slate-200 hover:border-emerald-200 px-2.5 py-1 rounded-full transition-all text-slate-600 flex items-center gap-1 shadow-xs"
                        >
                          <span>{suggestion}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 📢 Scrolling Announcement Bar */}
                {!selectedCategory && !searchQuery.trim() && <ScrollingAnnouncement text={shopSettings.announcementText} />}

                {/* 🚚 Welcome Popup Notice */}
                <WelcomeDeliveryPopup />

                {/* Banner Ad Slider - Mobile Friendly */}
                {!selectedCategory && !searchQuery.trim() && (
                  <BannerSlider 
                    banners={banners} 
                    onSelectCategory={setSelectedCategory} 
                  />
                )}

                {/* Categories Layout */}
                {(!selectedCategory && !searchQuery.trim()) ? (
                  <div className="space-y-8 py-4">
                    <div className="text-center space-y-2">
                      <h2 className="text-3xl font-black text-slate-950 tracking-tight">Shop by Department</h2>
                      <p className="text-slate-500 text-sm font-medium">Select a category to view items</p>
                    </div>
                    
                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-6">
                      <CategoryCard 
                        name="All Products"
                        isActive={selectedCategory === 'All Products'}
                        onClick={() => setSelectedCategory('All Products')}
                      />
                      {allCategories.map(cat => (
                        <CategoryCard 
                          key={cat.name}
                          item={cat.item}
                          name={cat.name}
                          isActive={selectedCategory === cat.name}
                          onClick={() => setSelectedCategory(cat.name)}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Sticky category selection bar */}
                    <div className="sticky top-[52px] sm:top-[58px] z-30 bg-bg-page/90 backdrop-blur-xl -mx-4 px-4 py-3 border-b border-slate-200/50">
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => { setSelectedCategory(null); setSearchQuery(''); }}
                          className="bg-white p-2.5 rounded-xl border border-slate-200 text-slate-900 hover:text-primary-green hover:border-primary-green transition-all shadow-xs shrink-0"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <div className="flex gap-2 overflow-x-auto no-scrollbar flex-1">
                          <button
                            onClick={() => setSelectedCategory('All Products')}
                            className={`px-5 py-2 rounded-full text-xs font-black whitespace-nowrap transition-all border flex items-center gap-1.5 ${selectedCategory === 'All Products' ? 'bg-[#00884F] text-white border-[#00884F] shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-primary-green'}`}
                          >
                            <Package className="w-3.5 h-3.5" />
                            All Products
                          </button>
                          {allCategories.map(cat => (
                            <button
                              key={cat.name}
                              onClick={() => setSelectedCategory(cat.name)}
                              className={`px-5 py-2 rounded-full text-xs font-black whitespace-nowrap transition-all border ${selectedCategory === cat.name ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-primary-green'}`}
                            >
                              {cat.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Products Grid */}
                    <div className="space-y-6">
                      <div className="flex items-baseline gap-2 px-1">
                        <h3 className="text-xl font-black text-slate-900 uppercase">
                          {searchQuery.trim() 
                            ? `Search Results for "${searchQuery}"` 
                            : (selectedCategory === 'All Products' ? 'Everything in Stock' : selectedCategory)}
                        </h3>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                          ({filteredProducts.length} items)
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        {filteredProducts.map((p: Product) => (
                          <ProductCard 
                            key={p.id} 
                            product={p} 
                            onAdd={addToCart} 
                            isWishlisted={Boolean(customerProfile?.wishlist?.includes(p.id))}
                            onToggleWishlist={toggleWishlist}
                            voiceIntent={voiceIntent}
                          />
                        ))}
                        {filteredProducts.length === 0 && (
                          <div className="col-span-full py-16 text-center bg-white border border-slate-200 rounded-3xl border-dashed">
                            <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-slate-100 text-slate-300">
                              <Package className="w-6 h-6" />
                            </div>
                            <h3 className="text-slate-900 font-bold mb-1">Out of Stock</h3>
                            <p className="text-slate-400 text-xs">We are restocking this aisle soon.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Recently Viewed Products */}
                {recentlyViewed.length > 0 && (
                  <div className="pt-6 pb-2">
                    <div className="flex items-center gap-2 mb-4 px-1">
                      <Clock className="w-4 h-4 text-emerald-600" />
                      <h3 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">Recently Viewed / તમે જોયેલી વસ્તુઓ</h3>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-3.5 no-scrollbar snap-x scroll-smooth -mx-4 px-4">
                      {recentlyViewed
                        .map(id => products.find(p => p.id === id))
                        .filter((p): p is Product => !!p)
                        .map(p => {
                          return (
                            <div 
                              key={p.id}
                              onClick={() => navigate(`/product/${p.id}`)}
                              className="w-[125px] bg-white dark:bg-slate-800 border border-slate-150 dark:border-slate-700 rounded-[20px] p-2 shrink-0 snap-start flex flex-col justify-between shadow-xs hover:border-emerald-500 hover:shadow-xs transition-all cursor-pointer"
                            >
                              <div className="w-full h-16 bg-slate-50 dark:bg-slate-900 rounded-xl flex items-center justify-center p-1 overflow-hidden">
                                <img src={p.image} alt={p.name} className="max-h-full max-w-full object-contain" />
                              </div>
                              <div className="flex-1 text-left min-w-0 mt-2">
                                <h5 className="text-[10px] font-black text-slate-850 dark:text-slate-100 truncate line-clamp-1 leading-tight uppercase">{p.name}</h5>
                                <p className="text-[8px] font-bold text-slate-400 truncate mt-0.5">{p.gujaratiName || ''}</p>
                                <span className="text-xs font-black text-primary-green block mt-1">₹{p.price.toFixed(0)}</span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Customer Basket */}
                <div id="customer-basket" className="pt-8 border-t border-slate-200">
                  <div className="grid lg:grid-cols-12 gap-8 items-start">
                    <div className="lg:col-span-8 space-y-4">
                      <div className="flex items-center justify-between px-1">
                        <h3 className="text-lg font-extrabold text-slate-900">Your Basket</h3>
                        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full uppercase tracking-wider">{cart.length} unique items</span>
                      </div>
                      
                      {cart.length === 0 ? (
                        <div className="bg-white border border-slate-200 border-dashed rounded-3xl p-12 text-center">
                          <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-100 text-emerald-300">
                            <ShoppingCart className="w-7 h-7" />
                          </div>
                          <h4 className="text-slate-900 font-bold mb-1">Your Basket is Empty</h4>
                          <p className="text-slate-400 text-xs max-w-xs mx-auto">Explore categories, select products, and they will show up here for quick WhatsApp ordering.</p>
                        </div>
                      ) : (
                        <>
                          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden divide-y divide-slate-100">
                            {cart.map(item => {
                              const cartItemId = item.id + (item.selectedVariant ? '-' + item.selectedVariant.id : '');
                              return (
                                <div key={cartItemId} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 hover:bg-slate-50/50 transition-all">
                                  {/* Left: Product Image & Details */}
                                  <div className="flex items-center gap-3.5 flex-1 min-w-0">
                                    <div className="w-12 h-12 bg-white border border-slate-100 rounded-xl overflow-hidden shrink-0 flex items-center justify-center p-1">
                                      {item.image ? (
                                        <img src={item.image} alt={item.name} className="max-h-full max-w-full object-contain" />
                                      ) : (
                                        <ImageIcon className="w-5 h-5 text-slate-300" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <span className="text-[8px] font-black text-slate-400 uppercase mb-0.5 block tracking-wider">{item.category}</span>
                                      <h4 className="font-black text-xs sm:text-sm text-slate-900 truncate leading-tight uppercase">{item.name}</h4>
                                      {item.gujaratiName && (
                                        <p className="text-[9px] font-bold text-slate-400 leading-none mt-0.5">{item.gujaratiName}</p>
                                      )}
                                      <p className="text-xs font-black text-primary-green mt-0.5">₹{item.price.toFixed(0)} / {item.unit}</p>
                                    </div>
                                  </div>
                                  
                                  {/* Right: Controls (Qty editor, Subtotal, Delete) */}
                                  <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100 shrink-0">
                                    <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
                                      <button
                                        onClick={() => updateCartQuantity(cartItemId, -1)}
                                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 hover:bg-red-50 hover:text-red-500 transition-all"
                                      >
                                        {item.quantity === 1 ? <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" /> : <ChevronLeft className="w-4 h-4 text-slate-600" />}
                                      </button>
                                      <span className="w-6 text-center font-black text-xs text-slate-850 font-mono">{item.quantity}</span>
                                      <button
                                        onClick={() => updateCartQuantity(cartItemId, 1)}
                                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 hover:bg-emerald-50 hover:text-primary-green transition-all"
                                      >
                                        <ChevronRight className="w-4 h-4 text-slate-600" />
                                      </button>
                                    </div>
                                    <div className="text-right min-w-[70px]">
                                      <p className="font-black text-sm text-slate-900 font-mono">₹{(item.price * item.quantity).toFixed(0)}</p>
                                    </div>
                                    <button
                                      onClick={() => updateCartQuantity(cartItemId, -item.quantity)}
                                      className="p-1.5 text-slate-350 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                      title="Remove item"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Smart Progress Bar Suggestions */}
                          {(() => {
                            const nextCoupon = coupons
                              .filter(c => c.activeStatus && c.minOrderAmount > cartTotal && c.minOrderAmount <= cartTotal + 500)
                              .sort((a, b) => a.minOrderAmount - b.minOrderAmount)[0];

                            if (!nextCoupon) return null;

                            const needed = nextCoupon.minOrderAmount - cartTotal;
                            const percentage = (cartTotal / nextCoupon.minOrderAmount) * 100;

                            return (
                              <div className="bg-amber-50/40 border border-amber-205 rounded-[24px] p-4.5 space-y-2.5 mt-6 shadow-2xs border-amber-200/60">
                                <div className="flex justify-between items-center text-xs font-black text-amber-900 uppercase tracking-wide">
                                  <span className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                                    Add ₹{needed.toFixed(0)} more to unlock {nextCoupon.code}!
                                  </span>
                                  <span className="font-mono text-[10px]">₹{cartTotal.toFixed(0)} / ₹{nextCoupon.minOrderAmount.toFixed(0)}</span>
                                </div>
                                <div className="w-full bg-slate-200/70 h-2 rounded-full overflow-hidden">
                                  <div className="bg-amber-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, percentage)}%` }} />
                                </div>
                                <p className="text-[10px] text-amber-700 font-bold">
                                  Apply <span className="font-extrabold uppercase bg-amber-100 px-1.5 py-0.5 rounded text-amber-900 text-[9px]">{nextCoupon.code}</span> to get {nextCoupon.discountType === 'flat' ? `₹${nextCoupon.discountValue} off` : `${nextCoupon.discountValue}% off`}!
                                </p>
                              </div>
                            );
                          })()}

                          {/* Available Coupons Section */}
                          <div className="bg-white border border-slate-200 rounded-[28px] p-5 space-y-4 shadow-sm mt-6">
                            <h4 className="font-black text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                              <Tag className="w-4 h-4 text-emerald-600" />
                              Available Offers / ઉપલબ્ધ ઑફર્સ
                            </h4>
                            <div className="grid sm:grid-cols-2 gap-4">
                              {(() => {
                                const todayStr = new Date().toISOString().split('T')[0];
                                const activeList = coupons.filter(c => {
                                  const isLive = c.activeStatus && c.expiryDate >= todayStr;
                                  if (!isLive) return false;
                                  // Filter out if customer specific and phone doesn't match
                                  if (customerUser && c.customerSpecific) {
                                    const cleanSpecific = c.customerSpecific.replace(/\D/g, '');
                                    const cleanPhone = (customerProfile?.phone || '').replace(/\D/g, '');
                                    if (cleanSpecific !== cleanPhone) return false;
                                  }
                                  return true;
                                });

                                if (activeList.length === 0) {
                                  return (
                                    <p className="text-xs font-bold text-slate-400 col-span-full py-4 text-center">હાલમાં કોઈ ઓફર ઉપલબ્ધ નથી / No offers available right now.</p>
                                  );
                                }

                                return activeList.map(c => {
                                  const isEligible = cartTotal >= c.minOrderAmount;
                                  return (
                                    <div key={c.id} className={`p-4.5 rounded-2xl border-2 transition-all flex flex-col justify-between gap-4 ${isEligible ? 'border-emerald-150 bg-emerald-50/5 hover:border-emerald-300' : 'border-slate-100 bg-slate-50/30'}`}>
                                      <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                          <span className="bg-emerald-100 text-emerald-800 border border-emerald-255 px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border-emerald-200">{c.code}</span>
                                          <span className="text-[9px] font-bold text-slate-400">Exp: {new Date(c.expiryDate).toLocaleDateString('gu-IN', { day: 'numeric', month: 'short' })}</span>
                                        </div>
                                        <h5 className="text-xs font-black text-slate-800">{c.title}</h5>
                                        <p className="text-[10px] text-slate-500 font-medium leading-relaxed">{c.description}</p>
                                        <p className="text-[9px] font-bold text-slate-400">
                                          • Min. Order: ₹{c.minOrderAmount} {c.firstOrderOnly && '• First Order Only'}
                                        </p>
                                      </div>
                                      
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setCouponCodeInput(c.code);
                                          handleApplyCoupon(c.code);
                                        }}
                                        disabled={!isEligible}
                                        className={`w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border ${
                                          isEligible 
                                            ? 'bg-emerald-600 border-emerald-650 hover:bg-emerald-700 text-white active:scale-95' 
                                            : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                                        }`}
                                      >
                                        {isEligible ? 'Apply Coupon' : `Add ₹${(c.minOrderAmount - cartTotal).toFixed(0)} more`}
                                      </button>
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Checkout Details Side Card */}
                    <div className="lg:col-span-4 sticky top-6">
                      <div className="bg-white border border-slate-200 rounded-[28px] p-6 shadow-sm">
                        <div className="mb-6">
                          <span className="tag bg-emerald-50 text-emerald-800 border border-emerald-100 mb-3 block w-fit">Order Pricing</span>
                          
                          {/* Coupon Input Box */}
                          {customerUser && (
                            <div className="bg-slate-50 border border-slate-150 p-3.5 rounded-2xl space-y-2 mb-4">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block pl-1">Apply Coupon / કૂપન કોડ</label>
                              {appliedCoupon ? (
                                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-250 rounded-xl px-3.5 py-2.5">
                                  <div>
                                    <span className="text-xs font-black text-emerald-800 bg-emerald-100 border border-emerald-250 px-2 py-0.5 rounded-md uppercase">{appliedCoupon.code}</span>
                                    <p className="text-[9px] font-bold text-emerald-700 mt-1">
                                      ₹{couponDiscount.toFixed(0)} discount applied!
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={handleRemoveCoupon}
                                    className="text-[10px] font-black text-rose-600 hover:text-rose-700 uppercase tracking-wider pl-2"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ) : (
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    placeholder="દા.ત. FIRSTORDER"
                                    value={couponCodeInput}
                                    onChange={e => setCouponCodeInput(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold uppercase focus:border-primary-green outline-hidden"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleApplyCoupon(couponCodeInput)}
                                    className="bg-slate-900 hover:bg-slate-800 active:scale-95 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                                  >
                                    Apply
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="space-y-2">
                            <div className="flex justify-between text-xs font-semibold text-slate-500">
                              <span>Subtotal</span>
                              <span>₹{cartTotal.toFixed(2)}</span>
                            </div>
                            
                            {appliedCoupon && couponDiscount > 0 && (
                              <div className="flex justify-between text-xs font-bold text-rose-600 items-center">
                                <span>Discount ({appliedCoupon.code})</span>
                                <span className="font-mono">-₹{couponDiscount.toFixed(2)}</span>
                              </div>
                            )}

                            <div className="flex justify-between text-xs font-bold text-emerald-700 items-center">
                              <span>Delivery Charge</span>
                              <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-[9px] font-black">FREE</span>
                            </div>
                            <div className="pt-3 border-t border-slate-100 flex justify-between items-baseline">
                              <span className="font-extrabold text-slate-900 text-sm">Grand Total</span>
                              <span className="text-2xl font-black text-slate-900">₹{finalTotal.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>

                        {!customerUser ? (
                          <div className="bg-slate-50 border border-slate-200 border-dashed rounded-[20px] p-5 text-center space-y-3">
                            <Lock className="w-8 h-8 text-slate-400 mx-auto" />
                            <p className="text-xs font-black text-slate-800">લૉગિન કરવું જરૂરી છે / Login Required</p>
                            <p className="text-[10px] font-bold text-slate-400">ઓર્ડર મોકલવા માટે કૃપા કરીને લૉગિન કરો.</p>
                            <button
                              type="button"
                              onClick={() => {
                                setAuthRedirectAction(() => () => {});
                                setShowAuthModal(true);
                              }}
                              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-md active:scale-95 transition-all"
                            >
                              Login / લૉગિન કરો
                            </button>
                          </div>
                        ) : (
                          <CheckoutForm 
                            onSubmit={handleCreateOrder} 
                            isDisabled={cart.length === 0} 
                            cartTotal={cartTotal} 
                            finalTotal={finalTotal}
                            couponDiscount={couponDiscount}
                            appliedCoupon={appliedCoupon}
                            customerProfile={customerProfile} 
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Section */}
                <footer className="mt-16 pb-8 pt-8 border-t border-slate-200 flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2 opacity-60">
                    <Store className="w-4 h-4 text-primary-green" />
                    <span className="text-xs font-black text-slate-800 uppercase tracking-widest">{shopSettings.shopName}</span>
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    © {new Date().getFullYear()} {shopSettings.shopName} • All Rights Reserved
                  </p>
                </footer>

                {/* Sticky Mobile Cart Bar */}
                {cart.length > 0 && selectedCategory && (
                  <motion.div
                    initial={{ y: 80 }}
                    animate={{ y: 0 }}
                    className="fixed bottom-4 left-4 right-4 z-50 lg:hidden"
                  >
                    <button
                      onClick={() => {
                        const basket = document.getElementById('customer-basket');
                        basket?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="w-full bg-[#00884F] text-white p-4.5 rounded-2xl shadow-xl flex items-center justify-between border border-white/10"
                    >
                      <div className="flex items-center gap-2">
                        <ShoppingCart className="w-5 h-5" />
                        <div className="text-left leading-none">
                          <p className="text-[9px] text-white/70 font-black uppercase tracking-wider">{cart.length} Items</p>
                          <p className="text-sm font-black mt-0.5">₹{cartTotal.toFixed(0)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 font-bold text-xs uppercase tracking-wider">
                        Open Basket <ChevronRight className="w-4 h-4" />
                      </div>
                    </button>
                  </motion.div>
                )}
              </motion.div>
            } />
          </Routes>
        </AnimatePresence>

        <AuthModal 
          isOpen={showAuthModal} 
          onClose={() => setShowAuthModal(false)} 
          showToast={showToast} 
          onAuthSuccess={() => {
            if (authRedirectAction) {
              authRedirectAction();
              setAuthRedirectAction(null);
            }
          }}
        />

        <ToastContainer toasts={toasts} />

        {/* AI Assistant Chatbot UI */}
        {!isAdminView && shopSettings.aiEnabled !== false && (
          <div className="fixed bottom-6 right-6 z-40 font-sans text-left">
            {/* Floating Circle Button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsChatOpen(!isChatOpen)}
              className="w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center shadow-2xl cursor-pointer relative border-none outline-hidden"
            >
              {isChatOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Sparkles className="w-6 h-6 text-white animate-pulse" />
              )}
              {!isChatOpen && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
              )}
            </motion.button>

            {/* Chat Window Panel */}
            <AnimatePresence>
              {isChatOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 50, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 50, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                  className="absolute bottom-16 right-0 w-[92vw] sm:w-[380px] h-[520px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] shadow-2xl flex flex-col overflow-hidden"
                >
                  {/* Header */}
                  <div className="bg-indigo-600 p-4 text-white flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center shrink-0">
                        <Sparkles className="w-5 h-5 text-amber-300" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-sm leading-tight text-white">AI Grocery Assistant</h4>
                        <p className="text-[10px] text-indigo-200 flex items-center gap-1 mt-0.5 font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
                          Online | એઆઈ મદદગાર
                        </p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setIsChatOpen(false)} className="p-1 hover:bg-white/10 rounded-lg transition-all cursor-pointer border-none text-white bg-transparent">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Messages Feed */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-950">
                    {chatMessages.map((msg) => (
                      <div key={msg.id} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'} space-y-1.5`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs font-semibold shadow-xs whitespace-pre-wrap leading-relaxed ${
                          msg.sender === 'user' 
                            ? 'bg-indigo-600 text-white rounded-tr-none text-right' 
                            : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-150 dark:border-slate-700 rounded-tl-none text-left'
                        }`}>
                          {msg.text}
                        </div>

                        {/* Recommended Products Carousel */}
                        {msg.products && msg.products.length > 0 && (
                          <div className="w-full py-1.5 overflow-x-auto flex gap-3 scrollbar-none no-scrollbar snap-x shrink-0">
                            {msg.products.map((prod: Product) => {
                              const discount = prod.mrp && prod.mrp > prod.price ? Math.round(((prod.mrp - prod.price) / prod.mrp) * 100) : 0;
                              const handleAdd = () => {
                                addToCart(prod, 1);
                                showToast(`${prod.name} added to cart!`, 'success');
                              };

                              return (
                                <div key={prod.id} className="w-[130px] bg-white dark:bg-slate-850 border border-slate-150 dark:border-slate-700 rounded-2xl p-2 shrink-0 snap-start flex flex-col justify-between shadow-xs">
                                  <div className="relative border-none">
                                    <img src={prod.image} alt={prod.name} className="w-full h-16 object-cover rounded-xl mb-1.5" />
                                    {discount > 0 && (
                                      <span className="absolute top-1 left-1 bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-md">
                                        -{discount}%
                                      </span>
                                    )}
                                  </div>
                                  <div className="space-y-1">
                                    <h5 className="text-[10px] font-black text-slate-800 dark:text-slate-100 truncate line-clamp-1">{prod.name}</h5>
                                    <p className="text-[9px] font-bold text-slate-400 truncate">{prod.gujaratiName || ''}</p>
                                    <div className="flex items-baseline gap-1">
                                      <span className="text-xs font-black text-slate-900 dark:text-white">₹{prod.price}</span>
                                      {discount > 0 && <span className="text-[9px] text-slate-400 line-through">₹{prod.mrp}</span>}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={handleAdd}
                                    className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border-none cursor-pointer"
                                  >
                                    Add to Cart
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 p-3.5 rounded-2xl rounded-tl-none border border-slate-150 dark:border-slate-700 w-16 shadow-xs justify-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce"></span>
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:0.2s]"></span>
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:0.4s]"></span>
                      </div>
                    )}
                  </div>

                  {/* Suggestion Chips */}
                  <div className="p-2 border-t border-slate-150 dark:border-slate-800 flex gap-1.5 overflow-x-auto shrink-0 bg-slate-50/50 dark:bg-slate-900/50 no-scrollbar">
                    {[
                      "ચા માટે શું જોઈએ?",
                      "પંજાબી શાક બનાવવા શું જોઈએ?",
                      "Healthy snacks suggest કરો",
                      "Cold drink સાથે શું સારું જશે?"
                    ].map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => handleSendChatMessage(chip)}
                        className="text-[9px] font-black bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-750 hover:border-indigo-400 hover:bg-indigo-50/20 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-full shrink-0 transition-all cursor-pointer"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>

                  {/* Input Form */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendChatMessage();
                    }}
                    className="p-3 bg-white dark:bg-slate-900 border-t border-slate-150 dark:border-slate-800 flex gap-2 items-center shrink-0"
                  >
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="તમારો પ્રશ્ન પૂછો... Ask AI Assistant"
                      className="flex-1 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold focus:border-indigo-500 outline-hidden dark:text-white"
                    />
                    {/* Voice dictation */}
                    <button
                      type="button"
                      onClick={startChatVoiceInput}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                        chatSpeechListening 
                          ? 'bg-red-500 border-red-500 text-white animate-pulse' 
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-250 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-750'
                      }`}
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                    <button
                      type="submit"
                      className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all cursor-pointer shadow-md border-none flex items-center justify-center shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ==========================================
            PREMIUM NATIVE APP PORTAL & OVERLAYS
            ========================================== */}

        {/* 1. Opening Splash Screen Animation Overlay */}
        <AnimatePresence>
          {showSplash && (
            <motion.div
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="fixed inset-0 z-[999] bg-[#0a0f1d] flex flex-col items-center justify-center text-white"
            >
              {/* Logo & Glow */}
              <div className="relative flex flex-col items-center justify-center p-8">
                <motion.div 
                  animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute w-44 h-44 rounded-full bg-emerald-500/20 blur-xl"
                />
                
                <motion.div
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 100, damping: 15 }}
                  className="relative w-28 h-28 bg-[#0f172a] rounded-3xl shadow-2xl flex items-center justify-center border border-white/10 overflow-hidden p-2"
                >
                  <img src="/logo.png" alt="GGM&S Grocery" className="w-full h-full object-contain rounded-2xl" />
                </motion.div>

                <motion.h1
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.5 }}
                  className="text-2xl font-black tracking-tight mt-6 bg-gradient-to-r from-emerald-400 via-emerald-300 to-amber-300 bg-clip-text text-transparent uppercase font-display"
                >
                  GGM&S Grocery
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.6 }}
                  transition={{ delay: 0.6 }}
                  className="text-[10px] uppercase tracking-widest font-bold mt-1 text-slate-400 font-sans"
                >
                  Wholesale & Retail Hub
                </motion.p>
              </div>

              {/* Premium Loading Spinner */}
              <div className="absolute bottom-16 flex flex-col items-center gap-3">
                <div className="flex gap-2">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      animate={{ y: [0, -8, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
                      className="w-2.5 h-2.5 rounded-full bg-emerald-455"
                    />
                  ))}
                </div>
                <span className="text-[9px] uppercase tracking-widest font-black text-slate-500 font-sans">Loading App...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 2. Onboarding Intro Screens */}
        <AnimatePresence>
          {showIntro && !showSplash && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[990] bg-[#0a0f1d] text-white flex flex-col justify-between p-6 sm:p-8"
            >
              {/* Glowing Background Decorative Elements */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[50%] rounded-full bg-emerald-500/10 blur-[130px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[50%] rounded-full bg-amber-500/10 blur-[130px]" />
              </div>

              {/* Onboarding Header */}
              <div className="flex items-center justify-between pt-4 z-10 relative">
                <span className="text-xs font-black tracking-widest text-emerald-450 uppercase font-sans">GGM&S GROCERY</span>
                {introStep < 3 && (
                  <button
                    onClick={() => {
                      localStorage.setItem('ggms_intro_seen', 'true');
                      setShowIntro(false);
                    }}
                    className="text-[10px] font-black uppercase text-slate-400 tracking-wider hover:text-white transition-colors bg-white/5 px-3.5 py-1.5 rounded-full border border-white/10 cursor-pointer"
                  >
                    Skip / સ્કીપ
                  </button>
                )}
              </div>

              {/* Slide Content Frame */}
              <div className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto w-full z-10 relative">
                <AnimatePresence mode="wait">
                  {introStep === 0 && (
                    <motion.div
                      key="step0"
                      initial={{ x: 50, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: -50, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="text-center space-y-6 flex flex-col items-center w-full"
                    >
                      {/* Premium Logo & Floating Orbits */}
                      <div className="relative w-48 h-48 flex items-center justify-center">
                        {/* Background Glow Ring */}
                        <motion.div
                          animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.6, 0.3] }}
                          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                          className="absolute w-36 h-36 rounded-full bg-emerald-500/15 blur-xl"
                        />
                        
                        {/* Central Logo Container */}
                        <motion.div
                          animate={{ y: [0, -6, 0] }}
                          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                          className="relative w-28 h-28 bg-[#0f172a] rounded-[32px] shadow-2xl flex items-center justify-center border border-white/10 p-3"
                        >
                          <img src="/logo.png" alt="GGM&S Grocery" className="w-full h-full object-contain rounded-2xl" />
                        </motion.div>

                        {/* Floating elements */}
                        <motion.div
                          animate={{ y: [0, -10, 0], x: [0, 5, 0] }}
                          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
                          className="absolute top-4 right-4 w-9 h-9 rounded-2xl bg-amber-500/10 border border-amber-500/20 shadow-lg flex items-center justify-center text-amber-400 backdrop-blur-xs"
                        >
                          <ShoppingCart className="w-4 h-4" />
                        </motion.div>

                        <motion.div
                          animate={{ y: [0, 8, 0], x: [0, -6, 0] }}
                          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                          className="absolute bottom-4 left-4 w-9 h-9 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 shadow-lg flex items-center justify-center text-emerald-450 backdrop-blur-xs"
                        >
                          <Tag className="w-4 h-4" />
                        </motion.div>

                        <motion.div
                          animate={{ scale: [0.9, 1.1, 0.9] }}
                          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                          className="absolute top-12 left-2 w-7 h-7 rounded-xl bg-indigo-500/10 border border-indigo-500/20 shadow-lg flex items-center justify-center text-indigo-400 backdrop-blur-xs"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                        </motion.div>
                      </div>

                      {/* Titles */}
                      <div className="space-y-3.5 max-w-sm px-4">
                        <h2 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-white via-slate-100 to-slate-350 bg-clip-text text-transparent leading-tight font-display uppercase tracking-tight">
                          Welcome to GGM&S Grocery
                          <span className="block text-lg font-extrabold text-emerald-450 mt-1.5 font-sans lowercase">જીજીએમએન્ડએસ ગ્રોસરી</span>
                        </h2>
                        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed font-semibold">
                          Your trusted wholesale & retail grocery partner.
                          <span className="block text-[11px] text-slate-500 mt-1 font-bold">તમારા વિશ્વાસપાત્ર હોલસેલ અને રિટેલ કરિયાણાના ભાગીદાર.</span>
                        </p>
                      </div>

                      {/* Feature Highlights */}
                      <div className="flex flex-wrap gap-2 justify-center max-w-sm px-2 pt-2">
                        {[
                          { text: "Fast Ordering", guj: "ઝડપી ઓર્ડર", color: "emerald" },
                          { text: "Trusted Products", guj: "વિશ્વાસપાત્ર વસ્તુઓ", color: "amber" },
                          { text: "Best Prices", guj: "શ્રેષ્ઠ ભાવો", color: "indigo" }
                        ].map((feat, idx) => (
                          <motion.span
                            key={feat.text}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 + idx * 0.1 }}
                            className="px-3.5 py-2 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black text-slate-300 tracking-wide flex items-center gap-1.5 shadow-sm"
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              feat.color === 'emerald' ? 'bg-emerald-450' : (feat.color === 'amber' ? 'bg-amber-450' : 'bg-indigo-400')
                            }`} />
                            {feat.text} | {feat.guj}
                          </motion.span>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {introStep === 1 && (
                    <motion.div
                      key="step1"
                      initial={{ x: 50, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: -50, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="text-center space-y-6 flex flex-col items-center w-full"
                    >
                      {/* Delivery Scooter & Floating Assets */}
                      <div className="relative w-48 h-48 flex items-center justify-center">
                        <motion.div
                          animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.5, 0.2] }}
                          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                          className="absolute w-36 h-36 rounded-full bg-amber-500/10 blur-xl"
                        />

                        <motion.div
                          animate={{ y: [0, -5, 0], rotate: [0, 2, 0] }}
                          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                          className="relative w-28 h-28 bg-[#0f172a] rounded-[32px] shadow-2xl flex items-center justify-center border border-white/10 text-amber-400 p-6"
                        >
                          <Truck className="w-14 h-14" />
                        </motion.div>

                        {/* Floating speedometer dashes & location pins */}
                        <motion.div
                          animate={{ x: [-10, 10, -10] }}
                          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                          className="absolute top-6 left-4 w-9 h-9 rounded-2xl bg-amber-500/10 border border-amber-500/20 shadow-lg flex items-center justify-center text-amber-500 backdrop-blur-xs"
                        >
                          <Clock className="w-4 h-4 animate-pulse" />
                        </motion.div>

                        <motion.div
                          animate={{ y: [0, 8, 0] }}
                          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
                          className="absolute bottom-6 right-4 w-9 h-9 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 shadow-lg flex items-center justify-center text-emerald-450 backdrop-blur-xs"
                        >
                          <MapPin className="w-4 h-4" />
                        </motion.div>

                        <div className="absolute right-3 top-10 flex flex-col gap-1 opacity-50">
                          <span className="w-4 h-1 bg-amber-450/35 rounded-full animate-pulse" />
                          <span className="w-6 h-1 bg-amber-450/35 rounded-full animate-pulse [animation-delay:0.2s]" />
                          <span className="w-3 h-1 bg-amber-450/35 rounded-full animate-pulse [animation-delay:0.4s]" />
                        </div>
                      </div>

                      {/* Titles */}
                      <div className="space-y-3.5 max-w-sm px-4">
                        <h2 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-white via-slate-100 to-slate-350 bg-clip-text text-transparent leading-tight font-display uppercase tracking-tight">
                          Fast Home Delivery
                          <span className="block text-lg font-extrabold text-amber-400 mt-1.5 font-sans lowercase">ઝડપી હોમ ડિલિવરી</span>
                        </h2>
                        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed font-semibold">
                          Get groceries delivered quickly to your doorstep.
                          <span className="block text-[11px] text-slate-500 mt-1 font-bold">કરિયાણું ઝડપથી મેળવો તમારા ઘર આંગણે.</span>
                        </p>
                      </div>

                      {/* Feature Highlights */}
                      <div className="flex flex-wrap gap-2 justify-center max-w-sm px-2 pt-2">
                        {[
                          { text: "Same Day Delivery", guj: "સેમ ડે ડિલિવરી", color: "amber" },
                          { text: "Live Order Updates", guj: "લાઈવ અપડેટ્સ", color: "emerald" },
                          { text: "Safe Packaging", guj: "સુરક્ષિત પેકિંગ", color: "blue" }
                        ].map((feat, idx) => (
                          <motion.span
                            key={feat.text}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 + idx * 0.1 }}
                            className="px-3.5 py-2 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black text-slate-300 tracking-wide flex items-center gap-1.5 shadow-sm"
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              feat.color === 'amber' ? 'bg-amber-455' : (feat.color === 'emerald' ? 'bg-emerald-450' : 'bg-blue-400')
                            }`} />
                            {feat.text} | {feat.guj}
                          </motion.span>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {introStep === 2 && (
                    <motion.div
                      key="step2"
                      initial={{ x: 50, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: -50, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="text-center space-y-6 flex flex-col items-center w-full"
                    >
                      {/* Mobile search / Voice visualizer */}
                      <div className="relative w-48 h-48 flex items-center justify-center">
                        <motion.div
                          animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.5, 0.2] }}
                          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                          className="absolute w-36 h-36 rounded-full bg-blue-500/10 blur-xl"
                        />

                        {/* Breathing voice rings */}
                        <motion.div
                          animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0, 0.4] }}
                          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                          className="absolute w-24 h-24 rounded-full border border-blue-500/30"
                        />
                        <motion.div
                          animate={{ scale: [1, 1.7, 1], opacity: [0.2, 0, 0.2] }}
                          transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 0.4 }}
                          className="absolute w-24 h-24 rounded-full border border-indigo-500/20"
                        />

                        <motion.div
                          animate={{ scale: [1, 1.05, 1] }}
                          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                          className="relative w-28 h-28 bg-[#0f172a] rounded-[32px] shadow-2xl flex items-center justify-center border border-white/10 text-indigo-400 p-6"
                        >
                          <Mic className="w-12 h-12 text-indigo-400" />
                        </motion.div>

                        {/* Floating visual items */}
                        <motion.div
                          animate={{ y: [0, -6, 0] }}
                          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                          className="absolute top-6 right-4 w-9 h-9 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 shadow-lg flex items-center justify-center text-indigo-400 backdrop-blur-xs"
                        >
                          <Sparkles className="w-4 h-4 text-indigo-400" />
                        </motion.div>

                        <motion.div
                          animate={{ y: [0, 8, 0], rotate: [0, -10, 0] }}
                          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
                          className="absolute bottom-6 left-4 w-9 h-9 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 shadow-lg flex items-center justify-center text-emerald-450 backdrop-blur-xs"
                        >
                          <Eye className="w-4 h-4" />
                        </motion.div>
                      </div>

                      {/* Titles */}
                      <div className="space-y-3.5 max-w-sm px-4">
                        <h2 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-white via-slate-100 to-slate-350 bg-clip-text text-transparent leading-tight font-display uppercase tracking-tight">
                          Smart Grocery Shopping
                          <span className="block text-lg font-extrabold text-indigo-400 mt-1.5 font-sans lowercase">સ્માર્ટ ગ્રોસરી શોપિંગ</span>
                        </h2>
                        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed font-semibold">
                          Search products easily with smart features.
                          <span className="block text-[11px] text-slate-500 mt-1 font-bold">સ્માર્ટ સુવિધાઓ વડે સરળતાથી પ્રોડક્ટ્સ શોધો.</span>
                        </p>
                      </div>

                      {/* Feature Highlights */}
                      <div className="flex flex-wrap gap-2 justify-center max-w-sm px-2 pt-2">
                        {[
                          { text: "Voice Search", guj: "વોઈસ સર્ચ", color: "indigo" },
                          { text: "Smart Suggestions", guj: "સ્માર્ટ સૂચનો", color: "amber" },
                          { text: "Easy Cart Management", guj: "સરળ કાર્ટ મેનેજમેન્ટ", color: "emerald" }
                        ].map((feat, idx) => (
                          <motion.span
                            key={feat.text}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 + idx * 0.1 }}
                            className="px-3.5 py-2 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black text-slate-300 tracking-wide flex items-center gap-1.5 shadow-sm"
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              feat.color === 'indigo' ? 'bg-indigo-400' : (feat.color === 'amber' ? 'bg-amber-450' : 'bg-emerald-450')
                            }`} />
                            {feat.text} | {feat.guj}
                          </motion.span>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {introStep === 3 && (
                    <motion.div
                      key="step3"
                      initial={{ x: 50, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: -50, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="text-center space-y-6 flex flex-col items-center w-full"
                    >
                      {/* Reward / Gold Ribbon & Floating coins */}
                      <div className="relative w-48 h-48 flex items-center justify-center">
                        <motion.div
                          animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.5, 0.2] }}
                          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                          className="absolute w-36 h-36 rounded-full bg-emerald-500/10 blur-xl"
                        />

                        <motion.div
                          animate={{ scale: [0.95, 1.05, 0.95], y: [0, -4, 0] }}
                          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
                          className="relative w-28 h-28 bg-[#0f172a] rounded-[32px] shadow-2xl flex items-center justify-center border border-white/10 text-[#FFB800] p-6"
                        >
                          <Award className="w-14 h-14" />
                        </motion.div>

                        {/* Floating Gift Box and shopping badges */}
                        <motion.div
                          animate={{ y: [0, -8, 0], rotate: [0, 15, 0] }}
                          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.1 }}
                          className="absolute top-6 right-4 w-9 h-9 rounded-2xl bg-amber-500/10 border border-amber-500/20 shadow-lg flex items-center justify-center text-amber-500 backdrop-blur-xs"
                        >
                          <Gift className="w-4 h-4" />
                        </motion.div>

                        <motion.div
                          animate={{ y: [0, 8, 0] }}
                          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                          className="absolute bottom-6 left-4 w-9 h-9 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 shadow-lg flex items-center justify-center text-emerald-450 backdrop-blur-xs"
                        >
                          <ShoppingBag className="w-4 h-4" />
                        </motion.div>
                      </div>

                      {/* Titles */}
                      <div className="space-y-3.5 max-w-sm px-4">
                        <h2 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-white via-slate-100 to-slate-355 bg-clip-text text-transparent leading-tight font-display uppercase tracking-tight">
                          Let's Start Shopping
                          <span className="block text-lg font-extrabold text-emerald-450 mt-1.5 font-sans lowercase">ચાલો ખરીદી શરૂ કરીએ</span>
                        </h2>
                        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed font-semibold">
                          Fresh groceries, premium service, and smooth shopping experience.
                          <span className="block text-[11px] text-slate-500 mt-1 font-bold">તાજું કરિયાણું, પ્રીમિયમ સેવા અને ખરીદીનો ઉત્તમ અનુભવ.</span>
                        </p>
                      </div>

                      {/* Feature Highlights */}
                      <div className="flex flex-wrap gap-2 justify-center max-w-sm px-2 pt-2">
                        {[
                          { text: "Exclusive Offers", guj: "ખાસ ઓફરો", color: "amber" },
                          { text: "Loyalty Rewards", guj: "લોયલ્ટી રિવોર્ડ્સ", color: "emerald" },
                          { text: "Easy Checkout", guj: "સરળ ચેકઆઉટ", color: "blue" }
                        ].map((feat, idx) => (
                          <motion.span
                            key={feat.text}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 + idx * 0.1 }}
                            className="px-3.5 py-2 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black text-slate-300 tracking-wide flex items-center gap-1.5 shadow-sm"
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              feat.color === 'amber' ? 'bg-amber-450' : (feat.color === 'emerald' ? 'bg-emerald-450' : 'bg-blue-400')
                            }`} />
                            {feat.text} | {feat.guj}
                          </motion.span>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Onboarding Bottom Indicators & Buttons */}
              <div className="flex flex-col items-center gap-6 pb-6 max-w-md mx-auto w-full z-10 relative">
                {/* Pagination Dots */}
                <div className="flex gap-2">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={`h-2 rounded-full transition-all duration-350 ${introStep === i ? 'w-6 bg-emerald-500' : 'w-2 bg-slate-700'}`}
                    />
                  ))}
                </div>

                {/* Control Actions */}
                {introStep < 3 ? (
                  introStep === 0 ? (
                    <button
                      onClick={() => setIntroStep(prev => prev + 1)}
                      className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer border-none shadow-lg shadow-emerald-950/20"
                    >
                      આગળ વધો / Next
                    </button>
                  ) : (
                    <div className="flex gap-3 w-full animate-fadeIn">
                      <button
                        onClick={() => setIntroStep(prev => prev - 1)}
                        className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer"
                      >
                        પાછા / Back
                      </button>
                      <button
                        onClick={() => setIntroStep(prev => prev + 1)}
                        className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer border-none shadow-lg shadow-emerald-950/20"
                      >
                        આગળ / Next
                      </button>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col gap-2.5 w-full">
                    <button
                      onClick={() => {
                        localStorage.setItem('ggms_intro_seen', 'true');
                        setShowIntro(false);
                      }}
                      className="w-full py-4 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 active:scale-[0.98] text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer border-none shadow-lg shadow-emerald-950/25"
                    >
                      શરૂ કરો / Get Started
                    </button>
                    <button
                      onClick={() => {
                        localStorage.setItem('ggms_intro_seen', 'true');
                        setShowIntro(false);
                      }}
                      className="w-full py-2.5 text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer border-none bg-transparent"
                    >
                      સ્કીપ / Skip
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 3. Exit Confirmation Modal */}
        <AnimatePresence>
          {showExitConfirm && (
            <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-[28px] border border-slate-200 dark:border-slate-800 p-6 text-center shadow-2xl"
              >
                <div className="w-12 h-12 bg-rose-50 dark:bg-rose-950/30 rounded-2xl flex items-center justify-center text-rose-500 mx-auto mb-4 border border-rose-100 dark:border-rose-900/50">
                  <LogOut className="w-6 h-6" />
                </div>
                <h3 className="text-slate-900 dark:text-white font-extrabold text-base mb-1">એપ બંધ કરો? / Close App?</h3>
                <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed mb-6 font-semibold">
                  શું તમે ખરેખર જીજીએમએન્ડએસ ગ્રોસરી એપમાંથી બહાર નીકળવા માંગો છો?
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowExitConfirm(false)}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-250 rounded-xl text-xs font-bold transition-all cursor-pointer border-none"
                  >
                    ના / Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      window.close();
                      setShowExitConfirm(false);
                    }}
                    className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border-none shadow-md"
                  >
                    હા / Exit App
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* 4. App Rating Popup */}
        <AnimatePresence>
          {showRateAppPopup && (
            <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-[28px] border border-slate-200 dark:border-slate-800 p-6 text-center shadow-2xl"
              >
                <div className="w-14 h-14 bg-amber-400 rounded-3xl flex items-center justify-center text-white mx-auto mb-4 border border-amber-300 shadow-md">
                  <Gift className="w-7 h-7" />
                </div>
                <h3 className="text-slate-900 dark:text-white font-extrabold text-base mb-1">તમને ૫૦ પોઈન્ટ મળ્યા! 🎉</h3>
                <p className="text-[10px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest mb-3">Earned 50 Loyalty Points!</p>
                <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed mb-6 font-semibold">
                  અમને પ્લે સ્ટોર પર રેટ કરો અને તમારો અનુભવ શેર કરો! ⭐️⭐️⭐️⭐️⭐️
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      window.open("https://play.google.com/store", "_blank");
                      setShowRateAppPopup(false);
                    }}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border-none shadow-md"
                  >
                    એપ રેટ કરો / Rate App
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRateAppPopup(false)}
                    className="w-full py-2.5 text-xs font-bold text-slate-400 hover:text-slate-650 dark:hover:text-slate-300 transition-colors cursor-pointer border-none bg-transparent"
                  >
                    પછીથી / Remind Me Later
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}

interface ScrollingAnnouncementProps {
  text?: string;
}

// 📢 Scrolling Announcement Bar (Marquee Notice)
const ScrollingAnnouncement: React.FC<ScrollingAnnouncementProps> = ({ text }) => {
  const noticeText = text || "🚚 મહત્વની સૂચના: ₹2000 થી વધુ ની ખરીદી પર જ હોમ ડિલિવરી મળશે. ₹2000 થી ઓછી ખરીદી માટે ઓર્ડર આપીને દુકાનેથી રૂબરૂ (Pick Up) લઈ જવાનું રહેશે.";
  
  return (
    <div className="relative overflow-hidden w-full bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border-y border-amber-200/50 py-2 sm:py-2.5 my-3 shadow-2xs backdrop-blur-xs rounded-xl sm:rounded-2xl">
      <div className="animate-marquee whitespace-nowrap flex gap-12 items-center">
        <span className="text-xs sm:text-sm font-bold text-amber-900 flex items-center gap-2">
          {noticeText}
        </span>
        <span className="text-xs sm:text-sm font-bold text-amber-900 flex items-center gap-2">
          {noticeText}
        </span>
        <span className="text-xs sm:text-sm font-bold text-amber-900 flex items-center gap-2">
          {noticeText}
        </span>
        <span className="text-xs sm:text-sm font-bold text-amber-900 flex items-center gap-2">
          {noticeText}
        </span>
      </div>
    </div>
  );
};

// 🚚 Welcome Delivery Popup Component (shows on first visit)
const WelcomeDeliveryPopup: React.FC = () => {
  const [isOpen, setIsOpen] = useState(() => {
    return sessionStorage.getItem('welcomePopupSeen') !== 'true';
  });

  const handleClose = () => {
    setIsOpen(false);
    sessionStorage.setItem('welcomePopupSeen', 'true');
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(8px)' }}
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: 30 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
          style={{
            background: 'linear-gradient(160deg, #FFF7ED 0%, #FFFBEB 30%, #FEF3C7 70%, #FDE68A 100%)',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Decorative elements */}
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-amber-300/20"></div>
          <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-orange-300/15"></div>
          <div className="absolute top-20 right-10 w-12 h-12 rounded-full bg-amber-200/30"></div>

          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/80 hover:bg-white text-amber-700 hover:text-amber-900 transition-all shadow-sm z-10"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="relative px-6 py-8 sm:px-8 sm:py-10">
            {/* Header Icon */}
            <div className="flex justify-center mb-5">
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-400 via-orange-400 to-orange-500 flex items-center justify-center shadow-xl shadow-orange-300/40"
              >
                <Truck className="w-10 h-10 text-white" />
              </motion.div>
            </div>

            {/* Title */}
            <h2 className="text-center text-xl sm:text-2xl font-black text-amber-900 mb-2">
              📢 ડિલિવરી માહિતી
            </h2>
            <p className="text-center text-xs font-bold text-amber-600 uppercase tracking-widest mb-6">
              Delivery Information
            </p>

            {/* Info Cards */}
            <div className="space-y-3 mb-6">
              {/* Home Delivery Info */}
              <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 border border-amber-200/50">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                    <Truck className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-amber-900 leading-snug">
                      ₹2000 થી વધુ ની ખરીદી પર <span className="text-emerald-600 font-extrabold">હોમ ડિલિવરી</span> મળશે
                    </p>
                    <p className="text-[11px] text-amber-700/70 mt-1">
                      Home delivery on orders above ₹2,000
                    </p>
                  </div>
                </div>
              </div>

              {/* Store Pickup Info */}
              <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 border border-amber-200/50">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                    <Store className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-amber-900 leading-snug">
                      ₹2000 થી ઓછી ખરીદી માટે ઓર્ડર આપીને <span className="text-blue-600 font-extrabold">રૂબરૂ લઈ જાવ</span>
                    </p>
                    <p className="text-[11px] text-amber-700/70 mt-1">
                      For orders below ₹2,000, order online & pick up from store
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA Button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleClose}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 text-white font-black text-sm uppercase tracking-widest shadow-lg shadow-orange-300/30 flex items-center justify-center gap-2"
            >
              <ShoppingCart className="w-5 h-5" />
              ખરીદી શરૂ કરો / Start Shopping
            </motion.button>
          </div>

          {/* Bottom accent */}
          <div className="h-1.5 bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400"></div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// Banner Ad Slider Sub-Component
interface BannerSliderProps {
  banners: Banner[];
  onSelectCategory: (catName: string) => void;
}

const BannerSlider: React.FC<BannerSliderProps> = ({ banners, onSelectCategory }) => {
  const activeBanners = useMemo(() => banners.filter(b => b.isActive), [banners]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Auto rotation
  React.useEffect(() => {
    if (activeBanners.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % activeBanners.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [activeBanners]);

  // Safety guard against index out of range (e.g. if activeBanners changes size)
  React.useEffect(() => {
    if (currentIndex >= activeBanners.length) {
      setCurrentIndex(0);
    }
  }, [activeBanners, currentIndex]);

  if (activeBanners.length === 0) return null;

  const currentBanner = activeBanners[currentIndex];

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex(prev => (prev - 1 + activeBanners.length) % activeBanners.length);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex(prev => (prev + 1) % activeBanners.length);
  };

  const handleBannerClick = () => {
    if (currentBanner.linkUrl) {
      onSelectCategory(currentBanner.linkUrl);
    }
  };

  return (
    <div 
      className="relative w-full max-w-[1000px] mx-auto bg-slate-100 rounded-2xl sm:rounded-3xl overflow-hidden shadow-sm group border border-slate-200/50"
    >
      {/* 16:9 ratio — 1000×565 banner size */}
      <div className="relative w-full aspect-video">
        <div className="absolute inset-0">
          <div 
            onClick={handleBannerClick}
            className={`w-full h-full relative ${currentBanner.linkUrl ? 'cursor-pointer' : ''}`}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={currentBanner.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.4 }}
                className="w-full h-full absolute inset-0"
              >
                <img 
                  src={currentBanner.imageUrl} 
                  alt={currentBanner.title || 'Promo Banner'} 
                  className="w-full h-full object-cover"
                />
                {currentBanner.title && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 sm:p-4 md:p-6 flex flex-col justify-end text-white">
                    <h3 className="text-base sm:text-lg md:text-xl font-black uppercase tracking-wide leading-tight">
                      {currentBanner.title}
                    </h3>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Navigation Arrows - always visible on mobile */}
          {activeBanners.length > 1 && (
            <>
              <button 
                onClick={handlePrev}
                className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-9 h-9 sm:w-10 sm:h-10 bg-white/90 hover:bg-white text-slate-800 rounded-full flex items-center justify-center shadow-md sm:opacity-0 sm:group-hover:opacity-100 opacity-80 transition-opacity duration-200 z-10"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button 
                onClick={handleNext}
                className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-9 h-9 sm:w-10 sm:h-10 bg-white/90 hover:bg-white text-slate-800 rounded-full flex items-center justify-center shadow-md sm:opacity-0 sm:group-hover:opacity-100 opacity-80 transition-opacity duration-200 z-10"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Dots Indicator */}
          {activeBanners.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
              {activeBanners.map((_, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentIndex(idx);
                  }}
                  className={`w-2 h-2 rounded-full transition-all ${currentIndex === idx ? 'bg-white w-5' : 'bg-white/50 hover:bg-white/80'}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Banner Manage/Edit Form Sub-Component
interface BannerFormProps {
  onAdd: (b: Omit<Banner, 'id'>) => void;
  onUpdate?: (b: Omit<Banner, 'id'>) => void;
  initialData?: Banner;
  availableCategories: string[];
}

const BannerForm: React.FC<BannerFormProps> = ({ 
  onAdd, 
  onUpdate, 
  initialData, 
  availableCategories 
}) => {
  const [title, setTitle] = useState(initialData?.title || '');
  const [imageUrl, setImageUrl] = useState(initialData?.imageUrl || '');
  const [linkUrl, setLinkUrl] = useState(initialData?.linkUrl || '');
  const [isActive, setIsActive] = useState(initialData?.isActive ?? true);
  const [uploadType, setUploadType] = useState<'url' | 'file'>(initialData?.imageUrl?.startsWith('data:') ? 'file' : 'url');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageUrl) {
      alert('Please provide a banner image URL or file. / કૃપા કરીને બેનર ઈમેજ URL અથવા ફાઈલ આપો.');
      return;
    }

    const payload = {
      title: title || undefined,
      imageUrl,
      linkUrl: linkUrl || undefined,
      isActive,
      order: initialData?.order ?? 0
    };

    if (initialData && onUpdate) {
      onUpdate(payload);
    } else {
      onAdd(payload);
      setTitle('');
      setImageUrl('');
      setLinkUrl('');
      setIsActive(true);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      compressImage(file, 1600, 430, 0.7, (compressedBase64) => {
        setImageUrl(compressedBase64);
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Ad Title / Banner Text</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Special Discount on Spices"
          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:border-primary-green outline-hidden"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Image Source Type / ઈમેજ સોર્સ</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setUploadType('url')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${uploadType === 'url' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-500 border-slate-200'}`}
          >
            Image URL
          </button>
          <button
            type="button"
            onClick={() => setUploadType('file')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${uploadType === 'file' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-500 border-slate-200'}`}
          >
            Upload File
          </button>
        </div>
      </div>

      {uploadType === 'url' ? (
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Banner Image URL</label>
          <input
            type="text"
            value={imageUrl.startsWith('data:') ? '' : imageUrl}
            onChange={e => setImageUrl(e.target.value)}
            placeholder="https://images.unsplash.com/..."
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:border-primary-green outline-hidden"
          />
        </div>
      ) : (
        <div className="space-y-1.5 flex flex-col items-center">
          <label className="relative cursor-pointer group w-full">
            <div className="w-full h-32 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-slate-400 group-hover:border-primary-green group-hover:bg-emerald-50 transition-all overflow-hidden text-center p-2">
              {imageUrl && imageUrl.startsWith('data:') ? (
                <>
                  <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <X className="text-white w-5 h-5" onClick={(e) => {
                      e.preventDefault();
                      setImageUrl('');
                    }} />
                  </div>
                </>
              ) : (
                <>
                  <Camera className="w-6 h-6 mb-1 text-slate-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Choose Image File (Auto Resized / ઓટો સાઇઝ સેટ થશે)</span>
                </>
              )}
            </div>
            <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
          </label>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Link to Department / Category (Optional)</label>
        <select
          value={linkUrl}
          onChange={e => setLinkUrl(e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:border-primary-green outline-hidden cursor-pointer"
        >
          <option value="">Do not link (Static Banner)</option>
          {availableCategories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 pl-1 py-1">
        <input 
          type="checkbox" 
          id="banner-is-active"
          checked={isActive} 
          onChange={e => setIsActive(e.target.checked)} 
          className="rounded text-primary-green focus:ring-primary-green cursor-pointer"
        />
        <label htmlFor="banner-is-active" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
          Active (Show in slider)
        </label>
      </div>

      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        type="submit"
        className="w-full bg-slate-900 text-white py-3.5 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 mt-2"
      >
        <Plus className="w-4 h-4" /> {initialData ? 'Update Banner' : 'Create Banner'}
      </motion.button>
    </form>
  );
};

interface AdminCouponsPanelProps {
  coupons: Coupon[];
  couponUsages: CouponUsage[];
  onAdd: (coupon: Omit<Coupon, 'id' | 'createdAt' | 'totalUsed'>) => Promise<void>;
  onUpdate: (id: string, coupon: Omit<Coupon, 'id' | 'createdAt' | 'totalUsed'>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  availableCategories: string[];
  editingCoupon: Coupon | null;
  setEditingCoupon: (coupon: Coupon | null) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const AdminCouponsPanel: React.FC<AdminCouponsPanelProps> = ({
  coupons,
  couponUsages,
  onAdd,
  onUpdate,
  onDelete,
  availableCategories,
  editingCoupon,
  setEditingCoupon,
  showToast
}) => {
  const [subTab, setSubTab] = useState<'all' | 'logs'>('all');
  
  // Form fields state
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<'flat' | 'percentage' | 'free_delivery' | 'category'>('flat');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [minOrderAmount, setMinOrderAmount] = useState<number>(0);
  const [maxDiscount, setMaxDiscount] = useState<number>(0);
  const [category, setCategory] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [usageLimit, setUsageLimit] = useState<number>(1000);
  const [activeStatus, setActiveStatus] = useState(true);
  const [firstOrderOnly, setFirstOrderOnly] = useState(false);
  const [onePerCustomer, setOnePerCustomer] = useState(true);
  const [customerSpecific, setCustomerSpecific] = useState('');

  // Populate form if editingCoupon is set
  useEffect(() => {
    if (editingCoupon) {
      setCode(editingCoupon.code);
      setTitle(editingCoupon.title);
      setDescription(editingCoupon.description);
      setDiscountType(editingCoupon.discountType);
      setDiscountValue(editingCoupon.discountValue);
      setMinOrderAmount(editingCoupon.minOrderAmount);
      setMaxDiscount(editingCoupon.maxDiscount || 0);
      setCategory(editingCoupon.category || '');
      setExpiryDate(editingCoupon.expiryDate);
      setUsageLimit(editingCoupon.usageLimit);
      setActiveStatus(editingCoupon.activeStatus);
      setFirstOrderOnly(editingCoupon.firstOrderOnly);
      setOnePerCustomer(editingCoupon.onePerCustomer);
      setCustomerSpecific(editingCoupon.customerSpecific || '');
    } else {
      clearForm();
    }
  }, [editingCoupon]);

  const clearForm = () => {
    setCode('');
    setTitle('');
    setDescription('');
    setDiscountType('flat');
    setDiscountValue(0);
    setMinOrderAmount(0);
    setMaxDiscount(0);
    setCategory('');
    // Default expiry date: 30 days from now
    const d = new Date();
    d.setDate(d.getDate() + 30);
    setExpiryDate(d.toISOString().split('T')[0]);
    setUsageLimit(1000);
    setActiveStatus(true);
    setFirstOrderOnly(false);
    setOnePerCustomer(true);
    setCustomerSpecific('');
  };

  const handlePreset = (presetName: string) => {
    const today = new Date();
    const endOfYear = new Date(today.getFullYear(), 11, 31);
    const endOfNavratri = new Date(today.getFullYear(), 9, 31); // End of October approx
    const endOfDiwali = new Date(today.getFullYear(), 10, 30); // End of November approx
    
    // Get next Sunday
    const nextSunday = new Date();
    nextSunday.setDate(today.getDate() + (7 - today.getDay()) % 7);
    if (nextSunday.toDateString() === today.toDateString()) {
      nextSunday.setDate(nextSunday.getDate() + 7); // Next Sunday if today is Sunday
    }

    if (presetName === 'welcome') {
      setCode('WELCOME50');
      setTitle('Welcome Discount');
      setDescription('Get ₹50 flat discount on your first order / તમારા પહેલા ઓર્ડર પર ₹૫૦ ફ્લેટ ડિસ્કાઉન્ટ મેળવો');
      setDiscountType('flat');
      setDiscountValue(50);
      setMinOrderAmount(300);
      setMaxDiscount(0);
      setCategory('');
      setExpiryDate(endOfYear.toISOString().split('T')[0]);
      setUsageLimit(1000);
      setActiveStatus(true);
      setFirstOrderOnly(true);
      setOnePerCustomer(true);
      setCustomerSpecific('');
      showToast('Welcome preset loaded!', 'info');
    } else if (presetName === 'navratri') {
      setCode('NAVRATRI10');
      setTitle('Navratri Special');
      setDescription('10% off on all grocery items during Navratri / નવરાત્રિ દરમિયાન કરિયાણાની વસ્તુઓ પર ૧૦% ડિસ્કાઉન્ટ');
      setDiscountType('percentage');
      setDiscountValue(10);
      setMinOrderAmount(1000);
      setMaxDiscount(150);
      setCategory('');
      setExpiryDate(endOfNavratri.toISOString().split('T')[0]);
      setUsageLimit(2000);
      setActiveStatus(true);
      setFirstOrderOnly(false);
      setOnePerCustomer(true);
      setCustomerSpecific('');
      showToast('Navratri preset loaded!', 'info');
    } else if (presetName === 'diwali') {
      setCode('DIWALI200');
      setTitle('Diwali Celebration');
      setDescription('₹200 flat discount on orders above ₹2000 / ₹૨૦૦૦ થી વધુ ઓર્ડર પર ₹૨૦૦ ફ્લેટ ડિસ્કાઉન્ટ');
      setDiscountType('flat');
      setDiscountValue(200);
      setMinOrderAmount(2000);
      setMaxDiscount(0);
      setCategory('');
      setExpiryDate(endOfDiwali.toISOString().split('T')[0]);
      setUsageLimit(1500);
      setActiveStatus(true);
      setFirstOrderOnly(false);
      setOnePerCustomer(true);
      setCustomerSpecific('');
      showToast('Diwali preset loaded!', 'info');
    } else if (presetName === 'free_del') {
      setCode('FREEDEL');
      setTitle('Free Delivery Offer');
      setDescription('Free Home Delivery on all orders this weekend / આ વીકએન્ડમાં બધા ઓર્ડર પર ફ્રી હોમ ડિલિવરી');
      setDiscountType('free_delivery');
      setDiscountValue(0);
      setMinOrderAmount(250);
      setMaxDiscount(0);
      setCategory('');
      setExpiryDate(nextSunday.toISOString().split('T')[0]);
      setUsageLimit(5000);
      setActiveStatus(true);
      setFirstOrderOnly(false);
      setOnePerCustomer(false);
      setCustomerSpecific('');
      showToast('Free Delivery preset loaded!', 'info');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code || !title || !description || !expiryDate) {
      showToast('Please fill all required fields / કૃપા કરીને બધી વિગતો ભરો', 'error');
      return;
    }
    if (discountType !== 'free_delivery' && discountValue <= 0) {
      showToast('Discount value must be greater than 0 / ડિસ્કાઉન્ટ કિંમત ૦ થી વધારે હોવી જોઈએ', 'error');
      return;
    }

    const data: Omit<Coupon, 'id' | 'createdAt' | 'totalUsed'> = {
      code: code.toUpperCase().trim(),
      title: title.trim(),
      description: description.trim(),
      discountType,
      discountValue: discountType === 'free_delivery' ? 0 : Number(discountValue),
      minOrderAmount: Number(minOrderAmount),
      expiryDate,
      usageLimit: Number(usageLimit),
      activeStatus,
      firstOrderOnly,
      onePerCustomer,
      ...(discountType === 'percentage' && maxDiscount ? { maxDiscount: Number(maxDiscount) } : {}),
      ...(discountType === 'category' && category ? { category } : {}),
      ...(customerSpecific.trim() ? { customerSpecific: customerSpecific.trim() } : {})
    };

    if (editingCoupon) {
      await onUpdate(editingCoupon.id, data);
    } else {
      if (coupons.some(c => c.code.toUpperCase() === data.code)) {
        showToast('Coupon code already exists! / આ કૂપન કોડ પહેલેથી જ છે!', 'error');
        return;
      }
      await onAdd(data);
    }
    clearForm();
  };

  // Analytics summary calculation
  const totalSavings = useMemo(() => {
    return couponUsages.reduce((acc, curr) => acc + curr.discountAmount, 0);
  }, [couponUsages]);

  const activeCount = useMemo(() => {
    return coupons.filter(c => c.activeStatus).length;
  }, [coupons]);

  return (
    <div className="space-y-8">
      {/* Analytics Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Coupons</span>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">{coupons.length}</span>
            <span className="text-xs text-slate-400">created</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Active Offers</span>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-600">{activeCount}</span>
            <span className="text-xs text-emerald-400">running</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Savings Given</span>
          <div className="mt-4 flex items-baseline gap-1">
            <IndianRupee className="w-6 h-6 text-slate-900" />
            <span className="text-3xl font-black text-slate-900">{totalSavings.toLocaleString('en-IN')}</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Redemptions</span>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-blue-600">{couponUsages.length}</span>
            <span className="text-xs text-blue-400">times used</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Form Builder & List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Form Builder */}
        <div className="lg:col-span-4 bg-white p-6 rounded-[32px] border border-slate-100 shadow-lg h-fit">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Gift className="w-5 h-5 text-emerald-600" />
              {editingCoupon ? 'Edit Coupon' : 'Create Coupon'}
            </h3>
            {editingCoupon && (
              <button 
                onClick={() => setEditingCoupon(null)} 
                className="text-xs text-slate-400 hover:text-slate-600 underline font-bold"
              >
                Cancel Edit
              </button>
            )}
          </div>

          {/* Preset templates */}
          {!editingCoupon && (
            <div className="mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Preset Quick Templates</span>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => handlePreset('welcome')} className="bg-white hover:bg-slate-100 border border-slate-200 text-[10px] font-bold py-2 px-1 rounded-xl text-center text-slate-700 truncate shadow-xs">
                  🎉 Welcome ₹50
                </button>
                <button type="button" onClick={() => handlePreset('navratri')} className="bg-white hover:bg-slate-100 border border-slate-200 text-[10px] font-bold py-2 px-1 rounded-xl text-center text-slate-700 truncate shadow-xs">
                  🕌 Navratri 10%
                </button>
                <button type="button" onClick={() => handlePreset('diwali')} className="bg-white hover:bg-slate-100 border border-slate-200 text-[10px] font-bold py-2 px-1 rounded-xl text-center text-slate-700 truncate shadow-xs">
                  🪔 Diwali ₹200
                </button>
                <button type="button" onClick={() => handlePreset('free_del')} className="bg-white hover:bg-slate-100 border border-slate-200 text-[10px] font-bold py-2 px-1 rounded-xl text-center text-slate-700 truncate shadow-xs">
                  🚚 Free Delivery
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">Coupon Code *</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
                disabled={!!editingCoupon}
                className="w-full bg-slate-50 px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:border-emerald-600 font-bold text-slate-900 disabled:opacity-50"
                placeholder="e.g. FESTIVAL50"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">Title (ENG) *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-50 px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:border-emerald-600 font-medium text-slate-900"
                  placeholder="e.g. Diwali Fest"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">Expiry Date *</label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="w-full bg-slate-50 px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:border-emerald-600 font-medium text-slate-900"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">Description (Guj / Eng) *</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full bg-slate-50 px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:border-emerald-600 text-sm font-medium text-slate-900 resize-none"
                placeholder="e.g. Get ₹50 flat discount / ₹૫૦ ડિસ્કાઉન્ટ મેળવો"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">Discount Type</label>
                <select
                  value={discountType}
                  onChange={(e) => {
                    const val = e.target.value as any;
                    setDiscountType(val);
                    if (val === 'free_delivery') {
                      setDiscountValue(0);
                    }
                  }}
                  className="w-full bg-slate-50 px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:border-emerald-600 font-semibold text-slate-900"
                >
                  <option value="flat">Flat ₹ Discount</option>
                  <option value="percentage">Percentage % Discount</option>
                  <option value="free_delivery">Free Delivery</option>
                  <option value="category">Category Flat ₹</option>
                </select>
              </div>

              {discountType !== 'free_delivery' && (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">
                    Value ({discountType === 'percentage' ? '%' : '₹'}) *
                  </label>
                  <input
                    type="number"
                    value={discountValue || ''}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                    className="w-full bg-slate-50 px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:border-emerald-600 font-bold text-slate-900"
                    placeholder="Value"
                    required
                  />
                </div>
              )}
            </div>

            {discountType === 'percentage' && (
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">Max Discount Cap (₹) (Optional)</label>
                <input
                  type="number"
                  value={maxDiscount || ''}
                  onChange={(e) => setMaxDiscount(Number(e.target.value))}
                  className="w-full bg-slate-50 px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:border-emerald-600 font-bold text-slate-900"
                  placeholder="e.g. 150"
                />
              </div>
            )}

            {discountType === 'category' && (
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">Target Category *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-slate-50 px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:border-emerald-600 font-semibold text-slate-900"
                  required
                >
                  <option value="">Select Category</option>
                  {availableCategories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">Min Order Amount (₹)</label>
                <input
                  type="number"
                  value={minOrderAmount || ''}
                  onChange={(e) => setMinOrderAmount(Number(e.target.value))}
                  className="w-full bg-slate-50 px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:border-emerald-600 font-bold text-slate-900"
                  placeholder="Min cart total"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">Total Usage Limit</label>
                <input
                  type="number"
                  value={usageLimit || ''}
                  onChange={(e) => setUsageLimit(Number(e.target.value))}
                  className="w-full bg-slate-50 px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:border-emerald-600 font-bold text-slate-900"
                  placeholder="e.g. 1000"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">Restrict to Phone (Optional)</label>
              <input
                type="text"
                value={customerSpecific}
                onChange={(e) => setCustomerSpecific(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-slate-50 px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:border-emerald-600 font-semibold text-slate-900"
                placeholder="10-digit number e.g. 9876543210"
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeStatus}
                  onChange={(e) => setActiveStatus(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Active (કૂપન ચાલુ છે)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={firstOrderOnly}
                  onChange={(e) => setFirstOrderOnly(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">First Order Only</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onePerCustomer}
                  onChange={(e) => setOnePerCustomer(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">One Limit per customer</span>
              </label>
            </div>

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              type="submit"
              className="w-full bg-slate-900 text-white py-3.5 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 mt-2"
            >
              <Plus className="w-4 h-4" /> {editingCoupon ? 'Update Coupon' : 'Create Coupon'}
            </motion.button>
          </form>
        </div>

        {/* Coupons List and logs */}
        <div className="lg:col-span-8 bg-white p-6 rounded-[32px] border border-slate-100 shadow-lg flex flex-col">
          {/* Sub-Navigation tabs */}
          <div className="flex gap-2 border-b border-slate-100 pb-4 mb-6">
            <button
              onClick={() => setSubTab('all')}
              className={`px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
                subTab === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
              }`}
            >
              All Coupons ({coupons.length})
            </button>
            <button
              onClick={() => setSubTab('logs')}
              className={`px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
                subTab === 'logs'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
              }`}
            >
              Redemption Audit Logs ({couponUsages.length})
            </button>
          </div>

          {subTab === 'all' ? (
            <div className="overflow-x-auto flex-1">
              {coupons.length === 0 ? (
                <div className="text-center py-20 text-slate-400">
                  <Tag className="w-12 h-12 mx-auto opacity-20 mb-4" />
                  <p className="italic text-sm">No coupons created yet.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="py-3 px-4 text-xs font-black text-slate-400 uppercase tracking-wider">Code / Title</th>
                      <th className="py-3 px-4 text-xs font-black text-slate-400 uppercase tracking-wider">Type / Value</th>
                      <th className="py-3 px-4 text-xs font-black text-slate-400 uppercase tracking-wider">Min Order</th>
                      <th className="py-3 px-4 text-xs font-black text-slate-400 uppercase tracking-wider">Redeemed</th>
                      <th className="py-3 px-4 text-xs font-black text-slate-400 uppercase tracking-wider">Expiry</th>
                      <th className="py-3 px-4 text-xs font-black text-slate-400 uppercase tracking-wider">Status</th>
                      <th className="py-3 px-4 text-xs font-black text-slate-400 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coupons.map((coupon) => {
                      const isExpired = new Date(coupon.expiryDate) < new Date(new Date().toISOString().split('T')[0]);
                      return (
                        <tr key={coupon.id} className="border-b border-slate-50 hover:bg-slate-50 transition-all">
                          <td className="py-4 px-4">
                            <span className="bg-slate-100 text-slate-800 text-xs font-extrabold px-2.5 py-1 rounded-md border border-slate-200">
                              {coupon.code}
                            </span>
                            <span className="block text-xs font-black text-slate-900 mt-1.5">{coupon.title}</span>
                            <span className="block text-[10px] text-slate-400 max-w-[180px] truncate">{coupon.description}</span>
                          </td>
                          <td className="py-4 px-4 text-xs font-semibold text-slate-700">
                            {coupon.discountType === 'flat' && `₹${coupon.discountValue} Flat`}
                            {coupon.discountType === 'percentage' && `${coupon.discountValue}% Off`}
                            {coupon.discountType === 'free_delivery' && 'Free Delivery'}
                            {coupon.discountType === 'category' && `₹${coupon.discountValue} Flat (${coupon.category})`}
                            {coupon.maxDiscount ? <span className="block text-[10px] text-slate-400">Cap: ₹{coupon.maxDiscount}</span> : null}
                          </td>
                          <td className="py-4 px-4 text-xs font-bold text-slate-900">
                            ₹{coupon.minOrderAmount}
                          </td>
                          <td className="py-4 px-4 text-xs font-bold">
                            <span className="text-slate-900">{coupon.totalUsed || 0}</span>
                            <span className="text-slate-400 font-normal"> / {coupon.usageLimit}</span>
                          </td>
                          <td className="py-4 px-4">
                            <span className={`text-xs font-bold ${isExpired ? 'text-red-500' : 'text-slate-600'}`}>
                              {coupon.expiryDate}
                            </span>
                            {isExpired && <span className="block text-[9px] font-bold text-red-400 uppercase tracking-widest">Expired</span>}
                          </td>
                          <td className="py-4 px-4">
                            <button
                              onClick={() => {
                                onUpdate(coupon.id, {
                                  ...coupon,
                                  activeStatus: !coupon.activeStatus
                                });
                              }}
                              className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border transition-all ${
                                coupon.activeStatus
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                  : 'bg-slate-50 border-slate-200 text-slate-500'
                              }`}
                            >
                              {coupon.activeStatus ? 'Active' : 'Inactive'}
                            </button>
                          </td>
                          <td className="py-4 px-4 text-right">
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => setEditingCoupon(coupon)}
                                className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-900 rounded-lg transition-all"
                                title="Edit"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => onDelete(coupon.id)}
                                className="p-1.5 hover:bg-red-50 text-red-500 hover:text-red-700 rounded-lg transition-all"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto flex-1">
              {couponUsages.length === 0 ? (
                <div className="text-center py-20 text-slate-400">
                  <ClipboardList className="w-12 h-12 mx-auto opacity-20 mb-4" />
                  <p className="italic text-sm">No redemption logs recorded yet.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="py-3 px-4 text-xs font-black text-slate-400 uppercase tracking-wider">Date & Time</th>
                      <th className="py-3 px-4 text-xs font-black text-slate-400 uppercase tracking-wider">Customer Phone</th>
                      <th className="py-3 px-4 text-xs font-black text-slate-400 uppercase tracking-wider">Coupon Code</th>
                      <th className="py-3 px-4 text-xs font-black text-slate-400 uppercase tracking-wider">Savings Given</th>
                      <th className="py-3 px-4 text-xs font-black text-slate-400 uppercase tracking-wider">Order Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...couponUsages].sort((a, b) => new Date(b.usedAt).getTime() - new Date(a.usedAt).getTime()).map((log) => {
                      const formattedTime = new Date(log.usedAt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      });
                      return (
                        <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50 transition-all">
                          <td className="py-4 px-4 text-xs font-medium text-slate-500">
                            {formattedTime}
                          </td>
                          <td className="py-4 px-4 text-xs font-bold text-slate-900">
                            {log.customerPhone}
                          </td>
                          <td className="py-4 px-4">
                            <span className="bg-slate-100 text-slate-800 text-xs font-bold px-2 py-0.5 rounded border border-slate-200">
                              {log.couponCode}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-xs font-black text-emerald-600">
                            +₹{log.discountAmount}
                          </td>
                          <td className="py-4 px-4 text-[10px] font-mono text-slate-400">
                            {log.orderId}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Product detail view sub-page
interface ProductDetailPageProps {
  products: Product[];
  addToCart: (product: Product, quantity: number, variant?: ProductVariant) => void;
  onViewProduct?: (productId: string) => void;
}

function ProductDetailPageWrapper({ products, addToCart, onViewProduct }: ProductDetailPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (id) {
      onViewProduct?.(id);
    }
  }, [id, onViewProduct]);

  const foundProduct = products.find(p => p.id === id);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | undefined>(() => {
    return foundProduct && foundProduct.variants && foundProduct.variants.length > 0
      ? foundProduct.variants[0]
      : undefined;
  });

  if (!foundProduct) {
    return (
      <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 max-w-xl mx-auto p-8 shadow-sm mt-8">
        <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-black text-slate-900 mb-2">Product Not Found</h2>
        <p className="text-slate-500 mb-6">The product you are trying to view does not exist or has been removed.</p>
        <button onClick={() => navigate('/')} className="bg-primary-green text-white px-6 py-3 rounded-2xl font-bold hover:bg-secondary-green transition-all shadow-lg">
          Back to Shop
        </button>
      </div>
    );
  }

  const currentPrice = selectedVariant ? selectedVariant.price : foundProduct.price;
  const currentMrp = selectedVariant ? selectedVariant.mrp : foundProduct.mrp;
  const currentUnit = selectedVariant ? selectedVariant.name : foundProduct.unit;

  const discount = currentMrp && currentMrp > currentPrice 
    ? ((currentMrp - currentPrice) / currentMrp * 100).toFixed(0) 
    : '0';
  const hasDiscount = parseInt(discount) > 0;

  const handleAddToCart = () => {
    addToCart(foundProduct, qty, selectedVariant);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      <button 
        onClick={() => navigate(-1)} 
        className="flex items-center gap-2 text-slate-600 hover:text-primary-green font-bold text-sm mb-6 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-xs hover:border-primary-green/30 transition-all w-fit"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Products
      </button>

      <div className="bg-white rounded-[32px] border border-slate-100 shadow-xl overflow-hidden grid md:grid-cols-12 gap-8 p-6 md:p-10">
        <div className="md:col-span-6 flex items-center justify-center bg-slate-50 rounded-2xl p-6 relative aspect-square border border-slate-100">
          {foundProduct.image ? (
            <img src={foundProduct.image} alt={foundProduct.name} className="max-h-full max-w-full object-contain rounded-lg" />
          ) : (
            <ImageIcon className="w-24 h-24 text-slate-200" />
          )}
          {hasDiscount && (
            <span className="absolute top-4 left-4 bg-red-500 text-white text-xs font-black px-3 py-1.5 rounded-full uppercase tracking-wider shadow-md">
              Save {discount}%
            </span>
          )}
        </div>

        <div className="md:col-span-6 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-black text-primary-green uppercase tracking-widest bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100 inline-block mb-4">
              {foundProduct.category}
            </span>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight leading-tight mb-2 uppercase">
              {foundProduct.name}
            </h2>
            {foundProduct.gujaratiName && (
              <h3 className="text-xl font-bold text-slate-500 font-sans mb-6">
                {foundProduct.gujaratiName}
              </h3>
            )}

            {/* Variants Selector Pills / સાઇઝ સિલેક્ટર */}
            {foundProduct.variants && foundProduct.variants.length > 0 && (
              <div className="mb-6">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Select Size / સાઇઝ પસંદ કરો:</span>
                <div className="flex flex-wrap gap-2">
                  {foundProduct.variants.map(v => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVariant(v)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                        selectedVariant?.id === v.id
                          ? 'bg-[#00884F] text-white border-[#00884F] shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-[#00884F]/30 hover:bg-white'
                      }`}
                    >
                      {v.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 flex items-center justify-between mb-8">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pricing Details</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-[#00884F]">₹{currentPrice.toFixed(2)}</span>
                  <span className="text-xs text-slate-500 font-bold lowercase">/ {currentUnit}</span>
                </div>
              </div>
              {currentMrp && currentMrp > currentPrice && (
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">M.R.P.</p>
                  <span className="text-lg text-slate-400 line-through font-semibold">₹{currentMrp.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Genuine product packaged with care. High quality and fresh stock guaranteed from your trusted local vendor.
              </p>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 space-y-4">
            <div className="flex items-center gap-4">
              <span className="text-xs font-black text-slate-900 uppercase tracking-widest">Quantity:</span>
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-2xl p-1 gap-4">
                <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white text-slate-900 font-black border border-slate-100 shadow-sm active:scale-95 transition-all">
                  -
                </button>
                <span className="w-8 text-center font-black text-slate-900 text-lg">{qty}</span>
                <button onClick={() => setQty(Math.min(99, qty + 1))} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white text-slate-900 font-black border border-slate-100 shadow-sm active:scale-95 transition-all">
                  +
                </button>
              </div>
            </div>

            <button
              onClick={handleAddToCart}
              className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl active:scale-[0.98] flex items-center justify-center gap-2 ${added ? 'bg-emerald-600 text-white shadow-emerald-500/20' : 'bg-[#FFB800] text-slate-900 shadow-yellow-500/10'}`}
            >
              {added ? <CheckCircle className="w-5 h-5" /> : <ShoppingCart className="w-5 h-5" />}
              {added ? 'Added to Basket!' : 'Add to Basket'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Category Listing Card
interface CategoryCardProps {
  item?: CategoryItem;
  name?: string;
  isActive: boolean;
  onClick: () => void;
}

const CategoryCard: React.FC<CategoryCardProps> = ({ item, name, isActive, onClick }) => {
  return (
    <motion.button
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`bg-white border rounded-[22px] p-2.5 sm:p-4 flex flex-col items-center justify-center gap-2.5 transition-all ${isActive ? 'border-primary-green bg-emerald-50/50 shadow-xs' : 'border-slate-200/80 hover:border-emerald-200 hover:shadow-sm'}`}
    >
      <div className="w-full aspect-square rounded-xl sm:rounded-2xl overflow-hidden bg-slate-50 flex items-center justify-center relative shadow-inner border border-slate-100">
        {item?.image ? (
          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
        ) : name === 'All Products' ? (
          <div className="w-full h-full bg-[#00884F] flex items-center justify-center text-white">
            <Package className="w-6 h-6 sm:w-10 sm:h-10" />
          </div>
        ) : (
          <ImageIcon className="w-6 h-6 sm:w-10 sm:h-10 text-slate-200" />
        )}
      </div>
      <div className="text-center overflow-hidden w-full flex-1 flex flex-col justify-center">
        <h4 className={`text-[9px] sm:text-xs font-black uppercase tracking-tight leading-tight line-clamp-2 ${isActive ? 'text-primary-green' : 'text-slate-800'}`}>
          {name || item?.name}
        </h4>
        {item?.gujaratiName && (
          <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 mt-0.5 line-clamp-1">({item.gujaratiName})</p>
        )}
      </div>
    </motion.button>
  );
};

interface CheckoutFormProps {
  onSubmit: (details: CustomerDetails) => void;
  isDisabled: boolean;
  cartTotal: number;
  finalTotal: number;
  couponDiscount: number;
  appliedCoupon: Coupon | null;
  customerProfile: CustomerProfile | null;
}

const CheckoutForm: React.FC<CheckoutFormProps> = ({ 
  onSubmit, isDisabled, cartTotal, finalTotal, couponDiscount, appliedCoupon, customerProfile 
}) => {
  const [details, setDetails] = useState<CustomerDetails>({ name: '', phone: '', address: '', deliveryMode: undefined });
  const [showDeliveryWarning, setShowDeliveryWarning] = useState(false);
  const isHomeDeliveryEligible = cartTotal >= 2000 || (appliedCoupon && appliedCoupon.discountType === 'free_delivery');

  // Auto-fill details from profile
  useEffect(() => {
    if (customerProfile) {
      const defaultAddr = customerProfile.savedAddresses?.find(a => a.isDefault)?.address || '';
      setDetails(prev => ({
        ...prev,
        name: prev.name || customerProfile.name || '',
        phone: prev.phone || customerProfile.phone || '',
        address: prev.address || defaultAddr || ''
      }));
    }
  }, [customerProfile]);

  const handleDeliveryModeSelect = (mode: 'home_delivery' | 'pickup') => {
    if (mode === 'home_delivery' && !isHomeDeliveryEligible) {
      setShowDeliveryWarning(true);
      return;
    }
    setShowDeliveryWarning(false);
    const defaultAddr = customerProfile?.savedAddresses?.find(a => a.isDefault)?.address || '';
    setDetails(prev => ({ 
      ...prev, 
      deliveryMode: mode, 
      address: mode === 'pickup' 
        ? 'Pick Up At Store' 
        : (prev.address === 'Pick Up At Store' || prev.address === '' ? (defaultAddr || prev.address) : prev.address) 
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!details.deliveryMode) {
      alert('કૃપા કરીને ડિલિવરી વિકલ્પ પસંદ કરો / Please select a delivery option.');
      return;
    }
    if (!details.name || !details.phone) {
      alert('કૃપા કરીને બધી વિગતો ભરો / Please fill out all details.');
      return;
    }
    if (details.deliveryMode === 'home_delivery' && !details.address) {
      alert('કૃપા કરીને ડિલિવરી એડ્રેસ ભરો / Please enter delivery address.');
      return;
    }
    onSubmit(details);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h4 className="font-black text-slate-900 text-xs uppercase tracking-wider mb-1">Delivery Option / ડિલિવરી વિકલ્પ</h4>
      
      {/* Delivery Mode Selection */}
      <div className="grid grid-cols-2 gap-3">
        {/* Home Delivery Option */}
        <button
          type="button"
          onClick={() => handleDeliveryModeSelect('home_delivery')}
          className={`relative p-3.5 rounded-2xl border-2 text-left transition-all ${
            details.deliveryMode === 'home_delivery' 
              ? 'border-emerald-500 bg-emerald-50 shadow-md shadow-emerald-100' 
              : isHomeDeliveryEligible
                ? 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30'
                : 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'
          }`}
        >
          {details.deliveryMode === 'home_delivery' && (
            <div className="absolute top-2 right-2">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
            </div>
          )}
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${
            details.deliveryMode === 'home_delivery' ? 'bg-emerald-500' : 'bg-slate-200'
          }`}>
            <Truck className={`w-5 h-5 ${details.deliveryMode === 'home_delivery' ? 'text-white' : 'text-slate-500'}`} />
          </div>
          <p className="text-[10px] font-black text-slate-900 uppercase leading-tight">Home Delivery</p>
          <p className="text-[9px] font-bold text-slate-400 mt-0.5">હોમ ડિલિવરી</p>
          {!isHomeDeliveryEligible && (
            <p className="text-[8px] font-bold text-red-500 mt-1">₹2000+ જરૂરી</p>
          )}
        </button>

        {/* Pick Up Option */}
        <button
          type="button"
          onClick={() => handleDeliveryModeSelect('pickup')}
          className={`relative p-3.5 rounded-2xl border-2 text-left transition-all ${
            details.deliveryMode === 'pickup' 
              ? 'border-blue-500 bg-blue-50 shadow-md shadow-blue-100' 
              : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/30'
          }`}
        >
          {details.deliveryMode === 'pickup' && (
            <div className="absolute top-2 right-2">
              <CheckCircle className="w-4 h-4 text-blue-500" />
            </div>
          )}
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${
            details.deliveryMode === 'pickup' ? 'bg-blue-500' : 'bg-slate-200'
          }`}>
            <Store className={`w-5 h-5 ${details.deliveryMode === 'pickup' ? 'text-white' : 'text-slate-500'}`} />
          </div>
          <p className="text-[10px] font-black text-slate-900 uppercase leading-tight">Pick Up At Store</p>
          <p className="text-[9px] font-bold text-slate-400 mt-0.5">દુકાનેથી લઈ જાવ</p>
        </button>
      </div>

      {/* ₹2000 Warning Popup */}
      <AnimatePresence>
        {showDeliveryWarning && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-200 flex items-center justify-center shrink-0">
                <AlertCircle className="w-4 h-4 text-amber-700" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-amber-900 leading-snug">
                  ₹2000 થી વધુ ની ખરીદી પર જ હોમ ડિલિવરી મળશે
                </p>
                <p className="text-[10px] text-amber-700 mt-1">
                  Home delivery only for orders above ₹2,000. Your current total: <span className="font-black">₹{cartTotal.toFixed(0)}</span>
                </p>
                <p className="text-[10px] text-amber-600 mt-1 font-semibold">
                  તમે "Pick Up At Store" પસંદ કરી ઓર્ડર મુકી શકો છો.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowDeliveryWarning(false);
                    handleDeliveryModeSelect('pickup');
                  }}
                  className="mt-2 text-[10px] font-black text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-100 transition-all"
                >
                  🏪 Pick Up At Store પસંદ કરો
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowDeliveryWarning(false)}
                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-amber-200/50 transition-all shrink-0"
              >
                <X className="w-3 h-3 text-amber-600" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Customer Details - show after delivery mode selected */}
      <AnimatePresence>
        {details.deliveryMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 overflow-hidden"
          >
            <h4 className="font-black text-slate-900 text-xs uppercase tracking-wider pt-2">
              {details.deliveryMode === 'home_delivery' ? 'Delivery Details / ડિલિવરી વિગતો' : 'Your Details / તમારી વિગતો'}
            </h4>

            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                required
                type="text"
                placeholder="તમારું નામ / Your Name"
                value={details.name}
                onChange={e => setDetails({ ...details, name: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-4 py-3.5 text-xs font-bold focus:border-primary-green outline-hidden"
              />
            </div>

            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                required
                type="tel"
                placeholder="WhatsApp નંબર / WhatsApp Number"
                value={details.phone}
                onChange={e => setDetails({ ...details, phone: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-4 py-3.5 text-xs font-bold focus:border-primary-green outline-hidden"
              />
            </div>

            {/* Address - only for Home Delivery */}
            {details.deliveryMode === 'home_delivery' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2.5"
              >
                {customerProfile && customerProfile.savedAddresses && customerProfile.savedAddresses.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Select Address / સરનામું પસંદ કરો</label>
                    <div className="flex flex-wrap gap-1.5">
                      {customerProfile.savedAddresses.map(addr => (
                        <button
                          key={addr.id}
                          type="button"
                          onClick={() => setDetails(prev => ({ ...prev, address: addr.address }))}
                          className={`px-3 py-1.5 rounded-xl border text-[10px] font-black transition-all ${
                            details.address === addr.address
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-500 shadow-xs'
                              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-350'
                          }`}
                        >
                          {addr.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="relative">
                  <MapPin className="absolute left-4 top-4 w-4 h-4 text-slate-400" />
                  <textarea
                    required
                    rows={3}
                    placeholder="સંપૂર્ણ ડિલિવરી એડ્રેસ / Complete Delivery Address"
                    value={details.address === 'Pick Up At Store' ? '' : details.address}
                    onChange={e => setDetails({ ...details, address: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-4 py-3.5 text-xs font-bold focus:border-emerald-500 outline-hidden resize-none"
                  />
                </div>
              </motion.div>
            )}

            {/* Pickup confirmation badge */}
            {details.deliveryMode === 'pickup' && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 flex items-center gap-2">
                <Store className="w-4 h-4 text-blue-600 shrink-0" />
                <p className="text-[11px] font-bold text-blue-800">
                  તમારો ઓર્ડર દુકાનેથી લઈ જવાનો રહેશે / You'll pick up from our store
                </p>
              </div>
            )}

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              type="submit"
              disabled={isDisabled}
              className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg disabled:opacity-40 disabled:grayscale transition-all flex items-center justify-center gap-2 mt-4 ${
                details.deliveryMode === 'home_delivery'
                  ? 'bg-emerald-600 text-white shadow-emerald-100 shadow-md'
                  : 'bg-blue-600 text-white shadow-blue-100 shadow-md'
              }`}
            >
              <Send className="w-4 h-4" />
              {details.deliveryMode === 'home_delivery' 
                ? `Send Order (₹${finalTotal.toFixed(0)}) / ઓર્ડર મોકલો 🚚` 
                : `Place Pickup Order (₹${finalTotal.toFixed(0)}) / ઓર્ડર મુકો 🏪`
              }
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
};

// Category Manage/Edit Form
interface CategoryFormProps {
  onAdd: (c: Omit<CategoryItem, 'id'>) => void;
  onUpdate?: (c: Omit<CategoryItem, 'id'>) => void;
  initialData?: CategoryItem;
  nextOrder: number;
}

const CategoryForm: React.FC<CategoryFormProps> = ({ onAdd, onUpdate, initialData, nextOrder }) => {
  const [name, setName] = useState(initialData?.name || '');
  const [gujaratiName, setGujaratiName] = useState(initialData?.gujaratiName || '');
  const [image, setImage] = useState<string | null>(initialData?.image || null);
  const [order] = useState<number>(initialData?.order ?? nextOrder);
  const [uploadType, setUploadType] = useState<'url' | 'file'>(() => {
    const img = initialData?.image || '';
    if (img.startsWith('data:')) return 'file';
    if (img && !img.startsWith('data:')) return 'url';
    return 'file';
  });
  const [imageUrl, setImageUrl] = useState(() => {
    const img = initialData?.image || '';
    return (!img.startsWith('data:')) ? img : '';
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    let finalImage: string | undefined;
    if (uploadType === 'url' && imageUrl.trim()) {
      finalImage = imageUrl.trim();
    } else if (uploadType === 'file' && image && image.startsWith('data:')) {
      finalImage = image;
    } else if (image) {
      finalImage = image;
    }

    const cat = { name, gujaratiName, image: finalImage, order };
    if (initialData && onUpdate) {
      onUpdate(cat);
    } else {
      onAdd(cat);
      setName('');
      setGujaratiName('');
      setImage(null);
      setImageUrl('');
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      compressImage(file, 600, 600, 0.7, (compressedBase64) => {
        setImage(compressedBase64);
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Image Source Type Toggle */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Image Source / ફોટો સોર્સ</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setUploadType('url')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${uploadType === 'url' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-500 border-slate-200'}`}
          >
            Image URL
          </button>
          <button
            type="button"
            onClick={() => setUploadType('file')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${uploadType === 'file' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-500 border-slate-200'}`}
          >
            Upload File
          </button>
        </div>
      </div>

      {uploadType === 'url' ? (
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Category Image URL</label>
          <input
            type="text"
            value={imageUrl}
            onChange={e => setImageUrl(e.target.value)}
            placeholder="https://images.unsplash.com/..."
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:border-primary-green outline-hidden"
          />
          {imageUrl && (
            <div className="mt-2 w-20 h-20 rounded-2xl border border-slate-200 overflow-hidden mx-auto bg-slate-50">
              <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <label className="relative cursor-pointer group">
            <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-slate-400 group-hover:border-primary-green group-hover:bg-emerald-50 transition-all overflow-hidden text-center p-1.5">
              {image ? (
                <>
                  <img src={image} alt="Preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <X className="text-white w-5 h-5" onClick={(e) => {
                      e.preventDefault();
                      setImage(null);
                    }} />
                  </div>
                </>
              ) : (
                <>
                  <Camera className="w-5 h-5 mb-0.5 text-slate-400" />
                  <span className="text-[8px] font-bold uppercase tracking-widest text-slate-400">Photo</span>
                </>
              )}
            </div>
            <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
          </label>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">English Name</label>
        <input
          required
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Rice & Flour"
          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:border-primary-green outline-hidden"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Gujarati Name (Optional)</label>
        <input
          type="text"
          value={gujaratiName}
          onChange={e => setGujaratiName(e.target.value)}
          placeholder="શાકભાજી વગેરે"
          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:border-primary-green outline-hidden font-sans"
        />
      </div>

      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        type="submit"
        className="w-full bg-slate-900 text-white py-3.5 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 mt-2"
      >
        <Plus className="w-4 h-4" /> {initialData ? 'Update Category / કેટેગરી અપડેટ કરો' : 'Create Category / કેટેગરી બનાવો'}
      </motion.button>
    </form>
  );
};

const parseCustomSizeMultiplier = (size: string): number => {
  const clean = size.toLowerCase().trim();
  const numMatch = clean.match(/^([0-9.]+)\s*(gm|kg|ml|l|litre|litres|g)?$/);
  if (!numMatch) return 1.0;
  
  const val = parseFloat(numMatch[1]);
  const unit = numMatch[2] || '';
  
  if (unit === 'gm' || unit === 'g') {
    return val / 1000;
  }
  if (unit === 'ml') {
    return val / 1000;
  }
  if (unit === 'kg') {
    return val;
  }
  if (unit === 'l' || unit === 'litre' || unit === 'litres') {
    return val;
  }
  return 1.0;
};

const getWeightMultiplier = (size: string): number => {
  switch (size) {
    case '50 gm': return 0.05;
    case '100 gm': return 0.1;
    case '200 gm': return 0.2;
    case '250 gm': return 0.25;
    case '500 gm': return 0.5;
    case '1 kg': return 1.0;
    case '2 kg': return 2.0;
    case '3 kg': return 3.0;
    case '5 kg': return 5.0;
    case '10 kg': return 10.0;
    default: return parseCustomSizeMultiplier(size);
  }
};

const getVolumeMultiplier = (size: string): number => {
  switch (size) {
    case '100 ml': return 0.1;
    case '200 ml': return 0.2;
    case '500 ml': return 0.5;
    case '1 L': return 1.0;
    case '2 L': return 2.0;
    case '5 L': return 5.0;
    case '15 L': return 15.0;
    default: return parseCustomSizeMultiplier(size);
  }
};

// Product Manage/Edit Form
interface ProductFormProps {
  onAdd: (p: Omit<Product, 'id'>) => void;
  onUpdate?: (p: Omit<Product, 'id'>) => void;
  initialData?: Product;
  availableCategories: string[];
  availableUnits: string[];
  onAddNewCategory: (cat: string) => void;
  onAddNewUnit: (unit: string) => void;
}

const ProductForm: React.FC<ProductFormProps> = ({ 
  onAdd, 
  onUpdate,
  initialData,
  availableCategories, 
  availableUnits,
  onAddNewCategory,
  onAddNewUnit
}) => {
  const [name, setName] = useState(initialData?.name || '');
  const [category, setCategory] = useState(initialData?.category || availableCategories[0] || 'KARIYANU');

  const [variantType, setVariantType] = useState<'none' | 'weight' | 'volume'>(() => {
    if (!initialData?.variants || initialData.variants.length === 0) return 'none';
    const first = initialData.variants[0].name.toLowerCase();
    if (first.includes('ml') || first.includes(' l')) return 'volume';
    if (first.includes('gm') || first.includes('kg')) return 'weight';
    return 'none';
  });

  const [selectedSizes, setSelectedSizes] = useState<string[]>(() => {
    if (!initialData?.variants || initialData.variants.length === 0) return [];
    return initialData.variants.map(v => v.name);
  });

  const [price, setPrice] = useState(() => {
    if (initialData?.variants && initialData.variants.length > 0) {
      const first = initialData.variants[0];
      const n = first.name.toLowerCase();
      let multiplier = 1.0;
      if (n.includes('ml') || n.includes(' l') || n.includes('gm') || n.includes('kg')) {
        multiplier = n.includes('ml') || n.includes(' l') 
          ? getVolumeMultiplier(first.name) 
          : getWeightMultiplier(first.name);
      }
      return (first.price / multiplier).toString();
    }
    return initialData?.price.toString() || '';
  });

  const [mrp, setMrp] = useState(() => {
    if (initialData?.variants && initialData.variants.length > 0) {
      const first = initialData.variants[0];
      if (first.mrp) {
        const n = first.name.toLowerCase();
        let multiplier = 1.0;
        if (n.includes('ml') || n.includes(' l') || n.includes('gm') || n.includes('kg')) {
          multiplier = n.includes('ml') || n.includes(' l') 
            ? getVolumeMultiplier(first.name) 
            : getWeightMultiplier(first.name);
        }
        return (first.mrp / multiplier).toString();
      }
    }
    return initialData?.mrp?.toString() || '';
  });

  const [unit, setUnit] = useState(initialData?.unit || availableUnits[0] || 'kg');
  const [image, setImage] = useState<string | null>(initialData?.image || null);
  const [gujaratiName, setGujaratiName] = useState(initialData?.gujaratiName || '');
  const [hindiName, setHindiName] = useState(initialData?.hindiName || '');
  const [voiceKeywords, setVoiceKeywords] = useState(initialData?.voiceKeywords?.join(', ') || '');

  const [uploadType, setUploadType] = useState<'url' | 'file'>(() => {
    const img = initialData?.image || '';
    if (img.startsWith('data:')) return 'file';
    if (img && !img.startsWith('data:')) return 'url';
    return 'file';
  });
  const [productImageUrl, setProductImageUrl] = useState(() => {
    const img = initialData?.image || '';
    return (!img.startsWith('data:')) ? img : '';
  });

  const [isAddingNewCat, setIsAddingNewCat] = useState(false);
  const [newCat, setNewCat] = useState('');
  
  const [isAddingNewUnit, setIsAddingNewUnit] = useState(false);
  const [newUnitInput, setNewUnitInput] = useState('');

  const [customSizeInput, setCustomSizeInput] = useState('');

  const handleAddCustomSize = (e: React.MouseEvent) => {
    e.preventDefault();
    const cleanSize = customSizeInput.trim();
    if (!cleanSize) return;
    
    const lower = cleanSize.toLowerCase();
    if (variantType === 'weight') {
      if (!lower.endsWith('gm') && !lower.endsWith('g') && !lower.endsWith('kg')) {
        alert('❌ Please use gm or kg unit (e.g. 150 gm) / કૃપા કરીને gm અથવા kg યુનિટ વાપરો');
        return;
      }
    } else if (variantType === 'volume') {
      if (!lower.endsWith('ml') && !lower.endsWith('l') && !lower.endsWith('litre') && !lower.endsWith('litres')) {
        alert('❌ Please use ml or L unit (e.g. 250 ml) / કૃપા કરીને ml અથવા L યુનિટ વાપરો');
        return;
      }
    }

    if (selectedSizes.some(s => s.toLowerCase() === lower)) {
      alert('❌ This size already exists / આ સાઇઝ પહેલેથી ઉમેરેલી છે');
      return;
    }

    let formattedSize = cleanSize;
    const numPart = cleanSize.match(/^([0-9.]+)/)?.[1] || '';
    const unitPart = cleanSize.slice(numPart.length).trim();
    if (unitPart.toLowerCase() === 'l') {
      formattedSize = `${numPart} L`;
    } else if (unitPart.toLowerCase() === 'ml') {
      formattedSize = `${numPart} ml`;
    } else if (unitPart.toLowerCase() === 'gm' || unitPart.toLowerCase() === 'g') {
      formattedSize = `${numPart} gm`;
    } else if (unitPart.toLowerCase() === 'kg') {
      formattedSize = `${numPart} kg`;
    }

    setSelectedSizes(prev => [...prev, formattedSize]);
    setCustomSizeInput('');
  };

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      compressImage(file, 600, 600, 0.7, (compressedBase64) => {
        setImage(compressedBase64);
      });
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name || (variantType === 'none' && !price)) return;
    
    let finalCat = category;
    if (isAddingNewCat && newCat.trim()) {
      finalCat = newCat.trim().toUpperCase();
      onAddNewCategory(finalCat);
    }
    
    let finalUnit = unit;
    if (isAddingNewUnit && newUnitInput.trim()) {
      finalUnit = newUnitInput.trim();
      onAddNewUnit(finalUnit);
    }

    let priceVal = parseFloat(price);
    let mrpVal = mrp ? parseFloat(mrp) : undefined;

    let calculatedVariants: ProductVariant[] = [];
    if (variantType !== 'none') {
      if (selectedSizes.length === 0) {
        alert('❌ Please select at least one size / કૃપા કરીને ઓછામાં ઓછું એક માપ પસંદ કરો');
        return;
      }
      
      if (variantType === 'weight') {
        calculatedVariants = selectedSizes.map(size => {
          const mult = parseCustomSizeMultiplier(size);
          return {
            id: `v-${size.replace(/\s+/g, '')}`,
            name: size,
            price: parseFloat((priceVal * mult).toFixed(2)),
            mrp: mrpVal ? parseFloat((mrpVal * mult).toFixed(2)) : undefined
          };
        });
        calculatedVariants.sort((a, b) => parseCustomSizeMultiplier(a.name) - parseCustomSizeMultiplier(b.name));
      } else if (variantType === 'volume') {
        calculatedVariants = selectedSizes.map(size => {
          const mult = parseCustomSizeMultiplier(size);
          return {
            id: `v-${size.replace(/\s+/g, '')}`,
            name: size,
            price: parseFloat((priceVal * mult).toFixed(2)),
            mrp: mrpVal ? parseFloat((mrpVal * mult).toFixed(2)) : undefined
          };
        });
        calculatedVariants.sort((a, b) => parseCustomSizeMultiplier(a.name) - parseCustomSizeMultiplier(b.name));
      }

      priceVal = calculatedVariants[0].price;
      mrpVal = calculatedVariants[0].mrp;
      finalUnit = calculatedVariants[0].name;
    }

    let finalImage: string | undefined;
    if (uploadType === 'url' && productImageUrl.trim()) {
      finalImage = productImageUrl.trim();
    } else if (uploadType === 'file' && image && image.startsWith('data:')) {
      finalImage = image;
    } else if (image) {
      finalImage = image;
    }

    const dataPayload = { 
      name: name.toUpperCase(), 
      category: finalCat, 
      price: priceVal, 
      mrp: mrpVal, 
      unit: finalUnit, 
      image: finalImage,
      gujaratiName: gujaratiName || undefined,
      hindiName: hindiName || undefined,
      voiceKeywords: voiceKeywords ? voiceKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean) : undefined,
      variants: variantType !== 'none' ? calculatedVariants.map(v => ({ id: v.id, name: v.name, price: v.price, mrp: v.mrp || null })) : null
    };

    if (initialData && onUpdate) {
      onUpdate(dataPayload);
    } else {
      onAdd(dataPayload);
      setName('');
      setPrice('');
      setMrp('');
      setGujaratiName('');
      setHindiName('');
      setVoiceKeywords('');
      setImage(null);
      setProductImageUrl('');
      setSelectedSizes([]);
      setVariantType('none');
    }
    
    setIsAddingNewCat(false);
    setNewCat('');
    setIsAddingNewUnit(false);
    setNewUnitInput('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      {/* Image Source Type Toggle */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Image Source / ફોટો સોર્સ</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setUploadType('url')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${uploadType === 'url' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-500 border-slate-200'}`}
          >
            Image URL
          </button>
          <button
            type="button"
            onClick={() => setUploadType('file')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${uploadType === 'file' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-500 border-slate-200'}`}
          >
            Upload File
          </button>
        </div>
      </div>

      {uploadType === 'url' ? (
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Product Image URL</label>
          <input
            type="text"
            value={productImageUrl}
            onChange={e => setProductImageUrl(e.target.value)}
            placeholder="https://images.unsplash.com/..."
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:border-primary-green outline-hidden"
          />
          {productImageUrl && (
            <div className="mt-2 w-20 h-20 rounded-2xl border border-slate-200 overflow-hidden mx-auto bg-slate-50">
              <img src={productImageUrl} alt="Preview" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <label className="relative cursor-pointer group">
            <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-slate-400 group-hover:border-primary-green group-hover:bg-emerald-50 transition-all overflow-hidden">
              {image ? (
                <>
                  <img src={image} alt="Preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <X className="text-white w-5 h-5" onClick={(e) => {
                      e.preventDefault();
                      setImage(null);
                    }} />
                  </div>
                </>
              ) : (
                <>
                  <Camera className="w-5 h-5 mb-0.5 text-slate-400" />
                  <span className="text-[8px] font-bold uppercase tracking-widest text-slate-400">Photo</span>
                </>
              )}
            </div>
            <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
          </label>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Product Name (EN)</label>
        <input
          required
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Basmati Rice"
          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:border-primary-green outline-hidden"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Product Name (GUJ - Optional)</label>
        <input
          type="text"
          value={gujaratiName}
          onChange={e => setGujaratiName(e.target.value)}
          placeholder="ચોખા ૧ કિલો"
          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:border-primary-green outline-hidden font-sans"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Product Name (HIN - Optional)</label>
        <input
          type="text"
          value={hindiName}
          onChange={e => setHindiName(e.target.value)}
          placeholder="चावल 1 किलो"
          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:border-primary-green outline-hidden font-sans"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Voice Keywords / Alternate Pronunciations (Optional, comma-separated)</label>
        <input
          type="text"
          value={voiceKeywords}
          onChange={e => setVoiceKeywords(e.target.value)}
          placeholder="doodh, milk, dudh, dood"
          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:border-primary-green outline-hidden"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between items-center px-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</label>
          <button type="button" onClick={() => setIsAddingNewCat(!isAddingNewCat)} className="text-[9px] font-black text-primary-green uppercase tracking-widest hover:underline">
            {isAddingNewCat ? 'Choose' : '+ New'}
          </button>
        </div>
        {isAddingNewCat ? (
          <input
            autoFocus
            type="text"
            value={newCat}
            onChange={e => setNewCat(e.target.value)}
            placeholder="New category name..."
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:border-primary-green outline-hidden"
          />
        ) : (
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:border-primary-green outline-hidden cursor-pointer"
          >
            {availableCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        )}
      </div>

      {/* Variant Type Selector / વેરિએન્ટ પ્રકાર પસંદ કરો */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Variant Type / માપ પ્રકાર</label>
        <div className="flex gap-2 bg-slate-50 p-1 rounded-2xl border border-slate-200">
          {(['none', 'weight', 'volume'] as const).map(type => (
            <button
              key={type}
              type="button"
              onClick={() => {
                setVariantType(type);
                if (type === 'weight') setUnit('kg');
                else if (type === 'volume') setUnit('L');
              }}
              className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                variantType === type 
                  ? 'bg-slate-900 text-white shadow-xs' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {type === 'none' ? 'None' : type === 'weight' ? 'Weight (KG/GM)' : 'Volume (L/ML)'}
            </button>
          ))}
        </div>
      </div>

      {variantType === 'none' ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Selling Price (₹)</label>
              <input required={variantType === 'none'} type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:border-primary-green outline-hidden" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">M.R.P. (₹ - Optional)</label>
              <input type="number" step="0.01" value={mrp} onChange={e => setMrp(e.target.value)} placeholder="0" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:border-primary-green outline-hidden" />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center px-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Unit</label>
              <button type="button" onClick={() => setIsAddingNewUnit(!isAddingNewUnit)} className="text-[9px] font-black text-primary-green uppercase tracking-widest hover:underline">
                {isAddingNewUnit ? 'Choose' : '+ New'}
              </button>
            </div>
            {isAddingNewUnit ? (
              <input
                autoFocus
                type="text"
                value={newUnitInput}
                onChange={e => setNewUnitInput(e.target.value)}
                placeholder="e.g. piece"
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:border-primary-green outline-hidden"
              />
            ) : (
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:border-primary-green outline-hidden cursor-pointer"
              >
                {availableUnits.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-4 border border-slate-100 bg-slate-50/50 p-4 rounded-3xl">
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
                  Base Price (for 1 {variantType === 'weight' ? 'kg' : 'L'}) (₹)
                </label>
                <input 
                  required 
                  type="number" 
                  step="0.01" 
                  value={price} 
                  onChange={e => setPrice(e.target.value)} 
                  placeholder="e.g. 100" 
                  className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:border-[#00884F] outline-hidden" 
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
                  Base M.R.P. (for 1 {variantType === 'weight' ? 'kg' : 'L'}) (₹)
                </label>
                <input 
                  type="number" 
                  step="0.01" 
                  value={mrp} 
                  onChange={e => setMrp(e.target.value)} 
                  placeholder="e.g. 120" 
                  className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:border-[#00884F] outline-hidden" 
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
              Select Sizes / કદ પસંદ કરો:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-white p-3 rounded-2xl border border-slate-200">
              {(variantType === 'weight' 
                ? ['50 gm', '100 gm', '200 gm', '250 gm', '500 gm', '1 kg', '2 kg', '3 kg', '5 kg', '10 kg']
                : ['100 ml', '200 ml', '500 ml', '1 L', '2 L', '5 L', '15 L']
              ).map(size => {
                const isChecked = selectedSizes.includes(size);
                return (
                  <label 
                    key={size} 
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer select-none transition-all ${
                      isChecked 
                        ? 'border-[#00884F] bg-emerald-50/50 text-[#00884F] font-bold' 
                        : 'border-slate-100 bg-slate-50 text-slate-600 hover:bg-slate-100/50'
                    }`}
                  >
                    <input 
                      type="checkbox" 
                      checked={isChecked} 
                      onChange={() => {
                        setSelectedSizes(prev => 
                          prev.includes(size) ? prev.filter(s => s !== size) : [...prev, size]
                        );
                      }}
                      className="w-3.5 h-3.5 text-[#00884F] focus:ring-[#00884F] rounded-md cursor-pointer accent-[#00884F]"
                    />
                    <span className="text-xs">{size}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Custom Sized Pills / કસ્ટમ માપ */}
          <div className="space-y-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
              Custom Sizes / કસ્ટમ સાઇઝ:
            </span>
            <div className="flex flex-wrap gap-2 p-3 bg-white rounded-2xl border border-slate-200 min-h-[46px] items-center">
              {selectedSizes
                .filter(s => {
                  const standardList = variantType === 'weight'
                    ? ['50 gm', '100 gm', '200 gm', '250 gm', '500 gm', '1 kg', '2 kg', '3 kg', '5 kg', '10 kg']
                    : ['100 ml', '200 ml', '500 ml', '1 L', '2 L', '5 L', '15 L'];
                  return !standardList.includes(s);
                })
                .map(size => (
                  <span 
                    key={size} 
                    className="flex items-center gap-1.5 px-3 py-1 rounded-xl border border-[#00884F] bg-emerald-50 text-[#00884F] text-xs font-bold"
                  >
                    {size}
                    <button
                      type="button"
                      onClick={() => setSelectedSizes(prev => prev.filter(s => s !== size))}
                      className="hover:text-red-500 transition-colors shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              {selectedSizes.filter(s => {
                const standardList = variantType === 'weight'
                  ? ['50 gm', '100 gm', '200 gm', '250 gm', '500 gm', '1 kg', '2 kg', '3 kg', '5 kg', '10 kg']
                  : ['100 ml', '200 ml', '500 ml', '1 L', '2 L', '5 L', '15 L'];
                return !standardList.includes(s);
              }).length === 0 && (
                <span className="text-[10px] font-semibold text-slate-400 italic">No custom sizes added yet</span>
              )}
            </div>
          </div>

          {/* Add custom size input */}
          <div className="space-y-1.5" onClick={e => e.stopPropagation()}>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Add Custom Size / નવી સાઇઝ ઉમેરો</span>
            <div className="flex gap-2">
              <input
                type="text"
                value={customSizeInput}
                onChange={e => setCustomSizeInput(e.target.value)}
                placeholder={variantType === 'weight' ? 'e.g. 150 gm' : 'e.g. 250 ml'}
                className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:border-[#00884F] outline-hidden"
              />
              <button
                type="button"
                onClick={handleAddCustomSize}
                className="bg-[#00884F] hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all"
              >
                + Add
              </button>
            </div>
          </div>
        </div>
      )}

      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        type="submit"
        className="w-full bg-slate-900 text-white py-3.5 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 mt-2"
      >
        <Plus className="w-4 h-4" /> {initialData ? 'Update Product / પ્રોડક્ટ અપડેટ કરો' : 'Register Product / પ્રોડક્ટ ઉમેરો'}
      </motion.button>
    </form>
  );
};

// Customer Product Card
interface ProductCardProps {
  product: Product;
  onAdd: (p: Product, qty: number, variant?: ProductVariant) => void;
  isWishlisted: boolean;
  onToggleWishlist: (productId: string) => void;
  voiceIntent?: VoiceIntent | null;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, onAdd, isWishlisted, onToggleWishlist, voiceIntent }) => {
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | undefined>(() => {
    return product.variants && product.variants.length > 0 ? product.variants[0] : undefined;
  });

  const isMatchedByVoice = useMemo(() => {
    if (!voiceIntent) return false;
    const pName = product.name.toLowerCase();
    const pGuj = product.gujaratiName?.toLowerCase() || '';
    const pHindi = product.hindiName?.toLowerCase() || '';
    const pKeys = product.voiceKeywords?.map(k => k.toLowerCase()) || [];
    const intentProd = voiceIntent.product.toLowerCase();
    return pName.includes(intentProd) || 
           pGuj.includes(intentProd) || 
           pHindi.includes(intentProd) ||
           pKeys.some(k => k.includes(intentProd) || intentProd.includes(k));
  }, [voiceIntent, product]);

  useEffect(() => {
    if (voiceIntent && isMatchedByVoice) {
      if (voiceIntent.quantity) {
        setQty(voiceIntent.quantity);
      }
      if (voiceIntent.unit && product.variants && product.variants.length > 0) {
        const targetUnit = voiceIntent.unit.toLowerCase();
        const targetQtyStr = voiceIntent.quantity ? String(voiceIntent.quantity) : '';
        
        const matchedVar = product.variants.find(v => {
          const vName = v.name.toLowerCase();
          if (targetQtyStr && targetUnit) {
            return vName.includes(targetQtyStr) && (vName.includes(targetUnit) || (targetUnit === 'kilo' && vName.includes('kg')));
          }
          if (targetQtyStr) {
            return vName.includes(targetQtyStr);
          }
          if (targetUnit) {
            return vName.includes(targetUnit);
          }
          return false;
        });

        if (matchedVar) {
          setSelectedVariant(matchedVar);
        }
      }
    }
  }, [voiceIntent, product, isMatchedByVoice]);
  
  const currentPrice = selectedVariant ? selectedVariant.price : product.price;
  const currentMrp = selectedVariant ? selectedVariant.mrp : product.mrp;
  const currentUnit = selectedVariant ? selectedVariant.name : product.unit;

  const discount = currentMrp && currentMrp > currentPrice 
    ? ((currentMrp - currentPrice) / currentMrp * 100).toFixed(0) 
    : '0';
  const hasDiscount = parseInt(discount) > 0;

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid navigating to details page
    onAdd(product, qty, selectedVariant);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
    setQty(1);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: isMatchedByVoice ? 1.02 : 1 }}
      onClick={() => navigate(`/product/${product.id}`)}
      className={`bg-white rounded-[24px] overflow-hidden flex flex-col h-full group border shadow-xs hover:shadow-md hover:border-emerald-100 transition-all duration-300 cursor-pointer relative ${
        isMatchedByVoice 
          ? 'ring-4 ring-emerald-500/20 border-emerald-500 shadow-emerald-100 shadow-md' 
          : 'border-slate-200/80'
      }`}
    >
      <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-3">
        {product.image ? (
          <img src={product.image} alt={product.name} className="max-h-full max-w-full object-contain p-1 transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <ImageIcon className="w-8 h-8 text-slate-200" />
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleWishlist(product.id);
          }}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 hover:bg-white shadow-xs hover:shadow-md flex items-center justify-center border border-slate-100 transition-all duration-200 z-10"
        >
          <Heart className={`w-4 h-4 transition-all duration-300 ${isWishlisted ? 'fill-red-500 text-red-500 scale-110' : 'text-slate-400 hover:text-red-500'}`} />
        </button>
        {hasDiscount && (
          <div className="absolute top-2 left-2">
            <span className="bg-red-500 text-white text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider">
              -{discount}%
            </span>
          </div>
        )}
      </div>

      <div className="p-3.5 flex-1 flex flex-col justify-between">
        <div>
          <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">
            {product.category}
          </span>
          <h4 className="text-xs font-black text-slate-800 line-clamp-2 min-h-[2rem] leading-tight uppercase group-hover:text-primary-green transition-colors">
            {product.name}
          </h4>
          {product.gujaratiName && (
            <p className="text-[9px] font-semibold text-slate-400 mt-0.5 line-clamp-1">
              {product.gujaratiName}
            </p>
          )}

          {/* Variants Selector Dropdown */}
          {product.variants && product.variants.length > 0 && (
            <div className="mt-2" onClick={e => e.stopPropagation()}>
              <select
                value={selectedVariant?.id || ''}
                onChange={e => {
                  const found = product.variants?.find(v => v.id === e.target.value);
                  if (found) setSelectedVariant(found);
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 text-[10px] font-bold focus:border-[#00884F] outline-hidden cursor-pointer"
              >
                {product.variants.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.name} - ₹{v.price} {v.mrp && v.mrp > v.price ? `(MRP ₹${v.mrp})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        
        <div className="mt-3 space-y-2.5">
          <div className="flex items-baseline gap-1">
            <span className="text-base font-black text-[#00884F]">₹{currentPrice.toFixed(0)}</span>
            <span className="text-[9px] text-slate-400 font-bold lowercase">/ {currentUnit}</span>
            {currentMrp && currentMrp > currentPrice && (
              <span className="text-[10px] text-slate-400 line-through font-semibold ml-1">₹{currentMrp.toFixed(0)}</span>
            )}
          </div>

          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-0.5 gap-2" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setQty(Math.max(1, qty - 1))}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-white text-slate-900 font-black border border-slate-100 shadow-xs active:scale-90 transition-all font-mono text-xs"
            >
              -
            </button>
            <span className="flex-1 text-center font-black text-slate-900 text-xs">{qty}</span>
            <button
              onClick={() => setQty(Math.min(99, qty + 1))}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-white text-slate-900 font-black border border-slate-100 shadow-xs active:scale-90 transition-all font-mono text-xs"
            >
              +
            </button>
          </div>

          <button
            onClick={handleAdd}
            className={`w-full py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider hover:opacity-95 transition-all shadow-xs active:scale-[0.98] flex items-center justify-center gap-1.5 ${added ? 'bg-emerald-600 text-white' : 'bg-[#FFB800] text-slate-900 hover:bg-[#e6a500]'}`}
          >
            {added ? <CheckCircle className="w-3.5 h-3.5 text-white" /> : <ShoppingCart className="w-3.5 h-3.5" />}
            {added ? 'Added!' : 'Add to Cart'}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// ==========================================
// CUSTOMER AUTHENTICATION COMPONENTS & HELPERS
// ==========================================

export const normalizePhone = (phone: string) => {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }
  return cleaned;
};

export const phoneToEmail = (phone: string) => {
  return `${normalizePhone(phone)}@ggms.app`;
};

export const ToastContainer: React.FC<{ toasts: ToastMessage[] }> = ({ toasts }) => {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 max-w-sm w-full px-4 pointer-events-none">
      <AnimatePresence>
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className={`p-3 rounded-2xl shadow-lg text-xs font-black text-white flex items-center gap-2 border pointer-events-auto ${
              toast.type === 'success' 
                ? 'bg-emerald-600 border-emerald-500' 
                : toast.type === 'error' 
                  ? 'bg-rose-600 border-rose-500' 
                  : 'bg-blue-600 border-blue-500'
            }`}
          >
            {toast.type === 'success' && <CheckCircle className="w-4 h-4 shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
            {toast.type === 'info' && <Clock className="w-4 h-4 shrink-0" />}
            <span className="flex-1">{toast.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export const AuthModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onAuthSuccess: () => void;
}> = ({ isOpen, onClose, showToast, onAuthSuccess }) => {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !password) {
      showToast('કૃપા કરીને બધી વિગતો ભરો / Please fill all details.', 'error');
      return;
    }
    const cleanPhone = normalizePhone(phone);
    if (cleanPhone.length < 10) {
      showToast('સાચો ફોન નંબર દાખલ કરો / Enter a valid phone number.', 'error');
      return;
    }

    setLoading(true);
    try {
      const email = `${cleanPhone}@ggms.app`;
      await signInWithEmailAndPassword(auth, email, password);
      showToast('સફળતાપૂર્વક લૉગિન થયા! / Login Successful! 🎉', 'success');
      onAuthSuccess();
      onClose();
    } catch (error: any) {
      console.error(error);
      let errMsg = 'લૉગિન નિષ્ફળ ગયું / Login Failed';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errMsg = 'મોબાઈલ નંબર અથવા પાસવર્ડ ખોટો છે / Incorrect mobile or password';
      }
      showToast(errMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone || !password || !confirmPassword) {
      showToast('કૃપા કરીને બધી વિગતો ભરો / Please fill all details.', 'error');
      return;
    }
    const cleanPhone = normalizePhone(phone);
    if (!/^[6-9]\d{9}$/.test(phone.replace(/\D/g, ''))) {
      showToast('કૃપા કરીને સાચો ૧૦ આંકડાનો WhatsApp નંબર લખો / Enter a valid 10-digit number.', 'error');
      return;
    }
    if (password.length < 6) {
      showToast('પાસવર્ડ ઓછામાં ઓછો ૬ અક્ષરનો હોવો જોઈએ / Password must be at least 6 characters.', 'error');
      return;
    }
    if (password !== confirmPassword) {
      showToast('બંને પાસવર્ડ અલગ અલગ છે / Passwords do not match.', 'error');
      return;
    }

    setLoading(true);
    try {
      const email = `${cleanPhone}@ggms.app`;
      // Create user
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const user = credential.user;

      // Update Firebase Profile
      await updateProfile(user, { displayName: name });

      // Save to Firestore
      const newProfile: CustomerProfile = {
        uid: user.uid,
        name,
        phone: cleanPhone,
        createdAt: new Date().toISOString(),
        savedAddresses: [],
        wishlist: []
      };
      await setDoc(doc(db, 'customers', user.uid), newProfile);

      showToast('નવું એકાઉન્ટ સફળતાપૂર્વક બની ગયું! / Signup Successful! 🛒', 'success');
      onAuthSuccess();
      onClose();
    } catch (error: any) {
      console.error(error);
      let errMsg = 'સાઇનઅપ નિષ્ફળ ગયું / Signup Failed';
      if (error.code === 'auth/email-already-in-use') {
        errMsg = 'આ નંબર પર એકાઉન્ટ પહેલેથી બનેલું છે / This number is already registered.';
      }
      showToast(errMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        onClick={onClose} 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300"
      />

      {/* Modal Card */}
      <div className="relative bg-white w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] z-10 animate-in fade-in zoom-in-95 duration-205">
        
        {/* Header decoration */}
        <div className="bg-emerald-600 p-6 text-white text-center relative">
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-all"
          >
            <X className="w-4 h-4" />
          </button>
          
          <div className="w-12 h-12 bg-white/15 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Store className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-lg font-black tracking-wide">GGM&S Grocery Shop</h3>
          <p className="text-[10px] text-emerald-100 font-bold uppercase tracking-widest mt-0.5">Customer Portal / ગ્રાહક લૉગિન</p>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-100 bg-slate-50">
          <button
            type="button"
            onClick={() => { setTab('login'); }}
            className={`flex-1 py-4 text-center text-xs font-black uppercase tracking-wider transition-all border-b-2 ${
              tab === 'login' 
                ? 'border-emerald-600 text-emerald-600 bg-white' 
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            Login / લૉગિન
          </button>
          <button
            type="button"
            onClick={() => { setTab('signup'); }}
            className={`flex-1 py-4 text-center text-xs font-black uppercase tracking-wider transition-all border-b-2 ${
              tab === 'signup' 
                ? 'border-emerald-600 text-emerald-600 bg-white' 
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            Sign Up / નોંધણી
          </button>
        </div>

        {/* Form Container */}
        <div className="p-6 overflow-y-auto">
          {tab === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">WhatsApp Number / વૉટ્સએપ નંબર</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    required
                    type="tel"
                    placeholder="દા.ત. 9876543210"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-4 py-3.5 text-xs font-bold focus:border-emerald-500 focus:bg-white outline-hidden transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Password / પાસવર્ડ</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    required
                    type={showPassword ? 'text' : 'password'}
                    placeholder="છ કે તેથી વધુ અક્ષર"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-11 py-3.5 text-xs font-bold focus:border-emerald-500 focus:bg-white outline-hidden transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-100 hover:shadow-xl transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <User className="w-4 h-4" />
                      Login / લૉગિન
                    </>
                  )}
                </button>
              </div>

              <div className="text-center pt-2">
                <p className="text-[10px] text-slate-400 font-bold">
                  Forgot Password? / પાસવર્ડ ભૂલી ગયા?
                </p>
                <p className="text-[11px] font-black text-emerald-600 mt-1">
                  દુકાન પર રૂબરૂ અથવા WhatsApp પર સંપર્ક કરો.
                </p>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Full Name / તમારું પૂરું નામ</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    required
                    type="text"
                    placeholder="નામ અને અટક"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-4 py-3.5 text-xs font-bold focus:border-emerald-500 focus:bg-white outline-hidden transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">WhatsApp Number / વૉટ્સએપ નંબર</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    required
                    type="tel"
                    placeholder="૧૦ આંકડાનો WhatsApp નંબર"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-4 py-3.5 text-xs font-bold focus:border-emerald-500 focus:bg-white outline-hidden transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Password / પાસવર્ડ</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    required
                    type={showPassword ? 'text' : 'password'}
                    placeholder="ઓછામાં ઓછા ૬ અક્ષર"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-11 py-3.5 text-xs font-bold focus:border-emerald-500 focus:bg-white outline-hidden transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Confirm Password / કન્ફર્મ પાસવર્ડ</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    required
                    type={showPassword ? 'text' : 'password'}
                    placeholder="પાસવર્ડ ફરીથી લખો"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-11 py-3.5 text-xs font-bold focus:border-emerald-500 focus:bg-white outline-hidden transition-all"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-100 hover:shadow-xl transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      Sign Up / એકાઉન્ટ બનાવો
                    </>
                  )}
                </button>
              </div>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setTab('login')}
                  className="text-[10px] text-slate-400 font-bold hover:text-emerald-600 transition-colors"
                >
                  Already have an account? Login / લૉગિન કરો
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export const MyAccountPage: React.FC<{
  customerUser: FirebaseAuthUser;
  customerProfile: CustomerProfile | null;
  setCustomerProfile: React.Dispatch<React.SetStateAction<CustomerProfile | null>>;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  products: Product[];
  onAdd: (p: Product, qty: number, variant?: ProductVariant) => void;
  onLogout: () => void;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  cartTotal: number;
  updateCartQuantity: (id: string, delta: number) => void;
  shopSettings: any;
  preferredTheme: 'light' | 'dark' | 'system' | 'time_based';
  handleThemeChange: (theme: 'light' | 'dark' | 'system' | 'time_based') => Promise<void>;
  voiceIntent?: VoiceIntent | null;
  notificationPermission?: string;
  requestNotificationPermission?: () => Promise<void>;
  loyaltyPoints?: number;
}> = ({ 
  customerUser, customerProfile, setCustomerProfile, showToast, products, onAdd, onLogout,
  cart, setCart, cartTotal, updateCartQuantity, shopSettings,
  preferredTheme, handleThemeChange, voiceIntent,
  notificationPermission = 'default', requestNotificationPermission,
  loyaltyPoints = 120
}) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'orders' | 'addresses' | 'wishlist' | 'cart' | 'profile' | 'theme' | null>(null);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  
  // Profile Edit State
  const [profileName, setProfileName] = useState(customerProfile?.name || '');
  const [profilePhone, setProfilePhone] = useState(customerProfile?.phone || '');
  const [profileImg, setProfileImg] = useState(customerProfile?.profileImage || '');
  const [profileUpdating, setProfileUpdating] = useState(false);

  // Sync profile edits when customerProfile loads
  useEffect(() => {
    if (customerProfile) {
      setProfileName(customerProfile.name);
      setProfilePhone(customerProfile.phone);
      setProfileImg(customerProfile.profileImage || '');
    }
  }, [customerProfile]);

  // Image Upload handler
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      compressImage(file, 300, 300, 0.7, (base64) => {
        setProfileImg(base64);
      });
    }
  };

  // Handle Profile Update
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName || !profilePhone) {
      showToast('કૃપા કરીને નામ અને નંબર ભરો / Please fill name and phone.', 'error');
      return;
    }
    const cleanPhone = normalizePhone(profilePhone);
    if (!/^[6-9]\d{9}$/.test(profilePhone.replace(/\D/g, ''))) {
      showToast('કૃપા કરીને સાચો ૧૦ આંકડાનો WhatsApp નંબર લખો / Enter a valid 10-digit number.', 'error');
      return;
    }

    setProfileUpdating(true);
    try {
      // 1. Update Firebase Auth Email if phone changed
      if (cleanPhone !== customerProfile?.phone) {
        const newEmail = `${cleanPhone}@ggms.app`;
        try {
          const { updateEmail } = await import('firebase/auth');
          await updateEmail(customerUser, newEmail);
        } catch (authError: any) {
          console.error('Firebase Auth email update failed:', authError);
          if (authError.code === 'auth/requires-recent-login') {
            showToast('સેક્યુરિટીના કારણે નંબર બદલવા માટે ફરીથી લોગિન કરવું પડશે / For security, please log out and log in again to change phone number', 'error');
            setProfileUpdating(false);
            return;
          }
        }
      }

      // 2. Update Firebase Auth Profile name
      await updateProfile(customerUser, { displayName: profileName });

      // 3. Update Firestore Profile Doc
      const updatedProfile = {
        ...customerProfile,
        name: profileName,
        phone: cleanPhone,
        profileImage: profileImg
      };
      await setDoc(doc(db, 'customers', customerUser.uid), updatedProfile, { merge: true });
      setCustomerProfile(updatedProfile as CustomerProfile);
      showToast('પ્રોફાઇલ અપડેટ થઈ ગઈ! / Profile updated successfully! 🎉', 'success');
    } catch (err) {
      console.error(err);
      showToast('પ્રોફાઇલ અપડેટ નિષ્ફળ ગઈ / Profile update failed', 'error');
    } finally {
      setProfileUpdating(false);
    }
  };
  
  // Address Form State
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [addrLabel, setAddrLabel] = useState('');
  const [addrText, setAddrText] = useState('');
  const [editingAddrId, setEditingAddrId] = useState<string | null>(null);

  // Fetch orders
  useEffect(() => {
    const q = query(collection(db, 'orders'), where('customerId', '==', customerUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Order[] = [];
      snapshot.forEach(docSnap => {
        list.push({ ...docSnap.data(), id: docSnap.id } as Order);
      });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setCustomerOrders(list);
      setOrdersLoading(false);
    }, (err) => {
      console.error(err);
      setOrdersLoading(false);
    });
    return () => unsubscribe();
  }, [customerUser.uid]);

  // Handle address save (add or edit)
  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addrLabel || !addrText) return;

    const currentAddresses = customerProfile?.savedAddresses || [];
    let updatedAddresses: SavedAddress[] = [];

    if (editingAddrId) {
      // Edit existing
      updatedAddresses = currentAddresses.map(addr => 
        addr.id === editingAddrId 
          ? { ...addr, label: addrLabel, address: addrText } 
          : addr
      );
      showToast('સરનામું અપડેટ કર્યું / Address updated successfully', 'success');
    } else {
      // Add new
      const newAddress: SavedAddress = {
        id: Date.now().toString(),
        label: addrLabel,
        address: addrText,
        isDefault: currentAddresses.length === 0 // Default if it's the first address
      };
      updatedAddresses = [...currentAddresses, newAddress];
      showToast('સરનામું સાચવ્યું / Address added successfully', 'success');
    }

    try {
      await setDoc(doc(db, 'customers', customerUser.uid), { savedAddresses: updatedAddresses }, { merge: true });
      setCustomerProfile(prev => prev ? { ...prev, savedAddresses: updatedAddresses } : null);
      
      // Reset form
      setAddrLabel('');
      setAddrText('');
      setEditingAddrId(null);
      setShowAddressForm(false);
    } catch (error) {
      showToast('Error saving address', 'error');
    }
  };

  const handleEditAddress = (addr: SavedAddress) => {
    setAddrLabel(addr.label);
    setAddrText(addr.address);
    setEditingAddrId(addr.id);
    setShowAddressForm(true);
  };

  const handleDeleteAddress = async (addrId: string) => {
    const currentAddresses = customerProfile?.savedAddresses || [];
    const updatedAddresses = currentAddresses.filter(a => a.id !== addrId);
    
    // If we deleted the default one, make the first remaining one default
    if (currentAddresses.find(a => a.id === addrId)?.isDefault && updatedAddresses.length > 0) {
      updatedAddresses[0].isDefault = true;
    }

    try {
      await setDoc(doc(db, 'customers', customerUser.uid), { savedAddresses: updatedAddresses }, { merge: true });
      setCustomerProfile(prev => prev ? { ...prev, savedAddresses: updatedAddresses } : null);
      showToast('સરનામું કાઢી નાખ્યું / Address deleted successfully', 'info');
    } catch (error) {
      showToast('Error deleting address', 'error');
    }
  };

  const handleSetDefaultAddress = async (addrId: string) => {
    const currentAddresses = customerProfile?.savedAddresses || [];
    const updatedAddresses = currentAddresses.map(addr => ({
      ...addr,
      isDefault: addr.id === addrId
    }));

    try {
      await setDoc(doc(db, 'customers', customerUser.uid), { savedAddresses: updatedAddresses }, { merge: true });
      setCustomerProfile(prev => prev ? { ...prev, savedAddresses: updatedAddresses } : null);
      showToast('મુખ્ય સરનામું સેટ કર્યું / Default address updated', 'success');
    } catch (error) {
      showToast('Error setting default address', 'error');
    }
  };

  const handleReorder = (order: Order) => {
    order.items.forEach(item => {
      const latestProduct = products.find(p => p.id === item.id);
      if (latestProduct) {
        onAdd(latestProduct, item.quantity, item.selectedVariant);
      }
    });
    showToast('બધી આઇટમ્સ કાર્ટમાં ઉમેરવામાં આવી છે / All items added to basket!', 'success');
  };

  const handleDownloadInvoice = async (order: Order) => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        showToast('Failed to generate drawing context', 'error');
        return;
      }

      const hasCoupon = !!order.couponCode && (order.couponDiscount || 0) > 0;
      
      let totalProductSavings = 0;
      order.items.forEach(item => {
        const mrpVal = item.selectedVariant && item.selectedVariant.mrp ? item.selectedVariant.mrp : item.mrp;
        const priceVal = item.selectedVariant ? item.selectedVariant.price : item.price;
        if (mrpVal && mrpVal > priceVal) {
          totalProductSavings += (mrpVal - priceVal) * item.quantity;
        }
      });
      const totalSavingsVal = totalProductSavings + (order.couponDiscount || 0);
      const hasSavings = totalSavingsVal > 0;

      const itemRowHeight = 38;
      const headerHeight = 330; // Matches tableTop + 35
      const footerHeight = 230 + (hasCoupon ? 25 : 0) + (hasSavings ? 35 : 0);
      const totalItemsHeight = order.items.length * itemRowHeight;
      const canvasWidth = 800;
      const canvasHeight = headerHeight + totalItemsHeight + footerHeight;

      // Enable High-DPI Retina resolution (2x scaling)
      canvas.width = canvasWidth * 2;
      canvas.height = canvasHeight * 2;
      canvas.style.width = canvasWidth + 'px';
      canvas.style.height = canvasHeight + 'px';

      ctx.scale(2, 2);

      // Background fill
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Accent top line (Premium emerald green)
      ctx.fillStyle = '#00884F';
      ctx.fillRect(0, 0, canvasWidth, 15);

      // Shop Name (Bold modern serif/sans)
      ctx.fillStyle = '#00884F';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText(shopSettings.shopName, 40, 60);

      // Shop Tagline
      ctx.fillStyle = '#64748B';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(shopSettings.tagline.toUpperCase(), 40, 80);

      // Shop Contact (Right aligned)
      ctx.fillStyle = '#1E293B';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`Phone: ${shopSettings.mobile}`, canvasWidth - 40, 50);
      ctx.fillText(`WhatsApp: ${shopSettings.whatsapp}`, canvasWidth - 40, 70);
      
      const shopAddr = shopSettings.address || '';
      ctx.fillText(shopAddr.length > 50 ? shopAddr.substring(0, 48) + '...' : shopAddr, canvasWidth - 40, 90);

      ctx.textAlign = 'left';

      // Divider line
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(40, 110);
      ctx.lineTo(canvasWidth - 40, 110);
      ctx.stroke();

      // Title
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('INVOICE / ઓર્ડર બિલ', 40, 140);

      // Customer and Order Info Block
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(40, 160, canvasWidth - 80, 100);
      ctx.strokeStyle = '#E2E8F0';
      ctx.strokeRect(40, 160, canvasWidth - 80, 100);

      // Info Labels
      ctx.fillStyle = '#64748B';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('BILL TO / ગ્રાહક:', 60, 185);
      ctx.fillText('PHONE / મોબાઈલ:', 60, 210);
      ctx.fillText('ADDRESS / સરનામું:', 60, 235);

      ctx.fillText('ORDER ID / આઈડી:', 450, 185);
      ctx.fillText('DATE / તારીખ:', 450, 210);
      ctx.fillText('DELIVERY / ઓપ્શન:', 450, 235);

      // Info Values
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(order.customer.name, 185, 185);
      ctx.fillText(order.customer.phone, 185, 210);
      
      const cleanAddress = order.customer.address || 'N/A';
      ctx.fillText(cleanAddress.length > 33 ? cleanAddress.substring(0, 31) + '...' : cleanAddress, 185, 235);

      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(order.id, 580, 185);
      ctx.fillText(new Date(order.createdAt).toLocaleDateString('gu-IN', { day: 'numeric', month: 'short', year: 'numeric' }), 580, 210);
      
      const modeText = order.customer.deliveryMode === 'home_delivery' ? 'Home Delivery (હોમ ડિલિવરી)' : 'Shop Pick Up (દુકાનેથી રૂબરૂ)';
      ctx.fillText(modeText, 580, 235);

      // Items Table Header
      const tableTop = 280;
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(40, tableTop, canvasWidth - 80, 35);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('ITEM DESCRIPTION / વિગત', 60, tableTop + 22);
      ctx.fillText('UNIT / પેક', 360, tableTop + 22);
      ctx.textAlign = 'center';
      ctx.fillText('QTY / નંગ', 500, tableTop + 22);
      ctx.textAlign = 'right';
      ctx.fillText('PRICE / કિંમત', 630, tableTop + 22);
      ctx.fillText('TOTAL / કુલ', 740, tableTop + 22);

      ctx.textAlign = 'left';

      // Table Rows
      let currentY = tableTop + 35;
      order.items.forEach((item, idx) => {
        ctx.fillStyle = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
        ctx.fillRect(40, currentY, canvasWidth - 80, itemRowHeight);
        
        ctx.strokeStyle = '#F1F5F9';
        ctx.beginPath();
        ctx.moveTo(40, currentY + itemRowHeight);
        ctx.lineTo(canvasWidth - 40, currentY + itemRowHeight);
        ctx.stroke();

        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 12px sans-serif';
        
        const nameText = item.name + (item.gujaratiName ? ` (${item.gujaratiName})` : '');
        ctx.fillText(nameText.length > 35 ? nameText.substring(0, 32) + '...' : nameText, 60, currentY + 24);

        const unitName = item.selectedVariant ? item.selectedVariant.name : item.unit;
        ctx.fillStyle = '#475569';
        ctx.font = '11px sans-serif';
        ctx.fillText(unitName, 360, currentY + 24);

        ctx.textAlign = 'center';
        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(item.quantity.toString(), 500, currentY + 24);

        ctx.textAlign = 'right';
        ctx.font = 'mono 12px sans-serif';
        ctx.fillText(`₹${item.price.toFixed(0)}`, 630, currentY + 24);
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`₹${(item.price * item.quantity).toFixed(0)}`, 740, currentY + 24);

        ctx.textAlign = 'left';
        currentY += itemRowHeight;
      });

      // Dotted Separator between Items and Totals
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(40, currentY + 10);
      ctx.lineTo(canvasWidth - 40, currentY + 10);
      ctx.stroke();
      ctx.setLineDash([]); // Reset line dash to solid

      let totalsY = currentY + 25;

      // Totals (Right Aligned labels)
      ctx.textAlign = 'right';
      ctx.fillStyle = '#475569';
      ctx.font = '12px sans-serif';
      ctx.fillText('Subtotal / કિંમત:', 580, totalsY);
      
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 13px sans-serif';
      const calculatedSubtotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      ctx.fillText(`₹${calculatedSubtotal.toFixed(0)}`, 740, totalsY);
      
      totalsY += 25;

      if (hasCoupon) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#E11D48'; // Rose-600
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`Discount (${order.couponCode}) / ડિસ્કાઉન્ટ:`, 580, totalsY);
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(`-₹${(order.couponDiscount || 0).toFixed(0)}`, 740, totalsY);
        totalsY += 25;
      }

      ctx.textAlign = 'right';
      ctx.fillStyle = '#475569';
      ctx.font = '12px sans-serif';
      ctx.fillText('Delivery / ભાડું:', 580, totalsY);
      ctx.fillStyle = '#00884F';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('FREE', 740, totalsY);
      
      totalsY += 25;

      // Grand Total Box (Green Highlight Box)
      ctx.fillStyle = '#F0FDF4';
      ctx.fillRect(400, totalsY, 360, 50);
      ctx.strokeStyle = '#DCFCE7';
      ctx.strokeRect(400, totalsY, 360, 50);

      ctx.fillStyle = '#166534';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('Grand Total / કુલ કિંમત:', 580, totalsY + 32);
      ctx.font = 'black 20px sans-serif';
      ctx.fillText(`₹${order.total.toFixed(0)}`, 740, totalsY + 32);

      // Total Savings Green Badge
      if (hasSavings) {
        const savingsY = totalsY + 58;
        ctx.fillStyle = '#DCFCE7'; // light green
        ctx.fillRect(400, savingsY, 360, 32);
        ctx.strokeStyle = '#BBF7D0';
        ctx.strokeRect(400, savingsY, 360, 32);

        ctx.fillStyle = '#15803D'; // green-700
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`🎉 YOU SAVED ₹${totalSavingsVal.toFixed(0)} ON THIS ORDER! / તમે ₹${totalSavingsVal.toFixed(0)} બચાવ્યા! 🎉`, 580, savingsY + 20);
      }

      ctx.textAlign = 'left';

      // Terms Box (Left column of the footer)
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(40, totalsY, 340, 95);
      ctx.strokeStyle = '#E2E8F0';
      ctx.strokeRect(40, totalsY, 340, 95);

      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('⚠️ નિયમો / Terms:', 55, totalsY + 22);

      ctx.fillStyle = '#475569';
      ctx.font = '10px sans-serif';
      ctx.fillText('૧. ઓર્ડરનું પેમેન્ટ ઓર્ડર આપવા આવો ત્યારે આપવાનું રહેશે.', 55, totalsY + 45);
      ctx.fillText('૨. કોઈ વસ્તુ પાછી આપવાની હોય તો ૨૪ કલાકમાં શોપ પર આવવાનું રહેશે.', 55, totalsY + 68);

      // Thank you (Centered at the very bottom)
      const thankYouY = canvasHeight - 25;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#00884F';
      ctx.font = 'bold italic 13px sans-serif';
      ctx.fillText('Thank you for shopping with us! / મુલાકાત બદલ આભાર 🙏', canvasWidth / 2, thankYouY);

      // PDF export with multi-page pagination algorithm
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      const { jsPDF } = await import('jspdf');
      
      const pdfWidth = 210;
      const pdfHeight = 297; // A4 standard height
      
      const imgWidth = 210;
      const imgHeight = (canvasHeight * imgWidth) / canvasWidth;

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      if (imgHeight <= pdfHeight) {
        // Fits perfectly on single page
        doc.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
      } else {
        // Multi-page pagination
        let yOffset = 0;
        while (yOffset < imgHeight) {
          doc.addImage(imgData, 'JPEG', 0, -yOffset, imgWidth, imgHeight);
          yOffset += pdfHeight;
          if (yOffset < imgHeight) {
            doc.addPage();
          }
        }
      }

      doc.save(`invoice_${order.id}.pdf`);
      showToast('બિલ ડાઉનલોડ થઈ ગયું! / Invoice PDF downloaded successfully! 🎉', 'success');

    } catch (err) {
      console.error('Invoice PDF generation failed:', err);
      showToast('બિલ ડાઉનલોડ નિષ્ફળ ગયું / Invoice download failed', 'error');
    }
  };

  // Find wishlist products
  const wishlistProducts = useMemo(() => {
    const wishlistIds = customerProfile?.wishlist || [];
    return products.filter(p => wishlistIds.includes(p.id));
  }, [customerProfile?.wishlist, products]);

  return (
    <div className="bg-slate-50 dark:bg-slate-900 min-h-screen py-8 px-4 md:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Page Header */}
        <div className="text-center mb-2">
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white">My Account</h1>
          <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mt-1">Manage your profile, orders, and more / તમારી પ્રોફાઈલ, ઓર્ડર્સ અને વધુ મેનેજ કરો</p>
        </div>

        {/* Back button when inside a tab */}
        {activeTab && (
          <button
            onClick={() => setActiveTab(null)}
            className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 uppercase tracking-wider transition-all group mb-2"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back to Menu / મેનૂ પર પાછા જાઓ
          </button>
        )}

        {/* ========== LANDING MENU VIEW ========== */}
        {!activeTab && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Profile Card (Left) */}
            <div className="lg:col-span-4">
              <div className="bg-white dark:bg-slate-800 rounded-[28px] border border-slate-200 dark:border-slate-700 shadow-sm p-6 flex flex-col items-center text-center relative">
                
                {/* Edit Profile Icon (top-right corner) */}
                <button 
                  onClick={() => setActiveTab('profile')}
                  className="absolute top-5 right-5 p-2.5 bg-white dark:bg-slate-800 border border-blue-500 dark:border-blue-400 rounded-xl text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                  title="Edit Profile"
                >
                  <Edit className="w-4 h-4" />
                </button>

                {/* Avatar */}
                <div className="w-32 h-32 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm mb-4 mt-2 bg-slate-50 dark:bg-slate-900/40 flex items-center justify-center">
                  {customerProfile?.profileImage ? (
                    <img src={customerProfile.profileImage} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-4xl font-black text-emerald-600 dark:text-emerald-400">
                      {(customerProfile?.name || customerUser.displayName || 'C').slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Name */}
                <h2 className="text-lg font-black text-slate-900 dark:text-white">
                  {customerProfile?.name || customerUser.displayName || 'ગ્રાહક / Customer'}
                </h2>
                
                {/* Phone */}
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" />
                  {customerProfile?.phone || customerUser.email?.split('@')[0]}
                </p>

                {/* Loyalty Point Card */}
                <div className="mt-4 w-full bg-gradient-to-br from-amber-500 via-amber-400 to-amber-500 text-slate-950 p-4.5 rounded-2xl text-left border border-amber-350 shadow-sm relative overflow-hidden">
                  <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none translate-x-2 translate-y-2">
                    <Award className="w-24 h-24 text-slate-950" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-900 bg-white/30 px-2 py-0.5 rounded">GGM&S Club</span>
                    <span className="text-[9px] font-bold text-slate-950 flex items-center gap-0.5">
                      <Award className="w-3 h-3 text-slate-900 fill-slate-900" />
                      {loyaltyPoints >= 500 ? 'Gold' : (loyaltyPoints >= 300 ? 'Silver' : 'Bronze')} Rank
                    </span>
                  </div>
                  <div className="mt-3.5">
                    <p className="text-[10px] font-black text-slate-950/70 uppercase tracking-wide">Loyalty Points</p>
                    <p className="text-2xl font-black font-mono leading-none mt-1 text-slate-950">{loyaltyPoints}</p>
                  </div>
                  <p className="text-[9.5px] font-bold text-slate-900/80 leading-relaxed mt-2.5">
                    • Redeem points for free home delivery & exclusive wholesale offers!
                  </p>
                </div>

                {/* Theme Selector Section inside Profile Card */}
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 w-full flex flex-col items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    Theme / થીમ પસંદ કરો
                  </span>
                  <div className="grid grid-cols-2 gap-1.5 bg-slate-50 dark:bg-slate-900/50 p-1 rounded-xl border border-slate-200 dark:border-slate-700 w-full">
                    <button
                      type="button"
                      onClick={() => handleThemeChange('light')}
                      className={`py-1.5 px-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${preferredTheme === 'light' ? 'bg-white dark:bg-slate-700 text-amber-500 shadow-xs border border-slate-200/50 dark:border-slate-650' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-350'}`}
                    >
                      <Sun className="w-3.5 h-3.5" />
                      <span>Light</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleThemeChange('dark')}
                      className={`py-1.5 px-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${preferredTheme === 'dark' ? 'bg-white dark:bg-slate-700 text-indigo-400 shadow-xs border border-slate-200/50 dark:border-slate-650' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-350'}`}
                    >
                      <Moon className="w-3.5 h-3.5" />
                      <span>Dark</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleThemeChange('system')}
                      className={`py-1.5 px-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${preferredTheme === 'system' ? 'bg-white dark:bg-slate-700 text-slate-500 shadow-xs border border-slate-200/50 dark:border-slate-650' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-350'}`}
                    >
                      <Monitor className="w-3.5 h-3.5" />
                      <span>System</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleThemeChange('time_based')}
                      className={`py-1.5 px-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${preferredTheme === 'time_based' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs border border-slate-200/50 dark:border-slate-650' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-350'}`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Auto</span>
                    </button>
                  </div>
                </div>

                {/* Push Notifications Setup Section */}
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 w-full flex flex-col items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    Notifications / પુશ નોટિફિકેશન
                  </span>
                  <button
                    type="button"
                    onClick={requestNotificationPermission}
                    disabled={notificationPermission === 'granted'}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 border cursor-pointer ${
                      notificationPermission === 'granted'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/50 cursor-default'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-750 hover:bg-slate-50 dark:hover:bg-slate-700/50 active:scale-[0.98]'
                    }`}
                  >
                    <Bell className="w-3.5 h-3.5" />
                    <span>
                      {notificationPermission === 'granted' 
                        ? 'Notifications Active' 
                        : (notificationPermission === 'denied' ? 'Permission Denied' : 'Enable Notifications')}
                    </span>
                  </button>
                </div>

                {/* Share App Option */}
                <div className="mt-2 w-full">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        if (navigator.share) {
                          await navigator.share({
                            title: 'GGM&S Grocery',
                            text: 'GGM&S Grocery પરથી હોલસેલ અને રિટેલ કરિયાણું ઓર્ડર કરો!',
                            url: window.location.origin
                          });
                        } else {
                          await navigator.clipboard.writeText(window.location.origin);
                          showToast('App link copied to clipboard! / એપ લિંક કોપી થઇ ગઇ છે!', 'success');
                        }
                      } catch (err) {
                        console.error('Share error:', err);
                      }
                    }}
                    className="w-full py-2 px-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-750 hover:bg-slate-50 dark:hover:bg-slate-700/50 active:scale-[0.98] rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-slate-500" />
                    <span>Share App / એપ શેર કરો</span>
                  </button>
                </div>

                {/* Logout Button */}
                <button
                  onClick={onLogout}
                  className="mt-6 px-6 py-2 bg-white dark:bg-slate-800 border border-rose-500 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 active:scale-95 text-rose-500 dark:text-rose-450 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-xs"
                >
                  <LogOut className="w-4 h-4 text-rose-500" />
                  Logout
                </button>
              </div>
            </div>

            {/* Menu Cards Grid (Right) */}
            <div className="lg:col-span-8">
              <div className="grid grid-cols-2 gap-4">
                
                {/* My Orders Card */}
                <button
                  onClick={() => setActiveTab('orders')}
                  className="bg-white dark:bg-slate-800 rounded-[24px] border border-slate-200 dark:border-slate-700 shadow-xs p-6 md:p-8 flex flex-col items-center justify-center gap-3.5 text-center hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500 hover:-translate-y-0.5 transition-all active:scale-[0.97] group min-h-[160px]"
                >
                  <ShoppingBag className="w-9 h-9 text-blue-500 dark:text-blue-400 group-hover:scale-105 transition-transform" />
                  <div className="flex flex-col items-center">
                    <span className="text-sm font-bold text-slate-850 dark:text-white">My Orders</span>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">મારા ઓર્ડર્સ</span>
                  </div>
                </button>

                {/* Wishlist Card */}
                <button
                  onClick={() => setActiveTab('wishlist')}
                  className="bg-white dark:bg-slate-800 rounded-[24px] border border-slate-200 dark:border-slate-700 shadow-xs p-6 md:p-8 flex flex-col items-center justify-center gap-3.5 text-center hover:shadow-md hover:border-rose-400 dark:hover:border-rose-500 hover:-translate-y-0.5 transition-all active:scale-[0.97] group min-h-[160px]"
                >
                  <Heart className="w-9 h-9 text-rose-500 dark:text-rose-400 group-hover:scale-105 transition-transform" />
                  <div className="flex flex-col items-center">
                    <span className="text-sm font-bold text-slate-855 dark:text-white">Wishlist</span>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">મનપસંદ</span>
                  </div>
                </button>

                {/* Cart Card */}
                <button
                  onClick={() => setActiveTab('cart')}
                  className="bg-white dark:bg-slate-800 rounded-[24px] border border-slate-200 dark:border-slate-700 shadow-xs p-6 md:p-8 flex flex-col items-center justify-center gap-3.5 text-center hover:shadow-md hover:border-emerald-400 dark:hover:border-emerald-500 hover:-translate-y-0.5 transition-all active:scale-[0.97] group min-h-[160px]"
                >
                  <ShoppingCart className="w-9 h-9 text-emerald-600 dark:text-emerald-450 group-hover:scale-105 transition-transform" />
                  <div className="flex flex-col items-center">
                    <span className="text-sm font-bold text-slate-855 dark:text-white">Cart</span>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">બાસ્કેટ</span>
                  </div>
                </button>

                {/* Addresses Card */}
                <button
                  onClick={() => setActiveTab('addresses')}
                  className="bg-white dark:bg-slate-800 rounded-[24px] border border-slate-200 dark:border-slate-700 shadow-xs p-6 md:p-8 flex flex-col items-center justify-center gap-3.5 text-center hover:shadow-md hover:border-amber-400 dark:hover:border-amber-500 hover:-translate-y-0.5 transition-all active:scale-[0.97] group min-h-[160px]"
                >
                  <MapPin className="w-9 h-9 text-amber-500 dark:text-amber-400 group-hover:scale-105 transition-transform" />
                  <div className="flex flex-col items-center">
                    <span className="text-sm font-bold text-slate-855 dark:text-white">Addresses</span>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">સરનામાં</span>
                  </div>
                </button>

              </div>
            </div>
          </div>
        )}

        {/* ========== TAB CONTENT VIEW ========== */}
        {activeTab && (
          <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-[32px] p-6 shadow-sm min-h-[50vh]">
            
            {/* Orders Tab */}
            {activeTab === 'orders' && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 dark:border-slate-700 pb-4">
                  <h3 className="text-base font-black text-slate-900 dark:text-white uppercase flex items-center gap-2">
                    <ClipboardList className="w-5 h-5 text-blue-500" />
                    Order History / તમારો ઓર્ડર ઇતિહાસ
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">તમે કરેલા તમામ ઓર્ડર્સની વિગત</p>
                </div>

                {ordersLoading ? (
                  <div className="py-12 flex items-center justify-center">
                    <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : customerOrders.length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="w-14 h-14 bg-slate-50 dark:bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-3 text-slate-300 dark:text-slate-500 border border-slate-100 dark:border-slate-600">
                      <ClipboardList className="w-6 h-6" />
                    </div>
                    <h4 className="text-slate-900 dark:text-white font-black">No Orders Found</h4>
                    <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">તમે હજુ સુધી કોઈ ઓર્ડર આપ્યો નથી.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {customerOrders.map(order => (
                      <div key={order.id} className="border border-slate-200/80 dark:border-slate-600 rounded-2xl overflow-hidden shadow-xs">
                        <div className="bg-slate-50 dark:bg-slate-700/50 p-4 flex flex-wrap justify-between items-center gap-3 border-b border-slate-150 dark:border-slate-600">
                          <div>
                            <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">ORDER ID</span>
                            <span className="text-sm font-black text-slate-800 dark:text-white">{order.id}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">DATE</span>
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{new Date(order.createdAt).toLocaleDateString('gu-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">TOTAL</span>
                            <span className="text-sm font-black text-[#00884F] dark:text-emerald-400">₹{order.total.toFixed(0)}</span>
                          </div>
                          <div>
                            <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-wider ${
                              order.status === 'pending' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                              order.status === 'processing' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                              order.status === 'delivered' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                              'bg-rose-100 text-rose-800 border border-rose-200'
                            }`}>
                              {order.status}
                            </span>
                          </div>
                          <button
                            onClick={() => handleReorder(order)}
                            className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reorder
                          </button>
                          <button
                            onClick={() => handleDownloadInvoice(order)}
                            className="px-4 py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-400 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download Bill / બિલ
                          </button>
                        </div>
                        
                        {/* Order Items */}
                        <div className="p-4 divide-y divide-slate-100 dark:divide-slate-700">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="py-2.5 flex items-center justify-between gap-4 text-xs font-bold text-slate-700 dark:text-slate-300 first:pt-0 last:pb-0">
                              <div className="flex-1">
                                <p className="text-slate-800 dark:text-white uppercase font-black">{item.name}</p>
                                {item.selectedVariant && (
                                  <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold mt-0.5">{item.selectedVariant.name}</p>
                                )}
                              </div>
                              <span className="text-slate-500 dark:text-slate-400 shrink-0 font-mono">{item.quantity} x ₹{item.price.toFixed(0)}</span>
                              <span className="text-slate-900 dark:text-white font-black font-mono">₹{(item.price * item.quantity).toFixed(0)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Addresses Tab */}
            {activeTab === 'addresses' && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 dark:border-slate-700 pb-4 flex justify-between items-center">
                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white uppercase flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-amber-500" />
                      Saved Addresses / તમારા સરનામા
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">ડિલિવરી ઝડપી કરવા માટે સરનામાં સેવ કરો</p>
                  </div>
                  {!showAddressForm && (
                    <button
                      onClick={() => {
                        setEditingAddrId(null);
                        setAddrLabel('');
                        setAddrText('');
                        setShowAddressForm(true);
                      }}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      Add Address
                    </button>
                  )}
                </div>

                {showAddressForm && (
                  <form onSubmit={handleSaveAddress} className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 p-5 rounded-2xl space-y-4 animate-in slide-in-from-top duration-200">
                    <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">
                      {editingAddrId ? 'Edit Address / સરનામું સુધારો' : 'New Address / નવું સરનામું ઉમેરો'}
                    </h4>
                    
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Label / નામ (દા.ત. Home, Office)</label>
                      <input
                        required
                        type="text"
                        placeholder="દા.ત. ઘર, ઓફિસ"
                        value={addrLabel}
                        onChange={e => setAddrLabel(e.target.value)}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-xs font-bold focus:border-emerald-500 outline-hidden text-slate-900 dark:text-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Address details / સંપૂર્ણ સરનામું</label>
                      <textarea
                        required
                        rows={3}
                        placeholder="ઘર નંબર, સોસાયટી, શેરી, ગામ/શહેર, પિનકોડ"
                        value={addrText}
                        onChange={e => setAddrText(e.target.value)}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-xs font-bold focus:border-emerald-500 outline-hidden resize-none text-slate-900 dark:text-white"
                      />
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        type="submit"
                        className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                      >
                        Save Address / સાચવો
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddressForm(false);
                          setEditingAddrId(null);
                        }}
                        className="px-6 py-3 bg-slate-200 dark:bg-slate-600 hover:bg-slate-350 dark:hover:bg-slate-500 text-slate-700 dark:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {/* Addresses List */}
                <div className="space-y-4">
                  {(customerProfile?.savedAddresses || []).length === 0 ? (
                    <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs font-bold">
                      કોઈ સરનામું સેવ કરેલું નથી. Add Address બટનથી ઉમેરો.
                    </div>
                  ) : (
                    (customerProfile?.savedAddresses || []).map(addr => (
                      <div key={addr.id} className={`p-5 rounded-2xl border-2 transition-all flex flex-col justify-between md:flex-row md:items-start gap-4 ${
                        addr.isDefault 
                          ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-900/10' 
                          : 'border-slate-150 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                      }`}>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 bg-slate-250 dark:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-[9px] font-black uppercase tracking-wider">
                              {addr.label}
                            </span>
                            {addr.isDefault && (
                              <span className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" />
                                Main / ડિફોલ્ટ
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-300 leading-relaxed max-w-lg">
                            {addr.address}
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-2 shrink-0 self-end md:self-start">
                          {!addr.isDefault && (
                            <button
                              onClick={() => handleSetDefaultAddress(addr.id)}
                              className="px-3 py-1.5 text-[9px] font-black uppercase tracking-wider border border-emerald-500 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-all"
                            >
                              Set Default
                            </button>
                          )}
                          <button
                            onClick={() => handleEditAddress(addr)}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-400 transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteAddress(addr.id)}
                            className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-600 rounded-lg text-slate-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Wishlist Tab */}
            {activeTab === 'wishlist' && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 dark:border-slate-700 pb-4">
                  <h3 className="text-base font-black text-slate-900 dark:text-white uppercase flex items-center gap-2">
                    <Heart className="w-5 h-5 text-rose-500" />
                    My Wishlist / તમારી મનપસંદ વસ્તુઓ
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">તમે સેવ કરેલી વસ્તુઓનું લિસ્ટ</p>
                </div>

                {wishlistProducts.length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="w-14 h-14 bg-slate-50 dark:bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-3 text-slate-300 dark:text-slate-500 border border-slate-100 dark:border-slate-600">
                      <Heart className="w-6 h-6" />
                    </div>
                    <h4 className="text-slate-900 dark:text-white font-black">Wishlist is Empty</h4>
                    <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">તમારી મનપસંદ પ્રોડક્ટ્સ અહીં સેવ કરો.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {wishlistProducts.map(p => {
                      const foundProfileWishlist = customerProfile?.wishlist || [];
                      return (
                        <ProductCard 
                          key={p.id} 
                          product={p} 
                          onAdd={onAdd}
                          isWishlisted={foundProfileWishlist.includes(p.id)}
                          onToggleWishlist={async (pid) => {
                            const newWish = foundProfileWishlist.filter(id => id !== pid);
                            try {
                              await setDoc(doc(db, 'customers', customerUser.uid), { wishlist: newWish }, { merge: true });
                              setCustomerProfile(prev => prev ? { ...prev, wishlist: newWish } : null);
                              showToast('Wishlist માંથી કાઢી નાખ્યું', 'info');
                            } catch (e) {
                              console.error(e);
                            }
                          }}
                          voiceIntent={voiceIntent}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Cart Tab */}
            {activeTab === 'cart' && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 dark:border-slate-700 pb-4">
                  <h3 className="text-base font-black text-slate-900 dark:text-white uppercase flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    My Basket / મારું કાર્ટ
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">તમે ખરીદવા માટે પસંદ કરેલી વસ્તુઓ</p>
                </div>

                {cart.length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="w-14 h-14 bg-slate-50 dark:bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-3 text-slate-300 dark:text-slate-500 border border-slate-100 dark:border-slate-600">
                      <ShoppingCart className="w-6 h-6" />
                    </div>
                    <h4 className="text-slate-900 dark:text-white font-black">Your Basket is Empty</h4>
                    <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">તમારું બાસ્કેટ ખાલી છે. હોમ પેજ પરથી પ્રોડક્ટ્સ ઉમેરો.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Cart Items List */}
                    <div className="divide-y divide-slate-100 dark:divide-slate-700 border border-slate-150 dark:border-slate-600 rounded-2xl overflow-hidden shadow-xs bg-white dark:bg-slate-800">
                      {cart.map((item, idx) => {
                        const cartItemId = item.id + (item.selectedVariant ? '-' + item.selectedVariant.id : '');
                        return (
                          <div key={idx} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 hover:bg-slate-50/50 dark:hover:bg-slate-700/50 transition-colors">
                            {/* Left: Product Image & Details */}
                            <div className="flex items-center gap-3.5 flex-1 min-w-0">
                              <div className="w-12 h-12 bg-white dark:bg-slate-700 border border-slate-100 dark:border-slate-600 rounded-xl overflow-hidden shrink-0 flex items-center justify-center p-1">
                                {item.image ? (
                                  <img src={item.image} alt={item.name} className="max-h-full max-w-full object-contain" />
                                ) : (
                                  <div className="w-full h-full bg-slate-100 dark:bg-slate-600 rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-500">
                                    <ShoppingCart className="w-5 h-5" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase truncate leading-snug">{item.name}</h4>
                                {item.gujaratiName && (
                                  <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 leading-none mt-0.5">{item.gujaratiName}</p>
                                )}
                                <p className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 mt-1 font-mono">
                                  ₹{item.price} / {item.unit}
                                </p>
                              </div>
                            </div>

                            {/* Right: Controls (Qty, Subtotal, Delete) */}
                            <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100 dark:border-slate-700 shrink-0">
                              <div className="flex items-center bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl p-0.5 gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => updateCartQuantity(cartItemId, -1)}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white dark:bg-slate-600 text-slate-900 dark:text-white font-black border border-slate-100 dark:border-slate-500 shadow-2xs active:scale-90 transition-all font-mono text-[10px]"
                                >
                                  -
                                </button>
                                <span className="text-center font-black text-slate-900 dark:text-white text-xs w-4 font-mono">{item.quantity}</span>
                                <button
                                  type="button"
                                  onClick={() => updateCartQuantity(cartItemId, 1)}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white dark:bg-slate-600 text-slate-900 dark:text-white font-black border border-slate-100 dark:border-slate-500 shadow-2xs active:scale-90 transition-all font-mono text-[10px]"
                                >
                                  +
                                </button>
                              </div>

                              <div className="text-right shrink-0 min-w-[70px]">
                                <p className="text-xs font-black text-slate-900 dark:text-white font-mono">₹{(item.price * item.quantity).toFixed(0)}</p>
                              </div>

                              <button
                                type="button"
                                onClick={() => updateCartQuantity(cartItemId, -item.quantity)}
                                className="p-1.5 text-slate-350 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all shrink-0"
                                title="Remove item"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Summary & Checkout button */}
                    <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-[24px] p-5 space-y-4">
                      <div className="space-y-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                        <div className="flex justify-between">
                          <span>Subtotal / કુલ કિંમત</span>
                          <span className="font-mono">₹{cartTotal.toFixed(0)}</span>
                        </div>
                        <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                          <span>Delivery / ડિલિવરી ચાર્જ</span>
                          <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-400 px-2 py-0.5 rounded-full text-[9px] font-black">FREE</span>
                        </div>
                        <div className="flex justify-between pt-3 border-t border-slate-200 dark:border-slate-600 text-sm font-black text-slate-900 dark:text-white">
                          <span>Grand Total</span>
                          <span className="font-mono text-emerald-700 dark:text-emerald-400 text-base">₹{cartTotal.toFixed(0)}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          navigate('/');
                          setTimeout(() => {
                            const basket = document.getElementById('customer-basket');
                            basket?.scrollIntoView({ behavior: 'smooth' });
                          }, 250);
                        }}
                        className="w-full py-3.5 bg-[#00884F] hover:bg-[#007041] active:scale-[0.98] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        Proceed to Checkout / ઓર્ડર પૂરો કરો
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 dark:border-slate-700 pb-4">
                  <h3 className="text-base font-black text-slate-900 dark:text-white uppercase flex items-center gap-2">
                    <User className="w-5 h-5 text-violet-500" />
                    Edit Profile / પ્રોફાઇલ વિગતો
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">તમારી પર્સનલ માહિતી અને ફોટો બદલો</p>
                </div>

                <form onSubmit={handleUpdateProfile} className="space-y-5 max-w-lg">
                  {/* Photo Editor */}
                  <div className="space-y-2 text-center">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Profile Picture / તમારો ફોટો</label>
                    <div className="relative w-24 h-24 mx-auto group">
                      {profileImg ? (
                        <img 
                          src={profileImg} 
                          alt="Profile Preview" 
                          className="w-full h-full rounded-full object-cover border-2 border-emerald-500 shadow-md" 
                        />
                      ) : (
                        <div className="w-full h-full rounded-full bg-emerald-50 dark:bg-emerald-900/30 border-2 border-emerald-100 dark:border-emerald-800 flex items-center justify-center text-emerald-650 dark:text-emerald-400 font-black text-2xl">
                          {(profileName || customerUser.displayName || 'C').slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <label className="absolute bottom-0 right-0 bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-full cursor-pointer shadow-md transition-all active:scale-90 flex items-center justify-center border-2 border-white dark:border-slate-800">
                        <Camera className="w-3.5 h-3.5" />
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={handleImageChange} 
                        />
                      </label>
                    </div>
                  </div>

                  {/* Name Input */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Full Name / તમારું પૂરું નામ</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                      <input
                        required
                        type="text"
                        placeholder="નામ અને અટક"
                        value={profileName}
                        onChange={e => setProfileName(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl pl-11 pr-4 py-3 text-xs font-bold focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-600 outline-hidden transition-all text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  {/* Phone Input */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">WhatsApp Number / વૉટ્સએપ નંબર</label>
                    <div className="relative">
                      <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                      <input
                        required
                        type="tel"
                        placeholder="વૉટ્સએપ નંબર"
                        value={profilePhone}
                        onChange={e => setProfilePhone(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl pl-11 pr-4 py-3 text-xs font-bold focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-600 outline-hidden transition-all text-slate-900 dark:text-white"
                      />
                    </div>
                    <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold mt-0.5 pl-1">
                      ⚠️ નોંધ: વૉટ્સએપ નંબર બદલવાથી તમારું લૉગિન આઈડી (ID) પણ બદલાઈ જશે.
                    </p>
                  </div>

                  {/* Save Button */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={profileUpdating}
                      className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2"
                    >
                      {profileUpdating ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        'Save Changes / સાચવો'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Theme Settings Tab */}
            {activeTab === 'theme' && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 dark:border-slate-700 pb-4">
                  <h3 className="text-base font-black text-slate-900 dark:text-white uppercase flex items-center gap-2">
                    <Settings className="w-5 h-5 text-indigo-500" />
                    Theme Preferences / થીમ પસંદગી
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">પસંદ કરો કે વેબસાઈટ લાઈટ મોડમાં જોવી છે કે ડાર્ક મોડમાં</p>
                </div>
                
                <div className="grid sm:grid-cols-2 gap-4">
                  {/* Light Mode Option */}
                  <div 
                    onClick={() => handleThemeChange('light')}
                    className={`cursor-pointer border-2 rounded-2xl p-5 flex flex-col items-center gap-3 text-center transition-all ${
                      preferredTheme === 'light' 
                        ? 'border-primary-green bg-light-green/30 text-primary-green' 
                        : 'border-slate-250 dark:border-slate-600 hover:border-slate-350 dark:hover:border-slate-500 hover:bg-slate-50/50 dark:hover:bg-slate-700/50 text-slate-800 dark:text-white'
                    }`}
                  >
                    <Sun className="w-8 h-8 text-amber-500" />
                    <span className="text-xs font-black">Light Mode / લાઈટ મોડ</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">નિયમિત તેજસ્વી થીમ / Standard Bright UI theme</span>
                  </div>
                  
                  {/* Dark Mode Option */}
                  <div 
                    onClick={() => handleThemeChange('dark')}
                    className={`cursor-pointer border-2 rounded-2xl p-5 flex flex-col items-center gap-3 text-center transition-all ${
                      preferredTheme === 'dark' 
                        ? 'border-primary-green bg-light-green/30 text-primary-green' 
                        : 'border-slate-250 dark:border-slate-600 hover:border-slate-350 dark:hover:border-slate-500 hover:bg-slate-50/50 dark:hover:bg-slate-700/50 text-slate-800 dark:text-white'
                    }`}
                  >
                    <Moon className="w-8 h-8 text-indigo-400" />
                    <span className="text-xs font-black">Dark Mode / ડાર્ક મોડ</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">રાત્રિના સમય અને આંખની સુરક્ષા માટે અનુકૂળ થીમ / Soft background optimized for low-light</span>
                  </div>

                  {/* System Match Option */}
                  <div 
                    onClick={() => handleThemeChange('system')}
                    className={`cursor-pointer border-2 rounded-2xl p-5 flex flex-col items-center gap-3 text-center transition-all ${
                      preferredTheme === 'system' 
                        ? 'border-primary-green bg-light-green/30 text-primary-green' 
                        : 'border-slate-250 dark:border-slate-600 hover:border-slate-350 dark:hover:border-slate-500 hover:bg-slate-50/50 dark:hover:bg-slate-700/50 text-slate-800 dark:text-white'
                    }`}
                  >
                    <Monitor className="w-8 h-8 text-slate-500 dark:text-slate-400" />
                    <span className="text-xs font-black">System Match / સિસ્ટમ મુજબ</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">તમારા ફોન અથવા કોમ્પ્યુટર સેટિંગ્સ મુજબ બદલાશે / Follows OS settings automatically</span>
                  </div>

                  {/* Time-Based Option */}
                  <div 
                    onClick={() => handleThemeChange('time_based')}
                    className={`cursor-pointer border-2 rounded-2xl p-5 flex flex-col items-center gap-3 text-center transition-all ${
                      preferredTheme === 'time_based' 
                        ? 'border-primary-green bg-light-green/30 text-primary-green' 
                        : 'border-slate-250 dark:border-slate-600 hover:border-slate-350 dark:hover:border-slate-500 hover:bg-slate-50/50 dark:hover:bg-slate-700/50 text-slate-800 dark:text-white'
                    }`}
                  >
                    <Clock className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-black">Time-based Auto / સમય આધારિત ઓટો</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">રાત્રે (7 PM - 6 AM) ડાર્ક અને દિવસે લાઈટ મોડ / Light by day, Dark by night (7 PM - 6 AM)</span>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
};

