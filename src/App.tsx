import React, { useState, useEffect, useMemo, useCallback, Component, ReactNode } from 'react';
import { 
  Menu, Search, User as UserIcon, TrendingUp, Package, MapPin, 
  ArrowRight, Plus, Droplets, SortAsc, Wine, CupSoda, LayoutDashboard, 
  Layers, Settings, BellRing, AlertCircle, AlertTriangle, 
  ChevronLeft, Minus, Store, CheckCircle, LogOut, RefreshCw,
  Zap, History as HistoryIcon, BarChart3, DollarSign, Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  auth, db, signInWithGoogle, logout,
  addCategory, addItem, updateItemStock, addHistoryRecord, addAuditRecord
} from './firebase';
import { 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  collection, onSnapshot, doc, getDoc, setDoc 
} from 'firebase/firestore';
import { User, Category as CategoryType, Item, HistoryRecord, AuditRecord } from './types';
import { seedDatabase } from './seed';

// --- Error Boundary ---
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorInfo: string | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorInfo: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex flex-col items-center justify-center p-6 text-center space-y-4">
          <h2 className="text-2xl font-headline font-bold text-error">Something went wrong</h2>
          <div className="bg-error-container p-4 rounded-xl text-on-error-container text-xs font-mono max-w-md overflow-auto">
            {this.state.errorInfo}
          </div>
          <Button onClick={() => window.location.reload()}>Reload Ledger</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

