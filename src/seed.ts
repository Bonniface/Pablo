import { db, handleFirestoreError, OperationType } from './firebase';
import { collection, getDocs, setDoc, doc } from 'firebase/firestore';

export const seedDatabase = async (force = false) => {
  const categoriesRef = collection(db, 'categories');
  let categoriesSnap;
  try {
    categoriesSnap = await getDocs(categoriesRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'categories');
    return;
  }
  
  const categoryMap: Record<string, string> = {};
  
  if (force || categoriesSnap.empty) {
    const categories = [
      { id: 'cat_alc_can', name: 'Alcoholic - Can', priority: 'high', icon: 'liquor' },
      { id: 'cat_alc_plastic', name: 'Alcoholic - Plastic', priority: 'stable', icon: 'local_drink' },
      { id: 'cat_alc_sachet', name: 'Alcoholic - Sachet', priority: 'high', icon: 'wine_bar' },
      { id: 'cat_non_can', name: 'Non-Alcoholic - Can', priority: 'stable', icon: 'bolt' },
      { id: 'cat_non_plastic', name: 'Non-Alcoholic - Plastic', priority: 'stable', icon: 'local_drink' }
    ];
    for (const c of categories) {
      try {
        await setDoc(doc(db, 'categories', c.id), c);
        categoryMap[c.name] = c.id;
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `categories/${c.id}`);
      }
    }
  } else {
    categoriesSnap.docs.forEach(doc => {
      const data = doc.data();
      categoryMap[data.name] = doc.id;
    });
  }

  const itemsRef = collection(db, 'items');
  let itemsSnap;
  try {
    itemsSnap = await getDocs(itemsRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'items');
    return;
  }

  if (force || itemsSnap.empty) {
    const inventoryData = [
      { item: "Guinness", quantity: 43, unitPrice: 18.00, category: "Alcoholic - Can" },
      { item: "ABC", quantity: 46, unitPrice: 12.00, category: "Alcoholic - Can" },
      { item: "Smirnoff Can", quantity: 37, unitPrice: 22.00, category: "Alcoholic - Can" },
      { item: "Faxes", quantity: 8, unitPrice: 25.00, category: "Alcoholic - Can" },
      { item: "Stella Artois", quantity: 4, unitPrice: 30.00, category: "Alcoholic - Can" },
      { item: "Heineken (Plastic)", quantity: 24, unitPrice: 30.00, category: "Alcoholic - Plastic" },
      { item: "Bel ICE Plastic", quantity: 29, unitPrice: 10.00, category: "Alcoholic - Plastic" },
      { item: "Eagle (White)", quantity: 35, unitPrice: 12.00, category: "Alcoholic - Plastic" },
      { item: "Schnapps", quantity: 74, unitPrice: 5.00, category: "Alcoholic - Sachet" },
      { item: "8pm", quantity: 22, unitPrice: 6.00, category: "Alcoholic - Sachet" },
      { item: "Alomo", quantity: 1, unitPrice: 6.00, category: "Alcoholic - Sachet" },
      { item: "Vodka (Sachet)", quantity: 16, unitPrice: 4.00, category: "Alcoholic - Sachet" },
      { item: "Afri Bull", quantity: 91, unitPrice: 15.00, category: "Non-Alcoholic - Can" },
      { item: "Can Malt", quantity: 12, unitPrice: 12.00, category: "Non-Alcoholic - Can" },
      { item: "Storm", quantity: 12, unitPrice: 10.00, category: "Non-Alcoholic - Can" },
      { item: "Coca-Cola (Big)", quantity: 10, unitPrice: 15.00, category: "Non-Alcoholic - Plastic" },
      { item: "Coca-Cola (Medium)", quantity: 12, unitPrice: 10.00, category: "Non-Alcoholic - Plastic" },
      { item: "Beta Malt", quantity: 15, unitPrice: 12.00, category: "Non-Alcoholic - Plastic" },
      { item: "Tampico", quantity: 6, unitPrice: 8.00, category: "Non-Alcoholic - Plastic" }
    ];

    for (let i = 0; i < inventoryData.length; i++) {
      const item = inventoryData[i];
      const id = `item_${i}`;
      const categoryId = categoryMap[item.category] || 'cat_soft';
      
      try {
        await setDoc(doc(db, 'items', id), {
          id,
          sku: `${item.category.substring(0, 3).toUpperCase()}-${item.item.substring(0, 3).toUpperCase()}-${String(i).padStart(3, '0')}`,
          name: item.item,
          categoryId: categoryId,
          stock: item.quantity,
          threshold: 10,
          unitPrice: item.unitPrice,
          lastUpdated: new Date().toISOString(),
          updatedBy: 'system'
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `items/${id}`);
      }
    }
  }
};
