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
  couponCode?: string;
  couponDiscount?: number;
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
  profileImage?: string;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface Coupon {
  id: string;
  code: string;
  title: string;
  description: string;
  discountType: 'flat' | 'percentage' | 'free_delivery' | 'category';
  discountValue: number;
  minOrderAmount: number;
  maxDiscount?: number;
  category?: string;
  expiryDate: string;
  usageLimit: number;
  totalUsed: number;
  activeStatus: boolean;
  firstOrderOnly: boolean;
  onePerCustomer: boolean;
  customerSpecific?: string;
  createdAt: string;
}

export interface CouponUsage {
  id: string;
  customerId: string;
  customerPhone: string;
  couponCode: string;
  orderId: string;
  discountAmount: number;
  usedAt: string;
}


