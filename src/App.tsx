/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, ChangeEvent, FormEvent, useCallback, useRef } from 'react';
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
  Download, Upload, Database, GripVertical, Truck, Home
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { Routes, Route, useNavigate, useLocation, useParams } from 'react-router-dom';
import { CategoryItem, Product, CartItem, CustomerDetails, Order, OrderStatus, Banner } from './types.ts';
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase.ts';

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
    };
    // Auto-migrate if old dummy number is in local storage
    if (settings.whatsapp === '919876543210') {
      settings.whatsapp = '91972455778';
      settings.mobile = '+91 97245 5778';
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

  const [cart, setCart] = useState<CartItem[]>([]);

  const [orders, setOrders] = useState<Order[]>(() => {
    const storedOrders = localStorage.getItem('orders');
    return storedOrders ? JSON.parse(storedOrders) : [];
  });

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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
  const [adminTab, setAdminTab] = useState<'dashboard' | 'products' | 'categories' | 'orders' | 'settings' | 'qr' | 'banners'>('dashboard');

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);

  // Admin Auth state
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(() => Boolean(localStorage.getItem('adminSession')));

  const isAdminView = location.pathname.startsWith('/admin');

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
          setShopSettings(data.shopSettings);
          localStorage.setItem('shopSettings', JSON.stringify(data.shopSettings));
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
        };
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
    if (selectedCategory && selectedCategory !== 'All Products') {
      result = result.filter(p => p.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    }
    return result;
  }, [products, selectedCategory, searchQuery]);

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }, [cart]);

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

  const addToCart = (product: Product, quantity: number, selectedVariant?: ProductVariant) => {
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

    const newOrder: Order = {
      id: `ORD-${Date.now().toString().slice(-6)}`,
      items: [...cart],
      customer: customerDetails,
      total: cartTotal,
      status: 'pending',
      createdAt: new Date().toISOString(),
      deliveryMode: deliveryMode
    };

    try {
      await setDoc(doc(db, 'orders', newOrder.id), newOrder);
    } catch (error) {
      handleLocalDataError(error, OperationType.CREATE, 'orders');
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
    msg += `\n*💰 GRAND TOTAL: ₹${cartTotal.toFixed(2)}*\n\n`;
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
    
    // Reset cart
    setCart([]);
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
            <button onClick={() => setAdminTab('qr')} className={`admin-sidebar-btn ${adminTab === 'qr' ? 'active' : ''}`}>
              <Smartphone className="w-4 h-4" /> COUNTER QR
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
                  {/* Category Share */}
                  <div className="md:col-span-4 bg-white border border-slate-200 rounded-[24px] p-6">
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
                  <div className="md:col-span-8 bg-white border border-slate-200 rounded-[24px] p-6 flex flex-col justify-between">
                    <div>
                      <h4 className="font-extrabold text-slate-900 text-sm mb-4">Recent Orders</h4>
                      <div className="divide-y divide-slate-100 overflow-x-auto">
                        {orders.length === 0 ? (
                          <p className="text-sm italic text-slate-400 py-8 text-center">No orders registered yet.</p>
                        ) : (
                          orders.slice(0, 5).map(ord => (
                            <div key={ord.id} className="py-3 flex justify-between items-center text-xs gap-4">
                              <div>
                                <span className="font-black text-slate-800">{ord.id}</span>
                                <p className="text-[10px] text-slate-400 font-bold">{ord.customer.name}</p>
                              </div>
                              <span className="font-black text-slate-900">₹{ord.total.toFixed(0)}</span>
                              <span className={`status-badge status-${ord.status}`}>{ord.status}</span>
                              <button 
                                onClick={() => { setViewingOrder(ord); setAdminTab('orders'); }}
                                className="text-xs font-black text-primary-green hover:underline"
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
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Physical Store Address</label>
                    <textarea required name="address" defaultValue={shopSettings.address} rows={3} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:border-primary-green outline-hidden resize-none" />
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

          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFB]">
      <div className="max-w-7xl mx-auto px-4 py-6">
        
        {/* Responsive Navbar */}
        <header className="flex flex-col md:flex-row items-center justify-between px-2 py-4 mb-4 gap-4">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => navigate('/')}
          >
            <div className="w-12 h-12 bg-primary-green rounded-2xl flex items-center justify-center shadow-lg shadow-primary-green/20">
              <ShoppingCart className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight leading-tight">
                {shopSettings.shopName}
              </h1>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                {shopSettings.tagline}
              </p>
            </div>
          </motion.div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            {isAdminView && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/')}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-black shadow-xs transition-all border-2 bg-white text-emerald-600 border-emerald-600 hover:bg-emerald-50"
              >
                <Store className="w-4 h-4" />
                View Customer Shop
              </motion.button>
            )}
          </div>
        </header>

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
                <ProductDetailPageWrapper products={products} addToCart={addToCart} />
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
                <div className="sticky top-0 z-40 bg-[#F8FAFB]/95 backdrop-blur-md -mx-4 px-4 py-3 sm:py-4 pt-5 sm:pt-6">
                  <div className="flex flex-col gap-3 sm:gap-4">
                    <div className="flex justify-between items-baseline px-2">
                      <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                        <span className="relative inline-block">
                          <span className="absolute -inset-1 rounded-lg bg-emerald-100/60 -skew-y-2"></span>
                          <span className="relative text-emerald-700 font-black px-1.5">GGM&S</span>
                        </span>
                        <span className="text-slate-900 ml-2">Grocery Store</span>
                      </h2>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Fast WhatsApp Delivery</span>
                    </div>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-slate-400 group-focus-within:text-primary-green transition-colors" />
                      </div>
                      <input
                        type="text"
                        placeholder="Search pantry items, spices, pulses..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl sm:rounded-2xl pl-12 pr-4 py-3 sm:py-4 text-sm focus:border-primary-green focus:ring-4 focus:ring-primary-green/5 outline-hidden transition-all shadow-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* 🚚 Welcome Popup Notice */}
                <WelcomeDeliveryPopup />

                {/* Banner Ad Slider - Mobile Friendly */}
                {!selectedCategory && (
                  <BannerSlider 
                    banners={banners} 
                    onSelectCategory={setSelectedCategory} 
                  />
                )}

                {/* Categories Layout */}
                {!selectedCategory ? (
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
                    <div className="sticky top-[110px] sm:top-[135px] z-30 bg-[#F8FAFB]/90 backdrop-blur-xl -mx-4 px-4 py-3 border-b border-slate-200/50">
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => setSelectedCategory(null)}
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
                          {selectedCategory === 'All Products' ? 'Everything in Stock' : selectedCategory}
                        </h3>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                          ({filteredProducts.length} items)
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        {filteredProducts.map((p: Product) => (
                          <ProductCard key={p.id} product={p} onAdd={addToCart} />
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
                        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden divide-y divide-slate-100">
                          {cart.map(item => {
                            const cartItemId = item.id + (item.selectedVariant ? '-' + item.selectedVariant.id : '');
                            return (
                              <div key={cartItemId} className="p-4 flex items-center gap-4 hover:bg-slate-50/50 transition-all">
                                <div className="w-12 h-12 bg-white border border-slate-100 rounded-xl overflow-hidden shrink-0 flex items-center justify-center">
                                  {item.image ? (
                                    <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <ImageIcon className="w-5 h-5 text-slate-300" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="text-[8px] font-black text-slate-400 uppercase mb-0.5 block tracking-wider">{item.category}</span>
                                  <h4 className="font-bold text-sm text-slate-900 truncate leading-tight uppercase">{item.name}</h4>
                                  <p className="text-xs font-black text-primary-green mt-0.5">₹{item.price.toFixed(0)} / {item.unit}</p>
                                </div>
                                
                                <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl shrink-0">
                                  <button
                                    onClick={() => updateCartQuantity(cartItemId, -1)}
                                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 hover:bg-red-50 hover:text-red-500 transition-all"
                                  >
                                    {item.quantity === 1 ? <Trash2 className="w-3.5 h-3.5" /> : <ChevronLeft className="w-4 h-4" />}
                                  </button>
                                  <span className="w-6 text-center font-black text-xs text-slate-800">{item.quantity}</span>
                                  <button
                                    onClick={() => updateCartQuantity(cartItemId, 1)}
                                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 hover:bg-emerald-50 hover:text-primary-green transition-all"
                                  >
                                    <ChevronRight className="w-4 h-4" />
                                  </button>
                                </div>
                                <div className="text-right shrink-0 min-w-[60px]">
                                  <p className="font-black text-sm text-slate-900">₹{(item.price * item.quantity).toFixed(0)}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Checkout Details Side Card */}
                    <div className="lg:col-span-4 sticky top-6">
                      <div className="bg-white border border-slate-200 rounded-[28px] p-6 shadow-sm">
                        <div className="mb-6">
                          <span className="tag bg-emerald-50 text-emerald-800 border border-emerald-100 mb-3 block w-fit">Order Pricing</span>
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs font-semibold text-slate-500">
                              <span>Subtotal</span>
                              <span>₹{cartTotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-xs font-bold text-emerald-700 items-center">
                              <span>Delivery Charge</span>
                              <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-[9px] font-black">FREE</span>
                            </div>
                            <div className="pt-3 border-t border-slate-100 flex justify-between items-baseline">
                              <span className="font-extrabold text-slate-900 text-sm">Grand Total</span>
                              <span className="text-2xl font-black text-slate-900">₹{cartTotal.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>

                        <CheckoutForm onSubmit={handleCreateOrder} isDisabled={cart.length === 0} cartTotal={cartTotal} />
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

      </div>
    </div>
  );
}

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

// Product detail view sub-page
interface ProductDetailPageProps {
  products: Product[];
  addToCart: (product: Product, quantity: number, variant?: ProductVariant) => void;
}

function ProductDetailPageWrapper({ products, addToCart }: ProductDetailPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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

// Customer Checkout Form
interface CheckoutFormProps {
  onSubmit: (details: CustomerDetails) => void;
  isDisabled: boolean;
  cartTotal: number;
}

const CheckoutForm: React.FC<CheckoutFormProps> = ({ onSubmit, isDisabled, cartTotal }) => {
  const [details, setDetails] = useState<CustomerDetails>({ name: '', phone: '', address: '', deliveryMode: undefined });
  const [showDeliveryWarning, setShowDeliveryWarning] = useState(false);
  const isHomeDeliveryEligible = cartTotal >= 2000;

  const handleDeliveryModeSelect = (mode: 'home_delivery' | 'pickup') => {
    if (mode === 'home_delivery' && !isHomeDeliveryEligible) {
      setShowDeliveryWarning(true);
      return;
    }
    setShowDeliveryWarning(false);
    setDetails(prev => ({ ...prev, deliveryMode: mode, address: mode === 'pickup' ? 'Pick Up At Store' : (prev.address === 'Pick Up At Store' ? '' : prev.address) }));
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
                className="relative"
              >
                <MapPin className="absolute left-4 top-4 w-4 h-4 text-slate-400" />
                <textarea
                  required
                  rows={3}
                  placeholder="સંપૂર્ણ ડિલિવરી એડ્રેસ / Complete Delivery Address"
                  value={details.address === 'Pick Up At Store' ? '' : details.address}
                  onChange={e => setDetails({ ...details, address: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-4 py-3.5 text-xs font-bold focus:border-primary-green outline-hidden resize-none"
                />
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
                  ? 'bg-emerald-600 text-white'
                  : 'bg-blue-600 text-white'
              }`}
            >
              <Send className="w-4 h-4" />
              {details.deliveryMode === 'home_delivery' 
                ? 'Send Order / ઓર્ડર મોકલો 🚚' 
                : 'Place Pickup Order / ઓર્ડર મુકો 🏪'
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
}

const ProductCard: React.FC<ProductCardProps> = ({ product, onAdd }) => {
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | undefined>(() => {
    return product.variants && product.variants.length > 0 ? product.variants[0] : undefined;
  });
  
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
      animate={{ opacity: 1, scale: 1 }}
      onClick={() => navigate(`/product/${product.id}`)}
      className="bg-white rounded-[24px] overflow-hidden flex flex-col h-full group border border-slate-200/80 shadow-xs hover:shadow-md hover:border-emerald-100 transition-all duration-300 cursor-pointer relative"
    >
      <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-3">
        {product.image ? (
          <img src={product.image} alt={product.name} className="max-h-full max-w-full object-contain p-1 transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <ImageIcon className="w-8 h-8 text-slate-200" />
        )}
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
