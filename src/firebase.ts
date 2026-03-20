import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, collection, onSnapshot, query, where, orderBy, limit, getDocFromServer } from 'firebase/firestore';
import firebaseConfigJson from '../firebase-applet-config.json';

// Use environment variables for protection, fallback to config JSON
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfigJson.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigJson.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfigJson.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigJson.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigJson.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseConfigJson.appId,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || firebaseConfigJson.firestoreDatabaseId
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  try {
    console.log('Attempting Google Sign-In...');
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    console.log('Sign-in successful:', user.email);
    
    // Sync user to Firestore
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      console.log('Creating new user document...');
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        role: user.email === import.meta.env.VITE_ADMIN_EMAIL ? 'admin' : 'manager'
      });
    }
    return user;
  } catch (error: any) {
    console.error('Error signing in with Google:', error);
    if (error.code === 'auth/popup-blocked') {
      throw new Error('Sign-in popup was blocked by your browser. Please allow popups for this site.');
    }
    if (error.code === 'auth/unauthorized-domain') {
      throw new Error('This domain is not authorized for Google Sign-In. Please contact the administrator.');
    }
    throw error;
  }
};

export const logout = () => signOut(auth);

// Connection test
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. The client is offline.");
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- CRUD Operations ---

import { Category, Item, HistoryRecord } from './types';

export const addCategory = async (category: Omit<Category, 'id'>) => {
  const path = 'categories';
  try {
    const newDocRef = doc(collection(db, path));
    const data = { ...category, id: newDocRef.id };
    await setDoc(newDocRef, data);
    return data;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const addItem = async (item: Omit<Item, 'id' | 'lastUpdated' | 'updatedBy'>) => {
  const path = 'items';
  try {
    const newDocRef = doc(collection(db, path));
    const data = { 
      ...item, 
      id: newDocRef.id,
      lastUpdated: new Date().toISOString(),
      updatedBy: auth.currentUser?.uid || 'unknown'
    };
    await setDoc(newDocRef, data);
    return data;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const addHistoryRecord = async (record: Omit<HistoryRecord, 'id' | 'timestamp' | 'userUid' | 'userName'>) => {
  const path = 'history';
  try {
    const newDocRef = doc(collection(db, path));
    const data = {
      ...record,
      id: newDocRef.id,
      timestamp: new Date().toISOString(),
      userUid: auth.currentUser?.uid || 'unknown',
      userName: auth.currentUser?.displayName || 'Unknown User'
    };
    await setDoc(newDocRef, data);
    return data;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const updateItemStock = async (itemId: string, newStock: number) => {
  const path = `items/${itemId}`;
  try {
    const itemRef = doc(db, 'items', itemId);
    await setDoc(itemRef, { 
      stock: newStock,
      lastUpdated: new Date().toISOString(),
      updatedBy: auth.currentUser?.uid || 'unknown'
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};
