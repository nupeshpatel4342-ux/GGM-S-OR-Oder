export interface CategoryItem {
  id: string;
  name: string;
  gujaratiName?: string;
  image?: string;
  order?: number;
}

export interface ProductVariant {
  id: string;
  name: string;
  price: number;
  mrp?: number;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  mrp?: number;
  unit: string;
  image?: string;
  gujaratiName?: string;
  order?: number;
  variants?: ProductVariant[];
}

export interface CartItem extends Product {
  quantity: number;
  selectedVariant?: ProductVariant;
}

export interface CustomerDetails {
  name: string;
  phone: string;
  address: string;
  deliveryMode?: 'home_delivery' | 'pickup';
}

export type OrderStatus = 'pending' | 'processing' | 'delivered' | 'cancelled';

export interface Order {
  id: string;
  items: CartItem[];
  customer: CustomerDetails;
  total: number;
  status: OrderStatus;
  createdAt: string;
  deliveryMode?: 'home_delivery' | 'pickup';
  customerId?: string;
}

export interface Banner {
  id: string;
  imageUrl: string;
  title?: string;
  linkUrl?: string;
  isActive: boolean;
  order?: number;
}

export interface SavedAddress {
  id: string;
  label: string;
  address: string;
  isDefault: boolean;
}

export interface CustomerProfile {
  uid: string;
  name: string;
  phone: string;
  createdAt: string;
  savedAddresses: SavedAddress[];
  wishlist: string[];
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

