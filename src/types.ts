export interface User {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  role: 'admin' | 'manager' | 'viewer';
}

export interface Category {
  id: string;
  name: string;
  priority: 'high' | 'stable' | 'low';
  icon: string;
}

export interface Item {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  stock: number;
  threshold: number;
  unitPrice: number;
  lastUpdated: string;
  updatedBy: string;
}

export interface HistoryRecord {
  id: string;
  itemId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalCost: number;
  timestamp: string;
  userUid: string;
  userName: string;
}
