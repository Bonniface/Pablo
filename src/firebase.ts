import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, collection, onSnapshot, query, where, orderBy, limit, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Sync user to Firestore
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        role: user.email === 'kalongboniface97@gmail.com' ? 'admin' : 'manager'
      });
    }
    return user;
  } catch (error) {
    console.error('Error signing in with Google:', error);
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
