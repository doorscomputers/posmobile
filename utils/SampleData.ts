import { getDatabase } from '../database/getDatabase';

export const initializeSampleData = async () => {
  console.log('No sample data to initialize — production-ready install');
};

export const clearAllData = async () => {
  try {
    const dbService = getDatabase();
    const db = dbService.getDatabase();

    // Clear all tables (be careful with this in production!)
    await db.execAsync(`
      DELETE FROM transaction_items;
      DELETE FROM transactions;
      DELETE FROM inventory_movements;
      DELETE FROM ejournal;
      DELETE FROM z_readings;
      DELETE FROM x_readings;
      DELETE FROM products;
      DELETE FROM categories;

      -- Reset auto-increment counters
      DELETE FROM sqlite_sequence WHERE name IN (
        'transaction_items', 'transactions', 'inventory_movements',
        'ejournal', 'z_readings', 'x_readings', 'products', 'categories'
      );

      -- Reset invoice counter
      UPDATE settings SET value = '1' WHERE key = 'current_invoice_number';
      UPDATE settings SET value = '0' WHERE key = 'z_counter';
    `);

    console.log('All data cleared successfully');
  } catch (error) {
    console.error('Error clearing data:', error);
    throw error;
  }
};
