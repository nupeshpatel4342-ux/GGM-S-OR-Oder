export interface CategoryItem {
  id: string;
  name: string;
  gujaratiName?: string;
  image?: string;
  order?: number;
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
}

export interface CartItem extends Product {
  quantity: number;
}

export interface CustomerDetails {
  name: string;
  phone: string;
  address: string;
}