const Button = ({ 
  className, variant = 'primary', size = 'md', children, ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { 
  variant?: 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'error';
  size?: 'sm' | 'md' | 'lg';
}) => {
  const variants = {
    primary: 'bg-indigo-gradient text-white shadow-md hover:brightness-110',
    secondary: 'bg-surface-container-high text-primary-container hover:bg-primary-container hover:text-white',
    tertiary: 'text-primary-container hover:bg-primary-container/10',
    ghost: 'hover:bg-surface-container-highest text-on-surface-variant',
    error: 'bg-error-container text-on-error-container hover:bg-error hover:text-white'
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-6 py-2.5 text-sm',
    lg: 'px-8 py-4 text-lg'
  };
  return (
    <button 
      className={cn(
        'rounded-xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

const Card = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div 
    className={cn(
      'bg-surface-container-lowest rounded-[2rem] p-6 transition-all duration-300 hover:translate-y-[-2px] hover:shadow-lg border border-transparent hover:border-outline-variant/20',
      className
    )}
    {...props}
  >
    {children}
  </div>
);

const Badge = ({ children, variant = 'default' }: { children: React.ReactNode, variant?: 'default' | 'tertiary' | 'secondary' | 'error' }) => {
  const variants = {
    default: 'bg-surface-container-high text-on-surface-variant',
    tertiary: 'bg-tertiary-container text-on-tertiary-container',
    secondary: 'bg-secondary-container text-on-secondary-container',
    error: 'bg-error-container text-on-error-container'
  };
  return (
    <span className={cn('text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider', variants[variant])}>
      {children}
    </span>
  );
};

// --- Main App ---

export default function App() {
  return (
    <ErrorBoundary>
      <LedgerApp />
    </ErrorBoundary>
  );
}

function LedgerApp() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'inventory' | 'orders' | 'categories' | 'settings' | 'audits'>('inventory');
  const [categories, setCategories] = useState<CategoryType[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [historyUserFilter, setHistoryUserFilter] = useState('');
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState('');
  const [inventoryStockFilter, setInventoryStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [reorderItem, setReorderItem] = useState<Item | null>(null);
  const [auditItem, setAuditItem] = useState<Item | null>(null);
  const [physicalCount, setPhysicalCount] = useState<number>(0);
  const [auditNotes, setAuditNotes] = useState('');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showSuccessAlert, setShowSuccessAlert] = useState<string | null>(null);

  // Form States
  const [newItem, setNewItem] = useState({ name: '', sku: '', categoryId: '', stock: 0, unitPrice: 0, threshold: 10 });
  const [newCategory, setNewCategory] = useState({ name: '', priority: 'stable' as const, icon: 'package' });
  const [reorderQty, setReorderQty] = useState(48);

  const handleAddItem = async () => {
    if (!newItem.name || !newItem.sku || !newItem.categoryId) return;
    await addItem(newItem);
    setShowQuickAdd(false);
    setNewItem({ name: '', sku: '', categoryId: '', stock: 0, unitPrice: 0, threshold: 10 });
  };

  const handleAddCategory = async () => {
    if (!newCategory.name) return;
    await addCategory(newCategory);
    setShowAddCategory(false);
    setNewCategory({ name: '', priority: 'stable', icon: 'package' });
  };

  const handleConfirmReorder = async () => {
    if (!reorderItem) return;
    const totalCost = reorderItem.unitPrice * reorderQty * 0.9;
    
    try {
      await updateItemStock(reorderItem.id, reorderItem.stock + reorderQty);
      await addHistoryRecord({
        itemId: reorderItem.id,
        itemName: reorderItem.name,
        quantity: reorderQty,
        unitPrice: reorderItem.unitPrice,
        totalCost: totalCost
      });
      setReorderItem(null);
      setReorderQty(48);
      setActiveTab('orders');
    } catch (error) {
      console.error('Reorder failed:', error);
    }
  };

  const handleConfirmAudit = async () => {
    if (!auditItem) return;
    const variance = physicalCount - auditItem.stock;
    
    try {
      await addAuditRecord({
        itemId: auditItem.id,
        itemName: auditItem.name,
        systemCount: auditItem.stock,
        physicalCount: physicalCount,
        variance: variance,
        notes: auditNotes
      });
      
      // Reconcile stock
      await updateItemStock(auditItem.id, physicalCount);
      
      setAuditItem(null);
      setPhysicalCount(0);
      setAuditNotes('');
      setShowSuccessAlert(`Audit completed for ${auditItem.name}. Stock reconciled.`);
      setTimeout(() => setShowSuccessAlert(null), 3000);
    } catch (error) {
      console.error('Audit failed:', error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        
        // Ensure user document exists (fallback for persistence or deleted docs)
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            role: firebaseUser.email === import.meta.env.VITE_ADMIN_EMAIL ? 'admin' : 'manager'
          });
        }

        onSnapshot(userRef, (doc) => {
          if (doc.exists()) {
            setUser(doc.data() as User);
          }
        });
        // Force re-seed once for fresh view with user provided data
        const hasSeeded = localStorage.getItem('has_seeded_v4');
        if (!hasSeeded) {
          await seedDatabase(true);
          localStorage.setItem('has_seeded_v4', 'true');
        } else {
          seedDatabase().catch(console.error);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;

    const unsubCategories = onSnapshot(collection(db, 'categories'), (snap) => {
      setCategories(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as CategoryType)));
    });

    const unsubItems = onSnapshot(collection(db, 'items'), (snap) => {
      setItems(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Item)));
    });

    const unsubHistory = onSnapshot(collection(db, 'history'), (snap) => {
      setHistory(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as HistoryRecord)).sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ));
    });

    const unsubAudits = onSnapshot(collection(db, 'audits'), (snap) => {
      setAudits(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as AuditRecord)).sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ));
    });

    return () => {
      unsubCategories();
      unsubItems();
      unsubHistory();
      unsubAudits();
    };
  }, [user]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            item.sku.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = !inventoryCategoryFilter || item.categoryId === inventoryCategoryFilter;
      const matchesStock = inventoryStockFilter === 'all' ? true :
                           inventoryStockFilter === 'low' ? item.stock < item.threshold && item.stock > 0 :
                           inventoryStockFilter === 'out' ? item.stock === 0 : true;
      return matchesSearch && matchesCategory && matchesStock;
    });
  }, [items, searchQuery, inventoryCategoryFilter, inventoryStockFilter]);

  const filteredHistory = useMemo(() => {
    return history.filter(record => {
      const matchesSearch = record.itemName.toLowerCase().includes(historySearchQuery.toLowerCase());
      const matchesUser = record.userName.toLowerCase().includes(historyUserFilter.toLowerCase());
      
      const recordDate = new Date(record.timestamp);
      const matchesStartDate = !historyStartDate || recordDate >= new Date(historyStartDate);
      const matchesEndDate = !historyEndDate || recordDate <= new Date(historyEndDate + 'T23:59:59');
      
      return matchesSearch && matchesUser && matchesStartDate && matchesEndDate;
    });
  }, [history, historySearchQuery, historyUserFilter, historyStartDate, historyEndDate]);

  if (loading) return <div className="h-screen flex items-center justify-center font-headline font-bold text-primary">Loading Ledger...</div>;

  if (!user) {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-6 bg-surface">
        <div className="w-full max-w-md space-y-8 text-center">
          <div className="space-y-2">
            <h1 className="font-headline font-extrabold text-5xl text-primary tracking-tighter text-indigo-gradient bg-clip-text text-transparent">The Ledger</h1>
            <p className="text-on-surface-variant font-medium">Architectural Inventory Management</p>
          </div>
          <div className="bg-surface-container-low p-8 rounded-[2rem] shadow-xl space-y-6">
            <div className="w-20 h-20 bg-indigo-gradient rounded-full mx-auto flex items-center justify-center text-white">
              <Package size={40} />
            </div>
            <div className="space-y-2">
              <h2 className="font-headline font-bold text-2xl">Welcome Back</h2>
              <p className="text-sm text-on-surface-variant">Sign in with your Google account to access your inventory ledger.</p>
            </div>
            <Button 
              className="w-full py-4" 
              onClick={async () => {
                try {
                  setAuthError(null);
                  await signInWithGoogle();
                } catch (err: any) {
                  setAuthError(err.message || 'Failed to sign in. Please check your connection and try again.');
                }
              }}
            >
              Sign in with Google
            </Button>
            {authError && (
              <div className="mt-4 p-3 bg-error-container/10 border border-error-container/20 rounded-xl flex items-center gap-3 text-error text-xs font-medium">
                <AlertCircle size={16} />
                <p>{authError}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (reorderItem) {
    return (
      <div className="bg-surface font-body text-on-surface min-h-screen flex flex-col">
        <header className="w-full top-0 sticky z-50 bg-surface dark:bg-on-surface">
          <div className="flex items-center justify-between px-4 h-16 w-full max-w-2xl mx-auto">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setReorderItem(null)}
                className="hover:bg-surface-container-low transition-colors active:scale-95 duration-200 p-2 rounded-full"
              >
                <span className="material-symbols-outlined text-primary">arrow_back</span>
              </button>
              <h1 className="font-headline font-semibold text-lg tracking-tight text-primary">Confirm Reorder</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-headline font-bold text-primary">The Ledger</span>
            </div>
          </div>
        </header>

        <main className="flex-grow px-4 py-6 max-w-2xl mx-auto w-full space-y-8">
          <section className="bg-surface-container-low p-6 rounded-xl space-y-6">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="text-on-surface-variant font-label text-xs tracking-widest uppercase">Product Details</p>
                <h2 className="font-headline font-bold text-2xl text-primary">{reorderItem.name}</h2>
                <p className="text-on-surface-variant text-sm font-medium">SKU: {reorderItem.sku}</p>
              </div>
              <div className="bg-tertiary-container text-on-tertiary-container px-4 py-1.5 rounded-full flex items-center gap-2">
                <span className="w-2 h-2 bg-on-tertiary-container rounded-full animate-pulse"></span>
                <span className="text-xs font-bold tracking-tight">CRITICAL</span>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-surface-container-highest rounded-2xl flex items-center justify-center">
                <Package size={32} className="text-primary-container" />
              </div>
              <div className="flex flex-col justify-center">
                <span className="text-on-surface-variant font-label text-sm">Current Stock</span>
                <span className="text-4xl font-headline font-extrabold text-on-surface">
                  {reorderItem.stock} <span className="text-lg font-medium text-on-surface-variant">Units</span>
                </span>
                {reorderItem.stock <= reorderItem.threshold && (
                  <div className="mt-2 text-error flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">warning</span>
                    <span className="text-xs font-semibold">Low stock alert</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          <div className="space-y-6">
            <div className="space-y-3">
              <label className="font-headline font-bold text-on-surface flex justify-between items-center">
                <span>Reorder Quantity</span>
                <span className="text-primary font-bold">{reorderQty} Units</span>
              </label>
              <div className="bg-surface-container-highest p-4 rounded-xl flex items-center justify-between">
                <button 
                  onClick={() => setReorderQty(prev => Math.max(0, prev - 24))}
                  className="w-10 h-10 bg-surface-container-lowest rounded-lg flex items-center justify-center text-primary-container active:scale-95 transition-transform"
                >
                  <span className="material-symbols-outlined">remove</span>
                </button>
                <div className="text-2xl font-headline font-bold text-on-surface">{reorderQty}</div>
                <button 
                  onClick={() => setReorderQty(prev => prev + 24)}
                  className="w-10 h-10 bg-surface-container-lowest rounded-lg flex items-center justify-center text-primary-container active:scale-95 transition-transform"
                >
                  <span className="material-symbols-outlined">add</span>
                </button>
              </div>
              <p className="text-on-surface-variant text-xs italic px-1">Standard case pack size applied (24x2).</p>
            </div>

            <div className="space-y-3">
              {/* Storage Node section removed to simplify inventory management */}
            </div>
          </div>

          <div className="bg-surface-container-low p-6 rounded-xl space-y-4">
            <h3 className="font-headline font-bold text-lg">Order Summary</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">Unit Price</span>
                <span className="text-on-surface font-medium">GH₵{reorderItem.unitPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">Bulk Discount (10%)</span>
                <span className="text-on-tertiary-container font-medium">-GH₵{(reorderItem.unitPrice * reorderQty * 0.1).toFixed(2)}</span>
              </div>
              <div className="h-px bg-surface-variant w-full my-2"></div>
              <div className="flex justify-between items-baseline">
                <span className="font-bold">Total Estimated Cost</span>
                <span className="text-2xl font-headline font-extrabold text-primary">
                  GH₵{(reorderItem.unitPrice * reorderQty * 0.9).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 pb-24">
            <button 
              onClick={handleConfirmReorder}
              className="w-full py-4 rounded-xl bg-indigo-gradient text-white font-headline font-bold text-lg shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined">check_circle</span>
              Confirm Reorder
            </button>
          </div>
        </main>

        <nav className="md:hidden fixed bottom-0 w-full z-50 rounded-t-3xl bg-surface-container-low/90 backdrop-blur-xl border-t border-outline-variant/10 shadow-[0_-8px_24px_rgba(0,0,0,0.05)]">
          <div className="flex justify-around items-center w-full px-2 py-3 pb-safe">
            <NavTab 
              active={activeTab === 'inventory'} 
              onClick={() => {setReorderItem(null); setActiveTab('inventory')}} 
              icon={<span className="material-symbols-outlined">inventory_2</span>} 
              label="Inventory" 
            />
            <NavTab 
              active={true} 
              onClick={() => {}} 
              icon={<span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>reorder</span>} 
              label="Orders" 
            />
            <NavTab 
              active={activeTab === 'categories'} 
              onClick={() => {setReorderItem(null); setActiveTab('categories')}} 
              icon={<span className="material-symbols-outlined">category</span>} 
              label="Categories" 
            />
            <NavTab 
              active={activeTab === 'settings'} 
              onClick={() => {setReorderItem(null); setActiveTab('settings')}} 
              icon={<span className="material-symbols-outlined">settings</span>} 
              label="Settings" 
            />
          </div>
        </nav>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32 bg-surface text-on-surface">
      {/* TopAppBar */}
      <header className="w-full top-0 sticky z-40 bg-surface-container-low">
        <div className="flex items-center justify-between px-6 py-4 w-full max-w-screen-xl mx-auto">
          <div className="flex items-center gap-4">
            <button className="text-on-surface hover:bg-surface-container-highest transition-colors p-2 rounded-xl active:scale-95 duration-200">
              <span className="material-symbols-outlined">menu</span>
            </button>
            <h1 className="font-headline font-extrabold text-primary-container tracking-tighter text-xl">The Ledger</h1>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <nav className="flex items-center gap-6">
              <button 
                onClick={() => setActiveTab('inventory')}
                className={cn(
                  "font-headline transition-colors",
                  activeTab === 'inventory' ? "text-primary-container font-bold" : "text-on-surface-variant hover:text-primary-container"
                )}
              >
                Inventory
              </button>
              <button 
                onClick={() => setActiveTab('orders')}
                className={cn(
                  "font-headline transition-colors",
                  activeTab === 'orders' ? "text-primary-container font-bold" : "text-on-surface-variant hover:text-primary-container"
                )}
              >
                Orders
              </button>
              <button 
                onClick={() => setActiveTab('categories')}
                className={cn(
                  "font-headline transition-colors",
                  activeTab === 'categories' ? "text-primary-container font-bold" : "text-on-surface-variant hover:text-primary-container"
                )}
              >
                Categories
              </button>
              <button 
                onClick={() => setActiveTab('audits')}
                className={cn(
                  "font-headline transition-colors",
                  activeTab === 'audits' ? "text-primary-container font-bold" : "text-on-surface-variant hover:text-primary-container"
                )}
              >
                Audits
              </button>
              <button 
                onClick={() => setActiveTab('settings')}
                className={cn(
                  "font-headline transition-colors",
                  activeTab === 'settings' ? "text-primary-container font-bold" : "text-on-surface-variant hover:text-primary-container"
                )}
              >
                Settings
              </button>
            </nav>
            <div className="h-6 w-px bg-outline-variant/30"></div>
            <button className="text-on-surface hover:bg-surface-container-highest transition-colors p-2 rounded-xl active:scale-95 duration-200">
              <span className="material-symbols-outlined">search</span>
            </button>
          </div>
          <div className="md:hidden">
            <button className="text-on-surface hover:bg-surface-container-highest transition-colors p-2 rounded-xl active:scale-95 duration-200">
              <span className="material-symbols-outlined">search</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-6 pt-8">
        <AnimatePresence mode="wait">
          {activeTab === 'inventory' && (
            <motion.div 
              key="inventory"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-10"
            >
              {/* Hero Summary Section (Bento Style) */}
              <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <div className="md:col-span-2 bg-indigo-gradient p-8 rounded-[2.5rem] flex flex-col justify-between min-h-[240px] shadow-xl text-white">
                  <div>
                    <p className="font-label text-white/60 text-sm uppercase tracking-widest mb-2">Inventory Value</p>
                    <h2 className="font-headline font-extrabold text-4xl md:text-5xl tracking-tighter">
                      GH₵{items.reduce((acc, item) => acc + (item.stock * item.unitPrice), 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </h2>
                  </div>
                  <div className="flex items-center gap-4 mt-8">
                    <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm">trending_up</span>
                      <span className="text-sm font-medium">+12% this month</span>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm">inventory_2</span>
                      <span className="text-sm font-medium">{items.length} Total SKUs</span>
                    </div>
                  </div>
                </div>
                <div className="bg-surface-container-low p-8 rounded-[2.5rem] flex flex-col justify-center gap-4 border border-outline-variant/10">
                  <h3 className="font-headline font-bold text-lg text-primary-container">Stock Alerts</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-surface-container-lowest rounded-xl">
                      <span className="text-sm font-medium text-on-surface-variant">Low Stock Items</span>
                      <span className="bg-error-container text-on-error-container px-3 py-1 rounded-full text-xs font-bold">
                        {items.filter(i => i.stock < i.threshold && i.stock > 0).length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-surface-container-lowest rounded-xl">
                      <span className="text-sm font-medium text-on-surface-variant">Out of Stock</span>
                      <span className="bg-on-surface-variant text-white px-3 py-1 rounded-full text-xs font-bold">
                        {items.filter(i => i.stock === 0).length}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              {/* Search and Filters */}
              <div className="flex flex-col gap-6 mb-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="relative flex-1 max-w-xl">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
                    <input 
                      className="w-full bg-surface-container-highest border-none rounded-xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-primary/20 text-on-surface placeholder:text-on-surface-variant/60 font-body" 
                      placeholder="Search inventory (e.g. Guinness, Afri Bull...)" 
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => {
                        setSearchQuery('');
                        setInventoryCategoryFilter('');
                        setInventoryStockFilter('all');
                      }}
                      className={cn(
                        "text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-lg transition-all",
                        (searchQuery || inventoryCategoryFilter || inventoryStockFilter !== 'all') 
                          ? "text-primary hover:bg-primary/10 opacity-100" 
                          : "opacity-0 pointer-events-none"
                      )}
                    >
                      Reset Filters
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2 bg-surface-container-low p-1 rounded-2xl border border-outline-variant/10">
                    <button 
                      onClick={() => setInventoryStockFilter('all')}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                        inventoryStockFilter === 'all' ? "bg-primary text-white shadow-md" : "text-on-surface-variant hover:bg-surface-container-high"
                      )}
                    >
                      All Stock
                    </button>
                    <button 
                      onClick={() => setInventoryStockFilter('low')}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                        inventoryStockFilter === 'low' ? "bg-error text-white shadow-md" : "text-on-surface-variant hover:bg-surface-container-high"
                      )}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
                      Low Stock
                    </button>
                    <button 
                      onClick={() => setInventoryStockFilter('out')}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                        inventoryStockFilter === 'out' ? "bg-on-surface text-white shadow-md" : "text-on-surface-variant hover:bg-surface-container-high"
                      )}
                    >
                      Out of Stock
                    </button>
                  </div>

                  <div className="h-8 w-px bg-outline-variant/20 hidden md:block"></div>

                  <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
                    <button 
                      onClick={() => setInventoryCategoryFilter('')}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border",
                        inventoryCategoryFilter === '' ? "bg-primary-container text-white border-primary-container" : "bg-surface-container-low text-on-surface-variant border-outline-variant/20 hover:border-primary/40"
                      )}
                    >
                      All Categories
                    </button>
                    {categories.map(cat => (
                      <button 
                        key={cat.id}
                        onClick={() => setInventoryCategoryFilter(cat.id)}
                        className={cn(
                          "px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border",
                          inventoryCategoryFilter === cat.id ? "bg-primary-container text-white border-primary-container" : "bg-surface-container-low text-on-surface-variant border-outline-variant/20 hover:border-primary/40"
                        )}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Inventory List */}
              <div className="bg-surface-container-low rounded-[2.5rem] overflow-hidden">
                <div className="grid grid-cols-1 gap-4 p-4">
                  {/* Header row for desktop */}
                  <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-2 text-on-surface-variant font-label text-xs uppercase tracking-widest">
                    <div className="col-span-5">Product Details</div>
                    <div className="col-span-3 text-center">Category</div>
                    <div className="col-span-2 text-center">Quantity</div>
                    <div className="col-span-2 text-right">Status</div>
                  </div>
                  
                  {filteredItems.map(item => (
                    <div 
                      key={item.id} 
                      onClick={() => setReorderItem(item)}
                      className="bg-surface-container-lowest p-5 rounded-[2rem] shadow-sm hover:shadow-md transition-shadow group cursor-pointer"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-12 items-center gap-4">
                        <div className="col-span-5 flex items-center gap-4">
                          <div className="w-12 h-12 bg-surface-container-highest rounded-xl flex-shrink-0 flex items-center justify-center">
                            <Package size={24} className="text-primary-container/40" />
                          </div>
                          <div>
                            <h4 className="font-headline font-bold text-on-surface group-hover:text-primary transition-colors">{item.name}</h4>
                            <div className="flex items-center gap-2">
                              <p className="text-[10px] text-on-surface-variant font-body">SKU: {item.sku}</p>
                              <span className="w-1 h-1 bg-outline-variant rounded-full"></span>
                              <p className="text-[10px] font-bold text-primary">GH₵{item.unitPrice.toFixed(2)}</p>
                            </div>
                          </div>
                        </div>
                        <div className="col-span-3 flex justify-center">
                          <span className="bg-secondary-container text-on-secondary-fixed-variant px-4 py-1.5 rounded-full text-xs font-semibold">
                            {categories.find(c => c.id === item.categoryId)?.name || 'Uncategorized'}
                          </span>
                        </div>
                        <div className="col-span-2 flex flex-col items-center">
                          <span className={cn("text-lg font-headline font-extrabold", item.stock < item.threshold ? "text-error" : "text-on-surface")}>
                            {item.stock.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-on-surface-variant uppercase tracking-tighter">Units in Stock</span>
                        </div>
                    <div className="col-span-2 flex justify-end gap-2">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setAuditItem(item);
                          setPhysicalCount(item.stock);
                        }}
                        className="bg-surface-container-highest text-on-surface px-4 py-1.5 rounded-full text-xs font-bold hover:bg-surface-variant transition-all active:scale-95 flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined text-sm">fact_check</span>
                        Audit
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setReorderItem(item);
                        }}
                        className="bg-primary-container text-white px-4 py-1.5 rounded-full text-xs font-bold hover:brightness-110 transition-all active:scale-95"
                      >
                        Reorder
                      </button>
                      {item.stock < item.threshold ? (
                        <div className="bg-error-container text-on-error-container px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-error rounded-full animate-pulse"></span>
                          Low Stock
                        </div>
                      ) : (
                        <div className="bg-tertiary-fixed text-on-tertiary-fixed-variant px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-on-tertiary-fixed-variant rounded-full"></span>
                          Optimal
                        </div>
                      )}
                    </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'orders' && (
            <motion.div 
              key="orders"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-10"
            >
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                  <h2 className="font-headline font-extrabold text-3xl tracking-tight text-primary-container">Order History</h2>
                  <p className="text-on-surface-variant">Track your recent reorders and stock replenishments.</p>
                </div>
                
                {history.length > 0 && (
                  <div className="flex gap-4">
                    <div className="bg-surface-container-low px-6 py-3 rounded-2xl border border-outline-variant/10">
                      <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Total Spent</p>
                      <p className="text-xl font-headline font-extrabold text-primary">
                        GH₵{filteredHistory.reduce((acc, curr) => acc + curr.totalCost, 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="bg-surface-container-low px-6 py-3 rounded-2xl border border-outline-variant/10">
                      <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Total Orders</p>
                      <p className="text-xl font-headline font-extrabold text-primary">{filteredHistory.length}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* History Filters */}
              <div className="bg-surface-container-low p-6 rounded-[2rem] border border-outline-variant/10 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-primary text-sm">filter_alt</span>
                  <h3 className="font-headline font-bold text-sm uppercase tracking-widest text-on-surface-variant">Filter Records</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest px-1">Item Name</label>
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60" />
                      <input 
                        type="text" 
                        placeholder="Search items..."
                        className="w-full bg-surface-container-highest border-none rounded-xl py-2.5 pl-9 pr-3 text-sm focus:ring-1 focus:ring-primary/20"
                        value={historySearchQuery}
                        onChange={e => setHistorySearchQuery(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest px-1">Authorized By</label>
                    <div className="relative">
                      <UserIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60" />
                      <input 
                        type="text" 
                        placeholder="Search user..."
                        className="w-full bg-surface-container-highest border-none rounded-xl py-2.5 pl-9 pr-3 text-sm focus:ring-1 focus:ring-primary/20"
                        value={historyUserFilter}
                        onChange={e => setHistoryUserFilter(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest px-1">Start Date</label>
                    <div className="relative">
                      <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60" />
                      <input 
                        type="date" 
                        className="w-full bg-surface-container-highest border-none rounded-xl py-2.5 pl-9 pr-3 text-sm focus:ring-1 focus:ring-primary/20"
                        value={historyStartDate}
                        onChange={e => setHistoryStartDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest px-1">End Date</label>
                    <div className="relative">
                      <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60" />
                      <input 
                        type="date" 
                        className="w-full bg-surface-container-highest border-none rounded-xl py-2.5 pl-9 pr-3 text-sm focus:ring-1 focus:ring-primary/20"
                        value={historyEndDate}
                        onChange={e => setHistoryEndDate(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                {(historySearchQuery || historyUserFilter || historyStartDate || historyEndDate) && (
                  <div className="flex justify-end pt-2">
                    <button 
                      onClick={() => {
                        setHistorySearchQuery('');
                        setHistoryUserFilter('');
                        setHistoryStartDate('');
                        setHistoryEndDate('');
                      }}
                      className="text-[10px] font-bold text-primary uppercase tracking-widest hover:underline flex items-center gap-1"
                    >
                      <RefreshCw size={10} />
                      Clear All Filters
                    </button>
                  </div>
                )}
              </div>

              {history.length === 0 ? (
                <div className="bg-surface-container-low rounded-[2.5rem] p-8 text-center space-y-4 border border-outline-variant/10">
                  <div className="w-20 h-20 bg-surface-container-highest rounded-full mx-auto flex items-center justify-center text-primary-container/40">
                    <RefreshCw size={40} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-headline font-bold text-xl">No active orders</h3>
                    <p className="text-on-surface-variant text-sm">Your reorder history will appear here once you confirm stock replenishments.</p>
                  </div>
                  <Button variant="secondary" onClick={() => setActiveTab('inventory')}>
                    Go to Inventory
                  </Button>
                </div>
              ) : (
                <div className="space-y-8">
                  {/* Analysis Section */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="bg-primary-container text-white border-none">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="p-2 bg-white/20 rounded-lg">
                          <BarChart3 size={20} />
                        </div>
                        <h4 className="font-headline font-bold">Top Reordered</h4>
                      </div>
                      {(() => {
                        const counts: Record<string, number> = {};
                        filteredHistory.forEach(h => counts[h.itemName] = (counts[h.itemName] || 0) + h.quantity);
                        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
                        return (
                          <div>
                            <p className="text-2xl font-headline font-extrabold">{top?.[0] || 'N/A'}</p>
                            <p className="text-white/60 text-xs font-medium uppercase tracking-widest mt-1">{top?.[1] || 0} Units Total</p>
                          </div>
                        );
                      })()}
                    </Card>
                    
                    <Card className="bg-tertiary-container text-on-tertiary-container border-none">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="p-2 bg-black/5 rounded-lg">
                          <DollarSign size={20} />
                        </div>
                        <h4 className="font-headline font-bold">Average Order</h4>
                      </div>
                      <div>
                        <p className="text-2xl font-headline font-extrabold">
                          GH₵{filteredHistory.length > 0 ? (filteredHistory.reduce((acc, curr) => acc + curr.totalCost, 0) / filteredHistory.length).toLocaleString('en-GH', { maximumFractionDigits: 0 }) : '0'}
                        </p>
                        <p className="text-on-tertiary-container/60 text-xs font-medium uppercase tracking-widest mt-1">Per replenishment</p>
                      </div>
                    </Card>

                    <Card className="bg-surface-container-low border-outline-variant/10">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="p-2 bg-primary/10 text-primary rounded-lg">
                          <Calendar size={20} />
                        </div>
                        <h4 className="font-headline font-bold text-on-surface">Latest Activity</h4>
                      </div>
                      <div>
                        <p className="text-xl font-headline font-extrabold text-on-surface">
                          {filteredHistory.length > 0 ? new Date(filteredHistory[0].timestamp).toLocaleDateString('en-GH', { month: 'short', day: 'numeric' }) : 'N/A'}
                        </p>
                        <p className="text-on-surface-variant text-xs font-medium uppercase tracking-widest mt-1">
                          {filteredHistory.length > 0 ? `${filteredHistory[0].itemName} (${filteredHistory[0].quantity} units)` : 'No activity found'}
                        </p>
                      </div>
                    </Card>
                  </div>

                  {/* History Table */}
                  <div className="bg-surface-container-low rounded-[2.5rem] overflow-hidden border border-outline-variant/10">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-surface-container-high/50">
                            <th className="px-8 py-5 font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Date & Time</th>
                            <th className="px-8 py-5 font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Item</th>
                            <th className="px-8 py-5 font-label text-[10px] uppercase tracking-widest text-on-surface-variant text-center">Qty</th>
                            <th className="px-8 py-5 font-label text-[10px] uppercase tracking-widest text-on-surface-variant text-right">Total Cost</th>
                            <th className="px-8 py-5 font-label text-[10px] uppercase tracking-widest text-on-surface-variant text-right">Authorized By</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/10">
                          {filteredHistory.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-8 py-10 text-center text-on-surface-variant italic text-sm">
                                No records match your current filters.
                              </td>
                            </tr>
                          ) : (
                            filteredHistory.map((record) => (
                              <tr key={record.id} className="hover:bg-surface-container-high/30 transition-colors group">
                                <td className="px-8 py-5">
                                  <div className="flex flex-col">
                                    <span className="text-sm font-bold text-on-surface">
                                      {new Date(record.timestamp).toLocaleDateString('en-GH', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </span>
                                    <span className="text-[10px] text-on-surface-variant font-medium">
                                      {new Date(record.timestamp).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-8 py-5">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-surface-container-highest rounded-lg flex items-center justify-center">
                                      <Package size={16} className="text-primary-container/40" />
                                    </div>
                                    <span className="text-sm font-bold text-primary-container">{record.itemName}</span>
                                  </div>
                                </td>
                                <td className="px-8 py-5 text-center">
                                  <span className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full text-xs font-bold">
                                    {record.quantity}
                                  </span>
                                </td>
                                <td className="px-8 py-5 text-right">
                                  <span className="text-sm font-headline font-extrabold text-on-surface">
                                    GH₵{record.totalCost.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                                  </span>
                                </td>
                                <td className="px-8 py-5 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="w-6 h-6 rounded-full bg-indigo-gradient flex items-center justify-center text-[8px] text-white font-bold">
                                      {record.userName.charAt(0)}
                                    </div>
                                    <span className="text-xs font-medium text-on-surface-variant">{record.userName}</span>
                                  </div>
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
            </motion.div>
          )}

          {activeTab === 'categories' && (
            <motion.div 
              key="categories"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-10"
            >
              <div className="space-y-2">
                <h2 className="font-headline font-extrabold text-3xl tracking-tight text-primary-container">Inventory Categories</h2>
                <p className="text-on-surface-variant">Manage and track your stock levels by type.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {categories.map(cat => (
                  <div key={cat.id} className="bg-surface-container-low p-8 rounded-[2.5rem] flex flex-col items-center text-center group border border-outline-variant/10">
                    <div className="w-20 h-20 rounded-full bg-surface-container-lowest flex items-center justify-center mb-6 group-hover:bg-primary-container group-hover:text-white transition-colors duration-300 shadow-sm">
                      <span className="material-symbols-outlined text-3xl">category</span>
                    </div>
                    <h3 className="font-headline font-extrabold text-2xl text-primary-container mb-2">{cat.name}</h3>
                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="text-5xl font-headline font-extrabold text-primary">
                        {items.filter(i => i.categoryId === cat.id).length}
                      </span>
                      <span className="text-on-surface-variant font-label text-sm uppercase tracking-tighter">SKUs Active</span>
                    </div>
                    <button 
                      onClick={() => setActiveTab('inventory')}
                      className="mt-8 w-full py-4 bg-surface-container-highest text-primary-container font-bold rounded-2xl hover:bg-primary-container hover:text-white transition-all active:scale-95"
                    >
                      View Inventory
                    </button>
                  </div>
                ))}
                <button 
                  onClick={() => setShowAddCategory(true)}
                  className="p-8 rounded-[2.5rem] border-2 border-dashed border-outline-variant flex flex-col items-center justify-center gap-4 hover:bg-surface-container-high transition-colors group"
                >
                  <div className="w-16 h-16 rounded-full bg-primary-container text-white flex items-center justify-center group-active:scale-90 transition-transform shadow-lg">
                    <span className="material-symbols-outlined text-3xl">add</span>
                  </div>
                  <div className="text-center">
                    <span className="font-headline font-bold text-on-surface block">Add New Category</span>
                    <span className="text-xs text-on-surface-variant">Define a new stock classification</span>
                  </div>
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'audits' && (
            <motion.div 
              key="audits"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-10"
            >
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                  <h2 className="font-headline font-extrabold text-3xl tracking-tight text-primary-container">Stock Auditing</h2>
                  <p className="text-on-surface-variant">Perform physical counts and reconcile discrepancies.</p>
                </div>
                
                <div className="flex gap-4">
                  <div className="bg-surface-container-low px-6 py-3 rounded-2xl border border-outline-variant/10">
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Total Audits</p>
                    <p className="text-xl font-headline font-extrabold text-primary">{audits.length}</p>
                  </div>
                  <div className="bg-surface-container-low px-6 py-3 rounded-2xl border border-outline-variant/10">
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Total Variance</p>
                    <p className={cn(
                      "text-xl font-headline font-extrabold",
                      audits.reduce((acc, curr) => acc + curr.variance, 0) < 0 ? "text-error" : "text-primary"
                    )}>
                      {audits.reduce((acc, curr) => acc + curr.variance, 0)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Audit History Table */}
              <div className="bg-surface-container-low rounded-[2.5rem] overflow-hidden border border-outline-variant/10">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container-highest/50">
                        <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Date</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Item</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-center">System</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-center">Physical</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-center">Variance</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Auditor</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10">
                      {audits.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center text-on-surface-variant italic">
                            No audit records found.
                          </td>
                        </tr>
                      ) : (
                        audits.map(audit => (
                          <tr key={audit.id} className="hover:bg-surface-container-highest/30 transition-colors">
                            <td className="px-6 py-4 text-xs font-medium">
                              {new Date(audit.timestamp).toLocaleDateString()}
                              <br />
                              <span className="text-[10px] text-on-surface-variant">{new Date(audit.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-sm font-bold text-on-surface">{audit.itemName}</p>
                            </td>
                            <td className="px-6 py-4 text-center text-sm font-medium">{audit.systemCount}</td>
                            <td className="px-6 py-4 text-center text-sm font-bold text-primary">{audit.physicalCount}</td>
                            <td className="px-6 py-4 text-center">
                              <span className={cn(
                                "px-3 py-1 rounded-full text-[10px] font-bold",
                                audit.variance === 0 ? "bg-surface-container-highest text-on-surface-variant" :
                                audit.variance > 0 ? "bg-tertiary-container text-on-tertiary-container" :
                                "bg-error-container text-on-error-container"
                              )}>
                                {audit.variance > 0 ? `+${audit.variance}` : audit.variance}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                                  {audit.userName.charAt(0)}
                                </div>
                                <span className="text-xs font-medium">{audit.userName}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-xs text-on-surface-variant italic max-w-xs truncate">
                              {audit.notes || '-'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Audit Instructions Card */}
              <div className="bg-primary/5 p-8 rounded-[2.5rem] border border-primary/10 flex flex-col md:flex-row items-center gap-8">
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center text-primary flex-shrink-0">
                  <span className="material-symbols-outlined text-4xl">inventory</span>
                </div>
                <div className="space-y-2 text-center md:text-left">
                  <h3 className="font-headline font-bold text-xl text-primary">Ready to Audit?</h3>
                  <p className="text-on-surface-variant text-sm max-w-xl">
                    Go to the <strong>Inventory</strong> tab and click the <strong>Audit</strong> button on any item to start a physical count. 
                    The system will automatically calculate variances and update the stock levels upon reconciliation.
                  </p>
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="mt-4"
                    onClick={() => setActiveTab('inventory')}
                  >
                    Go to Inventory
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
          {activeTab === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-10"
            >
              <div className="space-y-2">
                <h2 className="font-headline font-extrabold text-3xl tracking-tight text-primary-container">System Configuration</h2>
                <p className="text-on-surface-variant">Manage your account and application preferences.</p>
              </div>

              <div className="bg-surface-container-low rounded-[2.5rem] p-8 space-y-8 border border-outline-variant/10">
                <div className="flex items-center gap-6">
                  <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-surface-container-highest shadow-xl">
                    <img src={user.photoURL || ''} alt="User" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h3 className="font-headline font-extrabold text-2xl text-on-surface">{user.displayName}</h3>
                    <p className="text-on-surface-variant">{user.email}</p>
                    <div className="mt-2 inline-flex items-center gap-2 bg-primary-container/10 text-primary-container px-3 py-1 rounded-full text-xs font-bold">
                      <span className="w-1.5 h-1.5 bg-primary-container rounded-full"></span>
                      Administrator
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                  <button 
                    onClick={() => setShowResetConfirm(true)}
                    className="flex items-center gap-4 p-6 bg-surface-container-lowest rounded-[2rem] hover:bg-surface-container-high transition-colors text-left group"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-tertiary-fixed text-on-tertiary-fixed-variant flex items-center justify-center group-hover:scale-110 transition-transform">
                      <span className="material-symbols-outlined">refresh</span>
                    </div>
                    <div>
                      <span className="font-headline font-bold text-on-surface block">Reset Database</span>
                      <span className="text-xs text-on-surface-variant">Restore to initial seed data</span>
                    </div>
                  </button>

                  <button 
                    onClick={() => auth.signOut()}
                    className="flex items-center gap-4 p-6 bg-surface-container-lowest rounded-[2rem] hover:bg-error-container/20 transition-colors text-left group"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-error-container text-on-error-container flex items-center justify-center group-hover:scale-110 transition-transform">
                      <span className="material-symbols-outlined">logout</span>
                    </div>
                    <div>
                      <span className="font-headline font-bold text-on-surface block">Sign Out</span>
                      <span className="text-xs text-on-surface-variant">Terminate current session</span>
                    </div>
                  </button>
                </div>

                {/* Security & Configuration Section */}
                <div className="pt-8 border-t border-outline-variant/10 space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 text-primary rounded-lg">
                      <AlertCircle size={20} />
                    </div>
                    <h4 className="font-headline font-bold text-on-surface">Security & Configuration</h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="bg-surface-container-highest/30 p-4 rounded-2xl border border-outline-variant/5">
                        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">Admin Email (Protected)</p>
                        <div className="flex items-center justify-between">
                          <code className="text-xs font-mono text-primary">
                            {import.meta.env.VITE_ADMIN_EMAIL ? 
                              `${import.meta.env.VITE_ADMIN_EMAIL.split('@')[0].substring(0, 3)}***@${import.meta.env.VITE_ADMIN_EMAIL.split('@')[1]}` : 
                              'Not Configured'}
                          </code>
                          <Badge variant={import.meta.env.VITE_ADMIN_EMAIL ? 'tertiary' : 'error'}>
                            {import.meta.env.VITE_ADMIN_EMAIL ? 'Active' : 'Missing'}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-[10px] text-on-surface-variant px-2 italic">
                        The Admin Email is managed via environment variables for enhanced security.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-surface-container-highest/30 p-4 rounded-2xl border border-outline-variant/5">
                        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">Firebase Integration</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-on-surface">Cloud Infrastructure</span>
                          <Badge variant="secondary">Connected</Badge>
                        </div>
                      </div>
                      <p className="text-[10px] text-on-surface-variant px-2">
                        API keys are protected and stored securely. To update configuration, use the platform's Settings menu.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Reorder Modal Placeholder (Removed redundant modal) */}

      {/* Quick Add Modal */}
      <AnimatePresence>
        {showQuickAdd && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-4"
            onClick={() => setShowQuickAdd(false)}
          >
            <motion.div 
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-surface w-full max-w-6xl rounded-[2.5rem] p-8 overflow-y-auto max-h-[90vh]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-4">
                  <button onClick={() => setShowQuickAdd(false)} className="text-primary-container hover:bg-surface-container-high transition-colors p-2 rounded-full active:scale-95 duration-200">
                    <ChevronLeft />
                  </button>
                  <h1 className="font-headline font-bold text-xl tracking-tight text-primary-container">Inventory Update</h1>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-headline font-extrabold text-primary-container tracking-tighter">The Ledger</span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Column: Form Controls */}
                <div className="lg:col-span-7 space-y-8">
                  <section className="space-y-6">
                    <div className="flex flex-col gap-1">
                      <h2 className="font-headline font-bold text-2xl tracking-tight text-primary-container">Quick Add Item</h2>
                      <p className="text-on-surface-variant text-sm">Update stock levels or add a new entry to the ledger.</p>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant px-1">Item Identity</label>
                        <div className="space-y-3">
                          <div className="relative group">
                            <input 
                              className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-4 text-on-surface focus:ring-1 focus:ring-primary/20 focus:bg-surface-container-lowest transition-all placeholder:text-outline" 
                              placeholder="Enter item name" 
                              type="text"
                              value={newItem.name}
                              onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                            />
                            <Package className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/40" size={20} />
                          </div>
                          <div className="relative group">
                            <input 
                              className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-4 text-on-surface focus:ring-1 focus:ring-primary/20 focus:bg-surface-container-lowest transition-all placeholder:text-outline" 
                              placeholder="Enter SKU" 
                              type="text"
                              value={newItem.sku}
                              onChange={e => setNewItem({ ...newItem, sku: e.target.value })}
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/40 text-[10px] font-bold">SKU</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant px-1">Classification</label>
                          <select 
                            className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-4 text-on-surface focus:ring-1 focus:ring-primary/20 transition-all appearance-none cursor-pointer"
                            value={newItem.categoryId}
                            onChange={e => setNewItem({ ...newItem, categoryId: e.target.value })}
                          >
                            <option value="">Select Category</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant px-1">Unit Price (GH₵)</label>
                          <input 
                            type="number"
                            className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-4 text-on-surface focus:ring-1 focus:ring-primary/20 transition-all" 
                            placeholder="0.00"
                            value={newItem.unitPrice || ''}
                            onChange={e => setNewItem({ ...newItem, unitPrice: parseFloat(e.target.value) || 0 })}
                          />
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="bg-surface-container-low p-6 rounded-xl space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="font-headline font-bold text-lg text-primary-container">Stock Pulse Adjustment</h3>
                      <span className="bg-tertiary-container text-on-tertiary-container px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest">Live Adjustment</span>
                    </div>
                    <div className="flex items-center justify-center gap-8 py-4">
                      <button 
                        onClick={() => setNewItem({ ...newItem, stock: Math.max(0, newItem.stock - 1) })}
                        className="w-16 h-16 rounded-xl bg-surface-container-highest text-primary-container hover:bg-primary-container hover:text-white transition-all active:scale-90 flex items-center justify-center"
                      >
                        <Minus size={32} />
                      </button>
                      <div className="text-center">
                        <input 
                          className="w-32 bg-transparent border-none text-center font-headline font-extrabold text-5xl text-primary focus:ring-0" 
                          type="number" 
                          value={newItem.stock}
                          onChange={e => setNewItem({ ...newItem, stock: parseInt(e.target.value) || 0 })}
                        />
                        <p className="text-xs font-bold text-on-surface-variant mt-2">UNITS</p>
                      </div>
                      <button 
                        onClick={() => setNewItem({ ...newItem, stock: newItem.stock + 1 })}
                        className="w-16 h-16 rounded-xl bg-primary-container text-white shadow-lg shadow-primary-container/20 hover:brightness-110 transition-all active:scale-90 flex items-center justify-center"
                      >
                        <Plus size={32} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <button className="py-3 px-4 rounded-xl bg-surface-container-highest text-on-surface-variant font-semibold text-sm hover:bg-surface-container-high transition-colors">
                        Set Absolute Value
                      </button>
                      <button className="py-3 px-4 rounded-xl bg-surface-container-highest text-on-surface-variant font-semibold text-sm hover:bg-surface-container-high transition-colors">
                        Log as Return
                      </button>
                    </div>
                  </section>

                  <div className="pt-4">
                    <button 
                      onClick={handleAddItem}
                      className="w-full py-5 rounded-xl bg-gradient-to-br from-primary to-primary-container text-white font-headline font-bold text-lg shadow-xl shadow-primary-container/20 active:scale-[0.98] transition-all"
                    >
                      Commit to Ledger
                    </button>
                  </div>
                </div>

                {/* Right Column: Visual Feedback & Context */}
                <div className="lg:col-span-5 space-y-6">
                  {/* Recent Activity/Context Card */}
                  <div className="bg-surface-container-low p-6 rounded-xl">
                    <h3 className="font-headline font-bold text-sm text-on-surface-variant mb-4 uppercase tracking-widest">Inventory Context</h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 bg-surface-container-lowest rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-surface-container-highest rounded-lg flex items-center justify-center">
                            <HistoryIcon size={20} className="text-primary-container" />
                          </div>
                          <div>
                            <p className="text-sm font-bold">Last Updated</p>
                            <p className="text-xs text-on-surface-variant">Just now by System</p>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-primary-container">{items.length} Total SKUs</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-surface-container-lowest rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-surface-container-highest rounded-lg flex items-center justify-center">
                            <TrendingUp size={20} className="text-primary-container" />
                          </div>
                          <div>
                            <p className="text-sm font-bold">Velocity</p>
                            <p className="text-xs text-on-surface-variant">Real-time tracking active</p>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-tertiary-container">+12% / week</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB */}
      <button 
        onClick={() => setShowQuickAdd(true)}
        className="fixed bottom-28 md:bottom-8 right-8 bg-indigo-gradient text-white w-16 h-16 rounded-2xl shadow-2xl flex items-center justify-center z-50 active:scale-90 transition-transform group"
      >
        <span className="material-symbols-outlined text-3xl">add</span>
        <span className="absolute right-full mr-4 bg-primary-container text-white px-4 py-2 rounded-xl text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl">Quick Add Stock</span>
      </button>

      {/* Audit Modal */}
      <AnimatePresence>
        {auditItem && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-4"
            onClick={() => setAuditItem(null)}
          >
            <motion.div 
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-surface w-full max-w-lg rounded-[2.5rem] p-8 space-y-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <h2 className="font-headline font-bold text-2xl text-primary-container">Stock Audit</h2>
                  <p className="text-on-surface-variant text-sm font-medium">{auditItem.name}</p>
                </div>
                <button onClick={() => setAuditItem(null)} className="p-2 rounded-full hover:bg-surface-container-high">
                  <ChevronLeft />
                </button>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10">
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">System Stock</p>
                    <p className="text-2xl font-headline font-extrabold text-on-surface">{auditItem.stock}</p>
                  </div>
                  <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10">
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Variance</p>
                    <p className={cn(
                      "text-2xl font-headline font-extrabold",
                      (physicalCount - auditItem.stock) === 0 ? "text-on-surface-variant" :
                      (physicalCount - auditItem.stock) > 0 ? "text-tertiary" : "text-error"
                    )}>
                      {(physicalCount - auditItem.stock) > 0 ? `+${physicalCount - auditItem.stock}` : physicalCount - auditItem.stock}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant px-1">Physical Count</label>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setPhysicalCount(prev => Math.max(0, prev - 1))}
                      className="w-12 h-12 bg-surface-container-highest rounded-xl flex items-center justify-center text-primary active:scale-90 transition-transform"
                    >
                      <Minus size={24} />
                    </button>
                    <input 
                      type="number"
                      className="flex-1 bg-surface-container-highest border-none rounded-2xl px-4 py-4 text-center text-2xl font-headline font-bold text-on-surface focus:ring-1 focus:ring-primary/20" 
                      value={physicalCount}
                      onChange={e => setPhysicalCount(parseInt(e.target.value) || 0)}
                    />
                    <button 
                      onClick={() => setPhysicalCount(prev => prev + 1)}
                      className="w-12 h-12 bg-surface-container-highest rounded-xl flex items-center justify-center text-primary active:scale-90 transition-transform"
                    >
                      <Plus size={24} />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant px-1">Audit Notes (Optional)</label>
                  <textarea 
                    className="w-full bg-surface-container-highest border-none rounded-2xl px-4 py-4 text-on-surface focus:ring-1 focus:ring-primary/20 min-h-[100px]" 
                    placeholder="e.g. Found 2 damaged bottles, stock miscounted in last delivery..."
                    value={auditNotes}
                    onChange={e => setAuditNotes(e.target.value)}
                  />
                </div>

                <div className="pt-4 space-y-3">
                  <Button className="w-full py-5" onClick={handleConfirmAudit}>
                    Reconcile & Log Audit
                  </Button>
                  <p className="text-[10px] text-center text-on-surface-variant uppercase tracking-widest font-bold">
                    This will update system stock to {physicalCount} units
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Category Modal */}
      <AnimatePresence>
        {showAddCategory && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-4"
            onClick={() => setShowAddCategory(false)}
          >
            <motion.div 
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-surface w-full max-w-lg rounded-[2.5rem] p-8 space-y-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center">
                <h2 className="font-headline font-bold text-2xl text-primary-container">New Category</h2>
                <button onClick={() => setShowAddCategory(false)} className="p-2 rounded-full hover:bg-surface-container-high">
                  <ChevronLeft />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant px-1">Category Name</label>
                  <input 
                    className="w-full bg-surface-container-highest border-none rounded-2xl px-4 py-4 text-on-surface focus:ring-1 focus:ring-primary/20" 
                    placeholder="e.g. Electronics" 
                    value={newCategory.name}
                    onChange={e => setNewCategory({ ...newCategory, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant px-1">Priority Level</label>
                  <select 
                    className="w-full bg-surface-container-highest border-none rounded-2xl px-4 py-4 text-on-surface focus:ring-1 focus:ring-primary/20"
                    value={newCategory.priority}
                    onChange={e => setNewCategory({ ...newCategory, priority: e.target.value as any })}
                  >
                    <option value="high">High Priority</option>
                    <option value="stable">Stable</option>
                    <option value="low">Low Priority</option>
                  </select>
                </div>

                <Button className="w-full py-5" onClick={handleAddCategory}>
                  Create Category
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {showResetConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowResetConfirm(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-surface w-full max-w-md rounded-[2.5rem] p-8 space-y-6 text-center"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-16 h-16 bg-error-container text-on-error-container rounded-full mx-auto flex items-center justify-center">
                <AlertTriangle size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="font-headline font-bold text-xl">Reset Database?</h3>
                <p className="text-on-surface-variant text-sm">This will clear all current inventory and restore seed defaults. This action cannot be undone.</p>
              </div>
              <div className="flex gap-3">
                <Button variant="ghost" className="flex-1" onClick={() => setShowResetConfirm(false)}>Cancel</Button>
                <Button variant="error" className="flex-1" onClick={async () => {
                  await seedDatabase(true);
                  setShowResetConfirm(false);
                  setShowSuccessAlert('Database reset successfully.');
                }}>Reset All</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Alert Modal */}
      <AnimatePresence>
        {showSuccessAlert && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowSuccessAlert(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-surface w-full max-w-sm rounded-[2.5rem] p-8 space-y-6 text-center"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-16 h-16 bg-primary/10 text-primary rounded-full mx-auto flex items-center justify-center">
                <CheckCircle size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="font-headline font-bold text-xl">Success</h3>
                <p className="text-on-surface-variant text-sm">{showSuccessAlert}</p>
              </div>
              <Button className="w-full" onClick={() => setShowSuccessAlert(null)}>Dismiss</Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* BottomNavBar */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full flex justify-around items-center px-4 pb-6 pt-3 bg-surface-container-low/80 backdrop-blur-xl z-50 rounded-t-3xl shadow-[0_-8px_24px_rgba(27,27,33,0.06)] border-t border-outline-variant/10">
        <NavTab 
          active={activeTab === 'inventory'} 
          onClick={() => setActiveTab('inventory')} 
          icon={<span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'inventory' ? "'FILL' 1" : "'FILL' 0" }}>inventory_2</span>} 
          label="Inventory" 
        />
        <NavTab 
          active={activeTab === 'orders'} 
          onClick={() => setActiveTab('orders')} 
          icon={<span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'orders' ? "'FILL' 1" : "'FILL' 0" }}>reorder</span>} 
          label="Orders" 
        />
        <NavTab 
          active={activeTab === 'categories'} 
          onClick={() => setActiveTab('categories')} 
          icon={<span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'categories' ? "'FILL' 1" : "'FILL' 0" }}>category</span>} 
          label="Categories" 
        />
        <NavTab 
          active={activeTab === 'audits'} 
          onClick={() => setActiveTab('audits')} 
          icon={<span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'audits' ? "'FILL' 1" : "'FILL' 0" }}>fact_check</span>} 
          label="Audits" 
        />
        <NavTab 
          active={activeTab === 'settings'} 
          onClick={() => setActiveTab('settings')} 
          icon={<span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'settings' ? "'FILL' 1" : "'FILL' 0" }}>settings</span>} 
          label="Settings" 
        />
      </nav>
    </div>
  );
}

function NavTab({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center px-4 py-1 transition-all active:scale-90 relative',
        active ? 'text-primary' : 'text-on-surface-variant hover:text-primary'
      )}
    >
      <AnimatePresence>
        {active && (
          <motion.div 
            layoutId="nav-pill"
            className="absolute inset-0 bg-primary/10 rounded-2xl -z-10"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          />
        )}
      </AnimatePresence>
      <div className={cn("transition-transform duration-200", active && "scale-110")}>
        {icon}
      </div>
      <span className={cn("font-body font-bold text-[10px] mt-0.5 transition-all", active ? "opacity-100" : "opacity-70")}>{label}</span>
    </button>
  );
}
