/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, ChangeEvent, FormEvent } from 'react';
import { ShoppingCart, Search, Package, Smartphone, Plus, Trash2, ChevronLeft, ChevronRight, MapPin, Phone, User, Send, LayoutDashboard, Camera, X, Image as ImageIcon, LogOut, Heart, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { CategoryItem, Product, CartItem, CustomerDetails } from './types.ts';
import { db, auth } from './firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  query,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { useCallback } from 'react';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

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

// Admin Configuration
const ADMIN_EMAIL = 'nupeshpatel4342@gmail.com';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(auth.currentUser);
  const isUserAdmin = useMemo(() => {
    const email = user?.email?.toLowerCase().trim();
    return email === ADMIN_EMAIL;
  }, [user]);

  const [adminTab, setAdminTab] = useState<'products' | 'categories' | 'qr'>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [categoryItems, setCategoryItems] = useState<CategoryItem[]>([]);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [customUnits, setCustomUnits] = useState<string[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [qrValue, setQrValue] = useState<string>(() => {
    return localStorage.getItem('qrValue') || window.location.origin + '/';
  });

  const isAdminView = location.pathname.startsWith('/admin');

  // Auth Sync
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);

  const addCategory = async (cat: Omit<CategoryItem, 'id'>) => {
    const id = cat.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
    const path = `categories/${id}`;
    try {
      // Filter out undefined fields for Firestore compatibility
      const cleanCat = Object.fromEntries(
        Object.entries(cat).filter(([, v]) => v !== undefined)
      );
      await setDoc(doc(db, 'categories', id), {
        ...cleanCat,
        createdAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
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

  // Auto-seed missing default categories for admins
  useEffect(() => {
    if (isUserAdmin && categoryItems.length > 0 && categoryItems.length < DEFAULT_CATEGORIES.length) {
      const missing = DEFAULT_CATEGORIES.some(def => !categoryItems.some(cat => cat.name === def.name));
      if (missing) {
        seedCategories(true);
      }
    } else if (isUserAdmin && categoryItems.length === 0) {
      const t = setTimeout(() => {
        if (categoryItems.length === 0) seedCategories(true);
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [isUserAdmin, categoryItems, seedCategories]);

  // Firebase Real-time Sync
  useEffect(() => {
    const productsPath = 'products';
    const unsubscribeProducts = onSnapshot(
      query(collection(db, productsPath), orderBy('createdAt', 'desc')),
      (snapshot) => {
        setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, productsPath)
    );

    const categoriesPath = 'categories';
    const unsubscribeCategories = onSnapshot(
      collection(db, categoriesPath),
      (snapshot) => {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CategoryItem));
        // Sort by order if available
        items.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        setCategoryItems(items);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, categoriesPath)
    );

    const settingsPath = 'settings/global';
    const unsubscribeSettings = onSnapshot(
      doc(db, settingsPath),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data.customCategories) setCustomCategories(data.customCategories);
          if (data.customUnits) setCustomUnits(data.customUnits);
          if (data.qrValue) setQrValue(data.qrValue);
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, settingsPath)
    );

    return () => {
      unsubscribeProducts();
      unsubscribeCategories();
      unsubscribeSettings();
    };
  }, []);

  const login = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const email = result.user.email?.toLowerCase().trim();
      if (email !== ADMIN_EMAIL) {
        alert(`Access Denied: ${result.user.email} is not authorized.`);
        await signOut(auth);
      }
    } catch (error: unknown) {
      console.error("Login Error:", error);
      alert("Login failed. Please check your connection and try again.");
    }
  };

  const logout = () => signOut(auth);

  const allCategories = useMemo(() => {
    const fromItems = categoryItems.map(c => c.name);
    const fromProducts = products.map(p => p.category);
    const uniqueNames = Array.from(new Set([...fromItems, ...fromProducts]));
    
    // Sort logic: use CategoryItem order if exists, otherwise alphabetical
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
    const path = 'products';
    try {
      // Filter out undefined fields for Firestore compatibility
      const cleanProduct = Object.fromEntries(
        Object.entries(product).filter(([, v]) => v !== undefined)
      );
      await addDoc(collection(db, path), {
        ...cleanProduct,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const updateProduct = async (id: string, product: Omit<Product, 'id'>) => {
    const path = `products/${id}`;
    try {
      const cleanProduct = Object.fromEntries(
        Object.entries(product).filter(([, v]) => v !== undefined)
      );
      await setDoc(doc(db, 'products', id), {
        ...cleanProduct,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setEditingProduct(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const deleteProduct = async (id: string) => {
    const path = `products/${id}`;
    try {
      await deleteDoc(doc(db, 'products', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const updateCategory = async (id: string, cat: Omit<CategoryItem, 'id'>) => {
    const path = `categories/${id}`;
    try {
      // Filter out undefined fields for Firestore compatibility
      const cleanCat = Object.fromEntries(
        Object.entries(cat).filter(([, v]) => v !== undefined)
      );
      await setDoc(doc(db, 'categories', id), {
        ...cleanCat,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setEditingCategory(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const deleteCategory = async (id: string) => {
    const path = `categories/${id}`;
    try {
      await deleteDoc(doc(db, 'categories', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const updateQrValue = async (val: string) => {
    setQrValue(val);
    const path = 'settings/global';
    try {
      await setDoc(doc(db, path), { 
        qrValue: val,
        customCategories,
        customUnits
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const updateCustomCategories = async (cats: string[]) => {
    for (const name of cats) {
      if (!categoryItems.some(c => c.name === name)) {
        await addCategory({ name, gujaratiName: '', order: categoryItems.length });
      }
    }
    setCustomCategories(prev => {
      const newCats = Array.from(new Set([...prev, ...cats]));
      const path = 'settings/global';
      setDoc(doc(db, path), { 
        customCategories: newCats,
        customUnits,
        qrValue
      }, { merge: true }).catch(error => handleFirestoreError(error, OperationType.WRITE, path));
      return newCats;
    });
  };

  const updateCustomUnits = async (u: string[]) => {
    setCustomUnits(prev => {
      const newUnits = Array.from(new Set([...prev, ...u]));
      const path = 'settings/global';
      setDoc(doc(db, path), { 
        customUnits: newUnits,
        customCategories,
        qrValue
      }, { merge: true }).catch(error => handleFirestoreError(error, OperationType.WRITE, path));
      return newUnits;
    });
  };

  const addToCart = (product: Product, quantity: number) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { ...product, quantity }];
    });
  };

  const updateCartQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(() => {
    return localStorage.getItem('isAdminUnlocked') === 'true';
  });

  const handleAdminUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === '1234') {
      setIsAdminUnlocked(true);
      localStorage.setItem('isAdminUnlocked', 'true');
      setAdminPassword('');
    } else {
      alert('Incorrect Password');
    }
  };

  const handleAdminLock = () => {
    setIsAdminUnlocked(false);
    localStorage.removeItem('isAdminUnlocked');
    navigate('/');
  };

  const renderAdminContent = () => (
    <div className="space-y-6">
      {!isAdminUnlocked && !isUserAdmin ? (
        <div className="flex flex-col items-center justify-center py-24 bento-card bg-white/50 backdrop-blur-sm border-dashed">
          <div className="w-24 h-24 bg-emerald-50 rounded-[32px] flex items-center justify-center mb-8 rotate-3 shadow-inner">
            <LayoutDashboard className="w-10 h-10 text-primary-green -rotate-3" />
          </div>
          <h2 className="text-3xl font-black text-slate-950 mb-3 tracking-tight">Admin Access</h2>
          <p className="text-slate-500 mb-10 max-w-xs text-center font-medium leading-relaxed">
            Enter your store manager password to access inventory and categories.
          </p>
          
          <form onSubmit={handleAdminUnlock} className="flex flex-col gap-4 w-full max-w-xs">
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Enter Password"
              className="w-full bg-white border-2 border-slate-200 rounded-2xl px-6 py-4 text-center text-xl font-bold tracking-[0.5em] focus:border-primary-green focus:ring-0 transition-all outline-hidden"
              autoFocus
            />
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              className="w-full bg-slate-950 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl"
            >
              Unlock Dashboard
            </motion.button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-full text-slate-400 text-xs font-bold uppercase tracking-widest hover:text-slate-600 py-2"
            >
              Cancel & Exit
            </button>
          </form>
        </div>
      ) : (
        <>
          {!isUserAdmin && isAdminUnlocked && (
            <div className="bg-amber-50 border-2 border-amber-200 p-6 rounded-[32px] flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 shadow-sm border-dashed">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                  <User className="w-6 h-6 text-amber-500" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Admin Authentication</h4>
                  <p className="text-xs text-slate-500 font-medium">To sync your data securely, please sign in with your primary email.</p>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={login}
                className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-bold text-xs flex items-center gap-2 shadow-xl whitespace-nowrap"
              >
                <User className="w-4 h-4 text-emerald-400" />
                Sign in with Google
              </motion.button>
            </div>
          )}

          <div className="flex items-center justify-between px-2 mb-2 gap-4">
            <div className="flex gap-2 p-1 bg-slate-200/50 rounded-2xl overflow-x-auto max-w-full no-scrollbar flex-1">
            <button
              onClick={() => setAdminTab('products')}
              className={`px-6 py-2.5 text-xs font-black rounded-xl transition-all ${adminTab === 'products' ? 'bg-white text-primary-green shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Package className="w-3.5 h-3.5 inline mr-2" /> PRODUCTS
            </button>
            <button
              onClick={() => setAdminTab('categories')}
              className={`px-6 py-2.5 text-xs font-black rounded-xl transition-all ${adminTab === 'categories' ? 'bg-white text-primary-green shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <LayoutDashboard className="w-3.5 h-3.5 inline mr-2" /> CATEGORIES
            </button>
            <button
              onClick={() => setAdminTab('qr')}
              className={`px-6 py-2.5 text-xs font-black rounded-xl transition-all ${adminTab === 'qr' ? 'bg-white text-primary-green shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Smartphone className="w-3.5 h-3.5 inline mr-2" /> SHOP QR
            </button>
          </div>
          {user && (
            <button
              onClick={logout}
              className="px-4 py-2 text-[10px] font-black text-red-500 uppercase tracking-widest hover:bg-red-50 rounded-xl transition-all"
            >
              <LogOut className="w-3.5 h-3.5 inline mr-1" /> Sign Out
            </button>
          )}
        </div>

        {adminTab === 'products' ? (
          <div className="grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 bento-card p-6 h-fit shrink-0">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-900">{editingProduct ? 'Edit Product' : 'Add Product'}</h3>
                <div className="flex gap-2">
                  {editingProduct && (
                    <button 
                      onClick={() => setEditingProduct(null)}
                      className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600"
                    >
                      Cancel
                    </button>
                  )}
                  <span className="tag bg-emerald-100 text-emerald-700">Inventory</span>
                </div>
              </div>
              <ProductForm 
                key={editingProduct?.id || 'new'}
                onAdd={addProduct} 
                onUpdate={(p) => editingProduct && updateProduct(editingProduct.id, p)}
                initialData={editingProduct || undefined}
                availableCategories={categories.filter(c => c !== 'All')}
                availableUnits={units}
                onAddNewCategory={(cat) => updateCustomCategories([cat])}
                onAddNewUnit={(u) => updateCustomUnits([u])}
              />
            </div>
            
            <div className="lg:col-span-8 flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="bento-card bg-emerald-50 p-6">
                  <span className="tag bg-emerald-200 text-emerald-800 w-fit mb-4">Live</span>
                  <div className="flex flex-col">
                    <span className="text-4xl font-extrabold text-emerald-950 leading-none mb-1">{products.length}</span>
                    <span className="text-xs text-emerald-700 uppercase font-bold tracking-wider">Total Products</span>
                  </div>
                </div>
                <div className="bento-card bg-slate-900 p-6 text-white">
                  <span className="tag bg-white/10 text-emerald-400 w-fit mb-4">System</span>
                  <div className="flex flex-col">
                    <span className="text-4xl font-extrabold text-emerald-400 leading-none mb-1">{new Set(products.map(p => p.category)).size}</span>
                    <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Active Categories</span>
                  </div>
                </div>
              </div>

              <div className="bento-card flex-1">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-bold text-slate-900">Product Directory</h3>
                  <div className="text-xs text-slate-400 font-medium">Auto-synced to Cloud</div>
                </div>
                <div className="overflow-x-auto">
                  <div className="divide-y divide-gray-100">
                    {products.length === 0 ? (
                      <div className="px-6 py-12 text-center text-slate-400 font-medium italic text-sm">
                        No items found in your shop inventory.
                      </div>
                    ) : (
                      Array.from(new Set(products.map(p => p.category))).sort().map(cat => (
                        <div key={cat} className="bg-white">
                          <div className="bg-slate-50/80 px-6 py-2 sticky top-0 z-10 border-y border-slate-100">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{cat}</span>
                          </div>
                          <table className="w-full text-left border-collapse">
                            <tbody className="divide-y divide-slate-50">
                              {products.filter(p => p.category === cat).map((p) => (
                                <tr key={p.id} className="group hover:bg-emerald-50/30 transition-colors">
                                  <td className="px-6 py-4 w-16">
                                    {p.image ? (
                                      <img src={p.image} alt={p.name} className="w-10 h-10 rounded-lg object-cover border border-slate-200" />
                                    ) : (
                                      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-300">
                                        <ImageIcon className="w-5 h-5" />
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-6 py-4">
                                    <p className="font-bold text-slate-900 text-sm">{p.name}</p>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{p.unit}</p>
                                  </td>
                                  <td className="px-6 py-4 font-black text-primary-green text-sm">₹{p.price.toFixed(2)}</td>
                                  <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                                      <button
                                        onClick={() => {
                                          setEditingProduct(p);
                                          window.scrollTo({ top: 0, behavior: 'smooth' });
                                        }}
                                        className="p-2 text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 rounded-xl transition-all"
                                        title="Edit"
                                      >
                                        <Plus className="w-4 h-4 rotate-45" />
                                      </button>
                                      <button
                                        onClick={() => deleteProduct(p.id)}
                                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                        title="Delete"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : adminTab === 'categories' ? (
          <div className="grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 bento-card p-6 h-fit shrink-0">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-900">{editingCategory ? 'Edit Category' : 'Add Category'}</h3>
                {editingCategory && (
                  <button 
                    onClick={() => setEditingCategory(null)}
                    className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600"
                  >
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
            
            <div className="lg:col-span-8 bento-card overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-900">Category Directory</h3>
                <div className="flex gap-4">
                  <button 
                    onClick={syncCategories}
                    className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600"
                  >
                    Sync from Products
                  </button>
                  <button 
                    onClick={seedCategories}
                    className="text-[10px] font-black text-primary-green uppercase tracking-widest hover:underline"
                  >
                    Seed Defaults
                  </button>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {categoryItems.length === 0 ? (
                  <div className="px-6 py-12 text-center text-slate-400 font-medium italic text-sm">
                    No categories defined.
                  </div>
                ) : (
                  categoryItems.map(cat => (
                    <div key={cat.id} className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden border border-slate-200" style={{ minWidth: '48px' }}>
                        {cat.image ? (
                          <img src={cat.image} alt={cat.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300">
                            <ImageIcon className="w-5 h-5" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-slate-900">{cat.name}</h4>
                        <p className="text-xs text-slate-500">{cat.gujaratiName || 'No Gujarati Name'}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingCategory(cat);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="p-2 text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 rounded-xl transition-all"
                        >
                          <Plus className="w-4 h-4 rotate-45" />
                        </button>
                        <button
                          onClick={() => deleteCategory(cat.id)}
                          className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
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
        ) : (
          <div className="bento-card p-12 text-center max-w-2xl mx-auto">
            <div className="mb-8">
              <span className="tag bg-emerald-100 text-emerald-700 mb-4 inline-block">Direct Access</span>
              <h3 className="text-3xl font-extrabold text-slate-950 mb-2">Grow Your Shop</h3>
              <p className="text-slate-500 max-w-sm mx-auto">Place this QR code at your shop counter. Customers can scan to order instantly.</p>
            </div>
            <div className="inline-block p-8 bg-white border border-emerald-100 rounded-[32px] shadow-2xl shadow-emerald-500/10 mb-8 border-dashed">
              <QRCodeSVG
                value={qrValue}
                size={256}
                level="H"
                includeMargin={true}
              />
            </div>
            <div className="flex flex-col gap-4 max-w-sm mx-auto">
              <div className="text-left mb-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                  Quick Order Link
                </label>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center gap-3">
                  <Smartphone className="w-5 h-5 text-emerald-500 shrink-0" />
                  <input
                    type="text"
                    value={qrValue}
                    onChange={(e) => updateQrValue(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-transparent text-sm font-bold text-slate-900 border-none focus:ring-0 p-0"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
                <span className="text-emerald-600 font-bold">✓ Live Link Active:</span> This QR code redirects customers directly to your online shop. You can manually change this link anytime.
              </p>
            </div>
          </div>
        )}
      </>
    )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFB]">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
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
                GGM&S Grocery
              </h1>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                Wholesale & Retail
              </p>
            </div>
          </motion.div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                if (isAdminView) {
                  navigate('/');
                } else {
                  navigate('/admin');
                }
              }}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-black shadow-lg transition-all border-2 
                ${isAdminView 
                  ? 'bg-white text-emerald-600 border-emerald-600' 
                  : (isUserAdmin ? 'bg-emerald-600 text-white border-emerald-600' : 'hidden')}`}
            >
              {isAdminView ? <ShoppingCart className="w-4 h-4" /> : <LayoutDashboard className="w-4 h-4" />}
              {isAdminView ? 'View Shop' : 'Manage Store'}
            </motion.button>

            {!isAdminView && !isUserAdmin && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/admin')}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-bold shadow-lg transition-all border-2 bg-slate-100 text-slate-400 border-slate-200 hover:text-slate-600"
              >
                <Lock className="w-4 h-4" />
                Admin
              </motion.button>
            )}

            {isAdminUnlocked && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleAdminLock}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-bold shadow-lg transition-all border-2 bg-slate-950 text-white border-slate-950"
              >
                <LogOut className="w-4 h-4" />
                {isAdminView ? 'Logout' : 'Lock'}
              </motion.button>
            )}
          </div>
        </header>

        {/* View Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={isAdminView ? 'admin' : location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {isAdminView ? renderAdminContent() : (
              <Routes location={location}>
                <Route path="/admin" element={renderAdminContent()} />
                <Route path="/admin/" element={renderAdminContent()} />
                <Route path="*" element={
              <div className="space-y-8 pb-32 lg:pb-12">
                {/* Search Header - Sticky */}
                <div className="sticky top-0 z-40 bg-[#F8FAFB]/95 backdrop-blur-md -mx-4 px-4 py-3 sm:py-4 pt-5 sm:pt-6">
                  <div className="flex flex-col gap-3 sm:gap-4">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 px-2 tracking-tight">Products Collection</h2>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-slate-400 group-focus-within:text-primary-green transition-colors" />
                      </div>
                      <input
                        type="text"
                        placeholder="Search Products..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl sm:rounded-2xl pl-12 pr-4 py-3 sm:py-4 text-sm focus:border-primary-green focus:ring-4 focus:ring-primary-green/5 outline-hidden transition-all shadow-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Category Selection - Home View */}
                {!selectedCategory ? (
                  <div className="space-y-10 py-8">
                    <div className="text-center space-y-3">
                      <h2 className="text-4xl font-black text-slate-950 tracking-tight">Our Categories</h2>
                      <p className="text-slate-500 font-medium">Select a department to start shopping</p>
                    </div>
                    
                    <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
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
                    {/* Category Filter - List View */}
                    <div className="sticky top-[132px] sm:top-[160px] z-30 bg-[#F8FAFB]/90 backdrop-blur-xl -mx-4 px-4 py-3 sm:py-4 border-b border-slate-200/50">
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={() => setSelectedCategory(null)}
                          className="bg-white p-2.5 rounded-2xl border border-slate-200 text-slate-900 hover:text-primary-green hover:border-primary-green transition-all shadow-sm"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div className="flex gap-2 overflow-x-auto scrollbar-hide flex-1">
                          <button
                            onClick={() => setSelectedCategory('All Products')}
                            className={`px-6 py-2.5 rounded-full text-xs font-black whitespace-nowrap transition-all border flex items-center gap-2 ${selectedCategory === 'All Products' ? 'bg-[#00884F] text-white border-[#00884F] shadow-lg' : 'bg-white text-slate-500 border-slate-200 hover:border-primary-green'}`}
                          >
                            <Package className="w-3 h-3" />
                            All Products
                          </button>
                          {allCategories.map(cat => (
                            <button
                              key={cat.name}
                              onClick={() => setSelectedCategory(cat.name)}
                              className={`px-6 py-2.5 rounded-full text-xs font-black whitespace-nowrap transition-all border ${selectedCategory === cat.name ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-white text-slate-500 border-slate-200 hover:border-primary-green'}`}
                            >
                              {cat.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-8">
                      {/* View Header */}
                      <div className="flex items-baseline gap-3">
                        <h3 className="text-2xl font-black text-slate-900">
                          {selectedCategory === 'All' ? 'Everything Fresh' : selectedCategory}
                        </h3>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                          {filteredProducts.length} Items Found
                        </span>
                      </div>

                      {/* Product Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-6">
                        {filteredProducts.map((p: Product) => (
                          <ProductCard key={p.id} product={p} onAdd={addToCart} />
                        ))}
                        {filteredProducts.length === 0 && (
                          <div className="col-span-full py-20 text-center bento-card border-dashed bg-slate-50/50">
                            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-200 text-slate-300">
                              <Package className="w-8 h-8" />
                            </div>
                            <h3 className="text-slate-900 font-bold mb-1">Stocking up...</h3>
                            <p className="text-slate-400 text-sm">We're adding fresh items to this section soon.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Cart Section */}
                <div className="pt-8 border-t border-slate-200">
                  <div id="customer-basket" className="grid lg:grid-cols-12 gap-8 items-start">
                    <div className="lg:col-span-8 flex flex-col gap-6">
                      <div className="flex items-center justify-between px-2">
                        <h3 className="text-xl font-extrabold text-slate-900">Your Basket</h3>
                        <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">{cart.length} ITEMS</span>
                      </div>
                      
                      {cart.length === 0 ? (
                        <div className="bento-card p-8 sm:p-16 text-center border-dashed bg-emerald-50/20">
                          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-[24px] flex items-center justify-center mx-auto mb-4 sm:mb-6 shadow-sm border border-emerald-100">
                            <ShoppingCart className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-200" />
                          </div>
                          <h4 className="text-slate-900 font-bold text-base sm:text-lg mb-1 sm:mb-2">Hungry for more?</h4>
                          <p className="text-slate-500 text-xs sm:text-sm max-w-[200px] sm:max-w-xs mx-auto">Explore our aisles and fill your basket with the freshest local produce.</p>
                        </div>
                      ) : (
                        <div className="bento-card overflow-hidden divide-y divide-slate-100">
                          {cart.map(item => (
                            <div key={item.id} className="p-3 sm:p-5 flex items-center gap-3 sm:gap-4 hover:bg-slate-50 transition-colors">
                              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl overflow-hidden shrink-0 border border-slate-100">
                                {item.image ? (
                                  <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full bg-slate-50 flex items-center justify-center text-slate-300">
                                    <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase mb-0.5 block truncate">{item.category}</span>
                                <h4 className="font-bold text-sm sm:text-base text-slate-900 truncate leading-tight">{item.name}</h4>
                                <p className="text-xs sm:text-sm font-black text-primary-green mt-0.5">₹{item.price.toFixed(0)} / {item.unit}</p>
                              </div>
                              <div className="flex items-center gap-1 sm:gap-1.5 p-0.5 sm:p-1 bg-slate-100 rounded-lg sm:rounded-xl">
                                <button
                                  onClick={() => updateCartQuantity(item.id, -1)}
                                  className="w-7 h-7 sm:w-8 h-8 flex items-center justify-center rounded-md sm:rounded-lg bg-white border border-slate-200 hover:text-danger hover:border-danger transition-all p-0"
                                >
                                  {item.quantity === 1 ? <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                                </button>
                                <span className="w-6 sm:w-8 text-center font-black text-[10px] sm:text-xs text-slate-900">{item.quantity}</span>
                                <button
                                  onClick={() => updateCartQuantity(item.id, 1)}
                                  className="w-7 h-7 sm:w-8 h-8 flex items-center justify-center rounded-md sm:rounded-lg bg-white border border-slate-200 hover:text-primary-green hover:border-primary-green transition-all"
                                >
                                  <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                </button>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="font-black text-xs sm:text-base text-slate-900">₹{(item.price * item.quantity).toFixed(0)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="lg:col-span-4 sticky top-8">
                      <div className="bento-card bg-emerald-50 border-emerald-100 p-6 shadow-xl shadow-emerald-900/5">
                        <div className="mb-8">
                          <span className="tag bg-emerald-200 text-emerald-800 mb-4 block w-fit">Checkout</span>
                          <div className="space-y-3">
                            <div className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-widest">
                              <span>Subtotal</span>
                              <span>₹{cartTotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-xs font-bold text-emerald-700 uppercase tracking-widest items-center">
                              <span>Delivery</span>
                              <span className="bg-emerald-200 px-2 py-0.5 rounded-full text-[10px]">FREE</span>
                            </div>
                            <div className="pt-4 border-t border-emerald-200/50 flex justify-between items-baseline">
                              <span className="font-extrabold text-emerald-950">Grand Total</span>
                              <span className="text-3xl font-black text-emerald-950 leading-none">₹{cartTotal.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>

                        <CheckoutForm cart={cart} total={cartTotal} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Store Footer */}
                <footer className="mt-16 pb-12 pt-8 border-t border-slate-200">
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-2 grayscale opacity-50">
                      <ShoppingCart className="w-5 h-5 text-primary-green" />
                      <span className="text-sm font-black text-slate-900 uppercase">GGM&S Grocery</span>
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">© 2024 Wholesale & Retail</p>
                    
                    <div className="flex flex-col items-center gap-2 mt-4">
                      {isAdminUnlocked ? (
                        <button 
                          onClick={() => navigate('/admin')}
                          className="text-[11px] font-black text-slate-800 hover:text-emerald-500 transition-colors uppercase tracking-[0.2em] bg-slate-100 px-6 py-2 rounded-full"
                        >
                          Manage Shop
                        </button>
                      ) : (
                        <button 
                          onClick={() => navigate('/admin')}
                          className="text-[11px] font-black text-slate-800 hover:text-emerald-500 transition-colors uppercase tracking-[0.2em] bg-slate-100 px-6 py-2 rounded-full"
                        >
                          Store Manager Login
                        </button>
                      )}
                    </div>
                  </div>
                </footer>

                {/* Mobile Floating Cart - Modern Sticky Bar */}
                {cart.length > 0 && selectedCategory && (
                  <motion.div
                    initial={{ y: 100 }}
                    animate={{ y: 0 }}
                    className="fixed bottom-4 left-4 right-4 z-50 lg:hidden"
                  >
                    <button
                      onClick={() => {
                        const basketElement = document.getElementById('customer-basket');
                        basketElement?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="w-full bg-[#00884F] text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between border-2 border-white/20 backdrop-blur-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-2 rounded-xl">
                          <ShoppingCart className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                          <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest">{cart.length} Items</p>
                          <p className="text-sm font-black">₹{cartTotal.toFixed(0)} Total</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 font-black text-sm uppercase">
                        View Cart
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </button>
                  </motion.div>
                )}
              </div>
            } />
          </Routes>
        )}
      </motion.div>
    </AnimatePresence>
    </div>
  </div>
);
}

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    const cat = { name, gujaratiName, image: image || undefined, order };
    if (initialData && onUpdate) {
      onUpdate(cat);
    } else {
      onAdd(cat);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        alert('Image too large. Please select an image under 1MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => setImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-col items-center gap-4 mb-6">
        <label className="relative cursor-pointer group">
          <div className="w-24 h-24 rounded-[24px] border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-slate-400 group-hover:border-primary-green group-hover:bg-emerald-50 transition-all overflow-hidden text-center p-2">
            {image ? (
              <>
                <img src={image} alt="Preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <X className="text-white w-6 h-6" onClick={(e) => {
                    e.preventDefault();
                    setImage(null);
                  }} />
                </div>
              </>
            ) : (
              <>
                <Camera className="w-6 h-6 mb-1" />
                <span className="text-[8px] font-bold uppercase tracking-widest">Icon</span>
              </>
            )}
          </div>
          <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
          <div className="absolute -bottom-2 -right-2 bg-primary-green text-white p-2 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
            <Plus className="w-4 h-4" />
          </div>
        </label>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">English Name</label>
        <input
          required
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Vegetables"
          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:border-primary-green transition-all"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Gujarati Name (Optional)</label>
        <input
          type="text"
          value={gujaratiName}
          onChange={e => setGujaratiName(e.target.value)}
          placeholder="e.g. શાકભાજી"
          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:border-primary-green transition-all font-sans"
        />
      </div>

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        type="submit"
        className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-slate-900/10 hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
      >
        {initialData ? <Send className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        {initialData ? 'Update Category' : 'Create Category'}
      </motion.button>
    </form>
  );
};

interface CategoryCardProps {
  item?: CategoryItem;
  name?: string;
  isActive: boolean;
  onClick: () => void;
}

const CategoryCard: React.FC<CategoryCardProps> = ({ item, name, isActive, onClick }) => {
  return (
    <motion.button
      whileHover={{ y: -5 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`bento-card p-2 sm:p-4 flex flex-col items-center justify-center gap-2 sm:gap-4 transition-all border-2 ${isActive ? 'border-primary-green bg-emerald-50' : 'border-white hover:border-emerald-100 hover:shadow-lg'}`}
    >
      <div className="w-full aspect-square rounded-xl sm:rounded-2xl overflow-hidden bg-slate-50 flex items-center justify-center relative shadow-inner">
        {item?.image ? (
          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
        ) : name === 'All Products' ? (
          <div className="w-full h-full bg-[#00884F] flex items-center justify-center text-white">
            <Package className="w-5 h-5 sm:w-10 sm:h-10" />
          </div>
        ) : (
          <ImageIcon className="w-5 h-5 sm:w-10 sm:h-10 text-slate-200" />
        )}
      </div>
      <div className="text-center overflow-hidden w-full flex-1 flex flex-col justify-center">
        <h4 className={`text-[9px] sm:text-base font-black uppercase tracking-tight leading-tight line-clamp-2 ${isActive ? 'text-primary-green' : 'text-slate-800'}`}>
          {name || item?.name}
        </h4>
        {item?.gujaratiName && (
          <p className="text-[8px] sm:text-sm font-medium text-slate-500 mt-0.5 line-clamp-1">({item.gujaratiName})</p>
        )}
      </div>
    </motion.button>
  );
};

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
  const [category, setCategory] = useState(initialData?.category || availableCategories[0] || 'Grains & Pulses');
  const [price, setPrice] = useState(initialData?.price.toString() || '');
  const [mrp, setMrp] = useState(initialData?.mrp?.toString() || '');
  const [unit, setUnit] = useState(initialData?.unit || availableUnits[0] || 'kg');
  const [image, setImage] = useState<string | null>(initialData?.image || null);

  const [isAddingNewCat, setIsAddingNewCat] = useState(false);
  const [newCat, setNewCat] = useState('');
  
  const [isAddingNewUnit, setIsAddingNewUnit] = useState(false);
  const [newUnitInput, setNewUnitInput] = useState('');

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) { // 1MB limit for localStorage safety
        alert('Image too large. Please select an image under 1MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name || !price) return;
    
    let finalCat = category;
    if (isAddingNewCat && newCat.trim()) {
      finalCat = newCat.trim();
      onAddNewCategory(finalCat);
    }
    
    let finalUnit = unit;
    if (isAddingNewUnit && newUnitInput.trim()) {
      finalUnit = newUnitInput.trim();
      onAddNewUnit(finalUnit);
    }

    const priceVal = parseFloat(price);
    const mrpVal = mrp ? parseFloat(mrp) : undefined;

    if (initialData && onUpdate) {
      onUpdate({ name, category: finalCat, price: priceVal, mrp: mrpVal, unit: finalUnit, image: image || undefined });
    } else {
      onAdd({ name, category: finalCat, price: priceVal, mrp: mrpVal, unit: finalUnit, image: image || undefined });
      setName('');
      setPrice('');
      setMrp('');
      setImage(null);
      setCategory(finalCat);
      setUnit(finalUnit);
    }
    
    setIsAddingNewCat(false);
    setNewCat('');
    setIsAddingNewUnit(false);
    setNewUnitInput('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-col items-center gap-4 mb-6">
        <label className="relative cursor-pointer group">
          <div className="w-24 h-24 rounded-[24px] border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-slate-400 group-hover:border-primary-green group-hover:bg-emerald-50 transition-all overflow-hidden">
            {image ? (
              <>
                <img src={image} alt="Preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <X className="text-white w-6 h-6" onClick={(e) => {
                    e.preventDefault();
                    setImage(null);
                  }} />
                </div>
              </>
            ) : (
              <>
                <Camera className="w-6 h-6 mb-1" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Avatar</span>
              </>
            )}
          </div>
          <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
          <div className="absolute -bottom-2 -right-2 bg-primary-green text-white p-2 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
            <Plus className="w-4 h-4" />
          </div>
        </label>
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Product Photo</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Name</label>
        <input
          required
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Basmati Rice"
          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:border-primary-green focus:ring-4 focus:ring-primary-green/5 focus:outline-hidden transition-all"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between items-center px-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</label>
          <button 
            type="button" 
            onClick={() => setIsAddingNewCat(!isAddingNewCat)}
            className="text-[10px] font-black text-primary-green uppercase tracking-widest hover:underline"
          >
            {isAddingNewCat ? 'Select' : '+ New'}
          </button>
        </div>
        {isAddingNewCat ? (
          <div className="flex gap-2">
            <input
              autoFocus
              type="text"
              value={newCat}
              onChange={e => setNewCat(e.target.value)}
              placeholder="Enter new category..."
              className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:border-primary-green focus:outline-hidden transition-all"
            />
            <button
              type="button"
              onClick={() => {
                if (newCat.trim()) {
                  onAddNewCategory(newCat.trim());
                  setCategory(newCat.trim());
                  setIsAddingNewCat(false);
                  setNewCat('');
                }
              }}
              className="bg-primary-green text-white px-4 rounded-2xl hover:bg-secondary-green transition-all"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:border-primary-green focus:outline-hidden transition-all appearance-none cursor-pointer"
          >
            {availableCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">MRP (₹)</label>
          <input
            type="number"
            step="0.01"
            value={mrp}
            onChange={e => setMrp(e.target.value)}
            placeholder="0.00"
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:border-primary-green focus:outline-hidden transition-all"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Selling Price (₹)</label>
          <input
            required
            type="number"
            step="0.01"
            value={price}
            onChange={e => setPrice(e.target.value)}
            placeholder="0.00"
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:border-primary-green focus:outline-hidden transition-all"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between items-center px-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Unit</label>
            <button 
              type="button" 
              onClick={() => setIsAddingNewUnit(!isAddingNewUnit)}
              className="text-[10px] font-black text-primary-green uppercase tracking-widest hover:underline"
            >
              {isAddingNewUnit ? 'Select' : '+ New'}
            </button>
          </div>
          {isAddingNewUnit ? (
            <div className="flex gap-2">
              <input
                autoFocus
                type="text"
                value={newUnitInput}
                onChange={e => setNewUnitInput(e.target.value)}
                placeholder="e.g. box"
                className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:border-primary-green focus:outline-hidden transition-all"
              />
              <button
                type="button"
                onClick={() => {
                  if (newUnitInput.trim()) {
                    onAddNewUnit(newUnitInput.trim());
                    setUnit(newUnitInput.trim());
                    setIsAddingNewUnit(false);
                    setNewUnitInput('');
                  }
                }}
                className="bg-primary-green text-white px-4 rounded-2xl hover:bg-secondary-green transition-all"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <select
              value={unit}
              onChange={e => setUnit(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:border-primary-green focus:outline-hidden transition-all appearance-none cursor-pointer"
            >
              {availableUnits.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          )}
        </div>

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        type="submit"
        className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-slate-900/10 hover:bg-slate-800 transition-all flex items-center justify-center gap-2 mt-4"
      >
        {initialData ? <Send className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        {initialData ? 'Update Item' : 'Register Item'}
      </motion.button>
    </form>
  );
}

interface ProductCardProps {
  product: Product;
  onAdd: (p: Product, qty: number) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, onAdd }) => {
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const discount = product.mrp && product.mrp > product.price ? ((product.mrp - product.price) / product.mrp * 100).toFixed(2) : '0';
  const hasDiscount = parseFloat(discount) > 0;

  const handleAdd = () => {
    onAdd(product, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
    setQty(1);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-[24px] overflow-hidden flex flex-col h-full group border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-300"
    >
      <div className="aspect-square relative overflow-hidden bg-white">
        {product.image ? (
          <img src={product.image} alt={product.name} className="w-full h-full object-contain p-2 sm:p-4 transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-200">
            <ImageIcon className="w-10 h-10 sm:w-12 sm:h-12" />
          </div>
        )}
        <div className="absolute top-2 left-2 sm:top-3 sm:left-3">
          <span className="tag bg-white shadow-sm text-slate-600 font-bold text-[8px] sm:text-[10px] py-0.5 px-1.5 sm:py-1 sm:px-2 uppercase tracking-tight">
            {product.category}
          </span>
        </div>
      </div>

      <div className="p-2.5 sm:p-5 flex-1 flex flex-col">
        <h4 className="text-[11px] sm:text-base font-black text-slate-900 mb-0.5 leading-tight group-hover:text-primary-green transition-colors line-clamp-2 min-h-[1.75rem] sm:min-h-[2.5rem] uppercase">{product.name}</h4>
        
        {product.gujaratiName && (
          <p className="text-[9px] sm:text-xs text-slate-400 font-bold mb-2 line-clamp-1">
            {product.gujaratiName}
          </p>
        )}
        
        <div className="flex flex-col mb-2 sm:mb-3">
          <div className="flex items-center gap-1.5 sm:gap-2">
            {product.mrp && product.mrp > product.price && (
              <span className="text-[9px] sm:text-sm text-slate-400 line-through font-medium">₹{product.mrp.toFixed(0)}</span>
            )}
            <div className="flex items-baseline gap-0.5 sm:gap-1">
              <span className="text-sm sm:text-xl font-black text-[#00884F]">₹{product.price.toFixed(0)}</span>
              <span className="text-[8px] sm:text-sm text-slate-400 font-bold lowercase">/ {product.unit}</span>
            </div>
          </div>
          {hasDiscount && (
            <div className="mt-0.5 sm:mt-1">
              <span className="bg-red-500 text-white text-[8px] sm:text-[10px] font-black px-1 py-0.5 sm:px-2 sm:py-1 rounded-md sm:rounded-lg uppercase tracking-tight">
                {Math.round(parseFloat(discount))}% Off
              </span>
            </div>
          )}
        </div>

        <div className="mt-auto space-y-2 sm:space-y-4">
          <div className="flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xl sm:rounded-2xl p-0.5 sm:p-1.5 gap-1.5 sm:gap-4">
            <button
              onClick={() => setQty(Math.max(1, qty - 1))}
              className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl bg-white text-slate-900 font-bold border border-slate-100 shadow-sm active:scale-90 transition-all font-mono"
            >
              -
            </button>
            <span className="w-6 sm:w-8 text-center font-black text-slate-900 text-sm sm:text-lg">{qty}</span>
            <button
              onClick={() => setQty(Math.min(99, qty + 1))}
              className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl bg-white text-slate-900 font-bold border border-slate-100 shadow-sm active:scale-90 transition-all font-mono"
            >
              +
            </button>
          </div>

          <button
            onClick={handleAdd}
            className={`w-full py-2.5 sm:py-3.5 rounded-2xl font-bold text-xs sm:text-sm hover:opacity-90 transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2 ${added ? 'bg-emerald-600 text-white shadow-emerald-500/20' : 'bg-[#FFB800] text-slate-900 shadow-yellow-500/10'}`}
          >
            {added ? (
              <>
                <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center">
                  <Plus className="w-3 h-3 text-emerald-600" />
                </div>
                Added!
              </>
            ) : 'Add to Cart'}
          </button>
          
          <div className="flex justify-center">
            <button className="text-slate-300 hover:text-red-500 transition-colors">
              <Heart className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

interface CheckoutFormProps {
  cart: CartItem[];
  total: number;
}

const CheckoutForm: React.FC<CheckoutFormProps> = ({ cart, total }) => {
  const [details, setDetails] = useState<CustomerDetails>({
    name: '',
    phone: '',
    address: ''
  });

  const sendOrder = () => {
    if (!details.name || !details.phone || !details.address || cart.length === 0) return;

    let text = `*📦 BENTO ORDER: GGM&S GROCERY*\n\n`;
    text += `*👤 Customer Profile:*\nName: ${details.name}\nPhone: ${details.phone}\nAddress: ${details.address}\n\n`;
    text += `*🛒 Items Ordered:*\n`;

    cart.forEach(item => {
      text += `• ${item.name} (${item.quantity} ${item.unit}) - ₹${(item.price * item.quantity).toFixed(2)}\n`;
    });

    text += `\n*💎 FINAL TOTAL: ₹${total.toFixed(2)}*\n\n`;
    text += `Sent from GGM&S Bento Order System.`;

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="relative">
          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            required
            type="text"
            placeholder="Full Name"
            value={details.name}
            onChange={e => setDetails({ ...details, name: e.target.value })}
            className="w-full bg-white/50 border border-emerald-200 rounded-xl sm:rounded-2xl pl-12 pr-4 py-3 sm:py-4 text-base sm:text-sm focus:border-primary-green focus:ring-4 focus:ring-primary-green/5 focus:outline-hidden transition-all placeholder:text-slate-400 font-medium"
          />
        </div>
        <div className="relative">
          <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            required
            type="tel"
            placeholder="Mobile Number"
            value={details.phone}
            onChange={e => setDetails({ ...details, phone: e.target.value })}
            className="w-full bg-white/50 border border-emerald-200 rounded-xl sm:rounded-2xl pl-12 pr-4 py-3 sm:py-4 text-base sm:text-sm focus:border-primary-green focus:ring-4 focus:ring-primary-green/5 focus:outline-hidden transition-all placeholder:text-slate-400 font-medium"
          />
        </div>
        <div className="relative">
          <MapPin className="absolute left-4 top-4 w-4 h-4 text-slate-400" />
          <textarea
            required
            placeholder="Delivery Address"
            value={details.address}
            onChange={e => setDetails({ ...details, address: e.target.value })}
            className="w-full bg-white/50 border border-emerald-200 rounded-xl sm:rounded-2xl pl-12 pr-4 py-3 sm:py-4 text-base sm:text-sm focus:border-primary-green focus:ring-4 focus:ring-primary-green/5 focus:outline-hidden transition-all placeholder:text-slate-400 font-medium min-h-[80px] resize-none"
          />
        </div>
      </div>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={sendOrder}
        disabled={cart.length === 0}
        className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black text-sm shadow-xl shadow-emerald-600/20 disabled:opacity-50 disabled:grayscale transition-all flex items-center justify-center gap-2 mt-6 uppercase tracking-widest"
      >
        <Send className="w-4 h-4" /> Place Bento Order
      </motion.button>
    </div>
  );
}

