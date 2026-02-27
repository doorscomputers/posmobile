import { Platform } from 'react-native';
import { verifyPassword } from '../utils/passwordHash';
import { getPhilippineDateTimeString, getPhilippineDateString, getPhilippineTimeString } from '../utils/dateTime';
import {
  initializeDatabase,
  getNextInvoiceNumber,
  updateInvoiceNumber,
  getNextPurchaseNumber,
  updatePurchaseNumber,
  getNextPaymentNumber,
  updatePaymentNumber,
  getNextDamageSessionId,
  updateDamageSessionNumber,
  Supplier,
  Purchase,
  PurchaseDetail,
  SupplierPayment,
  AccountsPayable,
  DamagedItemsSession,
  DamagedItemsDetail,
  Category,
  Brand,
  Unit,
  Size
} from './schema';

// Conditionally import SQLite only on native platforms
let SQLite: any = null;
if (Platform.OS !== 'web') {
  SQLite = require('expo-sqlite');
}

// Re-export WebMockDatabaseService for web platform
export { WebMockDatabaseService } from './WebMockDatabaseService';

export class DatabaseService {
  private static instance: DatabaseService;
  private db: any = null;
  private initializationPromise: Promise<void> | null = null;  // Lock to prevent multiple init

  private constructor() {}

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  // Re-open the database after a file-level restore
  public async reinitialize(): Promise<void> {
    this.db = null;
    this.initializationPromise = null;
    await this.initialize();
  }

  public async initialize(): Promise<void> {
    // If already initialized, return immediately
    if (this.db) {
      return;
    }

    // If initialization is already in progress, wait for it
    if (this.initializationPromise) {
      console.log('Database initialization already in progress, waiting...');
      return this.initializationPromise;
    }

    // Start initialization with a lock
    this.initializationPromise = this.doInitialize();

    try {
      await this.initializationPromise;
    } finally {
      this.initializationPromise = null;
    }
  }

  private async doInitialize(): Promise<void> {
    console.log('Initializing database...');

    try {
        // Check if we're on a supported platform
        const Platform = require('react-native').Platform;
        if (Platform.OS === 'web') {
          throw new Error('SQLite is not supported on web platform. Please use iOS/Android simulator or device.');
        }

        console.log('Platform check passed, opening database...');
        this.db = await SQLite.openDatabaseAsync('pos_database.db');

        // Verify database object is valid
        if (!this.db) {
          throw new Error('Failed to open database - returned null');
        }
        console.log('Database opened successfully, type:', typeof this.db);

        // Wait for native handle to be ready
        console.log('Waiting for native database handle...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Try direct schema initialization without test
        // Some devices have issues with the test query but work fine with real operations
        let schemaInitialized = false;
        const initAttempts = [0, 3000, 5000]; // immediate, then retry with delays

        for (let i = 0; i < initAttempts.length; i++) {
          if (i > 0) {
            console.log(`Retrying schema initialization after ${initAttempts[i]}ms...`);
            await new Promise(resolve => setTimeout(resolve, initAttempts[i]));
          }

          try {
            // Initialize full schema directly
            await initializeDatabase(this.db);
            console.log('Full database schema initialized successfully');
            schemaInitialized = true;
            break;
          } catch (err) {
            console.warn(`Schema initialization attempt ${i + 1} failed:`, err);

            // On NullPointerException, try re-opening the database
            if (err && String(err).includes('NullPointerException')) {
              console.log('NullPointerException detected, attempting to re-open database...');
              try {
                this.db = await SQLite.openDatabaseAsync('pos_database.db');
                console.log('Database re-opened, waiting 2s...');
                await new Promise(resolve => setTimeout(resolve, 2000));
              } catch (reopenErr) {
                console.error('Failed to re-open database:', reopenErr);
              }
            }
          }
        }

        if (!schemaInitialized) {
          throw new Error('Failed to initialize database schema after multiple attempts');
        }

        // ALWAYS apply critical PRAGMAs after database is opened
        // These are per-connection settings and must be set on every open
        await this.applyDatabasePragmas();

        // Verify critical tables exist
        await this.verifyCriticalTables();
        console.log('Critical tables verified - initialization complete');

      } catch (error) {
        // Reset db so retries can re-open and try again
        this.db = null;
        console.error('Database initialization failed:', error);
        throw error;
      }
  }

  // Test the most basic database operations to ensure SQLite is working
  private async testBasicDatabaseOperations(): Promise<void> {
    const db = this.getDatabase();

    try {
      // Test 1: Simple CREATE TABLE
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS test_table (
          id INTEGER PRIMARY KEY,
          name TEXT
        );
      `);

      // Test 2: Simple INSERT
      await db.runAsync('INSERT OR IGNORE INTO test_table (id, name) VALUES (1, ?)', ['test']);

      // Test 3: Simple SELECT
      const result = await db.getFirstAsync('SELECT * FROM test_table WHERE id = 1');

      // Test 4: Cleanup
      await db.execAsync('DROP TABLE IF EXISTS test_table');

      console.log('✅ Basic database operations test completed successfully');

    } catch (error) {
      console.error('❌ Basic database operations failed:', error);
      throw new Error(`SQLite is not functioning properly: ${error}`);
    }
  }

  // Verify that critical tables exist and create users if needed
  private async verifyCriticalTables(): Promise<void> {
    const db = this.getDatabase();

    // Check if users table has any records
    const userCount = await db.getFirstAsync<{count: number}>(`
      SELECT COUNT(*) as count FROM users WHERE is_active = 1
    `);

    console.log('Active users found:', userCount?.count || 0);

    if (!userCount || userCount.count === 0) {
      console.log('No active users found, creating default users...');
      await this.createDefaultUsers();
    }
  }

  // Apply critical PRAGMA settings - MUST be called on every database open
  // These settings are per-connection and don't persist across app restarts
  private async applyDatabasePragmas(): Promise<void> {
    const db = this.getDatabase();

    try {
      console.log('[DatabaseService] Applying critical PRAGMA settings...');

      // WAL mode for crash recovery (this one does persist, but we set it anyway)
      await db.execAsync('PRAGMA journal_mode = WAL;');

      // FULL synchronous mode - CRITICAL for data safety
      // This MUST be set on every connection as it doesn't persist
      await db.execAsync('PRAGMA synchronous = FULL;');

      // Enable foreign keys (per-connection setting)
      await db.execAsync('PRAGMA foreign_keys = ON;');

      // Set busy timeout to prevent lock errors
      await db.execAsync('PRAGMA busy_timeout = 5000;');

      // Verify settings were applied
      const syncMode = await db.getFirstAsync<{ synchronous: number }>('PRAGMA synchronous;');
      const journalMode = await db.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode;');

      console.log('[DatabaseService] PRAGMA settings applied:');
      console.log('  - synchronous:', syncMode?.synchronous === 2 ? 'FULL' : syncMode?.synchronous === 1 ? 'NORMAL' : 'OFF');
      console.log('  - journal_mode:', journalMode?.journal_mode);

      if (syncMode?.synchronous !== 2) {
        console.warn('[DatabaseService] WARNING: Could not set synchronous mode to FULL!');
      }
    } catch (error) {
      console.error('[DatabaseService] Error applying PRAGMA settings:', error);
      // Don't throw - the app can still work, just with reduced protection
    }
  }

  // Minimal initialization if full init fails
  private async minimalInitialization(): Promise<void> {
    const db = this.getDatabase();

    try {
      console.log('Creating essential tables...');

      // Create users table
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          full_name TEXT NOT NULL,
          role TEXT CHECK (role IN ('ADMIN', 'CASHIER', 'MANAGER')) DEFAULT 'CASHIER',
          is_active BOOLEAN DEFAULT 1,
          password_hash TEXT NOT NULL,
          last_login DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create products table
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          description TEXT,
          price DECIMAL(10,2) NOT NULL,
          cost DECIMAL(10,2) NOT NULL DEFAULT 0,
          category_id INTEGER,
          tax_rate DECIMAL(5,2) DEFAULT 12.00,
          is_vat_inclusive BOOLEAN DEFAULT 1,
          stock_quantity INTEGER DEFAULT 0,
          unit TEXT DEFAULT 'pcs',
          is_active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create settings table for app configuration
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT NOT NULL UNIQUE,
          value TEXT NOT NULL,
          description TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await this.createDefaultUsers();
      console.log('Minimal initialization completed with essential tables');

    } catch (error) {
      console.error('Even minimal initialization failed:', error);
      throw new Error('Database is completely inaccessible');
    }
  }

  public getDatabase(): any {
    if (!this.db) {
      console.error('Database access attempted before initialization!');
      throw new Error('Database not initialized. Call initialize() first. Please restart the app.');
    }
    return this.db;
  }

  // Check if database is ready
  public isReady(): boolean {
    return this.db !== null;
  }

  // Simple connection check - does NOT auto-reinitialize to avoid race conditions
  public async ensureConnection(): Promise<void> {
    // If database is not initialized, just return - App.tsx handles initialization
    if (!this.db) {
      console.warn('Database not initialized yet');
      return;
    }
    // Database exists, assume it's working - don't test with queries
    // as this can cause NullPointerException cascades
  }

  // ========================================
  // INVENTORY MOVEMENT TRACKING HELPER
  // ========================================

  public async recordInventoryMovement(movementData: {
    product_id: number;
    movement_type: 'IN' | 'OUT' | 'ADJUSTMENT';
    quantity: number;
    reference_type: 'SALE' | 'PURCHASE' | 'MANUAL_ADJUSTMENT' | 'DAMAGE' | 'DAMAGE_REVERSAL' | 'PHYSICAL_COUNT' | 'SALES_RETURN' | 'PURCHASE_RETURN' | 'EXCHANGE' | 'VOID' | 'BEGINNING_BALANCE';
    reference_id?: number;
    reference_number?: string;
    notes?: string;
    created_by: number;
  }): Promise<number> {
    const db = this.getDatabase();

    try {
      // Get current product information including stock before the transaction
      const product = await db.getFirstAsync<any>(
        'SELECT * FROM products WHERE id = ?',
        [movementData.product_id]
      );

      if (!product) {
        throw new Error(`Product with ID ${movementData.product_id} not found`);
      }

      const quantityBefore = product.stock_quantity;
      let quantityAfter: number;

      // Calculate quantity after based on movement type
      switch (movementData.movement_type) {
        case 'IN':
          quantityAfter = quantityBefore + Math.abs(movementData.quantity);
          break;
        case 'OUT':
          quantityAfter = quantityBefore - Math.abs(movementData.quantity);
          break;
        case 'ADJUSTMENT':
          // For adjustments, the quantity represents the final amount, not the change
          quantityAfter = movementData.quantity;
          break;
        default:
          throw new Error(`Invalid movement type: ${movementData.movement_type}`);
      }

      // Ensure stock doesn't go negative (except for adjustments)
      if (quantityAfter < 0 && movementData.movement_type !== 'ADJUSTMENT') {
        throw new Error(`Insufficient stock. Available: ${quantityBefore}, Requested: ${Math.abs(movementData.quantity)}`);
      }

      const actualQuantityMoved = movementData.movement_type === 'ADJUSTMENT'
        ? quantityAfter - quantityBefore
        : movementData.quantity;

      const totalValue = Math.abs(actualQuantityMoved) * product.cost;

      // Use Philippine timezone for created_at
      const phDateTime = getPhilippineDateTimeString();

      // Record the inventory movement
      const result = await db.runAsync(
        `INSERT INTO inventory_movements (
          product_id, product_code, product_name, movement_type, quantity,
          quantity_before, quantity_after, unit_cost, total_value,
          reference_type, reference_id, reference_number, notes, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          movementData.product_id,
          product.code,
          product.name,
          movementData.movement_type,
          actualQuantityMoved,
          quantityBefore,
          quantityAfter,
          product.cost,
          totalValue,
          movementData.reference_type,
          movementData.reference_id || null,
          movementData.reference_number || null,
          movementData.notes || null,
          movementData.created_by,
          phDateTime
        ]
      );

      // Update the product stock quantity
      await db.runAsync(
        'UPDATE products SET stock_quantity = ? WHERE id = ?',
        [quantityAfter, movementData.product_id]
      );

      console.log(`Inventory movement recorded: ${product.name} ${quantityBefore} → ${quantityAfter} (${actualQuantityMoved})`);
      return result.lastInsertRowId as number;
    } catch (error) {
      console.error('Error recording inventory movement:', error);
      throw error;
    }
  }

  // Method to recreate default users if they don't exist
  public async createDefaultUsers(): Promise<void> {
    const db = this.getDatabase();

    try {
      await db.execAsync(`
        INSERT OR IGNORE INTO users (username, full_name, role, password_hash) VALUES
          ('admin', 'System Administrator', 'ADMIN', '$simple$AdminSalt1234567$6d4a5ab4'),
          ('manager', 'Store Manager', 'MANAGER', '$simple$ManagerSalt12345$5d2db5b7'),
          ('cashier', 'Cashier User', 'CASHIER', '$simple$CashierSalt12345$26740ee1');
      `);

      console.log('Default users created/updated successfully');
    } catch (error) {
      console.error('Error creating default users:', error);
      throw error;
    }
  }

  // Product operations
  public async createProduct(product: {
    code: string;
    name: string;
    description?: string;
    price: number;
    cost: number;
    category_id?: number;
    vat_type?: 'vatable' | 'vat_exempt' | 'zero_rated';
    tax_rate?: number;
    is_vat_inclusive?: boolean;
    stock_quantity?: number;
    unit?: string;
    is_active?: boolean;
  }) {
    const db = this.getDatabase();
    try {
      // Check for duplicate product name (case-insensitive, includes inactive)
      const existingName = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM products WHERE LOWER(name) = LOWER(?)',
        [product.name.trim()]
      );
      if (existingName) {
        throw new Error(`Product name "${product.name.trim()}" already exists. Please use a unique name.`);
      }

      // Check for duplicate product code (case-insensitive, includes inactive)
      const existingCode = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM products WHERE LOWER(code) = LOWER(?)',
        [product.code.trim()]
      );
      if (existingCode) {
        throw new Error(`Product code "${product.code.trim()}" already exists. Please use a unique code.`);
      }

      // Determine tax_rate based on vat_type
      const vatType = product.vat_type || 'vatable';
      const taxRate = vatType === 'vatable' ? (product.tax_rate || 12.00) : 0;
      const isVatInclusive = vatType === 'vatable' ? (product.is_vat_inclusive !== false ? 1 : 0) : 0;

      const result = await db.runAsync(
        `INSERT INTO products (code, name, description, price, cost, category_id, vat_type, tax_rate, is_vat_inclusive, stock_quantity, unit, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          product.code,
          product.name,
          product.description || '',
          product.price,
          product.cost,
          product.category_id || null,
          vatType,
          taxRate,
          isVatInclusive,
          product.stock_quantity || 0,
          product.unit || 'pcs',
          product.is_active !== false ? 1 : 0
        ]
      );
      console.log(`Product created: ${product.name} (ID: ${result.lastInsertRowId})`);
      return result.lastInsertRowId;
    } catch (error) {
      console.error(`Error creating product ${product.name}:`, error);
      throw error;
    }
  }

  public async getProducts(active_only: boolean = true, limit?: number, searchTerm?: string) {
    const db = this.getDatabase();

    try {
      let whereClause = active_only ? 'WHERE is_active = 1' : 'WHERE 1=1';
      const params: any[] = [];

      // Add search filter if provided
      if (searchTerm && searchTerm.trim() !== '') {
        whereClause += ' AND (name LIKE ? OR code LIKE ?)';
        const searchPattern = `%${searchTerm.trim()}%`;
        params.push(searchPattern, searchPattern);
      }

      // Add limit for performance - no limit when searching to allow full search
      let limitClause = '';
      if (searchTerm && searchTerm.trim() !== '') {
        // When searching, allow unlimited results for complete search
        limitClause = limit ? `LIMIT ${limit}` : '';
      } else {
        // When browsing (no search), limit to prevent performance issues
        limitClause = limit ? `LIMIT ${limit}` : 'LIMIT 100';
      }

      // Use simple query for better performance with large datasets
      const products = await db.getAllAsync<any>(
        `SELECT id, code, name, description, price, wholesale_price, cost, category_id, vat_type, tax_rate,
                is_vat_inclusive, stock_quantity, unit, is_active, created_at, updated_at
         FROM products
         ${whereClause}
         ORDER BY name
         ${limitClause}`,
        params
      );

      console.log(`DatabaseService.getProducts: Found ${products.length} products (limited to ${limit || 100})`);
      return products;

    } catch (error) {
      console.error('Error in getProducts:', error);
      return [];
    }
  }

  // New method for getting products with pagination
  public async getProductsPaginated(
    page: number = 1,
    pageSize: number = 50,
    searchTerm?: string,
    active_only: boolean = true
  ) {
    const db = this.getDatabase();

    try {
      let whereClause = active_only ? 'WHERE is_active = 1' : 'WHERE 1=1';
      const params: any[] = [];

      if (searchTerm && searchTerm.trim() !== '') {
        whereClause += ' AND (name LIKE ? OR code LIKE ?)';
        const searchPattern = `%${searchTerm.trim()}%`;
        params.push(searchPattern, searchPattern);
      }

      const offset = (page - 1) * pageSize;

      const products = await db.getAllAsync<any>(
        `SELECT id, code, name, description, price, wholesale_price, cost, category_id, vat_type, tax_rate,
                is_vat_inclusive, stock_quantity, unit, is_active, created_at, updated_at
         FROM products
         ${whereClause}
         ORDER BY name
         LIMIT ${pageSize} OFFSET ${offset}`,
        params
      );

      // Get total count for pagination
      const countResult = await db.getFirstAsync<{count: number}>(
        `SELECT COUNT(*) as count FROM products ${whereClause}`,
        params
      );

      const totalCount = countResult?.count || 0;
      const totalPages = Math.ceil(totalCount / pageSize);

      return {
        products,
        pagination: {
          currentPage: page,
          pageSize,
          totalCount,
          totalPages,
          hasMore: page < totalPages
        }
      };

    } catch (error) {
      console.error('Error in getProductsPaginated:', error);
      return {
        products: [],
        pagination: {
          currentPage: 1,
          pageSize,
          totalCount: 0,
          totalPages: 0,
          hasMore: false
        }
      };
    }
  }

  public async getProductByCode(code: string) {
    const db = this.getDatabase();
    return await db.getFirstAsync(
      'SELECT * FROM products WHERE code = ? AND is_active = 1',
      [code]
    );
  }

  // Debug method to check raw products table
  public async getRawProducts() {
    const db = this.getDatabase();
    try {
      const products = await db.getAllAsync('SELECT * FROM products LIMIT 5');
      console.log(`Raw products table has ${products.length} entries`);
      if (products.length > 0) {
        console.log('Raw product sample:', JSON.stringify(products[0], null, 2));
      }
      return products;
    } catch (error) {
      console.error('Error getting raw products:', error);
      return [];
    }
  }

  // Transaction operations
  public async createTransaction(transaction: {
    customer_id?: number;
    customer_name?: string;
    customer_tin?: string;
    customer_address?: string;
    subtotal: number;
    tax_amount: number;
    discount_amount?: number;
    total_amount: number;
    payment_method: string;
    amount_tendered: number;
    change_amount?: number;
    cashier_id: number;
    // BIR Compliance: SC/PWD discount info
    sc_pwd_id?: string;
    sc_pwd_name?: string;
    sc_pwd_type?: 'SENIOR' | 'PWD';
    items: Array<{
      product_id: number;
      product_code: string;
      product_name: string;
      quantity: number;
      unit_price: number;
      discount_amount?: number;
      tax_amount: number;
      total_amount: number;
      price_type?: 'retail' | 'wholesale';
      item_type?: 'sale' | 'return';
    }>;
  }) {
    const db = this.getDatabase();

    // Get next transaction and invoice numbers
    const transactionNumber = `TXN${Date.now()}`;
    const invoiceNumber = await getNextInvoiceNumber(db);

    const isChargeInvoice = transaction.payment_method === 'CHARGE_INVOICE';
    const paymentStatus = isChargeInvoice ? 'UNPAID' : 'PAID';

    // Use Philippine timezone for transaction date
    const phDateTime = getPhilippineDateTimeString();

    await db.withTransactionAsync(async () => {
      // Create transaction with explicit Philippine timezone
      const transactionResult = await db.runAsync(
        `INSERT INTO transactions (
          transaction_number, invoice_number, customer_id, customer_name, customer_tin, customer_address,
          subtotal, tax_amount, discount_amount, total_amount, payment_method,
          amount_tendered, change_amount, payment_status, cashier_id,
          sc_pwd_id, sc_pwd_name, sc_pwd_type, transaction_date, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          transactionNumber,
          invoiceNumber,
          transaction.customer_id || null,
          transaction.customer_name || '',
          transaction.customer_tin || '',
          transaction.customer_address || '',
          transaction.subtotal,
          transaction.tax_amount,
          transaction.discount_amount || 0,
          transaction.total_amount,
          transaction.payment_method,
          transaction.amount_tendered,
          transaction.change_amount || 0,
          paymentStatus,
          transaction.cashier_id,
          transaction.sc_pwd_id || null,
          transaction.sc_pwd_name || null,
          transaction.sc_pwd_type || null,
          phDateTime,
          phDateTime
        ]
      );

      const transactionId = transactionResult.lastInsertRowId;

      // Create transaction items and update inventory
      let hasReturnItems = false;
      for (const item of transaction.items) {
        const itemType = item.item_type || 'sale';
        const isReturn = itemType === 'return';
        if (isReturn) hasReturnItems = true;

        await db.runAsync(
          `INSERT INTO transaction_items (
            transaction_id, product_id, product_code, product_name,
            quantity, unit_price, discount_amount, tax_amount, total_amount, price_type, item_type
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            transactionId,
            item.product_id,
            item.product_code,
            item.product_name,
            item.quantity,
            item.unit_price,
            item.discount_amount || 0,
            item.tax_amount,
            item.total_amount,
            item.price_type || 'retail',
            itemType
          ]
        );

        // Record inventory movement based on item type
        await this.recordInventoryMovement({
          product_id: item.product_id,
          movement_type: isReturn ? 'IN' : 'OUT',
          quantity: item.quantity,
          reference_type: isReturn ? 'SALES_RETURN' : 'SALE',
          reference_id: transactionId as number,
          reference_number: invoiceNumber,
          notes: isReturn
            ? `Return (BO): ${item.product_name} (${item.quantity} units)`
            : `Sale: ${item.product_name} (${item.quantity} units)`,
          created_by: transaction.cashier_id
        });
      }

      // Create accounts receivable entry for charge invoices
      if (isChargeInvoice) {
        // Get customer credit terms or use default
        let creditTerms = 30; // default
        if (transaction.customer_id) {
          const customer = await db.getFirstAsync<any>(
            'SELECT credit_terms FROM customers WHERE id = ?',
            [transaction.customer_id]
          );
          if (customer?.credit_terms) {
            creditTerms = customer.credit_terms;
          }
        }

        const invoiceDate = getPhilippineDateString();
        // Calculate due date from Philippine time
        const phTime = new Date();
        const phOffset = 8 * 60;
        const localOffset = phTime.getTimezoneOffset();
        const phDate = new Date(phTime.getTime() + (phOffset + localOffset) * 60000);
        phDate.setDate(phDate.getDate() + creditTerms);
        const dueDateString = phDate.toISOString().split('T')[0];

        await db.runAsync(
          `INSERT INTO accounts_receivable (
            transaction_id, customer_id, customer_name, invoice_number,
            invoice_date, due_date, original_amount, paid_amount, balance_amount
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            transactionId,
            transaction.customer_id || null,
            transaction.customer_name || 'Walk-in Customer',
            invoiceNumber,
            invoiceDate,
            dueDateString,
            transaction.total_amount,
            0, // Explicitly set paid_amount to 0 for new AR records
            transaction.total_amount
          ]
        );
      }

      // Add eJournal entry with Philippine time
      await db.runAsync(
        `INSERT INTO ejournal (entry_type, reference_number, description, amount, cashier_id, timestamp, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'SALE',
          invoiceNumber,
          hasReturnItems
            ? `Sale with Returns (BO) - Invoice: ${invoiceNumber}`
            : `Sale transaction - Invoice: ${invoiceNumber}`,
          transaction.total_amount,
          transaction.cashier_id,
          phDateTime,
          phDateTime
        ]
      );

      // Update invoice number
      await updateInvoiceNumber(db, invoiceNumber);
    });

    return { transactionNumber, invoiceNumber };
  }

  // BIR Compliance operations
  public async generateZReading(cashier_id: number, targetDate?: string): Promise<any> {
    const db = this.getDatabase();

    // Use target date if provided (for closing unterminated sessions), otherwise use today's Philippine date
    const dateToClose = targetDate || getPhilippineDateString();
    console.log('[generateZReading] Generating Z-Reading for date:', dateToClose, 'cashier:', cashier_id);

    // Check if Z-Reading already exists for this date
    const existingReading = await db.getFirstAsync(
      'SELECT * FROM z_readings WHERE date = ?',
      [dateToClose]
    );

    if (existingReading) {
      throw new Error(`Z-Reading already generated for ${dateToClose}`);
    }

    // Get current Z-Reading counter
    const counterResult = await db.getFirstAsync<{value: string}>(
      'SELECT value FROM settings WHERE key = ?',
      ['z_counter']
    );

    const currentCounter = parseInt(counterResult?.value || '0');
    const nextCounter = currentCounter + 1;

    // Calculate sales data for the target date filtered by cashier
    const salesData = await db.getFirstAsync<{
      gross_sales: number;
      vat_amount: number;
      discount_amount: number;
      void_amount: number;
      void_count: number;
      net_sales: number;
      start_invoice: string;
      end_invoice: string;
    }>(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN total_amount ELSE 0 END), 0) as gross_sales,
         COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN tax_amount ELSE 0 END), 0) as vat_amount,
         COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN discount_amount ELSE 0 END), 0) as discount_amount,
         COALESCE(SUM(CASE WHEN status = 'VOID' THEN total_amount ELSE 0 END), 0) as void_amount,
         COUNT(CASE WHEN status = 'VOID' THEN 1 END) as void_count,
         COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN total_amount - discount_amount ELSE 0 END), 0) as net_sales,
         MIN(invoice_number) as start_invoice,
         MAX(invoice_number) as end_invoice
       FROM transactions
       WHERE DATE(transaction_date) = ? AND cashier_id = ?`,
      [dateToClose, cashier_id]
    );

    // Get refund and exchange amounts from sales_returns table
    const refundData = await db.getFirstAsync<{ refund_amount: number; refund_count: number }>(
      `SELECT COALESCE(SUM(total_amount), 0) as refund_amount, COUNT(*) as refund_count
       FROM sales_returns
       WHERE DATE(return_date) = ? AND processed_by = ? AND status = 'COMPLETED' AND refund_method != 'EXCHANGE'`,
      [dateToClose, cashier_id]
    );

    const exchangeData = await db.getFirstAsync<{ exchange_amount: number; exchange_count: number }>(
      `SELECT COALESCE(SUM(total_amount), 0) as exchange_amount, COUNT(*) as exchange_count
       FROM sales_returns
       WHERE DATE(return_date) = ? AND processed_by = ? AND status = 'COMPLETED' AND refund_method = 'EXCHANGE'`,
      [dateToClose, cashier_id]
    );

    const vat_sales = salesData?.gross_sales ? (salesData.gross_sales / 1.12) : 0;

    // BIR Compliance: Get previous cumulative grand total
    const prevCumulativeResult = await db.getFirstAsync<{value: string}>(
      'SELECT value FROM settings WHERE key = ?',
      ['cumulative_grand_total']
    );
    const prevCumulativeGrandTotal = parseFloat(prevCumulativeResult?.value || '0');
    const newCumulativeGrandTotal = prevCumulativeGrandTotal + (salesData?.net_sales || 0);

    // Create Z-Reading record
    const result = await db.runAsync(
      `INSERT INTO z_readings (
        reading_number, date, start_invoice_number, end_invoice_number,
        gross_sales, vat_sales, vat_amount, discount_amount, void_amount, void_count,
        refund_amount, refund_count, exchange_amount, exchange_count,
        net_sales, cumulative_grand_total, reset_counter, cashier_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nextCounter,
        dateToClose,
        salesData?.start_invoice || '',
        salesData?.end_invoice || '',
        salesData?.gross_sales || 0,
        vat_sales,
        salesData?.vat_amount || 0,
        salesData?.discount_amount || 0,
        salesData?.void_amount || 0,
        salesData?.void_count || 0,
        refundData?.refund_amount || 0,
        refundData?.refund_count || 0,
        exchangeData?.exchange_amount || 0,
        exchangeData?.exchange_count || 0,
        salesData?.net_sales || 0,
        newCumulativeGrandTotal,
        nextCounter,
        cashier_id
      ]
    );
    console.log('[generateZReading] Z-Reading created with ID:', result.lastInsertRowId, 'for date:', dateToClose);

    // Update Z-Reading counter
    await db.runAsync(
      'UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
      [nextCounter.toString(), 'z_counter']
    );

    // BIR Compliance: Update cumulative grand total
    await db.runAsync(
      'UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
      [newCumulativeGrandTotal.toFixed(2), 'cumulative_grand_total']
    );

    // Add eJournal entry with Philippine time
    const phDateTime = getPhilippineDateTimeString();
    await db.runAsync(
      `INSERT INTO ejournal (entry_type, reference_number, description, cashier_id, timestamp, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['Z_READING', `Z${nextCounter.toString().padStart(4, '0')}`, `Z-Reading #${nextCounter}`, cashier_id, phDateTime, phDateTime]
    );

    return {
      reading_number: nextCounter,
      date: dateToClose,
      ...salesData,
      vat_sales,
      cumulative_grand_total: newCumulativeGrandTotal,
      reset_counter: nextCounter
    };
  }

  public async generateXReading(cashier_id: number): Promise<any> {
    const db = this.getDatabase();

    const today = getPhilippineDateString();
    const currentTime = getPhilippineTimeString();

    // Calculate current day sales data
    const salesData = await db.getFirstAsync<{
      gross_sales: number;
      vat_amount: number;
      discount_amount: number;
      void_amount: number;
      net_sales: number;
      transaction_count: number;
      current_invoice: string;
    }>(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN total_amount ELSE 0 END), 0) as gross_sales,
         COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN tax_amount ELSE 0 END), 0) as vat_amount,
         COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN discount_amount ELSE 0 END), 0) as discount_amount,
         COALESCE(SUM(CASE WHEN status = 'VOID' THEN total_amount ELSE 0 END), 0) as void_amount,
         COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN total_amount - discount_amount ELSE 0 END), 0) as net_sales,
         COUNT(*) as transaction_count,
         MAX(invoice_number) as current_invoice
       FROM transactions
       WHERE DATE(transaction_date) = ?`,
      [today]
    );

    const vat_sales = salesData?.gross_sales ? (salesData.gross_sales / 1.12) : 0;

    // Create X-Reading record
    await db.runAsync(
      `INSERT INTO x_readings (
        date, time, current_invoice_number, gross_sales, vat_sales, vat_amount,
        discount_amount, void_amount, net_sales, transaction_count, cashier_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        today,
        currentTime,
        salesData?.current_invoice || '',
        salesData?.gross_sales || 0,
        vat_sales,
        salesData?.vat_amount || 0,
        salesData?.discount_amount || 0,
        salesData?.void_amount || 0,
        salesData?.net_sales || 0,
        salesData?.transaction_count || 0,
        cashier_id
      ]
    );

    // Add eJournal entry with Philippine time
    const phDateTimeXRead = getPhilippineDateTimeString();
    await db.runAsync(
      `INSERT INTO ejournal (entry_type, reference_number, description, cashier_id, timestamp, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['X_READING', `X${Date.now()}`, `X-Reading ${currentTime}`, cashier_id, phDateTimeXRead, phDateTimeXRead]
    );

    return {
      date: today,
      time: currentTime,
      ...salesData,
      vat_sales
    };
  }

  // Check for unterminated sales sessions (days with sales but no Z-Reading or End of Day record)
  public async getUnterminatedSalesDates(): Promise<{ date: string; transaction_count: number; total_sales: number }[]> {
    const db = this.getDatabase();

    // Get Philippine timezone date for today (UTC+8)
    const now = new Date();
    const phOffset = 8 * 60; // Philippines is UTC+8 (8 hours * 60 minutes)
    const localOffset = now.getTimezoneOffset(); // Local timezone offset in minutes (negative for east of UTC)
    const phTime = new Date(now.getTime() + (phOffset + localOffset) * 60000);
    const today = phTime.toISOString().split('T')[0];

    console.log('[getUnterminatedSalesDates] Checking for unterminated sessions before:', today);

    // Find dates with transactions but no Z-Reading AND no End of Day record
    // Use DATE() on both sides to ensure consistent comparison
    const results = await db.getAllAsync<{ sale_date: string; transaction_count: number; total_sales: number }>(
      `SELECT
        DATE(transaction_date) as sale_date,
        COUNT(*) as transaction_count,
        COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN total_amount ELSE 0 END), 0) as total_sales
      FROM transactions
      WHERE DATE(transaction_date) < ?
        AND DATE(transaction_date) NOT IN (SELECT DATE(date) FROM z_readings)
        AND DATE(transaction_date) NOT IN (SELECT DATE(date) FROM end_of_day_records WHERE status = 'COMPLETED')
      GROUP BY DATE(transaction_date)
      ORDER BY sale_date ASC`,
      [today]
    );

    console.log('[getUnterminatedSalesDates] Found unterminated dates:', results.map(r => r.sale_date));

    return results.map(r => ({
      date: r.sale_date,
      transaction_count: r.transaction_count,
      total_sales: r.total_sales
    }));
  }

  // User authentication
  public async authenticateUser(username: string, password: string) {
    console.log('🔐 Authentication attempt:');
    console.log('  Username:', username);
    console.log('  Password provided:', password ? 'Yes' : 'No');

    // First verify database is ready
    if (!this.db) {
      console.error('  Database not initialized for authentication!');
      throw new Error('Database not initialized. Please restart the app.');
    }

    const db = this.getDatabase();

    try {
      // First, check if any users exist
      const allUsers = await db.getAllAsync<any>('SELECT username, is_active FROM users');
      console.log('  Total users in database:', allUsers.length);

      // Get user with password_hash for verification
      const user = await db.getFirstAsync<any>(
        'SELECT id, username, full_name, role, is_active, password_hash FROM users WHERE username = ? AND is_active = 1',
        [username]
      );

      if (user) {
        // Verify password
        if (verifyPassword(password, user.password_hash || '')) {
          console.log('  Authentication successful');
          // Return user without password_hash
          const { password_hash, ...userWithoutPassword } = user;
          return userWithoutPassword;
        } else {
          console.log('  Password verification failed');
          return null;
        }
      }

    } catch (error) {
      console.error('  Database query failed during authentication:', error);
      console.log('  Attempting to check/create users table...');

      try {
        // Ensure users table exists
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            full_name TEXT NOT NULL,
            role TEXT CHECK (role IN ('ADMIN', 'CASHIER', 'MANAGER')) DEFAULT 'CASHIER',
            is_active BOOLEAN DEFAULT 1,
            password_hash TEXT NOT NULL,
            last_login DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);

        await this.createDefaultUsers();
        console.log('  Users table created/verified, retrying authentication...');

        const retryUser = await db.getFirstAsync<any>(
          'SELECT id, username, full_name, role, is_active, password_hash FROM users WHERE username = ? AND is_active = 1',
          [username]
        );

        if (retryUser && verifyPassword(password, retryUser.password_hash || '')) {
          console.log('  Authentication successful after table creation');
          const { password_hash, ...userWithoutPassword } = retryUser;
          return userWithoutPassword;
        }

      } catch (createError) {
        console.error('  Failed to create users table:', createError);
      }
    }

    console.log('  Authentication failed - no user found or invalid password');
    return null;
  }

  public async updateUserLastLogin(userId: number): Promise<void> {
    const db = this.getDatabase();
    await db.runAsync(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
      [userId]
    );
  }

  public async createEJournalEntry(entry: {
    transaction_id?: number;
    entry_type: 'SALE' | 'VOID' | 'REFUND' | 'Z_READING' | 'X_READING' | 'SYSTEM';
    reference_number: string;
    description: string;
    amount?: number;
    cashier_id: number;
  }): Promise<void> {
    const db = this.getDatabase();
    const phDateTime = getPhilippineDateTimeString();
    await db.runAsync(
      'INSERT INTO ejournal (transaction_id, entry_type, reference_number, description, amount, cashier_id, timestamp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [entry.transaction_id || null, entry.entry_type, entry.reference_number, entry.description, entry.amount || null, entry.cashier_id, phDateTime, phDateTime]
    );
  }

  public async getUsers(): Promise<any[]> {
    const db = this.getDatabase();
    return await db.getAllAsync(
      'SELECT id, username, full_name, role, is_active, last_login, created_at FROM users ORDER BY created_at DESC'
    );
  }

  public async getUserById(userId: number): Promise<any | null> {
    const db = this.getDatabase();
    return await db.getFirstAsync(
      'SELECT id, username, full_name, role, is_active, password_hash, last_login, created_at FROM users WHERE id = ?',
      [userId]
    );
  }

  public async getUserByUsername(username: string): Promise<any | null> {
    const db = this.getDatabase();
    return await db.getFirstAsync(
      'SELECT id, username, full_name, role, is_active, last_login, created_at FROM users WHERE username = ? AND is_active = 1',
      [username]
    );
  }

  public async createUser(userData: {
    username: string;
    full_name: string;
    role: 'ADMIN' | 'CASHIER' | 'MANAGER';
    password_hash: string;
  }): Promise<void> {
    const db = this.getDatabase();
    await db.runAsync(
      'INSERT INTO users (username, full_name, role, password_hash) VALUES (?, ?, ?, ?)',
      [userData.username, userData.full_name, userData.role, userData.password_hash]
    );
  }

  public async updateUser(userId: number, userData: {
    username?: string;
    full_name?: string;
    role?: 'ADMIN' | 'CASHIER' | 'MANAGER';
    is_active?: boolean;
    password_hash?: string;
  }): Promise<void> {
    const db = this.getDatabase();
    const setParts = [];
    const values = [];

    if (userData.username !== undefined) {
      setParts.push('username = ?');
      values.push(userData.username);
    }
    if (userData.full_name !== undefined) {
      setParts.push('full_name = ?');
      values.push(userData.full_name);
    }
    if (userData.role !== undefined) {
      setParts.push('role = ?');
      values.push(userData.role);
    }
    if (userData.is_active !== undefined) {
      setParts.push('is_active = ?');
      values.push(userData.is_active ? 1 : 0);
    }
    if (userData.password_hash !== undefined) {
      setParts.push('password_hash = ?');
      values.push(userData.password_hash);
    }

    if (setParts.length > 0) {
      setParts.push('updated_at = CURRENT_TIMESTAMP');
      values.push(userId);

      await db.runAsync(
        `UPDATE users SET ${setParts.join(', ')} WHERE id = ?`,
        values
      );
    }
  }

  public async getTransactions(limit?: number): Promise<any[]> {
    const db = this.getDatabase();
    const query = `
      SELECT t.*, u.full_name as cashier_name
      FROM transactions t
      LEFT JOIN users u ON t.cashier_id = u.id
      ORDER BY t.created_at DESC
      ${limit ? `LIMIT ${limit}` : ''}
    `;
    return await db.getAllAsync(query);
  }

  public async getTransactionItems(transactionId: number): Promise<any[]> {
    const db = this.getDatabase();
    return await db.getAllAsync(
      'SELECT * FROM transaction_items WHERE transaction_id = ?',
      [transactionId]
    );
  }

  public async getAllTransactionItems(): Promise<any[]> {
    const db = this.getDatabase();
    return await db.getAllAsync('SELECT * FROM transaction_items ORDER BY transaction_id');
  }

  public async getTransactionsByCashier(cashierId: number, limit?: number): Promise<any[]> {
    const db = this.getDatabase();
    const query = `
      SELECT t.*, u.full_name as cashier_name
      FROM transactions t
      JOIN users u ON t.cashier_id = u.id
      WHERE t.cashier_id = ?
      ORDER BY t.created_at DESC
      ${limit ? `LIMIT ${limit}` : ''}
    `;
    return await db.getAllAsync(query, [cashierId]);
  }

  // Dynamic permission management
  public async getRolePermissions(role?: 'MANAGER' | 'CASHIER'): Promise<any[]> {
    const db = this.getDatabase();
    const query = role
      ? 'SELECT * FROM role_permissions WHERE role = ? ORDER BY permission'
      : 'SELECT * FROM role_permissions ORDER BY role, permission';
    const params = role ? [role] : [];
    return await db.getAllAsync(query, params);
  }

  public async updateRolePermission(
    role: 'MANAGER' | 'CASHIER',
    permission: string,
    isEnabled: boolean,
    updatedBy: number
  ): Promise<void> {
    const db = this.getDatabase();
    await db.runAsync(
      'UPDATE role_permissions SET is_enabled = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE role = ? AND permission = ?',
      [isEnabled ? 1 : 0, updatedBy, role, permission]
    );
  }

  public async getEnabledPermissionsForRole(role: 'MANAGER' | 'CASHIER'): Promise<string[]> {
    const db = this.getDatabase();
    const result = await db.getAllAsync<{permission: string}>(
      'SELECT permission FROM role_permissions WHERE role = ? AND is_enabled = 1',
      [role]
    );
    return result.map(row => row.permission);
  }

  public async resetRolePermissions(role: 'MANAGER' | 'CASHIER', updatedBy: number): Promise<void> {
    const db = this.getDatabase();
    // Reset to default permissions based on role
    if (role === 'MANAGER') {
      // Enable all manager permissions
      await db.runAsync(
        'UPDATE role_permissions SET is_enabled = 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE role = ?',
        [updatedBy, role]
      );
    } else if (role === 'CASHIER') {
      // Reset to default cashier permissions
      await db.runAsync(
        'UPDATE role_permissions SET is_enabled = CASE permission WHEN ? THEN 1 WHEN ? THEN 1 WHEN ? THEN 1 ELSE 0 END, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE role = ?',
        ['VIEW_DASHBOARD', 'CREATE_SALE', 'VIEW_OWN_SALES', 'VIEW_PRODUCTS', updatedBy, role]
      );
    }
  }

  // Settings operations
  public async getSetting(key: string): Promise<string | null> {
    const db = this.getDatabase();
    const result = await db.getFirstAsync<{value: string}>(
      'SELECT value FROM settings WHERE key = ?',
      [key]
    );
    return result?.value || null;
  }

  public async updateSetting(key: string, value: string): Promise<void> {
    const db = this.getDatabase();
    // Use INSERT OR REPLACE to handle both new and existing settings
    await db.runAsync(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [key, value]
    );
  }

  // Get today's transactions for reporting
  public async getTodaysTransactions() {
    const db = this.getDatabase();
    const today = getPhilippineDateString();

    return await db.getAllAsync(
      `SELECT t.*, u.full_name as cashier_name
       FROM transactions t
       JOIN users u ON t.cashier_id = u.id
       WHERE DATE(t.transaction_date) = ?
       ORDER BY t.created_at DESC`,
      [today]
    );
  }

  // Get transactions since a specific time (for shift-based filtering)
  // Get transactions since a specific time
  // Optional cashier_id to filter by specific cashier
  public async getTransactionsSinceTime(startTime: string, cashierId?: number) {
    const db = this.getDatabase();

    // Normalize ISO format (with 'T') to SQLite format (with space) for proper comparison
    const normalizedTime = startTime.replace('T', ' ').replace('Z', '').split('.')[0];

    if (cashierId) {
      return await db.getAllAsync(
        `SELECT t.*, u.full_name as cashier_name
         FROM transactions t
         JOIN users u ON t.cashier_id = u.id
         WHERE datetime(t.transaction_date) >= datetime(?) AND t.cashier_id = ?
         ORDER BY t.created_at DESC`,
        [normalizedTime, cashierId]
      );
    }

    return await db.getAllAsync(
      `SELECT t.*, u.full_name as cashier_name
       FROM transactions t
       JOIN users u ON t.cashier_id = u.id
       WHERE datetime(t.transaction_date) >= datetime(?)
       ORDER BY t.created_at DESC`,
      [normalizedTime]
    );
  }

  // Get transactions for a specific date (for closing unterminated sessions)
  // Optional cashier_id to filter by specific cashier
  public async getTransactionsByDate(date: string, cashierId?: number) {
    const db = this.getDatabase();

    if (cashierId) {
      return await db.getAllAsync(
        `SELECT t.*, u.full_name as cashier_name
         FROM transactions t
         JOIN users u ON t.cashier_id = u.id
         WHERE DATE(t.transaction_date) = ? AND t.cashier_id = ?
         ORDER BY t.created_at DESC`,
        [date, cashierId]
      );
    }

    return await db.getAllAsync(
      `SELECT t.*, u.full_name as cashier_name
       FROM transactions t
       JOIN users u ON t.cashier_id = u.id
       WHERE DATE(t.transaction_date) = ?
       ORDER BY t.created_at DESC`,
      [date]
    );
  }

  // Physical Count Session Management
  public async createPhysicalCountSession(sessionData: {
    session_id: string;
    started_by: number;
    total_items: number;
    notes?: string;
  }) {
    const db = this.getDatabase();
    const today = getPhilippineDateString();

    return await db.runAsync(
      `INSERT INTO physical_count_sessions (session_id, date, started_by, total_items, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [sessionData.session_id, today, sessionData.started_by, sessionData.total_items, sessionData.notes || null]
    );
  }

  public async updatePhysicalCountSession(sessionId: string, updates: {
    counted_items?: number;
    discrepancy_count?: number;
    total_discrepancy_value?: number;
    status?: 'in_progress' | 'completed' | 'cancelled';
    completed_by?: number;
    notes?: string;
  }) {
    const db = this.getDatabase();
    const setParts = [];
    const values = [];

    if (updates.counted_items !== undefined) {
      setParts.push('counted_items = ?');
      values.push(updates.counted_items);
    }
    if (updates.discrepancy_count !== undefined) {
      setParts.push('discrepancy_count = ?');
      values.push(updates.discrepancy_count);
    }
    if (updates.total_discrepancy_value !== undefined) {
      setParts.push('total_discrepancy_value = ?');
      values.push(updates.total_discrepancy_value);
    }
    if (updates.status !== undefined) {
      setParts.push('status = ?');
      values.push(updates.status);
      if (updates.status === 'completed') {
        setParts.push('completed_at = CURRENT_TIMESTAMP');
      }
    }
    if (updates.completed_by !== undefined) {
      setParts.push('completed_by = ?');
      values.push(updates.completed_by);
    }
    if (updates.notes !== undefined) {
      setParts.push('notes = ?');
      values.push(updates.notes);
    }

    if (setParts.length > 0) {
      values.push(sessionId);
      await db.runAsync(
        `UPDATE physical_count_sessions SET ${setParts.join(', ')} WHERE session_id = ?`,
        values
      );
    }
  }

  public async createPhysicalCountDetail(detailData: {
    session_id: string;
    product_id: number;
    product_code: string;
    product_name: string;
    system_quantity: number;
    unit_cost: number;
  }) {
    const db = this.getDatabase();

    return await db.runAsync(
      `INSERT INTO physical_count_details
       (session_id, product_id, product_code, product_name, system_quantity, unit_cost)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        detailData.session_id,
        detailData.product_id,
        detailData.product_code,
        detailData.product_name,
        detailData.system_quantity,
        detailData.unit_cost
      ]
    );
  }

  public async updatePhysicalCountDetail(sessionId: string, productId: number, updates: {
    physical_quantity?: number;
    discrepancy?: number;
    value_discrepancy?: number;
    status?: 'pending' | 'counted' | 'reviewed';
    counted_by?: number;
    notes?: string;
  }) {
    const db = this.getDatabase();
    const setParts = [];
    const values = [];

    if (updates.physical_quantity !== undefined) {
      setParts.push('physical_quantity = ?');
      values.push(updates.physical_quantity);
    }
    if (updates.discrepancy !== undefined) {
      setParts.push('discrepancy = ?');
      values.push(updates.discrepancy);
    }
    if (updates.value_discrepancy !== undefined) {
      setParts.push('value_discrepancy = ?');
      values.push(updates.value_discrepancy);
    }
    if (updates.status !== undefined) {
      setParts.push('status = ?');
      values.push(updates.status);
      if (updates.status === 'counted') {
        setParts.push('counted_at = CURRENT_TIMESTAMP');
      }
    }
    if (updates.counted_by !== undefined) {
      setParts.push('counted_by = ?');
      values.push(updates.counted_by);
    }
    if (updates.notes !== undefined) {
      setParts.push('notes = ?');
      values.push(updates.notes);
    }

    if (setParts.length > 0) {
      values.push(sessionId, productId);
      await db.runAsync(
        `UPDATE physical_count_details SET ${setParts.join(', ')} WHERE session_id = ? AND product_id = ?`,
        values
      );
    }
  }

  public async getPhysicalCountSessions(limit?: number) {
    const db = this.getDatabase();
    const query = `
      SELECT
        pcs.*,
        u1.full_name as started_by_name,
        u2.full_name as completed_by_name
      FROM physical_count_sessions pcs
      LEFT JOIN users u1 ON pcs.started_by = u1.id
      LEFT JOIN users u2 ON pcs.completed_by = u2.id
      ORDER BY pcs.created_at DESC
      ${limit ? `LIMIT ${limit}` : ''}
    `;
    return await db.getAllAsync(query);
  }

  public async getPhysicalCountDetails(sessionId: string) {
    const db = this.getDatabase();
    return await db.getAllAsync(
      `SELECT
        pcd.*,
        u.full_name as counted_by_name
       FROM physical_count_details pcd
       LEFT JOIN users u ON pcd.counted_by = u.id
       WHERE pcd.session_id = ?
       ORDER BY pcd.product_name`,
      [sessionId]
    );
  }

  public async getPhysicalCountReport(sessionId?: string, startDate?: string, endDate?: string) {
    const db = this.getDatabase();

    try {
      // Use simple, fast queries without complex JOINs
      console.log('Loading Physical Count Report...');

      // Build where clause for sessions
      let sessionWhereClause = 'WHERE 1=1';
      const sessionParams: any[] = [];

      if (sessionId) {
        sessionWhereClause += ' AND pcs.session_id = ?';
        sessionParams.push(sessionId);
      }
      if (startDate) {
        sessionWhereClause += ' AND DATE(pcs.date) >= DATE(?)';
        sessionParams.push(startDate);
      }
      if (endDate) {
        sessionWhereClause += ' AND DATE(pcs.date) <= DATE(?)';
        sessionParams.push(endDate);
      }

      // Get sessions with user names (optimized query)
      const sessions = await db.getAllAsync<any>(`
        SELECT pcs.session_id, pcs.date, pcs.status, pcs.started_by, pcs.completed_by,
               pcs.started_at, pcs.completed_at, pcs.total_items, pcs.counted_items,
               pcs.discrepancy_count, pcs.total_discrepancy_value, pcs.notes,
               u1.username as started_by_name,
               u2.username as completed_by_name
        FROM physical_count_sessions pcs
        LEFT JOIN users u1 ON pcs.started_by = u1.id
        LEFT JOIN users u2 ON pcs.completed_by = u2.id
        ${sessionWhereClause}
        ORDER BY pcs.date DESC
        LIMIT 50
      `, sessionParams);

      if (sessions.length === 0) {
        console.log('No sessions found');
        return [];
      }

      console.log(`Found ${sessions.length} sessions`);

      // Get details for these sessions (simple query)
      const sessionIds = sessions.map(s => s.session_id);
      const placeholders = sessionIds.map(() => '?').join(',');

      const details = await db.getAllAsync<any>(`
        SELECT pcd.session_id, pcd.product_code, pcd.product_name, pcd.system_quantity,
               pcd.physical_quantity, pcd.discrepancy, pcd.value_discrepancy, pcd.status,
               pcd.counted_by, pcd.counted_at, pcd.notes,
               u.username as counted_by_name
        FROM physical_count_details pcd
        LEFT JOIN users u ON pcd.counted_by = u.id
        WHERE pcd.session_id IN (${placeholders})
        ORDER BY pcd.session_id, pcd.product_name
      `, sessionIds);

      console.log(`Found ${details.length} detail records`);

      // Combine data efficiently
      const result = [];
      for (const session of sessions) {
        const sessionDetails = details.filter(d => d.session_id === session.session_id);

        if (sessionDetails.length > 0) {
          // Add each detail with session info
          for (const detail of sessionDetails) {
            result.push({
              ...session,
              ...detail,
              item_status: detail.status
            });
          }
        } else {
          // Add session without details
          result.push({
            ...session,
            product_code: null,
            product_name: null,
            system_quantity: 0,
            physical_quantity: 0,
            discrepancy: 0,
            value_discrepancy: 0,
            item_status: null,
            counted_by: null,
            counted_at: null,
            item_notes: null
          });
        }
      }

      console.log(`Returning ${result.length} combined records`);
      return result;

    } catch (error) {
      console.error('Error in getPhysicalCountReport:', error);
      return [];
    }
  }

  // Product update methods
  public async updateProduct(productId: number, updates: {
    code?: string;
    name?: string;
    description?: string;
    price?: number;
    cost?: number;
    category_id?: number;
    vat_type?: 'vatable' | 'vat_exempt' | 'zero_rated';
    tax_rate?: number;
    is_vat_inclusive?: boolean;
    stock_quantity?: number;
    unit?: string;
    is_active?: boolean;
  }) {
    const db = this.getDatabase();

    // Check for duplicate product name if name is being updated
    if (updates.name !== undefined) {
      const existingName = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM products WHERE LOWER(name) = LOWER(?) AND id != ?',
        [updates.name.trim(), productId]
      );
      if (existingName) {
        throw new Error(`Product name "${updates.name.trim()}" already exists. Please use a unique name.`);
      }
    }
    // Check for duplicate product code if code is being updated
    if (updates.code !== undefined) {
      const existingCode = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM products WHERE LOWER(code) = LOWER(?) AND id != ?',
        [updates.code.trim(), productId]
      );
      if (existingCode) {
        throw new Error(`Product code "${updates.code.trim()}" already exists. Please use a unique code.`);
      }
    }

    const setParts = [];
    const values = [];

    if (updates.code !== undefined) {
      setParts.push('code = ?');
      values.push(updates.code.trim());
    }
    if (updates.name !== undefined) {
      setParts.push('name = ?');
      values.push(updates.name.trim());
    }
    if (updates.description !== undefined) {
      setParts.push('description = ?');
      values.push(updates.description);
    }
    if (updates.price !== undefined) {
      setParts.push('price = ?');
      values.push(updates.price);
    }
    if (updates.cost !== undefined) {
      setParts.push('cost = ?');
      values.push(updates.cost);
    }
    if (updates.category_id !== undefined) {
      setParts.push('category_id = ?');
      values.push(updates.category_id);
    }
    if (updates.vat_type !== undefined) {
      setParts.push('vat_type = ?');
      values.push(updates.vat_type);
      // Auto-set tax_rate based on vat_type
      if (updates.vat_type !== 'vatable') {
        setParts.push('tax_rate = ?');
        values.push(0);
        setParts.push('is_vat_inclusive = ?');
        values.push(0);
      } else if (updates.tax_rate === undefined) {
        // Set default 12% for vatable items
        setParts.push('tax_rate = ?');
        values.push(12.00);
      }
    }
    if (updates.tax_rate !== undefined && updates.vat_type === undefined) {
      setParts.push('tax_rate = ?');
      values.push(updates.tax_rate);
    }
    if (updates.is_vat_inclusive !== undefined && updates.vat_type !== 'vat_exempt' && updates.vat_type !== 'zero_rated') {
      setParts.push('is_vat_inclusive = ?');
      values.push(updates.is_vat_inclusive ? 1 : 0);
    }
    if (updates.stock_quantity !== undefined) {
      setParts.push('stock_quantity = ?');
      values.push(updates.stock_quantity);
    }
    if (updates.unit !== undefined) {
      setParts.push('unit = ?');
      values.push(updates.unit);
    }
    if (updates.is_active !== undefined) {
      setParts.push('is_active = ?');
      values.push(updates.is_active ? 1 : 0);
    }

    if (setParts.length > 0) {
      setParts.push('updated_at = CURRENT_TIMESTAMP');
      values.push(productId);

      const result = await db.runAsync(
        `UPDATE products SET ${setParts.join(', ')} WHERE id = ?`,
        values
      );

      console.log(`Product ${productId} updated. Changes affected: ${result.changes}`);
      return result.changes > 0;
    }

    return false;
  }

  // Debug method to check physical count data integrity
  public async debugPhysicalCountData() {
    const db = this.getDatabase();

    try {
      console.log('\n=== PHYSICAL COUNT DEBUG ===');

      // Simple session count check
      const sessionCount = await db.getFirstAsync<{count: number}>(`
        SELECT COUNT(*) as count FROM physical_count_sessions
      `);
      console.log('Total sessions:', sessionCount?.count || 0);

      // Simple details count check
      const detailCount = await db.getFirstAsync<{count: number}>(`
        SELECT COUNT(*) as count FROM physical_count_details
      `);
      console.log('Total details:', detailCount?.count || 0);

      console.log('=== END DEBUG ===\n');
    } catch (error) {
      console.error('Debug method failed:', error);
    }
  }

  public async toggleProductActive(productId: number): Promise<boolean> {
    const db = this.getDatabase();

    // Get current active status
    const product = await db.getFirstAsync<{is_active: number}>(
      'SELECT is_active FROM products WHERE id = ?',
      [productId]
    );

    if (!product) {
      throw new Error(`Product with ID ${productId} not found`);
    }

    const newActiveStatus = product.is_active === 1 ? 0 : 1;

    const result = await db.runAsync(
      'UPDATE products SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newActiveStatus, productId]
    );

    console.log(`Product ${productId} active status toggled to ${newActiveStatus === 1 ? 'active' : 'inactive'}`);
    return result.changes > 0;
  }

  // Method to create test physical count data for demonstration
  public async createTestPhysicalCountData() {
    const db = this.getDatabase();

    try {
      console.log('Creating test physical count data...');

      // Get admin user ID
      const admin = await db.getFirstAsync<any>('SELECT id FROM users WHERE username = "admin"');
      if (!admin) {
        console.log('Admin user not found, cannot create test data');
        return;
      }

      // Get some products to count
      const products = await db.getAllAsync<any>('SELECT id, code, name, stock_quantity, cost FROM products LIMIT 5');
      if (products.length === 0) {
        console.log('No products found, cannot create test data');
        return;
      }

      // Create a test session
      const sessionId = `PC_${Date.now()}`;
      const sessionDate = new Date();
      const startDate = new Date(sessionDate.getTime() - (Math.random() * 30 * 24 * 60 * 60 * 1000)); // Random date in last 30 days

      // Insert physical count session
      await db.runAsync(`
        INSERT INTO physical_count_sessions (
          session_id, date, status, started_by, completed_by, started_at, completed_at,
          total_items, counted_items, discrepancy_count, total_discrepancy_value, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        sessionId,
        startDate.toISOString().split('T')[0], // YYYY-MM-DD format
        'completed',
        admin.id,
        admin.id,
        startDate.toISOString(),
        new Date(startDate.getTime() + (2 * 60 * 60 * 1000)).toISOString(), // 2 hours later
        products.length,
        products.length,
        Math.floor(products.length / 2), // Some discrepancies
        (Math.random() * 1000 - 500).toFixed(2), // Random discrepancy value
        'Test physical count session for demonstration'
      ]);

      // Insert physical count details
      for (const product of products) {
        const systemQty = product.stock_quantity;
        const physicalQty = Math.max(0, systemQty + Math.floor(Math.random() * 20 - 10)); // Random variance
        const discrepancy = physicalQty - systemQty;

        await db.runAsync(`
          INSERT INTO physical_count_details (
            session_id, product_id, product_code, product_name, system_quantity, physical_quantity,
            discrepancy, unit_cost, value_discrepancy, status, counted_by, counted_at, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          sessionId,
          product.id,
          product.code,
          product.name,
          systemQty,
          physicalQty,
          discrepancy,
          product.cost || 10, // Use product cost or default to ₱10
          discrepancy * (product.cost || 10), // Value discrepancy based on cost
          'counted',
          admin.id,
          new Date(startDate.getTime() + (Math.random() * 2 * 60 * 60 * 1000)).toISOString(), // Random time during session
          discrepancy !== 0 ? `Discrepancy of ${discrepancy} units found` : null
        ]);
      }

      console.log(`Created test physical count session ${sessionId} with ${products.length} items`);
      return sessionId;

    } catch (error) {
      console.error('Error creating test physical count data:', error);
      throw error;
    }
  }

  // Clean up all physical inventory data and reset stock quantities
  public async clearPhysicalInventoryData(): Promise<void> {
    const db = this.getDatabase();

    try {
      console.log('Starting physical inventory data cleanup...');

      // Delete all physical count details
      await db.runAsync('DELETE FROM physical_count_details');
      console.log('Cleared physical_count_details table');

      // Delete all physical count sessions
      await db.runAsync('DELETE FROM physical_count_sessions');
      console.log('Cleared physical_count_sessions table');

      // Delete related ejournal entries
      await db.runAsync(`DELETE FROM ejournal WHERE entry_type = 'PHYSICAL_COUNT' OR description LIKE '%Physical inventory%' OR description LIKE '%Physical count%'`);
      console.log('Cleared physical count ejournal entries');

      // Reset all product stock quantities to zero
      await db.runAsync('UPDATE products SET stock_quantity = 0');
      console.log('Reset all product stock quantities to zero');

      // Delete any inventory movements related to physical counts
      await db.runAsync(`DELETE FROM inventory_movements WHERE movement_type = 'ADJUSTMENT' AND reference_type = 'MANUAL_ADJUSTMENT' AND notes LIKE '%PHYSICAL_COUNT%'`);
      console.log('Cleared physical count inventory movements');

      console.log('Physical inventory data cleanup completed successfully!');

    } catch (error) {
      console.error('Error during physical inventory cleanup:', error);
      throw error;
    }
  }

  // ========================================
  // SUPPLIER MANAGEMENT METHODS
  // ========================================

  public async createSupplier(supplierData: {
    code: string;
    name: string;
    contact_person?: string;
    phone?: string;
    email?: string;
    address?: string;
    tin?: string;
    credit_terms?: number;
    credit_limit?: number;
    notes?: string;
  }): Promise<number> {
    const db = this.getDatabase();

    try {
      // Check for duplicate supplier name (case-insensitive, includes inactive)
      const existing = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM suppliers WHERE LOWER(name) = LOWER(?)',
        [supplierData.name.trim()]
      );
      if (existing) {
        throw new Error(`Supplier "${supplierData.name.trim()}" already exists. Please use a unique name.`);
      }

      // Check for duplicate supplier code (case-insensitive, includes inactive)
      const existingCode = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM suppliers WHERE LOWER(code) = LOWER(?)',
        [supplierData.code.trim()]
      );
      if (existingCode) {
        throw new Error(`Supplier code "${supplierData.code.trim()}" already exists. Please use a unique code.`);
      }

      const result = await db.runAsync(
        `INSERT INTO suppliers (code, name, contact_person, phone, email, address, tin, credit_terms, credit_limit, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          supplierData.code.trim(),
          supplierData.name.trim(),
          supplierData.contact_person || null,
          supplierData.phone || null,
          supplierData.email || null,
          supplierData.address || null,
          supplierData.tin || null,
          supplierData.credit_terms || 30,
          supplierData.credit_limit || 0,
          supplierData.notes || null
        ]
      );

      console.log(`Supplier created: ${supplierData.name} (ID: ${result.lastInsertRowId})`);
      return result.lastInsertRowId as number;
    } catch (error) {
      console.error(`Error creating supplier ${supplierData.name}:`, error);
      throw error;
    }
  }

  public async getSuppliers(active_only: boolean = true): Promise<Supplier[]> {
    const db = this.getDatabase();

    try {
      const whereClause = active_only ? 'WHERE is_active = 1' : '';
      const suppliers = await db.getAllAsync<Supplier>(
        `SELECT * FROM suppliers ${whereClause} ORDER BY name`
      );

      console.log(`Found ${suppliers.length} suppliers`);
      return suppliers;
    } catch (error) {
      console.error('Error getting suppliers:', error);
      return [];
    }
  }

  public async getSupplierById(id: number): Promise<Supplier | null> {
    const db = this.getDatabase();

    try {
      const supplier = await db.getFirstAsync<Supplier>(
        'SELECT * FROM suppliers WHERE id = ?',
        [id]
      );
      return supplier || null;
    } catch (error) {
      console.error(`Error getting supplier ${id}:`, error);
      return null;
    }
  }

  public async updateSupplier(id: number, updates: Partial<Supplier>): Promise<boolean> {
    const db = this.getDatabase();

    try {
      // Check for duplicate name if name is being updated
      if (updates.name !== undefined) {
        const existingName = await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM suppliers WHERE LOWER(name) = LOWER(?) AND id != ?',
          [(updates.name as string).trim(), id]
        );
        if (existingName) {
          throw new Error(`Supplier "${(updates.name as string).trim()}" already exists. Please use a unique name.`);
        }
      }
      // Check for duplicate code if code is being updated
      if (updates.code !== undefined) {
        const existingCode = await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM suppliers WHERE LOWER(code) = LOWER(?) AND id != ?',
          [(updates.code as string).trim(), id]
        );
        if (existingCode) {
          throw new Error(`Supplier code "${(updates.code as string).trim()}" already exists. Please use a unique code.`);
        }
      }

      const setParts = [];
      const values = [];

      for (const [key, value] of Object.entries(updates)) {
        if (key !== 'id' && key !== 'created_at' && value !== undefined) {
          setParts.push(`${key} = ?`);
          values.push(typeof value === 'string' ? value.trim() : value);
        }
      }

      if (setParts.length > 0) {
        setParts.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        const result = await db.runAsync(
          `UPDATE suppliers SET ${setParts.join(', ')} WHERE id = ?`,
          values
        );

        return result.changes > 0;
      }

      return false;
    } catch (error) {
      console.error(`Error updating supplier ${id}:`, error);
      throw error;
    }
  }

  // ========================================
  // PURCHASE ORDER MANAGEMENT METHODS
  // ========================================

  public async createPurchaseOrder(purchaseData: {
    supplier_id: number;
    expected_delivery_date?: string;
    reference_number?: string;
    payment_terms?: string;
    notes?: string;
    created_by: number;
    items: Array<{
      product_id: number;
      product_code: string;
      product_name: string;
      quantity_ordered: number;
      unit_cost: number;
      discount_amount?: number;
      tax_amount?: number;
    }>;
  }): Promise<{ purchaseId: number; purchaseNumber: string }> {
    const db = this.getDatabase();

    try {
      const purchaseNumber = await getNextPurchaseNumber(db);
      const today = getPhilippineDateString();

      // Calculate totals
      let subtotal = 0;
      let totalTax = 0;
      let totalDiscount = 0;

      for (const item of purchaseData.items) {
        const itemTotal = item.quantity_ordered * item.unit_cost;
        subtotal += itemTotal;
        totalTax += item.tax_amount || 0;
        totalDiscount += item.discount_amount || 0;
      }

      const total = subtotal + totalTax - totalDiscount;

      let purchaseId: number;

      await db.withTransactionAsync(async () => {
        // Create purchase order
        const phDateTime = getPhilippineDateTimeString();
        const purchaseResult = await db.runAsync(
          `INSERT INTO purchases (
            purchase_number, supplier_id, purchase_date, expected_delivery_date,
            reference_number, subtotal, tax_amount, discount_amount, total_amount,
            balance_amount, payment_terms, notes, created_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            purchaseNumber,
            purchaseData.supplier_id,
            today,
            purchaseData.expected_delivery_date || null,
            purchaseData.reference_number || null,
            subtotal,
            totalTax,
            totalDiscount,
            total,
            total, // Initial balance equals total
            purchaseData.payment_terms || '30 days',
            purchaseData.notes || null,
            purchaseData.created_by,
            phDateTime
          ]
        );

        purchaseId = purchaseResult.lastInsertRowId as number;

        // Create purchase details
        for (const item of purchaseData.items) {
          const itemTotal = (item.quantity_ordered * item.unit_cost) + (item.tax_amount || 0) - (item.discount_amount || 0);

          await db.runAsync(
            `INSERT INTO purchase_details (
              purchase_id, product_id, product_code, product_name,
              quantity_ordered, unit_cost, discount_amount, tax_amount, total_amount
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              purchaseId,
              item.product_id,
              item.product_code,
              item.product_name,
              item.quantity_ordered,
              item.unit_cost,
              item.discount_amount || 0,
              item.tax_amount || 0,
              itemTotal
            ]
          );
        }

        // Create accounts payable entry
        const dueDate = new Date();
        const creditTerms = await this.getSupplierById(purchaseData.supplier_id);
        if (creditTerms?.credit_terms) {
          dueDate.setDate(dueDate.getDate() + creditTerms.credit_terms);
        } else {
          dueDate.setDate(dueDate.getDate() + 30); // Default 30 days
        }

        await db.runAsync(
          `INSERT INTO accounts_payable (
            purchase_id, supplier_id, invoice_date, due_date,
            original_amount, balance_amount
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            purchaseId,
            purchaseData.supplier_id,
            today,
            dueDate.toISOString().split('T')[0],
            total,
            total
          ]
        );

        // Add eJournal entry with Philippine time
        const phDateTimeEJ = getPhilippineDateTimeString();
        await db.runAsync(
          `INSERT INTO ejournal (entry_type, reference_number, description, amount, cashier_id, timestamp, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            'SYSTEM',
            purchaseNumber,
            `Purchase order created - ${purchaseNumber}`,
            total,
            purchaseData.created_by,
            phDateTimeEJ,
            phDateTimeEJ
          ]
        );

        // Update purchase number
        await updatePurchaseNumber(db, purchaseNumber);
      });

      return { purchaseId: purchaseId!, purchaseNumber };
    } catch (error) {
      console.error('Error creating purchase order:', error);
      throw error;
    }
  }

  public async getPurchaseOrders(limit?: number): Promise<any[]> {
    const db = this.getDatabase();

    try {
      const query = `
        SELECT
          p.*,
          p.status as payment_status,
          s.name as supplier_name,
          s.contact_person,
          u.full_name as created_by_name
        FROM purchases p
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        LEFT JOIN users u ON p.created_by = u.id
        ORDER BY p.created_at DESC
        ${limit ? `LIMIT ${limit}` : ''}
      `;

      return await db.getAllAsync(query);
    } catch (error) {
      console.error('Error getting purchase orders:', error);
      return [];
    }
  }

  public async getPurchaseOrderById(id: number): Promise<any> {
    const db = this.getDatabase();

    try {
      const purchase = await db.getFirstAsync(
        `SELECT
          p.*,
          p.status as payment_status,
          s.name as supplier_name,
          s.contact_person,
          s.phone,
          s.email,
          s.address,
          u.full_name as created_by_name
        FROM purchases p
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        LEFT JOIN users u ON p.created_by = u.id
        WHERE p.id = ?`,
        [id]
      );

      if (purchase) {
        // Get purchase details
        const details = await db.getAllAsync(
          `SELECT pd.*, p.name as product_name_current
           FROM purchase_details pd
           LEFT JOIN products p ON pd.product_id = p.id
           WHERE pd.purchase_id = ?
           ORDER BY pd.product_name`,
          [id]
        );

        purchase.items = details;
      }

      return purchase;
    } catch (error) {
      console.error(`Error getting purchase order ${id}:`, error);
      return null;
    }
  }

  public async getAllPurchaseDetails(): Promise<any[]> {
    const db = this.getDatabase();
    try {
      return await db.getAllAsync(
        `SELECT pd.*, p.name as product_name_current
         FROM purchase_details pd
         LEFT JOIN products p ON pd.product_id = p.id
         ORDER BY pd.purchase_id, pd.product_name`
      );
    } catch (error) {
      console.error('Error getting all purchase details:', error);
      return [];
    }
  }

  public async updatePurchaseOrder(
    purchaseId: number,
    purchaseData: {
      supplier_id: number;
      expected_delivery_date?: string;
      reference_number?: string;
      payment_terms?: string;
      notes?: string;
      items: Array<{
        product_id: number;
        product_code: string;
        product_name: string;
        quantity_ordered: number;
        unit_cost: number;
        discount_amount?: number;
        tax_amount?: number;
      }>;
    }
  ): Promise<{ success: boolean; message: string }> {
    const db = this.getDatabase();

    try {
      // Verify the purchase order exists and is in DRAFT status
      const existingPurchase = await db.getFirstAsync<any>(
        'SELECT id, status FROM purchases WHERE id = ?',
        [purchaseId]
      );

      if (!existingPurchase) {
        return { success: false, message: 'Purchase order not found' };
      }

      if (existingPurchase.status !== 'DRAFT') {
        return { success: false, message: 'Only DRAFT purchase orders can be edited' };
      }

      // Calculate totals
      let subtotal = 0;
      let totalTax = 0;
      let totalDiscount = 0;

      for (const item of purchaseData.items) {
        const itemTotal = item.quantity_ordered * item.unit_cost;
        subtotal += itemTotal;
        totalTax += item.tax_amount || 0;
        totalDiscount += item.discount_amount || 0;
      }

      const totalAmount = subtotal + totalTax - totalDiscount;

      await db.withTransactionAsync(async () => {
        // Update purchase header
        await db.runAsync(
          `UPDATE purchases SET
            supplier_id = ?,
            expected_delivery_date = ?,
            reference_number = ?,
            payment_terms = ?,
            notes = ?,
            subtotal = ?,
            tax_amount = ?,
            discount_amount = ?,
            total_amount = ?,
            updated_at = datetime('now', '+8 hours')
          WHERE id = ?`,
          [
            purchaseData.supplier_id,
            purchaseData.expected_delivery_date || null,
            purchaseData.reference_number || null,
            purchaseData.payment_terms || '30 days',
            purchaseData.notes || null,
            subtotal,
            totalTax,
            totalDiscount,
            totalAmount,
            purchaseId
          ]
        );

        // Delete existing purchase details
        await db.runAsync(
          'DELETE FROM purchase_details WHERE purchase_id = ?',
          [purchaseId]
        );

        // Insert new purchase details
        for (const item of purchaseData.items) {
          const itemTotal = item.quantity_ordered * item.unit_cost;
          const taxAmount = item.tax_amount || 0;
          const discountAmount = item.discount_amount || 0;
          const lineTotal = itemTotal + taxAmount - discountAmount;

          await db.runAsync(
            `INSERT INTO purchase_details (
              purchase_id, product_id, product_code, product_name,
              quantity_ordered, quantity_received, unit_cost,
              discount_amount, tax_amount, total_amount
            ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
            [
              purchaseId,
              item.product_id,
              item.product_code,
              item.product_name,
              item.quantity_ordered,
              item.unit_cost,
              discountAmount,
              taxAmount,
              lineTotal
            ]
          );
        }
      });

      return { success: true, message: 'Purchase order updated successfully' };
    } catch (error) {
      console.error('Error updating purchase order:', error);
      return { success: false, message: `Failed to update purchase order: ${error}` };
    }
  }

  public async receivePurchaseOrder(
    purchaseId: number,
    receivedBy: number,
    items: Array<{
      product_id: number;
      quantity_received: number;
    }>
  ): Promise<void> {
    const db = this.getDatabase();

    try {
      await db.withTransactionAsync(async () => {
        // Get purchase information
        const purchase = await db.getFirstAsync<any>(
          'SELECT purchase_number FROM purchases WHERE id = ?',
          [purchaseId]
        );

        // Update purchase details with received quantities
        for (const item of items) {
          await db.runAsync(
            'UPDATE purchase_details SET quantity_received = quantity_received + ? WHERE purchase_id = ? AND product_id = ?',
            [item.quantity_received, purchaseId, item.product_id]
          );

          // Update product stock and cost
          const purchaseDetail = await db.getFirstAsync<any>(
            'SELECT unit_cost FROM purchase_details WHERE purchase_id = ? AND product_id = ?',
            [purchaseId, item.product_id]
          );

          if (purchaseDetail) {
            // Record inventory movement with before/after tracking
            await this.recordInventoryMovement({
              product_id: item.product_id,
              movement_type: 'IN',
              quantity: item.quantity_received,
              reference_type: 'PURCHASE',
              reference_id: purchaseId,
              reference_number: purchase?.purchase_number,
              notes: `Purchase receiving - PO #${purchase?.purchase_number}`,
              created_by: receivedBy
            });

            // Update product cost with the purchase cost
            await db.runAsync(
              'UPDATE products SET cost = ? WHERE id = ?',
              [purchaseDetail.unit_cost, item.product_id]
            );
          }
        }

        // Check if all items are fully received
        const pendingItems = await db.getFirstAsync<{count: number}>(
          'SELECT COUNT(*) as count FROM purchase_details WHERE purchase_id = ? AND quantity_received < quantity_ordered',
          [purchaseId]
        );

        const newStatus = (pendingItems?.count || 0) > 0 ? 'PARTIALLY_RECEIVED' : 'RECEIVED';

        // Update purchase status with Philippine time
        const phDateTime = getPhilippineDateTimeString();
        await db.runAsync(
          'UPDATE purchases SET status = ?, received_by = ?, updated_at = ? WHERE id = ?',
          [newStatus, receivedBy, phDateTime, purchaseId]
        );

        // Add eJournal entry with Philippine time
        if (purchase) {
          await db.runAsync(
            `INSERT INTO ejournal (entry_type, reference_number, description, cashier_id, timestamp, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              'SYSTEM',
              purchase.purchase_number,
              `Purchase ${newStatus.toLowerCase()} - ${purchase.purchase_number}`,
              receivedBy,
              phDateTime,
              phDateTime
            ]
          );
        }
      });
    } catch (error) {
      console.error(`Error receiving purchase order ${purchaseId}:`, error);
      throw error;
    }
  }

  // ========================================
  // SUPPLIER PAYMENT METHODS
  // ========================================

  public async createSupplierPayment(paymentData: {
    supplier_id: number;
    purchase_id?: number;
    payment_method: 'CASH' | 'CHECK' | 'BANK_TRANSFER' | 'CREDIT_CARD' | 'ONLINE';
    reference_number?: string;
    amount: number;
    notes?: string;
    created_by: number;
  }): Promise<{ paymentId: number; paymentNumber: string }> {
    const db = this.getDatabase();

    try {
      const paymentNumber = await getNextPaymentNumber(db);
      const today = getPhilippineDateString();

      let paymentId: number;

      await db.withTransactionAsync(async () => {
        // Create payment record
        const paymentResult = await db.runAsync(
          `INSERT INTO supplier_payments (
            payment_number, supplier_id, purchase_id, payment_date,
            payment_method, reference_number, amount, notes, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            paymentNumber,
            paymentData.supplier_id,
            paymentData.purchase_id || null,
            today,
            paymentData.payment_method,
            paymentData.reference_number || null,
            paymentData.amount,
            paymentData.notes || null,
            paymentData.created_by
          ]
        );

        paymentId = paymentResult.lastInsertRowId as number;

        // Update accounts payable if payment is for a specific purchase
        const phDateTimePayment = getPhilippineDateTimeString();
        if (paymentData.purchase_id) {
          await db.runAsync(
            'UPDATE accounts_payable SET paid_amount = paid_amount + ?, balance_amount = balance_amount - ?, updated_at = ? WHERE purchase_id = ?',
            [paymentData.amount, paymentData.amount, phDateTimePayment, paymentData.purchase_id]
          );

          // Update purchase paid amount
          await db.runAsync(
            'UPDATE purchases SET paid_amount = paid_amount + ?, balance_amount = balance_amount - ?, updated_at = ? WHERE id = ?',
            [paymentData.amount, paymentData.amount, phDateTimePayment, paymentData.purchase_id]
          );

          // Check if fully paid
          const purchase = await db.getFirstAsync<{balance_amount: number}>(
            'SELECT balance_amount FROM purchases WHERE id = ?',
            [paymentData.purchase_id]
          );

          if (purchase && purchase.balance_amount <= 0) {
            await db.runAsync(
              'UPDATE accounts_payable SET status = ? WHERE purchase_id = ?',
              ['PAID', paymentData.purchase_id]
            );
          } else if (purchase && purchase.balance_amount > 0) {
            // Balance is still positive, so it's partially paid
            await db.runAsync(
              'UPDATE accounts_payable SET status = ? WHERE purchase_id = ?',
              ['PARTIALLY_PAID', paymentData.purchase_id]
            );
          }
        }

        // Add eJournal entry with Philippine time
        const phDateTime = getPhilippineDateTimeString();
        await db.runAsync(
          `INSERT INTO ejournal (entry_type, reference_number, description, amount, cashier_id, timestamp, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            'SYSTEM',
            paymentNumber,
            `Supplier payment - ${paymentNumber}`,
            paymentData.amount,
            paymentData.created_by,
            phDateTime,
            phDateTime
          ]
        );

        // Update payment number
        await updatePaymentNumber(db, paymentNumber);
      });

      return { paymentId: paymentId!, paymentNumber };
    } catch (error) {
      console.error('Error creating supplier payment:', error);
      throw error;
    }
  }

  public async getSupplierPayments(supplierId?: number, limit?: number): Promise<any[]> {
    const db = this.getDatabase();

    try {
      let whereClause = '';
      const params: any[] = [];

      if (supplierId) {
        whereClause = 'WHERE sp.supplier_id = ?';
        params.push(supplierId);
      }

      const query = `
        SELECT
          sp.*,
          s.name as supplier_name,
          p.purchase_number,
          u.full_name as created_by_name
        FROM supplier_payments sp
        JOIN suppliers s ON sp.supplier_id = s.id
        LEFT JOIN purchases p ON sp.purchase_id = p.id
        JOIN users u ON sp.created_by = u.id
        ${whereClause}
        ORDER BY sp.payment_date DESC, sp.created_at DESC
        ${limit ? `LIMIT ${limit}` : ''}
      `;

      return await db.getAllAsync(query, params);
    } catch (error) {
      console.error('Error getting supplier payments:', error);
      return [];
    }
  }

  // ========================================
  // PDC (POST-DATED CHEQUE) TRACKING METHODS
  // ========================================

  /**
   * Get all cheque payments for PDC tracking
   */
  public async getChequePayments(status?: string): Promise<any[]> {
    const db = this.getDatabase();

    try {
      let whereClause = "WHERE sp.payment_method = 'CHEQUE'";
      const params: any[] = [];

      if (status && status !== 'ALL') {
        whereClause += ' AND sp.cheque_status = ?';
        params.push(status);
      }

      const query = `
        SELECT
          sp.*,
          s.name as supplier_name,
          p.purchase_number,
          u.full_name as created_by_name
        FROM supplier_payments sp
        JOIN suppliers s ON sp.supplier_id = s.id
        LEFT JOIN purchases p ON sp.purchase_id = p.id
        JOIN users u ON sp.created_by = u.id
        ${whereClause}
        ORDER BY sp.cheque_date ASC, sp.created_at DESC
      `;

      return await db.getAllAsync(query, params);
    } catch (error) {
      console.error('Error getting cheque payments:', error);
      return [];
    }
  }

  /**
   * Update cheque status (for PDC tracking)
   */
  public async updateChequeStatus(
    paymentId: number,
    newStatus: 'DEPOSITED' | 'CLEARED' | 'BOUNCED',
    options?: {
      bounced_reason?: string;
      updated_by?: number;
    }
  ): Promise<boolean> {
    const db = this.getDatabase();

    try {
      // Get current payment details
      const payment = await db.getFirstAsync<any>(
        `SELECT sp.*, s.name as supplier_name
         FROM supplier_payments sp
         JOIN suppliers s ON sp.supplier_id = s.id
         WHERE sp.id = ? AND sp.payment_method = 'CHEQUE'`,
        [paymentId]
      );

      if (!payment) {
        throw new Error('Cheque payment not found');
      }

      const oldStatus = payment.cheque_status;
      const now = getPhilippineDateTimeString();

      // Update status and date fields
      let updateQuery = 'UPDATE supplier_payments SET cheque_status = ?';
      const updateParams: any[] = [newStatus];

      if (newStatus === 'DEPOSITED') {
        updateQuery += ', deposited_date = ?';
        updateParams.push(now);
      } else if (newStatus === 'CLEARED') {
        updateQuery += ', cleared_date = ?';
        updateParams.push(now);
      } else if (newStatus === 'BOUNCED') {
        updateQuery += ', bounced_date = ?, bounced_reason = ?';
        updateParams.push(now);
        updateParams.push(options?.bounced_reason || 'OTHER');
      }

      updateQuery += ' WHERE id = ?';
      updateParams.push(paymentId);

      await db.runAsync(updateQuery, updateParams);

      // Handle BOUNCED cheque - restore AP balance
      if (newStatus === 'BOUNCED') {
        if (payment.purchase_id) {
          // Restore specific purchase AP
          await db.runAsync(
            `UPDATE accounts_payable
             SET paid_amount = MAX(0, paid_amount - ?),
                 balance_amount = balance_amount + ?,
                 status = CASE WHEN balance_amount + ? > 0 THEN 'OUTSTANDING' ELSE status END
             WHERE purchase_id = ?`,
            [payment.amount, payment.amount, payment.amount, payment.purchase_id]
          );
        } else {
          // Restore to oldest unpaid AP for this supplier
          const oldestAP = await db.getFirstAsync<{ id: number }>(
            `SELECT id FROM accounts_payable
             WHERE supplier_id = ? AND balance_amount > 0
             ORDER BY created_at ASC LIMIT 1`,
            [payment.supplier_id]
          );

          if (oldestAP) {
            await db.runAsync(
              `UPDATE accounts_payable
               SET paid_amount = MAX(0, paid_amount - ?),
                   balance_amount = balance_amount + ?,
                   status = 'OUTSTANDING'
               WHERE id = ?`,
              [payment.amount, payment.amount, oldestAP.id]
            );
          }
        }

        // Create eJournal entry for bounced cheque
        await db.runAsync(
          `INSERT INTO ejournal (entry_type, reference_number, description, amount, cashier_id, timestamp, created_at)
           VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))`,
          [
            'SYSTEM',
            payment.payment_number,
            `Bounced cheque from ${payment.supplier_name} - ${payment.cheque_number}`,
            payment.amount,
            options?.updated_by || 1
          ]
        );

        console.log(`[PDC] Cheque ${payment.cheque_number} bounced, restored ₱${payment.amount} to AP`);
      }

      // Create status change journal entry
      await db.runAsync(
        `INSERT INTO ejournal (entry_type, reference_number, description, amount, cashier_id, timestamp, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))`,
        [
          'SYSTEM',
          payment.payment_number,
          `Cheque ${payment.cheque_number} status: ${oldStatus} → ${newStatus}`,
          0,
          options?.updated_by || 1
        ]
      );

      return true;
    } catch (error) {
      console.error('Error updating cheque status:', error);
      throw error;
    }
  }

  /**
   * Get PDC alerts (cheques due soon or past due)
   */
  public async getPDCAlerts(daysAhead: number = 7): Promise<any[]> {
    const db = this.getDatabase();

    try {
      // Get pending cheques with their due status
      const query = `
        SELECT
          sp.*,
          s.name as supplier_name,
          CAST(julianday(sp.cheque_date) - julianday('now', 'localtime') AS INTEGER) as days_diff
        FROM supplier_payments sp
        JOIN suppliers s ON sp.supplier_id = s.id
        WHERE sp.payment_method = 'CHEQUE'
          AND sp.cheque_status = 'PENDING'
          AND sp.cheque_date IS NOT NULL
          AND CAST(julianday(sp.cheque_date) - julianday('now', 'localtime') AS INTEGER) <= ?
        ORDER BY sp.cheque_date ASC
      `;

      const cheques = await db.getAllAsync<any>(query, [daysAhead]);

      // Transform to alerts
      const alerts = cheques.map(cheque => {
        const daysDiff = cheque.days_diff;

        if (daysDiff < 0) {
          return {
            ...cheque,
            alert_type: 'PAST_DUE',
            days_overdue: Math.abs(daysDiff),
            days_until_due: null,
            priority: 'HIGH',
          };
        } else {
          return {
            ...cheque,
            alert_type: 'DUE_SOON',
            days_overdue: null,
            days_until_due: daysDiff,
            priority: daysDiff <= 3 ? 'MEDIUM' : 'LOW',
          };
        }
      });

      // Sort by priority (past due first, then by date)
      return alerts.sort((a, b) => {
        if (a.alert_type !== b.alert_type) {
          return a.alert_type === 'PAST_DUE' ? -1 : 1;
        }
        return (a.days_overdue || 0) - (b.days_overdue || 0) || (a.days_until_due || 0) - (b.days_until_due || 0);
      });
    } catch (error) {
      console.error('Error getting PDC alerts:', error);
      return [];
    }
  }

  // ========================================
  // ACCOUNTS PAYABLE METHODS
  // ========================================

  public async getAccountsPayable(supplierIdOrStatus?: number | string): Promise<any[]> {
    const db = this.getDatabase();

    try {
      const whereClauses: string[] = [];
      const params: any[] = [];

      if (supplierIdOrStatus !== undefined) {
        if (typeof supplierIdOrStatus === 'number') {
          // Filter by supplier ID
          whereClauses.push('ap.supplier_id = ?');
          params.push(supplierIdOrStatus);
        } else {
          // Filter by status string
          whereClauses.push('ap.status = ?');
          params.push(supplierIdOrStatus);
        }
      }

      const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const query = `
        SELECT
          ap.*,
          p.purchase_number,
          p.reference_number,
          s.name as supplier_name,
          s.contact_person,
          s.phone,
          CASE
            WHEN ap.due_date < date('now') AND ap.balance_amount > 0 THEN 'OVERDUE'
            ELSE ap.status
          END as current_status,
          CAST(julianday('now') - julianday(ap.due_date) AS INTEGER) as days_past_due
        FROM accounts_payable ap
        JOIN purchases p ON ap.purchase_id = p.id
        JOIN suppliers s ON ap.supplier_id = s.id
        ${whereClause}
        ORDER BY ap.due_date ASC, ap.balance_amount DESC
      `;

      return await db.getAllAsync(query, params);
    } catch (error) {
      console.error('Error getting accounts payable:', error);
      return [];
    }
  }

  public async getAccountsPayableAging(): Promise<any> {
    const db = this.getDatabase();

    try {
      const result = await db.getFirstAsync<any>(`
        SELECT
          COUNT(*) as total_invoices,
          SUM(balance_amount) as total_outstanding,
          SUM(CASE WHEN julianday('now') - julianday(due_date) <= 30 THEN balance_amount ELSE 0 END) as current_0_30,
          SUM(CASE WHEN julianday('now') - julianday(due_date) BETWEEN 31 AND 60 THEN balance_amount ELSE 0 END) as aged_31_60,
          SUM(CASE WHEN julianday('now') - julianday(due_date) BETWEEN 61 AND 90 THEN balance_amount ELSE 0 END) as aged_61_90,
          SUM(CASE WHEN julianday('now') - julianday(due_date) > 90 THEN balance_amount ELSE 0 END) as aged_over_90,
          COUNT(CASE WHEN julianday('now') - julianday(due_date) <= 30 THEN 1 END) as count_0_30,
          COUNT(CASE WHEN julianday('now') - julianday(due_date) BETWEEN 31 AND 60 THEN 1 END) as count_31_60,
          COUNT(CASE WHEN julianday('now') - julianday(due_date) BETWEEN 61 AND 90 THEN 1 END) as count_61_90,
          COUNT(CASE WHEN julianday('now') - julianday(due_date) > 90 THEN 1 END) as count_over_90
        FROM accounts_payable
        WHERE balance_amount > 0
      `);

      return result || {
        total_invoices: 0,
        total_outstanding: 0,
        current_0_30: 0,
        aged_31_60: 0,
        aged_61_90: 0,
        aged_over_90: 0,
        count_0_30: 0,
        count_31_60: 0,
        count_61_90: 0,
        count_over_90: 0
      };
    } catch (error) {
      console.error('Error getting accounts payable aging:', error);
      return {
        total_invoices: 0,
        total_outstanding: 0,
        current_0_30: 0,
        aged_31_60: 0,
        aged_61_90: 0,
        aged_over_90: 0,
        count_0_30: 0,
        count_31_60: 0,
        count_61_90: 0,
        count_over_90: 0
      };
    }
  }

  // ========================================
  // SUPPLIER ACCOUNT STATEMENT METHODS
  // ========================================

  /**
   * Get supplier purchases with items for a date range
   * Used for Supplier Account Statement - Purchases tab
   */
  public async getSupplierPurchasesWithItems(
    supplierId: number,
    startDate: string,
    endDate: string
  ): Promise<any[]> {
    const db = this.getDatabase();

    try {
      // Get purchases for the supplier within date range
      const purchases = await db.getAllAsync<any>(
        `SELECT
          p.*,
          s.name as supplier_name,
          s.code as supplier_code,
          u.full_name as created_by_name,
          ru.full_name as received_by_name
         FROM purchases p
         LEFT JOIN suppliers s ON p.supplier_id = s.id
         LEFT JOIN users u ON p.created_by = u.id
         LEFT JOIN users ru ON p.received_by = ru.id
         WHERE p.supplier_id = ?
           AND DATE(p.purchase_date) >= DATE(?)
           AND DATE(p.purchase_date) <= DATE(?)
           AND p.status NOT IN ('CANCELLED', 'DRAFT')
         ORDER BY p.purchase_date DESC, p.created_at DESC`,
        [supplierId, startDate, endDate]
      );

      // Get items for each purchase
      for (const purchase of purchases) {
        const items = await db.getAllAsync<any>(
          `SELECT
            pd.*,
            pr.name as product_name,
            pr.code as product_code
           FROM purchase_details pd
           LEFT JOIN products pr ON pd.product_id = pr.id
           WHERE pd.purchase_id = ?`,
          [purchase.id]
        );
        purchase.items = items;
      }

      return purchases;
    } catch (error) {
      console.error('Error getting supplier purchases with items:', error);
      return [];
    }
  }

  /**
   * Get supplier payments for a date range (including cheque details)
   * Used for Supplier Account Statement - Payments tab
   */
  public async getSupplierPaymentsByDateRange(
    supplierId: number,
    startDate: string,
    endDate: string
  ): Promise<any[]> {
    const db = this.getDatabase();

    try {
      const payments = await db.getAllAsync<any>(
        `SELECT
          sp.*,
          s.name as supplier_name,
          s.code as supplier_code,
          p.purchase_number,
          p.total_amount as purchase_total,
          u.full_name as created_by_name
         FROM supplier_payments sp
         LEFT JOIN suppliers s ON sp.supplier_id = s.id
         LEFT JOIN purchases p ON sp.purchase_id = p.id
         LEFT JOIN users u ON sp.created_by = u.id
         WHERE sp.supplier_id = ?
           AND DATE(sp.payment_date) >= DATE(?)
           AND DATE(sp.payment_date) <= DATE(?)
         ORDER BY sp.payment_date DESC, sp.created_at DESC`,
        [supplierId, startDate, endDate]
      );

      return payments;
    } catch (error) {
      console.error('Error getting supplier payments by date range:', error);
      return [];
    }
  }

  /**
   * Get supplier balance summary
   * Used for Supplier Account Statement - Summary section
   */
  public async getSupplierBalanceSummary(supplierId: number): Promise<{
    totalPurchases: number;
    totalPayments: number;
    currentBalance: number;
    purchaseCount: number;
    paidPurchases: number;
    unpaidPurchases: number;
    pendingCheques: number;
    pendingChequeAmount: number;
  }> {
    const db = this.getDatabase();

    try {
      // Total purchases (all non-cancelled purchases)
      const purchasesResult = await db.getFirstAsync<any>(
        `SELECT
          COALESCE(SUM(total_amount), 0) as total,
          COUNT(*) as count
         FROM purchases
         WHERE supplier_id = ?
           AND status NOT IN ('CANCELLED', 'DRAFT')`,
        [supplierId]
      );

      // Total payments made
      const paymentsResult = await db.getFirstAsync<any>(
        `SELECT COALESCE(SUM(amount), 0) as total
         FROM supplier_payments
         WHERE supplier_id = ?`,
        [supplierId]
      );

      // Get AP summary
      const apResult = await db.getFirstAsync<any>(
        `SELECT
          COALESCE(SUM(balance_amount), 0) as balance,
          COUNT(CASE WHEN status = 'PAID' THEN 1 END) as paid,
          COUNT(CASE WHEN status != 'PAID' THEN 1 END) as unpaid
         FROM accounts_payable
         WHERE supplier_id = ?`,
        [supplierId]
      );

      // Pending cheques (PDC)
      const chequeResult = await db.getFirstAsync<any>(
        `SELECT
          COUNT(*) as count,
          COALESCE(SUM(amount), 0) as total
         FROM supplier_payments
         WHERE supplier_id = ?
           AND payment_method = 'CHEQUE'
           AND cheque_status = 'PENDING'`,
        [supplierId]
      );

      return {
        totalPurchases: purchasesResult?.total || 0,
        totalPayments: paymentsResult?.total || 0,
        currentBalance: apResult?.balance || 0,
        purchaseCount: purchasesResult?.count || 0,
        paidPurchases: apResult?.paid || 0,
        unpaidPurchases: apResult?.unpaid || 0,
        pendingCheques: chequeResult?.count || 0,
        pendingChequeAmount: chequeResult?.total || 0,
      };
    } catch (error) {
      console.error('Error getting supplier balance summary:', error);
      return {
        totalPurchases: 0,
        totalPayments: 0,
        currentBalance: 0,
        purchaseCount: 0,
        paidPurchases: 0,
        unpaidPurchases: 0,
        pendingCheques: 0,
        pendingChequeAmount: 0,
      };
    }
  }

  /**
   * Get upcoming PDCs for funding report
   * Shows pending cheques grouped by maturity timeframe
   */
  public async getUpcomingPDCs(options?: {
    daysAhead?: number;
    startDate?: string;
    endDate?: string;
    supplierId?: number;
  }): Promise<any[]> {
    const db = this.getDatabase();

    try {
      const whereClauses: string[] = [
        "sp.payment_method = 'CHEQUE'",
        "sp.cheque_status = 'PENDING'",
        "sp.cheque_date IS NOT NULL"
      ];
      const params: any[] = [];

      if (options?.supplierId) {
        whereClauses.push('sp.supplier_id = ?');
        params.push(options.supplierId);
      }

      if (options?.startDate && options?.endDate) {
        whereClauses.push("DATE(sp.cheque_date) >= DATE(?)");
        whereClauses.push("DATE(sp.cheque_date) <= DATE(?)");
        params.push(options.startDate, options.endDate);
      } else if (options?.daysAhead) {
        whereClauses.push(`DATE(sp.cheque_date) <= DATE('now', '+${options.daysAhead} days')`);
      }

      const query = `
        SELECT
          sp.*,
          s.name as supplier_name,
          s.code as supplier_code,
          p.purchase_number,
          CAST(julianday(sp.cheque_date) - julianday('now', 'localtime') AS INTEGER) as days_until_due,
          CASE
            WHEN DATE(sp.cheque_date) < DATE('now', 'localtime') THEN 'OVERDUE'
            WHEN CAST(julianday(sp.cheque_date) - julianday('now', 'localtime') AS INTEGER) <= 3 THEN 'DUE_SOON'
            WHEN CAST(julianday(sp.cheque_date) - julianday('now', 'localtime') AS INTEGER) <= 7 THEN 'THIS_WEEK'
            ELSE 'UPCOMING'
          END as urgency
        FROM supplier_payments sp
        JOIN suppliers s ON sp.supplier_id = s.id
        LEFT JOIN purchases p ON sp.purchase_id = p.id
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY sp.cheque_date ASC, sp.amount DESC
      `;

      return await db.getAllAsync(query, params);
    } catch (error) {
      console.error('Error getting upcoming PDCs:', error);
      return [];
    }
  }

  /**
   * Get PDC summary by time period for funding planning
   */
  public async getPDCSummaryByPeriod(): Promise<{
    overdue: { count: number; amount: number };
    thisWeek: { count: number; amount: number };
    nextWeek: { count: number; amount: number };
    thisMonth: { count: number; amount: number };
    total: { count: number; amount: number };
  }> {
    const db = this.getDatabase();

    try {
      const result = await db.getFirstAsync<any>(`
        SELECT
          COUNT(CASE WHEN DATE(cheque_date) < DATE('now', 'localtime') THEN 1 END) as overdue_count,
          COALESCE(SUM(CASE WHEN DATE(cheque_date) < DATE('now', 'localtime') THEN amount ELSE 0 END), 0) as overdue_amount,
          COUNT(CASE WHEN DATE(cheque_date) >= DATE('now', 'localtime') AND DATE(cheque_date) <= DATE('now', 'localtime', '+7 days') THEN 1 END) as week_count,
          COALESCE(SUM(CASE WHEN DATE(cheque_date) >= DATE('now', 'localtime') AND DATE(cheque_date) <= DATE('now', 'localtime', '+7 days') THEN amount ELSE 0 END), 0) as week_amount,
          COUNT(CASE WHEN DATE(cheque_date) > DATE('now', 'localtime', '+7 days') AND DATE(cheque_date) <= DATE('now', 'localtime', '+14 days') THEN 1 END) as next_week_count,
          COALESCE(SUM(CASE WHEN DATE(cheque_date) > DATE('now', 'localtime', '+7 days') AND DATE(cheque_date) <= DATE('now', 'localtime', '+14 days') THEN amount ELSE 0 END), 0) as next_week_amount,
          COUNT(CASE WHEN DATE(cheque_date) > DATE('now', 'localtime', '+14 days') AND DATE(cheque_date) <= DATE('now', 'localtime', '+30 days') THEN 1 END) as month_count,
          COALESCE(SUM(CASE WHEN DATE(cheque_date) > DATE('now', 'localtime', '+14 days') AND DATE(cheque_date) <= DATE('now', 'localtime', '+30 days') THEN amount ELSE 0 END), 0) as month_amount,
          COUNT(*) as total_count,
          COALESCE(SUM(amount), 0) as total_amount
        FROM supplier_payments
        WHERE payment_method = 'CHEQUE'
          AND cheque_status = 'PENDING'
          AND cheque_date IS NOT NULL
      `);

      return {
        overdue: { count: result?.overdue_count || 0, amount: result?.overdue_amount || 0 },
        thisWeek: { count: result?.week_count || 0, amount: result?.week_amount || 0 },
        nextWeek: { count: result?.next_week_count || 0, amount: result?.next_week_amount || 0 },
        thisMonth: { count: result?.month_count || 0, amount: result?.month_amount || 0 },
        total: { count: result?.total_count || 0, amount: result?.total_amount || 0 },
      };
    } catch (error) {
      console.error('Error getting PDC summary by period:', error);
      return {
        overdue: { count: 0, amount: 0 },
        thisWeek: { count: 0, amount: 0 },
        nextWeek: { count: 0, amount: 0 },
        thisMonth: { count: 0, amount: 0 },
        total: { count: 0, amount: 0 },
      };
    }
  }

  // ========================================
  // DAMAGED ITEMS MANAGEMENT METHODS
  // ========================================

  public async createDamageSession(sessionData: {
    session_name: string;
    notes?: string;
    started_by: number;
  }): Promise<{ sessionId: string; sessionDbId: number }> {
    const db = this.getDatabase();

    try {
      const sessionId = await getNextDamageSessionId(db);
      const phDateTime = getPhilippineDateTimeString();

      const result = await db.runAsync(
        `INSERT INTO damaged_items_sessions (session_id, session_name, notes, started_by, started_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          sessionId,
          sessionData.session_name,
          sessionData.notes || null,
          sessionData.started_by,
          phDateTime,
          phDateTime
        ]
      );

      await updateDamageSessionNumber(db, sessionId);

      console.log(`Damage session created: ${sessionId} (DB ID: ${result.lastInsertRowId})`);
      return {
        sessionId,
        sessionDbId: result.lastInsertRowId as number
      };
    } catch (error) {
      console.error('Error creating damage session:', error);
      throw error;
    }
  }

  public async getDamageSessions(limit?: number): Promise<any[]> {
    const db = this.getDatabase();

    try {
      const query = `
        SELECT
          ds.*,
          u1.full_name as started_by_name,
          u2.full_name as completed_by_name,
          u3.full_name as cancelled_by_name
        FROM damaged_items_sessions ds
        JOIN users u1 ON ds.started_by = u1.id
        LEFT JOIN users u2 ON ds.completed_by = u2.id
        LEFT JOIN users u3 ON ds.cancelled_by = u3.id
        ORDER BY ds.started_at DESC
        ${limit ? `LIMIT ${limit}` : ''}
      `;

      return await db.getAllAsync(query);
    } catch (error) {
      console.error('Error getting damage sessions:', error);
      return [];
    }
  }

  public async getDamageSessionById(sessionId: string): Promise<any> {
    const db = this.getDatabase();

    try {
      const session = await db.getFirstAsync(
        `SELECT
          ds.*,
          u1.full_name as started_by_name,
          u2.full_name as completed_by_name,
          u3.full_name as cancelled_by_name
        FROM damaged_items_sessions ds
        JOIN users u1 ON ds.started_by = u1.id
        LEFT JOIN users u2 ON ds.completed_by = u2.id
        LEFT JOIN users u3 ON ds.cancelled_by = u3.id
        WHERE ds.session_id = ?`,
        [sessionId]
      );

      if (session) {
        // Get damage details
        const details = await db.getAllAsync(
          `SELECT
            dd.*,
            p.name as current_product_name,
            u.full_name as recorded_by_name
           FROM damaged_items_details dd
           LEFT JOIN products p ON dd.product_id = p.id
           LEFT JOIN users u ON dd.recorded_by = u.id
           WHERE dd.session_id = ?
           ORDER BY dd.recorded_at DESC`,
          [sessionId]
        );

        session.items = details;
      }

      return session;
    } catch (error) {
      console.error(`Error getting damage session ${sessionId}:`, error);
      return null;
    }
  }

  public async addDamagedItem(damageData: {
    session_id: string;
    product_id: number;
    damaged_quantity: number;
    damage_reason: 'EXPIRED' | 'BROKEN' | 'DEFECTIVE' | 'SPOILED' | 'LOST' | 'THEFT' | 'OTHER';
    damage_description?: string;
    recorded_by: number;
  }): Promise<number> {
    const db = this.getDatabase();

    try {
      // Get current product information
      const product = await db.getFirstAsync<any>(
        'SELECT * FROM products WHERE id = ?',
        [damageData.product_id]
      );

      if (!product) {
        throw new Error('Product not found');
      }

      if (product.stock_quantity < damageData.damaged_quantity) {
        throw new Error('Insufficient stock quantity');
      }

      const totalValue = damageData.damaged_quantity * product.cost;

      let damageDetailId: number;

      await db.withTransactionAsync(async () => {
        // Insert damage detail
        const phDateTime = getPhilippineDateTimeString();
        const damageResult = await db.runAsync(
          `INSERT INTO damaged_items_details (
            session_id, product_id, product_code, product_name, current_stock,
            damaged_quantity, unit_cost, total_value, damage_reason,
            damage_description, recorded_by, recorded_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            damageData.session_id,
            damageData.product_id,
            product.code,
            product.name,
            product.stock_quantity,
            damageData.damaged_quantity,
            product.cost,
            totalValue,
            damageData.damage_reason,
            damageData.damage_description || null,
            damageData.recorded_by,
            phDateTime,
            phDateTime
          ]
        );

        damageDetailId = damageResult.lastInsertRowId as number;

        // Record inventory movement with before/after tracking
        await this.recordInventoryMovement({
          product_id: damageData.product_id,
          movement_type: 'OUT',
          quantity: damageData.damaged_quantity,
          reference_type: 'DAMAGE',
          reference_id: damageDetailId,
          reference_number: damageData.session_id,
          notes: `${damageData.damage_reason} - ${damageData.damage_description || 'No description'}`,
          created_by: damageData.recorded_by
        });

        // Update session totals
        await this.updateDamageSessionTotals(damageData.session_id);

        // Add eJournal entry with Philippine time
        await db.runAsync(
          `INSERT INTO ejournal (entry_type, reference_number, description, amount, cashier_id, timestamp, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            'SYSTEM',
            damageData.session_id,
            `Damaged item recorded: ${product.name} (${damageData.damaged_quantity} units)`,
            totalValue,
            damageData.recorded_by,
            phDateTime,
            phDateTime
          ]
        );
      });

      return damageDetailId!;
    } catch (error) {
      console.error('Error adding damaged item:', error);
      throw error;
    }
  }

  private async updateDamageSessionTotals(sessionId: string): Promise<void> {
    const db = this.getDatabase();

    try {
      const totals = await db.getFirstAsync<{total_items: number, total_value: number}>(
        `SELECT
          COUNT(*) as total_items,
          SUM(total_value) as total_value
         FROM damaged_items_details
         WHERE session_id = ?`,
        [sessionId]
      );

      await db.runAsync(
        'UPDATE damaged_items_sessions SET total_items = ?, total_value = ? WHERE session_id = ?',
        [totals?.total_items || 0, totals?.total_value || 0, sessionId]
      );
    } catch (error) {
      console.error('Error updating damage session totals:', error);
      throw error;
    }
  }

  public async completeDamageSession(sessionId: string, completedBy: number): Promise<void> {
    const db = this.getDatabase();

    try {
      const phDateTime = getPhilippineDateTimeString();
      await db.runAsync(
        `UPDATE damaged_items_sessions
         SET status = 'COMPLETED', completed_by = ?, completed_at = ?
         WHERE session_id = ?`,
        [completedBy, phDateTime, sessionId]
      );

      // Add eJournal entry with Philippine time
      const phDateTimeEJ2 = getPhilippineDateTimeString();
      await db.runAsync(
        `INSERT INTO ejournal (entry_type, reference_number, description, cashier_id, timestamp, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          'SYSTEM',
          sessionId,
          `Damage session completed - ${sessionId}`,
          completedBy,
          phDateTimeEJ2,
          phDateTime
        ]
      );
    } catch (error) {
      console.error(`Error completing damage session ${sessionId}:`, error);
      throw error;
    }
  }

  public async cancelDamageSession(
    sessionId: string,
    cancelledBy: number,
    reason: string
  ): Promise<void> {
    const db = this.getDatabase();

    try {
      await db.withTransactionAsync(async () => {
        // Get all damaged items in this session
        const damagedItems = await db.getAllAsync<any>(
          'SELECT * FROM damaged_items_details WHERE session_id = ?',
          [sessionId]
        );

        // Restore stock quantities with inventory movement tracking
        for (const item of damagedItems) {
          // Record reverse inventory movement with before/after tracking
          await this.recordInventoryMovement({
            product_id: item.product_id,
            movement_type: 'IN',
            quantity: item.damaged_quantity,
            reference_type: 'DAMAGE_REVERSAL',
            reference_id: item.id,
            reference_number: sessionId,
            notes: `Session cancelled: ${reason}`,
            created_by: cancelledBy
          });
        }

        // Update session status
        await db.runAsync(
          `UPDATE damaged_items_sessions
           SET status = 'CANCELLED', cancelled_by = ?, cancelled_reason = ?
           WHERE session_id = ?`,
          [cancelledBy, reason, sessionId]
        );

        // Add eJournal entry with Philippine time
        const phDateTime = getPhilippineDateTimeString();
        await db.runAsync(
          `INSERT INTO ejournal (entry_type, reference_number, description, cashier_id, timestamp, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            'SYSTEM',
            sessionId,
            `Damage session cancelled - ${sessionId}: ${reason}`,
            cancelledBy,
            phDateTime,
            phDateTime
          ]
        );
      });
    } catch (error) {
      console.error(`Error cancelling damage session ${sessionId}:`, error);
      throw error;
    }
  }

  public async getDamageReports(dateFrom?: string, dateTo?: string): Promise<any> {
    const db = this.getDatabase();

    try {
      let whereClause = '';
      const params: any[] = [];

      if (dateFrom && dateTo) {
        whereClause = 'WHERE DATE(ds.started_at) BETWEEN ? AND ?';
        params.push(dateFrom, dateTo);
      } else if (dateFrom) {
        whereClause = 'WHERE DATE(ds.started_at) >= ?';
        params.push(dateFrom);
      } else if (dateTo) {
        whereClause = 'WHERE DATE(ds.started_at) <= ?';
        params.push(dateTo);
      }

      // Summary by reason
      const reasonSummary = await db.getAllAsync(
        `SELECT
          dd.damage_reason,
          COUNT(*) as item_count,
          SUM(dd.damaged_quantity) as total_quantity,
          SUM(dd.total_value) as total_value
         FROM damaged_items_details dd
         JOIN damaged_items_sessions ds ON dd.session_id = ds.session_id
         ${whereClause}
         GROUP BY dd.damage_reason
         ORDER BY total_value DESC`,
        params
      );

      // Summary by product
      const productSummary = await db.getAllAsync(
        `SELECT
          dd.product_code,
          dd.product_name,
          COUNT(*) as damage_count,
          SUM(dd.damaged_quantity) as total_quantity,
          SUM(dd.total_value) as total_value
         FROM damaged_items_details dd
         JOIN damaged_items_sessions ds ON dd.session_id = ds.session_id
         ${whereClause}
         GROUP BY dd.product_id, dd.product_code, dd.product_name
         ORDER BY total_value DESC
         LIMIT 20`,
        params
      );

      // Overall totals
      const overallTotals = await db.getFirstAsync<any>(
        `SELECT
          COUNT(DISTINCT ds.session_id) as total_sessions,
          COUNT(dd.id) as total_items,
          SUM(dd.damaged_quantity) as total_quantity,
          SUM(dd.total_value) as total_value
         FROM damaged_items_details dd
         JOIN damaged_items_sessions ds ON dd.session_id = ds.session_id
         ${whereClause}`,
        params
      );

      return {
        reasonSummary,
        productSummary,
        overallTotals: overallTotals || {
          total_sessions: 0,
          total_items: 0,
          total_quantity: 0,
          total_value: 0
        }
      };
    } catch (error) {
      console.error('Error getting damage reports:', error);
      return {
        reasonSummary: [],
        productSummary: [],
        overallTotals: {
          total_sessions: 0,
          total_items: 0,
          total_quantity: 0,
          total_value: 0
        }
      };
    }
  }

  // ========================================
  // INVENTORY MOVEMENTS / TRANSACTION HISTORY METHODS
  // ========================================

  public async getInventoryMovements(options?: {
    product_id?: number;
    movement_type?: 'IN' | 'OUT' | 'ADJUSTMENT';
    reference_type?: 'SALE' | 'PURCHASE' | 'MANUAL_ADJUSTMENT' | 'DAMAGE' | 'DAMAGE_REVERSAL' | 'PHYSICAL_COUNT';
    date_from?: string;
    date_to?: string;
    limit?: number;
  }) {
    const db = this.getDatabase();

    try {
      let whereClause = '';
      const params: any[] = [];
      const conditions: string[] = [];

      if (options?.product_id) {
        conditions.push('im.product_id = ?');
        params.push(options.product_id);
      }

      if (options?.movement_type) {
        conditions.push('im.movement_type = ?');
        params.push(options.movement_type);
      }

      if (options?.reference_type) {
        conditions.push('im.reference_type = ?');
        params.push(options.reference_type);
      }

      if (options?.date_from) {
        conditions.push('DATE(im.created_at) >= ?');
        params.push(options.date_from);
      }

      if (options?.date_to) {
        conditions.push('DATE(im.created_at) <= ?');
        params.push(options.date_to);
      }

      if (conditions.length > 0) {
        whereClause = 'WHERE ' + conditions.join(' AND ');
      }

      const limit = options?.limit || 100;

      const movements = await db.getAllAsync<any>(
        `SELECT
          im.*,
          u.username as created_by_name,
          p.name as product_name,
          p.code as product_code
         FROM inventory_movements im
         LEFT JOIN users u ON im.created_by = u.id
         LEFT JOIN products p ON im.product_id = p.id
         ${whereClause}
         ORDER BY im.created_at DESC
         LIMIT ?`,
        [...params, limit]
      );

      return movements;
    } catch (error) {
      console.error('Error getting inventory movements:', error);
      return [];
    }
  }

  public async getTransactionHistoryForProduct(productId: number, limit: number = 50) {
    const db = this.getDatabase();

    try {
      const movements = await db.getAllAsync<any>(
        `SELECT
          im.*,
          u.username as created_by_name,
          p.name as product_name,
          p.code as product_code
         FROM inventory_movements im
         LEFT JOIN users u ON im.created_by = u.id
         LEFT JOIN products p ON im.product_id = p.id
         WHERE im.product_id = ?
         ORDER BY im.created_at DESC
         LIMIT ?`,
        [productId, limit]
      );

      return movements;
    } catch (error) {
      console.error('Error getting transaction history for product:', error);
      return [];
    }
  }

  public async getInventoryMovementsSummary(dateFrom?: string, dateTo?: string) {
    const db = this.getDatabase();

    try {
      let whereClause = '';
      const params: any[] = [];

      if (dateFrom && dateTo) {
        whereClause = 'WHERE DATE(im.created_at) BETWEEN ? AND ?';
        params.push(dateFrom, dateTo);
      } else if (dateFrom) {
        whereClause = 'WHERE DATE(im.created_at) >= ?';
        params.push(dateFrom);
      } else if (dateTo) {
        whereClause = 'WHERE DATE(im.created_at) <= ?';
        params.push(dateTo);
      }

      // Summary by movement type
      const movementTypeSummary = await db.getAllAsync(
        `SELECT
          movement_type,
          reference_type,
          COUNT(*) as transaction_count,
          SUM(quantity) as total_quantity,
          SUM(total_value) as total_value
         FROM inventory_movements im
         ${whereClause}
         GROUP BY movement_type, reference_type
         ORDER BY total_value DESC`,
        params
      );

      // Summary by product
      const productSummary = await db.getAllAsync(
        `SELECT
          im.product_code,
          im.product_name,
          COUNT(*) as transaction_count,
          SUM(CASE WHEN movement_type = 'IN' THEN quantity ELSE 0 END) as total_in,
          SUM(CASE WHEN movement_type = 'OUT' THEN quantity ELSE 0 END) as total_out,
          SUM(total_value) as total_value
         FROM inventory_movements im
         ${whereClause}
         GROUP BY im.product_id, im.product_code, im.product_name
         ORDER BY transaction_count DESC
         LIMIT 20`,
        params
      );

      // Overall totals
      const overallTotals = await db.getFirstAsync<any>(
        `SELECT
          COUNT(*) as total_transactions,
          SUM(CASE WHEN movement_type = 'IN' THEN quantity ELSE 0 END) as total_in_quantity,
          SUM(CASE WHEN movement_type = 'OUT' THEN quantity ELSE 0 END) as total_out_quantity,
          SUM(total_value) as total_value
         FROM inventory_movements im
         ${whereClause}`,
        params
      );

      return {
        movementTypeSummary,
        productSummary,
        overallTotals: overallTotals || {
          total_transactions: 0,
          total_in_quantity: 0,
          total_out_quantity: 0,
          total_value: 0
        }
      };
    } catch (error) {
      console.error('Error getting inventory movements summary:', error);
      return {
        movementTypeSummary: [],
        productSummary: [],
        overallTotals: {
          total_transactions: 0,
          total_in_quantity: 0,
          total_out_quantity: 0,
          total_value: 0
        }
      };
    }
  }

  // ========================================
  // CUSTOMER MANAGEMENT METHODS
  // ========================================

  public async createCustomer(customerData: {
    name: string;
    contact_person?: string;
    phone?: string;
    email?: string;
    address?: string;
    tin?: string;
    credit_terms?: number;
    credit_limit?: number;
    notes?: string;
  }) {
    const db = this.getDatabase();

    try {
      // Check for duplicate customer name (case-insensitive, includes inactive)
      const existing = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM customers WHERE LOWER(name) = LOWER(?)',
        [customerData.name.trim()]
      );
      if (existing) {
        throw new Error(`Customer "${customerData.name.trim()}" already exists. Please use a unique name.`);
      }

      const { getNextCustomerCode, updateCustomerNumber } = await import('./schema');

      const customerCode = await getNextCustomerCode(db);

      const result = await db.runAsync(
        `INSERT INTO customers (
          code, name, contact_person, phone, email, address, tin,
          credit_terms, credit_limit, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customerCode,
          customerData.name.trim(),
          customerData.contact_person || null,
          customerData.phone || null,
          customerData.email || null,
          customerData.address || null,
          customerData.tin || null,
          customerData.credit_terms || 30,
          customerData.credit_limit || 0,
          customerData.notes || null
        ]
      );

      await updateCustomerNumber(db, customerCode);

      return result.lastInsertRowId as number;
    } catch (error) {
      console.error('Error creating customer:', error);
      throw error;
    }
  }

  public async getCustomers(activeOnly: boolean = true) {
    const db = this.getDatabase();

    try {
      const whereClause = activeOnly ? 'WHERE is_active = 1' : '';

      const customers = await db.getAllAsync<any>(
        `SELECT * FROM customers ${whereClause} ORDER BY name ASC`
      );

      return customers;
    } catch (error) {
      console.error('Error getting customers:', error);
      return [];
    }
  }

  public async updateCustomer(id: number, customerData: {
    name?: string;
    contact_person?: string;
    phone?: string;
    email?: string;
    address?: string;
    tin?: string;
    credit_terms?: number;
    credit_limit?: number;
    is_active?: boolean;
    notes?: string;
  }) {
    const db = this.getDatabase();

    try {
      // Check for duplicate customer name if name is being updated
      if (customerData.name !== undefined) {
        const existingName = await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM customers WHERE LOWER(name) = LOWER(?) AND id != ?',
          [customerData.name.trim(), id]
        );
        if (existingName) {
          throw new Error(`Customer "${customerData.name.trim()}" already exists. Please use a unique name.`);
        }
      }

      const setParts = [];
      const values = [];

      Object.entries(customerData).forEach(([key, value]) => {
        if (value !== undefined) {
          setParts.push(`${key} = ?`);
          values.push(typeof value === 'string' ? value.trim() : value);
        }
      });

      if (setParts.length > 0) {
        setParts.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        await db.runAsync(
          `UPDATE customers SET ${setParts.join(', ')} WHERE id = ?`,
          values
        );
      }
    } catch (error) {
      console.error('Error updating customer:', error);
      throw error;
    }
  }

  // ========================================
  // CUSTOMER PAYMENT METHODS
  // ========================================

  public async processCustomerPayment(paymentData: {
    customer_id?: number;
    transaction_id: number;
    payment_method: 'CASH' | 'CARD' | 'CHECK' | 'BANK_TRANSFER' | 'ONLINE';
    amount_paid: number;
    reference_number?: string;
    notes?: string;
    received_by: number;
  }): Promise<number> {
    const db = this.getDatabase();

    try {
      let paymentId: number;

      await db.withTransactionAsync(async () => {
        const { getNextCustomerPaymentNumber, updateCustomerPaymentNumber } = await import('./schema');

        const paymentNumber = await getNextCustomerPaymentNumber(db);
        const phDate = getPhilippineDateString();

        // Insert customer payment with Philippine date and explicit created_at in PH time
        // IMPORTANT: Do NOT rely on DEFAULT CURRENT_TIMESTAMP (UTC) - use PH time for shift filtering
        const phDateTime = getPhilippineDateTimeString();
        const paymentResult = await db.runAsync(
          `INSERT INTO customer_payments (
            payment_number, customer_id, transaction_id, payment_date,
            payment_method, amount_paid, reference_number, notes, received_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            paymentNumber,
            paymentData.customer_id || null,
            paymentData.transaction_id,
            phDate,
            paymentData.payment_method,
            paymentData.amount_paid,
            paymentData.reference_number || null,
            paymentData.notes || null,
            paymentData.received_by,
            phDateTime
          ]
        );

        paymentId = paymentResult.lastInsertRowId as number;

        // Update accounts receivable
        // Use COALESCE to handle NULL paid_amount values from older records
        const arRecord = await db.getFirstAsync<any>(
          `SELECT *, COALESCE(paid_amount, 0) as paid_amount_safe
           FROM accounts_receivable WHERE transaction_id = ?`,
          [paymentData.transaction_id]
        );

        if (arRecord) {
          // Use paid_amount_safe to ensure we have a number, not NULL
          const currentPaidAmount = parseFloat(arRecord.paid_amount_safe) || 0;
          const newPaidAmount = currentPaidAmount + paymentData.amount_paid;
          const newBalance = arRecord.original_amount - newPaidAmount;

          let newStatus: string;
          if (newBalance <= 0) {
            newStatus = 'PAID';
          } else if (newPaidAmount > 0) {
            newStatus = 'PARTIALLY_PAID';
          } else {
            newStatus = 'OUTSTANDING';
          }

          await db.runAsync(
            `UPDATE accounts_receivable
             SET paid_amount = ?, balance_amount = ?, status = ?, updated_at = CURRENT_TIMESTAMP
             WHERE transaction_id = ?`,
            [newPaidAmount, Math.max(0, newBalance), newStatus, paymentData.transaction_id]
          );

          // Update transaction payment status
          await db.runAsync(
            `UPDATE transactions
             SET payment_status = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [newStatus === 'PAID' ? 'PAID' : 'PARTIAL', paymentData.transaction_id]
          );
        }

        // Update payment number sequence
        await updateCustomerPaymentNumber(db, paymentNumber);

        // Add eJournal entry with Philippine time (reuse phDateTime from above)
        await db.runAsync(
          `INSERT INTO ejournal (entry_type, reference_number, description, amount, cashier_id, timestamp, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            'PAYMENT',
            paymentNumber,
            `Customer payment received - ${paymentNumber}`,
            paymentData.amount_paid,
            paymentData.received_by,
            phDateTime,
            phDateTime
          ]
        );
      });

      return paymentId!;
    } catch (error) {
      console.error('Error processing customer payment:', error);
      throw error;
    }
  }

  /**
   * Process payment for multiple invoices at once (FIFO distribution)
   * Returns array of payment IDs created
   */
  public async processMultiInvoicePayment(paymentData: {
    customer_id?: number;
    customer_name?: string;
    invoices: Array<{
      transaction_id: number;
      invoice_number: string;
      balance_amount: number;
    }>;
    total_payment: number;
    payment_method: 'CASH' | 'CARD' | 'CHECK' | 'BANK_TRANSFER' | 'ONLINE';
    reference_number?: string;
    notes?: string;
    received_by: number;
  }): Promise<{ paymentIds: number[]; distributions: Array<{ invoice_number: string; amount: number; newBalance: number; status: string }> }> {
    const db = this.getDatabase();

    try {
      const paymentIds: number[] = [];
      const distributions: Array<{ invoice_number: string; amount: number; newBalance: number; status: string }> = [];

      await db.withTransactionAsync(async () => {
        const { getNextCustomerPaymentNumber, updateCustomerPaymentNumber } = await import('./schema');

        // Sort invoices by due date (FIFO - oldest first)
        const sortedInvoices = [...paymentData.invoices].sort((a, b) => {
          return a.transaction_id - b.transaction_id; // Older transactions have lower IDs
        });

        let remainingPayment = paymentData.total_payment;
        const phDate = getPhilippineDateString();
        const phDateTime = getPhilippineDateTimeString();

        for (const invoice of sortedInvoices) {
          if (remainingPayment <= 0) break;

          // Calculate how much to apply to this invoice
          const amountToApply = Math.min(remainingPayment, invoice.balance_amount);
          remainingPayment -= amountToApply;

          // Get payment number for this payment
          const paymentNumber = await getNextCustomerPaymentNumber(db);

          // Insert customer payment with explicit created_at in PH time
          // IMPORTANT: Do NOT rely on DEFAULT CURRENT_TIMESTAMP (UTC) - use PH time for shift filtering
          const paymentResult = await db.runAsync(
            `INSERT INTO customer_payments (
              payment_number, customer_id, transaction_id, payment_date,
              payment_method, amount_paid, reference_number, notes, received_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              paymentNumber,
              paymentData.customer_id || null,
              invoice.transaction_id,
              phDate,
              paymentData.payment_method,
              amountToApply,
              paymentData.reference_number || null,
              paymentData.notes ? `${paymentData.notes} (Multi-invoice payment)` : 'Multi-invoice payment',
              paymentData.received_by,
              phDateTime
            ]
          );

          paymentIds.push(paymentResult.lastInsertRowId as number);

          // Update accounts receivable
          const arRecord = await db.getFirstAsync<any>(
            `SELECT *, COALESCE(paid_amount, 0) as paid_amount_safe
             FROM accounts_receivable WHERE transaction_id = ?`,
            [invoice.transaction_id]
          );

          if (arRecord) {
            const currentPaidAmount = parseFloat(arRecord.paid_amount_safe) || 0;
            const newPaidAmount = currentPaidAmount + amountToApply;
            const newBalance = arRecord.original_amount - newPaidAmount;

            let newStatus: string;
            if (newBalance <= 0) {
              newStatus = 'PAID';
            } else if (newPaidAmount > 0) {
              newStatus = 'PARTIALLY_PAID';
            } else {
              newStatus = 'OUTSTANDING';
            }

            await db.runAsync(
              `UPDATE accounts_receivable
               SET paid_amount = ?, balance_amount = ?, status = ?, updated_at = ?
               WHERE transaction_id = ?`,
              [newPaidAmount, Math.max(0, newBalance), newStatus, phDateTime, invoice.transaction_id]
            );

            // Update transaction payment status
            await db.runAsync(
              `UPDATE transactions
               SET payment_status = ?, updated_at = ?
               WHERE id = ?`,
              [newStatus === 'PAID' ? 'PAID' : 'PARTIAL', phDateTime, invoice.transaction_id]
            );

            distributions.push({
              invoice_number: invoice.invoice_number,
              amount: amountToApply,
              newBalance: Math.max(0, newBalance),
              status: newStatus
            });
          }

          // Update payment number sequence
          await updateCustomerPaymentNumber(db, paymentNumber);

          // Add eJournal entry
          await db.runAsync(
            `INSERT INTO ejournal (entry_type, reference_number, description, amount, cashier_id, timestamp, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              'PAYMENT',
              paymentNumber,
              `Customer payment - ${invoice.invoice_number}`,
              amountToApply,
              paymentData.received_by,
              phDateTime,
              phDateTime
            ]
          );
        }
      });

      return { paymentIds, distributions };
    } catch (error) {
      console.error('Error processing multi-invoice payment:', error);
      throw error;
    }
  }

  // Adjust accounts receivable balance for exchange transactions
  public async adjustAccountsReceivableForExchange(
    transactionId: number,
    adjustment: number, // positive = increase balance, negative = decrease balance
    notes: string,
    cashierId: number
  ): Promise<void> {
    const db = this.getDatabase();
    try {
      // Get current AR record
      const arRecord = await db.getFirstAsync<any>(
        `SELECT * FROM accounts_receivable WHERE transaction_id = ?`,
        [transactionId]
      );

      if (!arRecord) {
        console.log('No AR record found for transaction:', transactionId);
        return;
      }

      // Calculate new amounts
      // For exchange: we adjust both original_amount and balance_amount
      // Example: Original ₱120, exchange to ₱35 → adjustment = -85
      // New original = 120 + (-85) = 35, New balance = current_balance + (-85)
      const newOriginalAmount = Math.max(0, arRecord.original_amount + adjustment);
      const newBalanceAmount = Math.max(0, arRecord.balance_amount + adjustment);

      // Determine new status
      let newStatus = arRecord.status;
      if (newBalanceAmount <= 0) {
        newStatus = 'PAID';
      } else if (arRecord.paid_amount > 0 && newBalanceAmount > 0) {
        newStatus = 'PARTIAL';
      }

      // Update AR record
      const phDateTime = getPhilippineDateTimeString();
      await db.runAsync(
        `UPDATE accounts_receivable
         SET original_amount = ?, balance_amount = ?, status = ?, updated_at = ?
         WHERE transaction_id = ?`,
        [newOriginalAmount, newBalanceAmount, newStatus, phDateTime, transactionId]
      );

      // Update transaction total_amount as well
      await db.runAsync(
        `UPDATE transactions
         SET total_amount = ?, updated_at = ?
         WHERE id = ?`,
        [newOriginalAmount, phDateTime, transactionId]
      );

      // Add eJournal entry (using 'SYSTEM' as entry_type for AR adjustments)
      await db.runAsync(
        `INSERT INTO ejournal (entry_type, reference_number, description, amount, timestamp, created_at, cashier_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'SYSTEM',
          arRecord.invoice_number,
          `AR Adjustment: ${notes}`,
          adjustment,
          phDateTime,
          phDateTime,
          cashierId
        ]
      );

      console.log(`AR adjusted for transaction ${transactionId}: ${adjustment > 0 ? '+' : ''}${adjustment}`);
    } catch (error) {
      console.error('Error adjusting AR for exchange:', error);
      throw error;
    }
  }

  public async getCustomerPayments(customerId?: number, limit: number = 50) {
    const db = this.getDatabase();

    try {
      let whereClause = '';
      const params: any[] = [];

      if (customerId) {
        whereClause = 'WHERE cp.customer_id = ?';
        params.push(customerId);
      }

      const payments = await db.getAllAsync<any>(
        `SELECT
          cp.*,
          c.name as customer_name,
          c.code as customer_code,
          t.invoice_number,
          u.username as received_by_name
         FROM customer_payments cp
         LEFT JOIN customers c ON cp.customer_id = c.id
         LEFT JOIN transactions t ON cp.transaction_id = t.id
         LEFT JOIN users u ON cp.received_by = u.id
         ${whereClause}
         ORDER BY cp.payment_date DESC, cp.created_at DESC
         LIMIT ?`,
        [...params, limit]
      );

      return payments;
    } catch (error) {
      console.error('Error getting customer payments:', error);
      return [];
    }
  }

  /**
   * Get customer transactions with items for a date range
   * Used for Customer Account Statement - Purchases tab
   */
  public async getCustomerTransactionsWithItems(
    customerId: number,
    startDate: string,
    endDate: string
  ): Promise<any[]> {
    const db = this.getDatabase();

    try {
      // Get transactions for the customer within date range
      const transactions = await db.getAllAsync<any>(
        `SELECT
          t.*,
          u.full_name as cashier_name,
          c.name as customer_name
         FROM transactions t
         LEFT JOIN users u ON t.cashier_id = u.id
         LEFT JOIN customers c ON t.customer_id = c.id
         WHERE t.customer_id = ?
           AND DATE(t.transaction_date) >= DATE(?)
           AND DATE(t.transaction_date) <= DATE(?)
           AND t.status IN ('COMPLETED', 'PARTIALLY_PAID', 'REFUNDED')
         ORDER BY t.transaction_date DESC, t.created_at DESC`,
        [customerId, startDate, endDate]
      );

      // Get items for each transaction
      for (const transaction of transactions) {
        const items = await db.getAllAsync<any>(
          `SELECT
            ti.*,
            p.name as product_name,
            p.code as product_code
           FROM transaction_items ti
           LEFT JOIN products p ON ti.product_id = p.id
           WHERE ti.transaction_id = ?`,
          [transaction.id]
        );
        transaction.items = items;
      }

      return transactions;
    } catch (error) {
      console.error('Error getting customer transactions with items:', error);
      return [];
    }
  }

  /**
   * Get customer payments for a date range
   * Used for Customer Account Statement - Payments tab
   */
  public async getCustomerPaymentsByDateRange(
    customerId: number,
    startDate: string,
    endDate: string
  ): Promise<any[]> {
    const db = this.getDatabase();

    try {
      const payments = await db.getAllAsync<any>(
        `SELECT
          cp.*,
          c.name as customer_name,
          c.code as customer_code,
          t.invoice_number,
          t.total_amount as invoice_total,
          u.username as received_by_name
         FROM customer_payments cp
         LEFT JOIN customers c ON cp.customer_id = c.id
         LEFT JOIN transactions t ON cp.transaction_id = t.id
         LEFT JOIN users u ON cp.received_by = u.id
         WHERE cp.customer_id = ?
           AND DATE(cp.payment_date) >= DATE(?)
           AND DATE(cp.payment_date) <= DATE(?)
         ORDER BY cp.payment_date DESC, cp.created_at DESC`,
        [customerId, startDate, endDate]
      );

      return payments;
    } catch (error) {
      console.error('Error getting customer payments by date range:', error);
      return [];
    }
  }

  /**
   * Get customer sales returns for a date range
   * Used for Customer Account Statement - Returns tab
   */
  public async getCustomerSalesReturns(
    customerId: number,
    startDate: string,
    endDate: string
  ): Promise<any[]> {
    const db = this.getDatabase();

    try {
      const returns = await db.getAllAsync<any>(
        `SELECT sr.*, u.full_name as processed_by_name
         FROM sales_returns sr
         LEFT JOIN users u ON sr.processed_by = u.id
         WHERE sr.customer_id = ?
           AND DATE(sr.return_date) >= DATE(?)
           AND DATE(sr.return_date) <= DATE(?)
           AND sr.status = 'COMPLETED'
         ORDER BY sr.return_date DESC, sr.id DESC`,
        [customerId, startDate, endDate]
      );

      // Get items for each return
      for (const ret of returns) {
        const items = await db.getAllAsync<any>(
          `SELECT * FROM sales_return_items WHERE sales_return_id = ?`,
          [ret.id]
        );
        ret.items = items;
      }

      return returns;
    } catch (error) {
      console.error('Error getting customer sales returns:', error);
      return [];
    }
  }

  /**
   * Get customer balance summary
   * Used for Customer Account Statement - Summary section
   */
  public async getCustomerBalanceSummary(customerId: number): Promise<{
    totalPurchases: number;
    totalPayments: number;
    currentBalance: number;
    invoiceCount: number;
    paidInvoices: number;
    unpaidInvoices: number;
  }> {
    const db = this.getDatabase();

    try {
      // Total purchases (all completed transactions)
      const purchasesResult = await db.getFirstAsync<any>(
        `SELECT
          COALESCE(SUM(total_amount), 0) as total,
          COUNT(*) as count
         FROM transactions
         WHERE customer_id = ?
           AND status IN ('COMPLETED', 'PARTIALLY_PAID')`,
        [customerId]
      );

      // Total payments made (customer_payments doesn't have status column - all payments are completed)
      const paymentsResult = await db.getFirstAsync<any>(
        `SELECT COALESCE(SUM(amount_paid), 0) as total
         FROM customer_payments
         WHERE customer_id = ?`,
        [customerId]
      );

      // Get AR summary
      const arResult = await db.getFirstAsync<any>(
        `SELECT
          COALESCE(SUM(balance_amount), 0) as balance,
          COUNT(CASE WHEN status = 'PAID' THEN 1 END) as paid,
          COUNT(CASE WHEN status != 'PAID' THEN 1 END) as unpaid
         FROM accounts_receivable
         WHERE customer_id = ?`,
        [customerId]
      );

      return {
        totalPurchases: purchasesResult?.total || 0,
        totalPayments: paymentsResult?.total || 0,
        currentBalance: arResult?.balance || 0,
        invoiceCount: purchasesResult?.count || 0,
        paidInvoices: arResult?.paid || 0,
        unpaidInvoices: arResult?.unpaid || 0,
      };
    } catch (error) {
      console.error('Error getting customer balance summary:', error);
      return {
        totalPurchases: 0,
        totalPayments: 0,
        currentBalance: 0,
        invoiceCount: 0,
        paidInvoices: 0,
        unpaidInvoices: 0,
      };
    }
  }

  public async getAccountsReceivable(customerId?: number) {
    const db = this.getDatabase();

    try {
      let whereClause = '';
      const params: any[] = [];

      if (customerId) {
        whereClause = 'WHERE ar.customer_id = ?';
        params.push(customerId);
      }

      const receivables = await db.getAllAsync<any>(
        `SELECT
          ar.*,
          c.name as customer_name,
          c.code as customer_code,
          c.credit_terms
         FROM accounts_receivable ar
         LEFT JOIN customers c ON ar.customer_id = c.id
         ${whereClause}
         ORDER BY ar.due_date ASC, ar.created_at DESC`,
        params
      );

      return receivables;
    } catch (error) {
      console.error('Error getting accounts receivable:', error);
      return [];
    }
  }

  public async getAccountsReceivableAging(asOfDate?: string) {
    const db = this.getDatabase();

    try {
      const dateFilter = asOfDate || 'DATE()';

      // Update aging calculations
      await db.runAsync(
        `UPDATE accounts_receivable
         SET
           days_outstanding = CAST(JULIANDAY(${dateFilter}) - JULIANDAY(invoice_date) AS INTEGER),
           aging_bucket = CASE
             WHEN CAST(JULIANDAY(${dateFilter}) - JULIANDAY(invoice_date) AS INTEGER) <= 30 THEN '0-30'
             WHEN CAST(JULIANDAY(${dateFilter}) - JULIANDAY(invoice_date) AS INTEGER) <= 60 THEN '31-60'
             WHEN CAST(JULIANDAY(${dateFilter}) - JULIANDAY(invoice_date) AS INTEGER) <= 90 THEN '61-90'
             ELSE '90+'
           END,
           updated_at = CURRENT_TIMESTAMP
         WHERE status IN ('OUTSTANDING', 'PARTIALLY_PAID')`
      );

      // Get aging report
      const agingData = await db.getAllAsync<any>(
        `SELECT
          ar.customer_id,
          ar.customer_name,
          c.code as customer_code,
          ar.aging_bucket,
          COUNT(*) as invoice_count,
          SUM(ar.balance_amount) as total_balance
         FROM accounts_receivable ar
         LEFT JOIN customers c ON ar.customer_id = c.id
         WHERE ar.status IN ('OUTSTANDING', 'PARTIALLY_PAID')
         GROUP BY ar.customer_id, ar.customer_name, c.code, ar.aging_bucket
         ORDER BY ar.customer_name, ar.aging_bucket`
      );

      // Get summary totals
      const summaryData = await db.getAllAsync<any>(
        `SELECT
          aging_bucket,
          COUNT(*) as invoice_count,
          SUM(balance_amount) as total_balance
         FROM accounts_receivable
         WHERE status IN ('OUTSTANDING', 'PARTIALLY_PAID')
         GROUP BY aging_bucket
         ORDER BY aging_bucket`
      );

      return {
        agingData,
        summaryData
      };
    } catch (error) {
      console.error('Error getting accounts receivable aging:', error);
      return {
        agingData: [],
        summaryData: []
      };
    }
  }

  // ========================================
  // CATEGORY MANAGEMENT METHODS
  // ========================================

  public async getCategories(activeOnly: boolean = true): Promise<Category[]> {
    const db = this.getDatabase();
    try {
      const whereClause = activeOnly ? 'WHERE is_active = 1' : '';
      const categories = await db.getAllAsync<Category>(
        `SELECT * FROM categories ${whereClause} ORDER BY name ASC`
      );
      return categories;
    } catch (error) {
      console.error('Error getting categories:', error);
      return [];
    }
  }

  public async getCategoryById(id: number): Promise<Category | null> {
    const db = this.getDatabase();
    try {
      const category = await db.getFirstAsync<Category>(
        'SELECT * FROM categories WHERE id = ?',
        [id]
      );
      return category || null;
    } catch (error) {
      console.error(`Error getting category ${id}:`, error);
      return null;
    }
  }

  public async createCategory(categoryData: {
    name: string;
    description?: string;
  }): Promise<number> {
    const db = this.getDatabase();
    try {
      // Check for duplicate category name (case-insensitive, includes inactive)
      const existing = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM categories WHERE LOWER(name) = LOWER(?)',
        [categoryData.name.trim()]
      );
      if (existing) {
        throw new Error(`Category "${categoryData.name.trim()}" already exists. Please use a unique name.`);
      }

      const result = await db.runAsync(
        'INSERT INTO categories (name, description) VALUES (?, ?)',
        [categoryData.name.trim(), categoryData.description || null]
      );
      console.log(`Category created: ${categoryData.name} (ID: ${result.lastInsertRowId})`);
      return result.lastInsertRowId as number;
    } catch (error) {
      console.error(`Error creating category ${categoryData.name}:`, error);
      throw error;
    }
  }

  public async updateCategory(id: number, updates: Partial<Category>): Promise<boolean> {
    const db = this.getDatabase();
    try {
      // Check for duplicate name if name is being updated
      if (updates.name !== undefined) {
        const existing = await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM categories WHERE LOWER(name) = LOWER(?) AND id != ?',
          [updates.name.trim(), id]
        );
        if (existing) {
          throw new Error(`Category "${updates.name.trim()}" already exists. Please use a unique name.`);
        }
      }

      const setParts: string[] = [];
      const values: any[] = [];

      if ('name' in updates && updates.name !== undefined) {
        setParts.push('name = ?');
        values.push(updates.name.trim());
      }
      if ('description' in updates) {
        setParts.push('description = ?');
        values.push(updates.description);
      }
      if ('is_active' in updates) {
        setParts.push('is_active = ?');
        values.push(updates.is_active ? 1 : 0);
      }

      if (setParts.length > 0) {
        values.push(id);
        const result = await db.runAsync(
          `UPDATE categories SET ${setParts.join(', ')} WHERE id = ?`,
          values
        );
        return result.changes > 0;
      }
      return false;
    } catch (error) {
      console.error(`Error updating category ${id}:`, error);
      throw error;
    }
  }

  public async deleteCategory(id: number, softDelete: boolean = true): Promise<boolean> {
    const db = this.getDatabase();
    try {
      // Check if category is in use
      const usageCount = await db.getFirstAsync<{count: number}>(
        'SELECT COUNT(*) as count FROM products WHERE category_id = ?',
        [id]
      );

      if (usageCount && usageCount.count > 0) {
        throw new Error(`Cannot delete category: ${usageCount.count} products are using this category`);
      }

      if (softDelete) {
        const result = await db.runAsync(
          'UPDATE categories SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [id]
        );
        return result.changes > 0;
      } else {
        const result = await db.runAsync('DELETE FROM categories WHERE id = ?', [id]);
        return result.changes > 0;
      }
    } catch (error) {
      console.error(`Error deleting category ${id}:`, error);
      throw error;
    }
  }

  // ========================================
  // BRAND MANAGEMENT METHODS
  // ========================================

  public async getBrands(activeOnly: boolean = true): Promise<Brand[]> {
    const db = this.getDatabase();
    try {
      const whereClause = activeOnly ? 'WHERE is_active = 1' : '';
      const brands = await db.getAllAsync<Brand>(
        `SELECT * FROM brands ${whereClause} ORDER BY name ASC`
      );
      return brands;
    } catch (error) {
      console.error('Error getting brands:', error);
      return [];
    }
  }

  public async getBrandById(id: number): Promise<Brand | null> {
    const db = this.getDatabase();
    try {
      const brand = await db.getFirstAsync<Brand>(
        'SELECT * FROM brands WHERE id = ?',
        [id]
      );
      return brand || null;
    } catch (error) {
      console.error(`Error getting brand ${id}:`, error);
      return null;
    }
  }

  public async createBrand(brandData: {
    name: string;
    description?: string;
  }): Promise<number> {
    const db = this.getDatabase();
    try {
      // Check for duplicate brand name (case-insensitive, includes inactive)
      const existing = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM brands WHERE LOWER(name) = LOWER(?)',
        [brandData.name.trim()]
      );
      if (existing) {
        throw new Error(`Brand "${brandData.name.trim()}" already exists. Please use a unique name.`);
      }

      const result = await db.runAsync(
        'INSERT INTO brands (name, description) VALUES (?, ?)',
        [brandData.name.trim(), brandData.description || null]
      );
      console.log(`Brand created: ${brandData.name} (ID: ${result.lastInsertRowId})`);
      return result.lastInsertRowId as number;
    } catch (error) {
      console.error(`Error creating brand ${brandData.name}:`, error);
      throw error;
    }
  }

  public async updateBrand(id: number, updates: Partial<Brand>): Promise<boolean> {
    const db = this.getDatabase();
    try {
      // Check for duplicate name if name is being updated
      if (updates.name !== undefined) {
        const existing = await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM brands WHERE LOWER(name) = LOWER(?) AND id != ?',
          [updates.name.trim(), id]
        );
        if (existing) {
          throw new Error(`Brand "${updates.name.trim()}" already exists. Please use a unique name.`);
        }
      }

      const setParts: string[] = [];
      const values: any[] = [];

      if (updates.name !== undefined) {
        setParts.push('name = ?');
        values.push(updates.name.trim());
      }
      if (updates.description !== undefined) {
        setParts.push('description = ?');
        values.push(updates.description);
      }
      if (updates.is_active !== undefined) {
        setParts.push('is_active = ?');
        values.push(updates.is_active ? 1 : 0);
      }

      if (setParts.length > 0) {
        setParts.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);
        const result = await db.runAsync(
          `UPDATE brands SET ${setParts.join(', ')} WHERE id = ?`,
          values
        );
        return result.changes > 0;
      }
      return false;
    } catch (error) {
      console.error(`Error updating brand ${id}:`, error);
      throw error;
    }
  }

  public async deleteBrand(id: number, softDelete: boolean = true): Promise<boolean> {
    const db = this.getDatabase();
    try {
      // Check if brand is in use
      const usageCount = await db.getFirstAsync<{count: number}>(
        'SELECT COUNT(*) as count FROM products WHERE brand_id = ?',
        [id]
      );

      if (usageCount && usageCount.count > 0) {
        throw new Error(`Cannot delete brand: ${usageCount.count} products are using this brand`);
      }

      if (softDelete) {
        const result = await db.runAsync(
          'UPDATE brands SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [id]
        );
        return result.changes > 0;
      } else {
        const result = await db.runAsync('DELETE FROM brands WHERE id = ?', [id]);
        return result.changes > 0;
      }
    } catch (error) {
      console.error(`Error deleting brand ${id}:`, error);
      throw error;
    }
  }

  // ========================================
  // UNIT OF MEASURE MANAGEMENT METHODS
  // ========================================

  public async getUnits(activeOnly: boolean = true): Promise<Unit[]> {
    const db = this.getDatabase();
    try {
      const whereClause = activeOnly ? 'WHERE is_active = 1' : '';
      const units = await db.getAllAsync<Unit>(
        `SELECT * FROM units ${whereClause} ORDER BY name ASC`
      );
      return units;
    } catch (error) {
      console.error('Error getting units:', error);
      return [];
    }
  }

  public async getUnitById(id: number): Promise<Unit | null> {
    const db = this.getDatabase();
    try {
      const unit = await db.getFirstAsync<Unit>(
        'SELECT * FROM units WHERE id = ?',
        [id]
      );
      return unit || null;
    } catch (error) {
      console.error(`Error getting unit ${id}:`, error);
      return null;
    }
  }

  public async createUnit(unitData: {
    name: string;
    abbreviation: string;
    description?: string;
  }): Promise<number> {
    const db = this.getDatabase();
    try {
      // Check for duplicate unit name (case-insensitive, includes inactive)
      const existingName = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM units WHERE LOWER(name) = LOWER(?)',
        [unitData.name.trim()]
      );
      if (existingName) {
        throw new Error(`Unit "${unitData.name.trim()}" already exists. Please use a unique name.`);
      }

      // Check for duplicate abbreviation (case-insensitive, includes inactive)
      const existingAbbr = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM units WHERE LOWER(abbreviation) = LOWER(?)',
        [unitData.abbreviation.trim()]
      );
      if (existingAbbr) {
        throw new Error(`Unit abbreviation "${unitData.abbreviation.trim()}" already exists. Please use a unique abbreviation.`);
      }

      const result = await db.runAsync(
        'INSERT INTO units (name, abbreviation, description) VALUES (?, ?, ?)',
        [unitData.name.trim(), unitData.abbreviation.trim(), unitData.description || null]
      );
      console.log(`Unit created: ${unitData.name} (ID: ${result.lastInsertRowId})`);
      return result.lastInsertRowId as number;
    } catch (error) {
      console.error(`Error creating unit ${unitData.name}:`, error);
      throw error;
    }
  }

  public async updateUnit(id: number, updates: Partial<Unit>): Promise<boolean> {
    const db = this.getDatabase();
    try {
      // Check for duplicate name if name is being updated
      if (updates.name !== undefined) {
        const existingName = await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM units WHERE LOWER(name) = LOWER(?) AND id != ?',
          [updates.name.trim(), id]
        );
        if (existingName) {
          throw new Error(`Unit "${updates.name.trim()}" already exists. Please use a unique name.`);
        }
      }
      // Check for duplicate abbreviation if abbreviation is being updated
      if (updates.abbreviation !== undefined) {
        const existingAbbr = await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM units WHERE LOWER(abbreviation) = LOWER(?) AND id != ?',
          [updates.abbreviation.trim(), id]
        );
        if (existingAbbr) {
          throw new Error(`Unit abbreviation "${updates.abbreviation.trim()}" already exists. Please use a unique abbreviation.`);
        }
      }

      const setParts: string[] = [];
      const values: any[] = [];

      if (updates.name !== undefined) {
        setParts.push('name = ?');
        values.push(updates.name.trim());
      }
      if (updates.abbreviation !== undefined) {
        setParts.push('abbreviation = ?');
        values.push(updates.abbreviation.trim());
      }
      if (updates.description !== undefined) {
        setParts.push('description = ?');
        values.push(updates.description);
      }
      if (updates.is_active !== undefined) {
        setParts.push('is_active = ?');
        values.push(updates.is_active ? 1 : 0);
      }

      if (setParts.length > 0) {
        setParts.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);
        const result = await db.runAsync(
          `UPDATE units SET ${setParts.join(', ')} WHERE id = ?`,
          values
        );
        return result.changes > 0;
      }
      return false;
    } catch (error) {
      console.error(`Error updating unit ${id}:`, error);
      throw error;
    }
  }

  public async deleteUnit(id: number, softDelete: boolean = true): Promise<boolean> {
    const db = this.getDatabase();
    try {
      // Check if unit is in use
      const usageCount = await db.getFirstAsync<{count: number}>(
        'SELECT COUNT(*) as count FROM products WHERE unit_id = ?',
        [id]
      );

      if (usageCount && usageCount.count > 0) {
        throw new Error(`Cannot delete unit: ${usageCount.count} products are using this unit`);
      }

      if (softDelete) {
        const result = await db.runAsync(
          'UPDATE units SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [id]
        );
        return result.changes > 0;
      } else {
        const result = await db.runAsync('DELETE FROM units WHERE id = ?', [id]);
        return result.changes > 0;
      }
    } catch (error) {
      console.error(`Error deleting unit ${id}:`, error);
      throw error;
    }
  }

  // ========================================
  // SIZE MANAGEMENT METHODS
  // ========================================

  public async getSizes(activeOnly: boolean = true): Promise<Size[]> {
    const db = this.getDatabase();
    try {
      const whereClause = activeOnly ? 'WHERE is_active = 1' : '';
      const sizes = await db.getAllAsync<Size>(
        `SELECT * FROM sizes ${whereClause} ORDER BY sort_order ASC, name ASC`
      );
      return sizes;
    } catch (error) {
      console.error('Error getting sizes:', error);
      return [];
    }
  }

  public async getSizeById(id: number): Promise<Size | null> {
    const db = this.getDatabase();
    try {
      const size = await db.getFirstAsync<Size>(
        'SELECT * FROM sizes WHERE id = ?',
        [id]
      );
      return size || null;
    } catch (error) {
      console.error(`Error getting size ${id}:`, error);
      return null;
    }
  }

  public async createSize(sizeData: {
    name: string;
    description?: string;
    sort_order?: number;
  }): Promise<number> {
    const db = this.getDatabase();
    try {
      // Check for duplicate size name (case-insensitive, includes inactive)
      const existing = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM sizes WHERE LOWER(name) = LOWER(?)',
        [sizeData.name.trim()]
      );
      if (existing) {
        throw new Error(`Size "${sizeData.name.trim()}" already exists. Please use a unique name.`);
      }

      const result = await db.runAsync(
        'INSERT INTO sizes (name, description, sort_order) VALUES (?, ?, ?)',
        [sizeData.name.trim(), sizeData.description || null, sizeData.sort_order || 0]
      );
      console.log(`Size created: ${sizeData.name} (ID: ${result.lastInsertRowId})`);
      return result.lastInsertRowId as number;
    } catch (error) {
      console.error(`Error creating size ${sizeData.name}:`, error);
      throw error;
    }
  }

  public async updateSize(id: number, updates: Partial<Size>): Promise<boolean> {
    const db = this.getDatabase();
    try {
      // Check for duplicate name if name is being updated
      if (updates.name !== undefined) {
        const existing = await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM sizes WHERE LOWER(name) = LOWER(?) AND id != ?',
          [updates.name.trim(), id]
        );
        if (existing) {
          throw new Error(`Size "${updates.name.trim()}" already exists. Please use a unique name.`);
        }
      }

      const setParts: string[] = [];
      const values: any[] = [];

      if (updates.name !== undefined) {
        setParts.push('name = ?');
        values.push(updates.name.trim());
      }
      if (updates.description !== undefined) {
        setParts.push('description = ?');
        values.push(updates.description);
      }
      if (updates.sort_order !== undefined) {
        setParts.push('sort_order = ?');
        values.push(updates.sort_order);
      }
      if (updates.is_active !== undefined) {
        setParts.push('is_active = ?');
        values.push(updates.is_active ? 1 : 0);
      }

      if (setParts.length > 0) {
        setParts.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);
        const result = await db.runAsync(
          `UPDATE sizes SET ${setParts.join(', ')} WHERE id = ?`,
          values
        );
        return result.changes > 0;
      }
      return false;
    } catch (error) {
      console.error(`Error updating size ${id}:`, error);
      throw error;
    }
  }

  public async deleteSize(id: number, softDelete: boolean = true): Promise<boolean> {
    const db = this.getDatabase();
    try {
      // Check if size is in use
      const usageCount = await db.getFirstAsync<{count: number}>(
        'SELECT COUNT(*) as count FROM products WHERE size_id = ?',
        [id]
      );

      if (usageCount && usageCount.count > 0) {
        throw new Error(`Cannot delete size: ${usageCount.count} products are using this size`);
      }

      if (softDelete) {
        const result = await db.runAsync(
          'UPDATE sizes SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [id]
        );
        return result.changes > 0;
      } else {
        const result = await db.runAsync('DELETE FROM sizes WHERE id = ?', [id]);
        return result.changes > 0;
      }
    } catch (error) {
      console.error(`Error deleting size ${id}:`, error);
      throw error;
    }
  }

  // ========================================
  // ENHANCED PRODUCT METHODS WITH MASTER DATA
  // ========================================

  public async getProductsWithDetails(activeOnly: boolean = true, limit?: number, searchTerm?: string) {
    const db = this.getDatabase();
    try {
      let whereClause = activeOnly ? 'WHERE p.is_active = 1' : 'WHERE 1=1';
      const params: any[] = [];

      if (searchTerm && searchTerm.trim() !== '') {
        whereClause += ' AND (p.name LIKE ? OR p.code LIKE ?)';
        const searchPattern = `%${searchTerm.trim()}%`;
        params.push(searchPattern, searchPattern);
      }

      const limitClause = limit ? `LIMIT ${limit}` : 'LIMIT 100';

      const products = await db.getAllAsync<any>(
        `SELECT
          p.*,
          c.name as category_name,
          b.name as brand_name,
          u.name as unit_name,
          u.abbreviation as unit_abbreviation,
          s.name as size_name
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         LEFT JOIN brands b ON p.brand_id = b.id
         LEFT JOIN units u ON p.unit_id = u.id
         LEFT JOIN sizes s ON p.size_id = s.id
         ${whereClause}
         ORDER BY p.name
         ${limitClause}`,
        params
      );

      return products;
    } catch (error) {
      console.error('Error getting products with details:', error);
      return [];
    }
  }

  public async createProductWithDetails(productData: {
    code: string;
    name: string;
    description?: string;
    price: number;
    wholesale_price?: number | null;
    cost: number;
    category_id?: number;
    brand_id?: number;
    unit_id?: number;
    size_id?: number;
    vat_type?: 'vatable' | 'vat_exempt' | 'zero_rated';
    tax_rate?: number;
    is_vat_inclusive?: boolean;
    stock_quantity?: number;
    reorder_level?: number;
    unit?: string;
    is_active?: boolean;
  }): Promise<number> {
    const db = this.getDatabase();
    try {
      // Check for duplicate product name (case-insensitive, includes inactive)
      const existingName = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM products WHERE LOWER(name) = LOWER(?)',
        [productData.name.trim()]
      );
      if (existingName) {
        throw new Error(`Product name "${productData.name.trim()}" already exists. Please use a unique name.`);
      }

      // Check for duplicate product code (case-insensitive, includes inactive)
      const existingCode = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM products WHERE LOWER(code) = LOWER(?)',
        [productData.code.trim()]
      );
      if (existingCode) {
        throw new Error(`Product code "${productData.code.trim()}" already exists. Please use a unique code.`);
      }

      // Determine tax_rate based on vat_type
      const vatType = productData.vat_type || 'vatable';
      const taxRate = vatType === 'vatable' ? (productData.tax_rate || 12.00) : 0;
      const isVatInclusive = vatType === 'vatable' ? (productData.is_vat_inclusive !== false ? 1 : 0) : 0;

      const result = await db.runAsync(
        `INSERT INTO products (
          code, name, description, price, wholesale_price, cost, category_id, brand_id, unit_id, size_id,
          vat_type, tax_rate, is_vat_inclusive, stock_quantity, reorder_level, unit, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          productData.code,
          productData.name,
          productData.description || '',
          productData.price,
          productData.wholesale_price || null,
          productData.cost,
          productData.category_id || null,
          productData.brand_id || null,
          productData.unit_id || null,
          productData.size_id || null,
          vatType,
          taxRate,
          isVatInclusive,
          productData.stock_quantity || 0,
          productData.reorder_level || 0,
          productData.unit || 'pcs',
          productData.is_active !== false ? 1 : 0
        ]
      );
      console.log(`Product created: ${productData.name} (ID: ${result.lastInsertRowId})`);
      return result.lastInsertRowId as number;
    } catch (error) {
      console.error(`Error creating product ${productData.name}:`, error);
      throw error;
    }
  }

  public async updateProductWithDetails(productId: number, updates: {
    code?: string;
    name?: string;
    description?: string;
    price?: number;
    wholesale_price?: number | null;
    cost?: number;
    category_id?: number | null;
    brand_id?: number | null;
    unit_id?: number | null;
    size_id?: number | null;
    vat_type?: 'vatable' | 'vat_exempt' | 'zero_rated';
    tax_rate?: number;
    is_vat_inclusive?: boolean;
    stock_quantity?: number;
    reorder_level?: number;
    unit?: string;
    is_active?: boolean;
  }): Promise<boolean> {
    const db = this.getDatabase();
    try {
      // Check for duplicate product name if name is being updated
      if (updates.name !== undefined) {
        const existingName = await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM products WHERE LOWER(name) = LOWER(?) AND id != ?',
          [updates.name.trim(), productId]
        );
        if (existingName) {
          throw new Error(`Product name "${updates.name.trim()}" already exists. Please use a unique name.`);
        }
      }
      // Check for duplicate product code if code is being updated
      if (updates.code !== undefined) {
        const existingCode = await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM products WHERE LOWER(code) = LOWER(?) AND id != ?',
          [updates.code.trim(), productId]
        );
        if (existingCode) {
          throw new Error(`Product code "${updates.code.trim()}" already exists. Please use a unique code.`);
        }
      }

      const setParts: string[] = [];
      const values: any[] = [];

      if (updates.code !== undefined) {
        setParts.push('code = ?');
        values.push(updates.code.trim());
      }
      if (updates.name !== undefined) {
        setParts.push('name = ?');
        values.push(updates.name.trim());
      }
      if (updates.description !== undefined) {
        setParts.push('description = ?');
        values.push(updates.description);
      }
      if (updates.price !== undefined) {
        setParts.push('price = ?');
        values.push(updates.price);
      }
      if (updates.cost !== undefined) {
        setParts.push('cost = ?');
        values.push(updates.cost);
      }
      if (updates.wholesale_price !== undefined) {
        setParts.push('wholesale_price = ?');
        values.push(updates.wholesale_price);
      }
      if (updates.category_id !== undefined) {
        setParts.push('category_id = ?');
        values.push(updates.category_id);
      }
      if (updates.brand_id !== undefined) {
        setParts.push('brand_id = ?');
        values.push(updates.brand_id);
      }
      if (updates.unit_id !== undefined) {
        setParts.push('unit_id = ?');
        values.push(updates.unit_id);
      }
      if (updates.size_id !== undefined) {
        setParts.push('size_id = ?');
        values.push(updates.size_id);
      }
      if (updates.vat_type !== undefined) {
        setParts.push('vat_type = ?');
        values.push(updates.vat_type);
        // Auto-set tax_rate based on vat_type
        if (updates.vat_type !== 'vatable') {
          setParts.push('tax_rate = ?');
          values.push(0);
          setParts.push('is_vat_inclusive = ?');
          values.push(0);
        } else if (updates.tax_rate === undefined) {
          setParts.push('tax_rate = ?');
          values.push(12.00);
        }
      }
      if (updates.tax_rate !== undefined && updates.vat_type === undefined) {
        setParts.push('tax_rate = ?');
        values.push(updates.tax_rate);
      }
      if (updates.is_vat_inclusive !== undefined && updates.vat_type !== 'vat_exempt' && updates.vat_type !== 'zero_rated') {
        setParts.push('is_vat_inclusive = ?');
        values.push(updates.is_vat_inclusive ? 1 : 0);
      }
      if (updates.stock_quantity !== undefined) {
        setParts.push('stock_quantity = ?');
        values.push(updates.stock_quantity);
      }
      if (updates.reorder_level !== undefined) {
        setParts.push('reorder_level = ?');
        values.push(updates.reorder_level);
      }
      if (updates.unit !== undefined) {
        setParts.push('unit = ?');
        values.push(updates.unit);
      }
      if (updates.is_active !== undefined) {
        setParts.push('is_active = ?');
        values.push(updates.is_active ? 1 : 0);
      }

      if (setParts.length > 0) {
        setParts.push('updated_at = CURRENT_TIMESTAMP');
        values.push(productId);
        const result = await db.runAsync(
          `UPDATE products SET ${setParts.join(', ')} WHERE id = ?`,
          values
        );
        return result.changes > 0;
      }
      return false;
    } catch (error) {
      console.error(`Error updating product ${productId}:`, error);
      throw error;
    }
  }

  // ========================================
  // END OF DAY METHODS
  // ========================================

  public async getEndOfDayRecords(limit: number = 30): Promise<any[]> {
    const db = this.getDatabase();
    try {
      const records = await db.getAllAsync<any>(
        `SELECT eod.*, u.full_name as cashier_name
         FROM end_of_day_records eod
         LEFT JOIN users u ON eod.created_by = u.id
         ORDER BY eod.date DESC, eod.id DESC
         LIMIT ?`,
        [limit]
      );
      return records;
    } catch (error) {
      console.error('Error getting end of day records:', error);
      return [];
    }
  }

  public async saveEndOfDay(eodData: {
    date: string;
    beginning_cash: number;
    gross_sales: number;
    discounts: number;
    sales_returns: number;
    net_sales: number;
    cash_sales: number;
    credit_sales: number;
    gcash_sales: number;
    card_sales: number;
    check_sales?: number;
    other_sales: number;
    void_amount: number;
    void_count: number;
    exchange_amount?: number;
    exchange_count?: number;
    refund_count?: number;
    transaction_count: number;
    customer_payments_received: number;
    customer_payments_cash?: number;
    customer_payments_check?: number;
    customer_payments_card?: number;
    customer_payments_online?: number;
    customer_payments_bank_transfer?: number;
    supplier_payments_made: number;
    opening_fund?: number;
    cash_in?: number;
    cash_out?: number;
    petty_cash?: number;
    cash_refunds?: number;
    cash_fund?: number;
    expected_cash: number;
    actual_cash: number;
    cash_variance: number;
    denomination_breakdown: any;
    next_day_beginning_cash: number;
    created_by: number;
    status?: string;
  }): Promise<number> {
    const db = this.getDatabase();
    try {
      const result = await db.runAsync(
        `INSERT INTO end_of_day_records (
          date, beginning_cash, gross_sales, discounts, sales_returns, net_sales,
          cash_sales, credit_sales, gcash_sales, card_sales, check_sales, other_sales,
          void_amount, void_count, exchange_amount, exchange_count, refund_count,
          transaction_count, customer_payments_received,
          customer_payments_cash, customer_payments_check, customer_payments_card,
          customer_payments_online, customer_payments_bank_transfer,
          supplier_payments_made,
          opening_fund, cash_in, cash_out, petty_cash, cash_refunds, cash_fund,
          expected_cash, actual_cash, cash_variance,
          denomination_breakdown, next_day_beginning_cash, created_by, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          eodData.date,
          eodData.beginning_cash,
          eodData.gross_sales,
          eodData.discounts,
          eodData.sales_returns,
          eodData.net_sales,
          eodData.cash_sales,
          eodData.credit_sales,
          eodData.gcash_sales,
          eodData.card_sales,
          eodData.check_sales || 0,
          eodData.other_sales,
          eodData.void_amount,
          eodData.void_count,
          eodData.exchange_amount || 0,
          eodData.exchange_count || 0,
          eodData.refund_count || 0,
          eodData.transaction_count,
          eodData.customer_payments_received,
          eodData.customer_payments_cash || 0,
          eodData.customer_payments_check || 0,
          eodData.customer_payments_card || 0,
          eodData.customer_payments_online || 0,
          eodData.customer_payments_bank_transfer || 0,
          eodData.supplier_payments_made,
          eodData.opening_fund || 0,
          eodData.cash_in || 0,
          eodData.cash_out || 0,
          eodData.petty_cash || 0,
          eodData.cash_refunds || 0,
          eodData.cash_fund || 0,
          eodData.expected_cash,
          eodData.actual_cash,
          eodData.cash_variance,
          JSON.stringify(eodData.denomination_breakdown),
          eodData.next_day_beginning_cash,
          eodData.created_by,
          eodData.status || 'COMPLETED'
        ]
      );
      console.log(`End of Day saved for ${eodData.date} (ID: ${result.lastInsertRowId})`);
      return result.lastInsertRowId as number;
    } catch (error) {
      console.error('Error saving end of day:', error);
      throw error;
    }
  }

  // ========================================
  // SALES RETURNS METHODS
  // ========================================

  public async getSalesReturns(limit: number = 100): Promise<any[]> {
    const db = this.getDatabase();
    try {
      const returns = await db.getAllAsync<any>(
        `SELECT sr.*, u.full_name as processed_by_name
         FROM sales_returns sr
         LEFT JOIN users u ON sr.processed_by = u.id
         ORDER BY sr.return_date DESC, sr.id DESC
         LIMIT ?`,
        [limit]
      );
      return returns;
    } catch (error) {
      console.error('Error getting sales returns:', error);
      return [];
    }
  }

  public async createSalesReturn(returnData: {
    return_number: string;
    original_transaction_id: number;
    original_invoice_number: string;
    customer_id?: number;
    customer_name?: string;
    return_date: string;
    total_amount: number;
    refund_method: 'CASH' | 'CREDIT' | 'EXCHANGE';
    reason: string;
    notes?: string;
    processed_by: number;
    items: Array<{
      product_id: number;
      product_code: string;
      product_name: string;
      quantity: number;
      unit_price: number;
      total_amount: number;
    }>;
  }): Promise<number> {
    const db = this.getDatabase();
    try {
      // Insert sales return header
      const result = await db.runAsync(
        `INSERT INTO sales_returns (
          return_number, original_transaction_id, original_invoice_number,
          customer_id, customer_name, return_date, total_amount, refund_method,
          reason, notes, processed_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          returnData.return_number,
          returnData.original_transaction_id,
          returnData.original_invoice_number,
          returnData.customer_id || null,
          returnData.customer_name || null,
          returnData.return_date,
          returnData.total_amount,
          returnData.refund_method,
          returnData.reason,
          returnData.notes || null,
          returnData.processed_by
        ]
      );

      const returnId = result.lastInsertRowId as number;

      // Insert return items
      for (const item of returnData.items) {
        await db.runAsync(
          `INSERT INTO sales_return_items (
            sales_return_id, product_id, product_code, product_name,
            quantity, unit_price, total_amount
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            returnId,
            item.product_id,
            item.product_code,
            item.product_name,
            item.quantity,
            item.unit_price,
            item.total_amount
          ]
        );

        // Record inventory movement (this also updates stock quantity)
        await this.recordInventoryMovement({
          product_id: item.product_id,
          movement_type: 'IN',
          quantity: item.quantity,
          reference_type: 'SALES_RETURN',
          reference_id: returnId,
          reference_number: returnData.return_number,
          notes: `Sales return: ${returnData.reason}`,
          created_by: returnData.processed_by
        });
      }

      // Handle CREDIT refund - update accounts_receivable balance
      if (returnData.refund_method === 'CREDIT' && returnData.customer_id) {
        // Update accounts_receivable to reduce customer's outstanding balance
        // Negative balance = customer has credit/advance payment
        await db.runAsync(
          `UPDATE accounts_receivable
           SET balance_amount = balance_amount - ?,
               status = CASE
                 WHEN balance_amount - ? < 0 THEN 'CREDIT'
                 WHEN balance_amount - ? = 0 THEN 'PAID'
                 ELSE 'PARTIALLY_PAID'
               END
           WHERE id = (SELECT id FROM accounts_receivable WHERE customer_id = ? AND balance_amount >= 0 ORDER BY created_at ASC LIMIT 1)`,
          [returnData.total_amount, returnData.total_amount, returnData.total_amount, returnData.customer_id]
        );
      }

      // Create eJournal entry with Philippine time
      const phDateTime = getPhilippineDateTimeString();
      await db.runAsync(
        `INSERT INTO ejournal (entry_type, reference_number, description, amount, cashier_id, timestamp, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['RETURN', returnData.return_number,
         `Sales return - ${returnData.refund_method} - ${returnData.items.length} items`,
         -returnData.total_amount, returnData.processed_by, phDateTime, phDateTime]
      );

      console.log(`Sales return created: ${returnData.return_number} (ID: ${returnId})`);
      return returnId;
    } catch (error) {
      console.error('Error creating sales return:', error);
      throw error;
    }
  }

  // Get transaction for return lookup
  public async getTransactionForReturn(transactionNumber: string): Promise<any | null> {
    const db = this.getDatabase();
    try {
      const transaction = await db.getFirstAsync<any>(
        `SELECT t.*, c.name as customer_full_name
         FROM transactions t
         LEFT JOIN customers c ON t.customer_id = c.id
         WHERE t.transaction_number = ? AND t.status = 'COMPLETED'`,
        [transactionNumber]
      );

      if (transaction) {
        // Get transaction items
        const items = await db.getAllAsync<any>(
          `SELECT ti.*, p.stock_quantity as current_stock
           FROM transaction_items ti
           LEFT JOIN products p ON ti.product_id = p.id
           WHERE ti.transaction_id = ?`,
          [transaction.id]
        );
        transaction.items = items;
      }

      return transaction || null;
    } catch (error) {
      console.error('Error getting transaction for return:', error);
      return null;
    }
  }

  // Get recent transactions for return lookup (last 30 days)
  public async getRecentTransactionsForReturn(): Promise<any[]> {
    const db = this.getDatabase();
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const dateStr = thirtyDaysAgo.toISOString();

      const transactions = await db.getAllAsync<any>(
        `SELECT t.id, t.transaction_number, t.total_amount, t.created_at,
                t.customer_id, t.customer_name, c.name as customer_full_name
         FROM transactions t
         LEFT JOIN customers c ON t.customer_id = c.id
         WHERE t.status = 'COMPLETED' AND t.created_at >= ?
         ORDER BY t.created_at DESC`,
        [dateStr]
      );

      return transactions || [];
    } catch (error) {
      console.error('Error getting recent transactions for return:', error);
      return [];
    }
  }

  // Get transactions for date range (for void/refund/exchange invoice browsing)
  // excludeWithReturns: when true, filters out transactions that have associated sales_returns (refunds/exchanges)
  // cashierId: when provided, filters to only show transactions by that specific cashier
  // excludeClosedShifts: when true (for void modal), filters out transactions from closed shifts
  public async getTransactionsForDateRange(
    startDate: string,
    endDate: string,
    excludeWithReturns: boolean = false,
    cashierId?: number,
    excludeClosedShifts: boolean = false
  ): Promise<any[]> {
    const db = this.getDatabase();
    try {
      let transactions: any[];

      // Build cashier filter clause
      const cashierFilter = cashierId ? `AND t.cashier_id = ${cashierId}` : '';

      // Build closed shift exclusion clause
      // Exclude transactions where:
      // - A shift exists for that cashier and transaction time
      // - AND that shift has been closed (end_time is NOT NULL OR status = 'CLOSED')
      const closedShiftFilter = excludeClosedShifts ? `
        AND NOT EXISTS (
          SELECT 1 FROM shifts s
          WHERE s.user_id = t.cashier_id
            AND datetime(t.transaction_date) >= datetime(s.start_time)
            AND (s.end_time IS NULL OR datetime(t.transaction_date) <= datetime(s.end_time))
            AND (s.status = 'CLOSED' OR s.end_time IS NOT NULL)
        )
      ` : '';

      if (excludeWithReturns) {
        // Query that excludes transactions with associated returns
        transactions = await db.getAllAsync<any>(
          `SELECT
            t.id,
            t.transaction_number,
            t.invoice_number,
            t.customer_id,
            t.customer_name,
            c.name as customer_full_name,
            t.subtotal,
            t.tax_amount,
            t.discount_amount,
            t.total_amount,
            t.payment_method,
            t.status,
            t.sc_pwd_id,
            t.sc_pwd_name,
            t.sc_pwd_type,
            t.transaction_date,
            t.created_at,
            t.cashier_id,
            u.full_name as cashier_name
           FROM transactions t
           LEFT JOIN customers c ON t.customer_id = c.id
           LEFT JOIN users u ON t.cashier_id = u.id
           WHERE t.status = 'COMPLETED'
             AND DATE(t.transaction_date) >= DATE(?)
             AND DATE(t.transaction_date) <= DATE(?)
             ${cashierFilter}
             ${closedShiftFilter}
             AND NOT EXISTS (SELECT 1 FROM sales_returns sr WHERE sr.original_transaction_id = t.id)
           ORDER BY t.transaction_date DESC`,
          [startDate, endDate]
        );
      } else {
        // Query without the returns filter
        transactions = await db.getAllAsync<any>(
          `SELECT
            t.id,
            t.transaction_number,
            t.invoice_number,
            t.customer_id,
            t.customer_name,
            c.name as customer_full_name,
            t.subtotal,
            t.tax_amount,
            t.discount_amount,
            t.total_amount,
            t.payment_method,
            t.status,
            t.sc_pwd_id,
            t.sc_pwd_name,
            t.sc_pwd_type,
            t.transaction_date,
            t.created_at,
            t.cashier_id,
            u.full_name as cashier_name
           FROM transactions t
           LEFT JOIN customers c ON t.customer_id = c.id
           LEFT JOIN users u ON t.cashier_id = u.id
           WHERE t.status = 'COMPLETED'
             AND DATE(t.transaction_date) >= DATE(?)
             AND DATE(t.transaction_date) <= DATE(?)
             ${cashierFilter}
             ${closedShiftFilter}
           ORDER BY t.transaction_date DESC`,
          [startDate, endDate]
        );
      }

      return transactions || [];
    } catch (error) {
      console.error('Error getting transactions for date range:', error);
      return [];
    }
  }

  // Get sales returns associated with a transaction
  public async getSalesReturnsByTransaction(transactionId: number): Promise<any[]> {
    const db = this.getDatabase();
    try {
      const returns = await db.getAllAsync<any>(
        `SELECT sr.*,
                (SELECT COUNT(*) FROM sales_return_items WHERE sales_return_id = sr.id) as item_count
         FROM sales_returns sr
         WHERE sr.original_transaction_id = ?
         ORDER BY sr.return_date DESC`,
        [transactionId]
      );
      return returns || [];
    } catch (error) {
      console.error('Error getting sales returns by transaction:', error);
      return [];
    }
  }

  /**
   * Check if a transaction belongs to a closed shift
   * Returns { isClosedShift: boolean, shiftId?: number, message?: string }
   */
  public async isTransactionInClosedShift(transactionId: number): Promise<{ isClosedShift: boolean; shiftId?: number; message?: string }> {
    const db = this.getDatabase();
    try {
      // Get the transaction details
      const transaction = await db.getFirstAsync<any>(
        `SELECT id, transaction_date, cashier_id, status FROM transactions WHERE id = ?`,
        [transactionId]
      );

      if (!transaction) {
        return { isClosedShift: false, message: 'Transaction not found' };
      }

      // Find the shift that this transaction belongs to
      // A transaction belongs to a shift if:
      // 1. Same cashier (user_id = cashier_id)
      // 2. transaction_date >= shift.start_time
      // 3. If shift has end_time, transaction_date <= shift.end_time
      const shift = await db.getFirstAsync<any>(
        `SELECT id, user_id, start_time, end_time, status
         FROM shifts
         WHERE user_id = ?
           AND datetime(?) >= datetime(start_time)
           AND (end_time IS NULL OR datetime(?) <= datetime(end_time))
         ORDER BY start_time DESC
         LIMIT 1`,
        [transaction.cashier_id, transaction.transaction_date, transaction.transaction_date]
      );

      if (!shift) {
        // No shift found - transaction might be from before shift tracking was implemented
        return { isClosedShift: false, message: 'No associated shift found' };
      }

      // Check if the shift is closed
      if (shift.status === 'CLOSED' || shift.end_time !== null) {
        return {
          isClosedShift: true,
          shiftId: shift.id,
          message: 'Transaction belongs to a closed shift and cannot be voided'
        };
      }

      return {
        isClosedShift: false,
        shiftId: shift.id,
        message: 'Transaction belongs to an open shift'
      };
    } catch (error) {
      console.error('Error checking if transaction is in closed shift:', error);
      return { isClosedShift: false, message: 'Error checking shift status' };
    }
  }

  // Get voided transactions for reporting
  public async getVoidedTransactions(startDate: string, endDate: string): Promise<any[]> {
    const db = this.getDatabase();
    try {
      const transactions = await db.getAllAsync<any>(
        `SELECT
          t.id,
          t.transaction_number,
          t.invoice_number,
          t.customer_id,
          t.customer_name,
          c.name as customer_full_name,
          t.subtotal,
          t.tax_amount,
          t.discount_amount,
          t.total_amount,
          t.payment_method,
          t.status,
          t.transaction_date,
          t.void_date,
          t.void_reason,
          t.void_by,
          u.full_name as cashier_name,
          vu.full_name as void_by_name
         FROM transactions t
         LEFT JOIN customers c ON t.customer_id = c.id
         LEFT JOIN users u ON t.cashier_id = u.id
         LEFT JOIN users vu ON t.void_by = vu.id
         WHERE t.status = 'VOID'
           AND DATE(t.void_date) >= DATE(?)
           AND DATE(t.void_date) <= DATE(?)
         ORDER BY t.void_date DESC`,
        [startDate, endDate]
      );
      return transactions || [];
    } catch (error) {
      console.error('Error getting voided transactions:', error);
      return [];
    }
  }

  // Get voided transaction items
  public async getVoidedTransactionItems(transactionId: number): Promise<any[]> {
    const db = this.getDatabase();
    try {
      console.log('Getting voided transaction items for transaction ID:', transactionId);
      const items = await db.getAllAsync<any>(
        `SELECT
          ti.id,
          ti.transaction_id,
          ti.product_id,
          ti.product_code,
          ti.product_name,
          ti.quantity,
          ti.unit_price,
          ti.discount_amount,
          ti.tax_amount,
          ti.total_amount
         FROM transaction_items ti
         WHERE ti.transaction_id = ?`,
        [transactionId]
      );
      console.log('Found voided transaction items:', items?.length || 0);
      return items || [];
    } catch (error) {
      console.error('Error getting voided transaction items:', error);
      return [];
    }
  }

  // Get refund and exchange transactions for reporting
  public async getRefundExchangeTransactions(startDate: string, endDate: string, type?: 'REFUND' | 'EXCHANGE' | 'ALL'): Promise<any[]> {
    const db = this.getDatabase();
    try {
      let typeFilter = '';
      if (type === 'REFUND') {
        typeFilter = "AND sr.refund_method IN ('CASH', 'CREDIT', 'STORE_CREDIT')";
      } else if (type === 'EXCHANGE') {
        typeFilter = "AND sr.refund_method = 'EXCHANGE'";
      }

      const returns = await db.getAllAsync<any>(
        `SELECT
          sr.id,
          sr.return_number,
          sr.original_transaction_id,
          sr.original_invoice_number,
          sr.customer_id,
          sr.customer_name,
          sr.return_date,
          sr.total_amount,
          sr.refund_method,
          sr.reason,
          sr.notes,
          sr.processed_by,
          sr.status,
          u.full_name as processed_by_name,
          (SELECT COUNT(*) FROM sales_return_items WHERE sales_return_id = sr.id) as item_count
         FROM sales_returns sr
         LEFT JOIN users u ON sr.processed_by = u.id
         WHERE DATE(sr.return_date) >= DATE(?)
           AND DATE(sr.return_date) <= DATE(?)
           ${typeFilter}
         ORDER BY sr.return_date DESC`,
        [startDate, endDate]
      );
      return returns || [];
    } catch (error) {
      console.error('Error getting refund/exchange transactions:', error);
      return [];
    }
  }

  // Get refund/exchange items
  public async getRefundExchangeItems(returnId: number): Promise<any[]> {
    const db = this.getDatabase();
    try {
      console.log('Getting refund/exchange items for return ID:', returnId);
      const items = await db.getAllAsync<any>(
        `SELECT
          sri.id,
          sri.sales_return_id,
          sri.product_id,
          sri.product_code,
          sri.product_name,
          sri.quantity,
          sri.unit_price,
          sri.total_amount
         FROM sales_return_items sri
         WHERE sri.sales_return_id = ?`,
        [returnId]
      );
      console.log('Found refund/exchange items:', items?.length || 0);
      return items || [];
    } catch (error) {
      console.error('Error getting refund/exchange items:', error);
      return [];
    }
  }

  // Get exchange replacement items (new items customer received in exchange)
  public async getExchangeReplacementItems(returnId: number): Promise<any[]> {
    const db = this.getDatabase();
    try {
      console.log('Getting exchange replacement items for return ID:', returnId);
      // Replacement items are stored in inventory_movements with reference_type = 'EXCHANGE' and movement_type = 'OUT'
      const items = await db.getAllAsync<any>(
        `SELECT
          im.id,
          im.product_id,
          im.product_code,
          im.product_name,
          im.quantity,
          im.unit_cost as unit_price,
          p.price as selling_price,
          (im.quantity * p.price) as total_amount
         FROM inventory_movements im
         LEFT JOIN products p ON im.product_id = p.id
         WHERE im.reference_id = ? AND im.reference_type = 'EXCHANGE' AND im.movement_type = 'OUT'`,
        [returnId]
      );
      console.log('Found exchange replacement items:', items?.length || 0);
      return items || [];
    } catch (error) {
      console.error('Error getting exchange replacement items:', error);
      return [];
    }
  }

  // Get void/refund/exchange summary for date range
  public async getVoidRefundExchangeSummary(startDate: string, endDate: string): Promise<{
    voidCount: number;
    voidTotal: number;
    refundCount: number;
    refundTotal: number;
    exchangeCount: number;
    exchangeTotal: number;
  }> {
    const db = this.getDatabase();
    try {
      // Get void summary
      const voidResult = await db.getFirstAsync<{ count: number; total: number }>(
        `SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total
         FROM transactions
         WHERE status = 'VOID'
           AND DATE(void_date) >= DATE(?)
           AND DATE(void_date) <= DATE(?)`,
        [startDate, endDate]
      );

      // Get refund summary (excluding exchange)
      const refundResult = await db.getFirstAsync<{ count: number; total: number }>(
        `SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total
         FROM sales_returns
         WHERE refund_method IN ('CASH', 'CREDIT', 'STORE_CREDIT')
           AND DATE(return_date) >= DATE(?)
           AND DATE(return_date) <= DATE(?)`,
        [startDate, endDate]
      );

      // Get exchange summary
      const exchangeResult = await db.getFirstAsync<{ count: number; total: number }>(
        `SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total
         FROM sales_returns
         WHERE refund_method = 'EXCHANGE'
           AND DATE(return_date) >= DATE(?)
           AND DATE(return_date) <= DATE(?)`,
        [startDate, endDate]
      );

      return {
        voidCount: voidResult?.count || 0,
        voidTotal: voidResult?.total || 0,
        refundCount: refundResult?.count || 0,
        refundTotal: refundResult?.total || 0,
        exchangeCount: exchangeResult?.count || 0,
        exchangeTotal: exchangeResult?.total || 0,
      };
    } catch (error) {
      console.error('Error getting void/refund/exchange summary:', error);
      return {
        voidCount: 0,
        voidTotal: 0,
        refundCount: 0,
        refundTotal: 0,
        exchangeCount: 0,
        exchangeTotal: 0,
      };
    }
  }

  // Process a complete sales return with all tracking
  public async processSalesReturn(returnData: {
    original_transaction_id?: number;
    original_transaction_number?: string;
    customer_id?: number;
    customer_name?: string;
    items: Array<{
      product_id: number;
      product_name: string;
      quantity: number;
      unit_price: number;
      reason: string;
    }>;
    refund_method: 'CASH' | 'CREDIT' | 'STORE_CREDIT' | 'EXCHANGE';
    notes?: string;
    created_by: number;
  }): Promise<{ returnId: number; returnNumber: string }> {
    const db = this.getDatabase();

    // Generate return number
    const countResult = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM sales_returns'
    );
    const returnNumber = `RTN-${String((countResult?.count || 0) + 1).padStart(6, '0')}`;

    // Calculate total
    const totalAmount = returnData.items.reduce(
      (sum, item) => sum + (item.quantity * item.unit_price), 0
    );

    // Create return record with Philippine date/time
    const phDateTime = getPhilippineDateTimeString();
    const result = await db.runAsync(
      `INSERT INTO sales_returns (
        return_number, original_transaction_id, original_invoice_number,
        customer_id, customer_name, return_date, total_amount, refund_method,
        reason, notes, processed_by, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?)`,
      [
        returnNumber,
        returnData.original_transaction_id || null,
        returnData.original_transaction_number || null,
        returnData.customer_id || null,
        returnData.customer_name || 'Walk-in',
        phDateTime,
        totalAmount,
        returnData.refund_method,
        returnData.items.map(i => i.reason).join('; '),
        returnData.notes || null,
        returnData.created_by,
        phDateTime
      ]
    );

    const returnId = result.lastInsertRowId as number;

    // Process each item
    for (const item of returnData.items) {
      // Insert return item
      await db.runAsync(
        `INSERT INTO sales_return_items (
          sales_return_id, product_id, product_code, product_name,
          quantity, unit_price, total_amount
        ) VALUES (?, ?, '', ?, ?, ?, ?)`,
        [returnId, item.product_id, item.product_name,
         item.quantity, item.unit_price, item.quantity * item.unit_price]
      );

      // Record inventory movement (this also updates stock quantity)
      await this.recordInventoryMovement({
        product_id: item.product_id,
        movement_type: 'IN',
        quantity: item.quantity,
        reference_type: 'SALES_RETURN',
        reference_id: returnId,
        reference_number: returnNumber,
        notes: `Sales return: ${item.reason}`,
        created_by: returnData.created_by
      });
    }

    // Handle CREDIT refund - reduce customer's accounts receivable balance
    // Negative balance = customer has credit/advance payment
    if (returnData.refund_method === 'CREDIT' && returnData.customer_id) {
      await db.runAsync(
        `UPDATE accounts_receivable
         SET balance_amount = balance_amount - ?,
             status = CASE
               WHEN balance_amount - ? < 0 THEN 'CREDIT'
               WHEN balance_amount - ? = 0 THEN 'PAID'
               ELSE 'PARTIALLY_PAID'
             END
         WHERE id = (SELECT id FROM accounts_receivable WHERE customer_id = ? AND balance_amount >= 0 ORDER BY created_at ASC LIMIT 1)`,
        [totalAmount, totalAmount, totalAmount, returnData.customer_id]
      );
    }

    // Handle CASH refund - record cash movement for accurate Expected Cash calculation
    if (returnData.refund_method === 'CASH') {
      await this.createCashMovement({
        movement_type: 'CASH_REFUND',
        amount: totalAmount,
        description: `Cash refund for ${returnNumber}`,
        reference_number: returnNumber,
        cashier_id: returnData.created_by
      });
    }

    // Create eJournal entry with Philippine time
    const phDateTimeEJ = getPhilippineDateTimeString();
    await db.runAsync(
      `INSERT INTO ejournal (entry_type, reference_number, description, amount, cashier_id, timestamp, created_at)
       VALUES ('RETURN', ?, ?, ?, ?, ?, ?)`,
      [returnNumber, `Sales return - ${returnData.refund_method}`, -totalAmount, returnData.created_by, phDateTimeEJ, phDateTimeEJ]
    );

    console.log(`Sales return processed: ${returnNumber}, Total: ${totalAmount}`);
    return { returnId, returnNumber };
  }

  // ========================================
  // RETURNS ANALYTICS METHODS
  // ========================================

  /**
   * Get BO return items (item_type='return' in transaction_items within normal sales)
   */
  public async getBOReturnItems(startDate: string, endDate: string): Promise<any[]> {
    const db = this.getDatabase();
    try {
      const results = await db.getAllAsync(
        `SELECT ti.id, ti.transaction_id, ti.product_id, ti.product_code, ti.product_name,
                ti.quantity, ti.unit_price, ti.total_amount, ti.created_at,
                t.transaction_number, t.invoice_number, t.customer_name,
                t.transaction_date
         FROM transaction_items ti
         JOIN transactions t ON ti.transaction_id = t.id
         WHERE ti.item_type = 'return'
           AND DATE(t.transaction_date) >= ?
           AND DATE(t.transaction_date) <= ?
           AND t.status = 'COMPLETED'
         ORDER BY t.transaction_date DESC`,
        [startDate, endDate]
      );
      return results || [];
    } catch (error) {
      console.error('Error getting BO return items:', error);
      return [];
    }
  }

  /**
   * Get standalone return items (sales_return_items joined with sales_returns)
   */
  public async getStandaloneReturnItems(startDate: string, endDate: string): Promise<any[]> {
    const db = this.getDatabase();
    try {
      const results = await db.getAllAsync(
        `SELECT sri.id, sri.sales_return_id, sri.product_id, sri.product_code, sri.product_name,
                sri.quantity, sri.unit_price, sri.total_amount, sri.created_at,
                sr.return_number, sr.original_invoice_number, sr.customer_name,
                sr.return_date, sr.refund_method, sr.reason, sr.status as return_status,
                u.full_name as processed_by_name
         FROM sales_return_items sri
         JOIN sales_returns sr ON sri.sales_return_id = sr.id
         LEFT JOIN users u ON sr.processed_by = u.id
         WHERE DATE(sr.return_date) >= ?
           AND DATE(sr.return_date) <= ?
           AND sr.status = 'COMPLETED'
         ORDER BY sr.return_date DESC`,
        [startDate, endDate]
      );
      return results || [];
    } catch (error) {
      console.error('Error getting standalone return items:', error);
      return [];
    }
  }

  /**
   * Get top returned products combining both BO and standalone sources
   */
  public async getTopReturnedProducts(startDate: string, endDate: string, limit: number = 20): Promise<any[]> {
    const db = this.getDatabase();
    try {
      const results = await db.getAllAsync(
        `SELECT product_id, product_code, product_name,
                SUM(quantity) as total_quantity,
                COUNT(*) as times_returned,
                SUM(total_amount) as total_amount
         FROM (
           SELECT ti.product_id, ti.product_code, ti.product_name, ti.quantity, ABS(ti.total_amount) as total_amount
           FROM transaction_items ti
           JOIN transactions t ON ti.transaction_id = t.id
           WHERE ti.item_type = 'return'
             AND DATE(t.transaction_date) >= ? AND DATE(t.transaction_date) <= ?
             AND t.status = 'COMPLETED'
           UNION ALL
           SELECT sri.product_id, sri.product_code, sri.product_name, sri.quantity, sri.total_amount
           FROM sales_return_items sri
           JOIN sales_returns sr ON sri.sales_return_id = sr.id
           WHERE DATE(sr.return_date) >= ? AND DATE(sr.return_date) <= ?
             AND sr.status = 'COMPLETED'
         )
         GROUP BY product_id, product_code, product_name
         ORDER BY total_quantity DESC
         LIMIT ?`,
        [startDate, endDate, startDate, endDate, limit]
      );
      return results || [];
    } catch (error) {
      console.error('Error getting top returned products:', error);
      return [];
    }
  }

  /**
   * Get returns summary: aggregate counts/amounts for BO, Standalone Refund, and Exchange
   */
  public async getReturnsSummary(startDate: string, endDate: string): Promise<any> {
    const db = this.getDatabase();
    try {
      // BO returns
      const boResult = await db.getFirstAsync<any>(
        `SELECT COUNT(*) as count, COALESCE(SUM(ABS(ti.total_amount)), 0) as total
         FROM transaction_items ti
         JOIN transactions t ON ti.transaction_id = t.id
         WHERE ti.item_type = 'return'
           AND DATE(t.transaction_date) >= ? AND DATE(t.transaction_date) <= ?
           AND t.status = 'COMPLETED'`,
        [startDate, endDate]
      );

      // Standalone refunds (CASH, CREDIT, STORE_CREDIT)
      const refundResult = await db.getFirstAsync<any>(
        `SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total
         FROM sales_returns
         WHERE refund_method IN ('CASH', 'CREDIT', 'STORE_CREDIT')
           AND DATE(return_date) >= ? AND DATE(return_date) <= ?
           AND status = 'COMPLETED'`,
        [startDate, endDate]
      );

      // Exchanges
      const exchangeResult = await db.getFirstAsync<any>(
        `SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total
         FROM sales_returns
         WHERE refund_method = 'EXCHANGE'
           AND DATE(return_date) >= ? AND DATE(return_date) <= ?
           AND status = 'COMPLETED'`,
        [startDate, endDate]
      );

      return {
        boCount: boResult?.count || 0,
        boTotal: boResult?.total || 0,
        refundCount: refundResult?.count || 0,
        refundTotal: refundResult?.total || 0,
        exchangeCount: exchangeResult?.count || 0,
        exchangeTotal: exchangeResult?.total || 0,
      };
    } catch (error) {
      console.error('Error getting returns summary:', error);
      return { boCount: 0, boTotal: 0, refundCount: 0, refundTotal: 0, exchangeCount: 0, exchangeTotal: 0 };
    }
  }

  /**
   * Get return reason analysis from standalone returns
   */
  public async getReturnReasonAnalysis(startDate: string, endDate: string): Promise<any[]> {
    const db = this.getDatabase();
    try {
      const results = await db.getAllAsync(
        `SELECT sr.reason,
                COUNT(DISTINCT sr.id) as return_count,
                SUM(sri.quantity) as total_quantity,
                SUM(sri.total_amount) as total_amount
         FROM sales_returns sr
         JOIN sales_return_items sri ON sr.id = sri.sales_return_id
         WHERE DATE(sr.return_date) >= ? AND DATE(sr.return_date) <= ?
           AND sr.status = 'COMPLETED'
         GROUP BY sr.reason
         ORDER BY total_amount DESC`,
        [startDate, endDate]
      );
      return results || [];
    } catch (error) {
      console.error('Error getting return reason analysis:', error);
      return [];
    }
  }

  /**
   * Get refund method breakdown from standalone returns
   */
  public async getRefundMethodBreakdown(startDate: string, endDate: string): Promise<any[]> {
    const db = this.getDatabase();
    try {
      const results = await db.getAllAsync(
        `SELECT sr.refund_method,
                COUNT(DISTINCT sr.id) as transaction_count,
                SUM(sri.quantity) as total_quantity,
                SUM(sri.total_amount) as total_amount
         FROM sales_returns sr
         JOIN sales_return_items sri ON sr.id = sri.sales_return_id
         WHERE DATE(sr.return_date) >= ? AND DATE(sr.return_date) <= ?
           AND sr.status = 'COMPLETED'
         GROUP BY sr.refund_method
         ORDER BY total_amount DESC`,
        [startDate, endDate]
      );
      return results || [];
    } catch (error) {
      console.error('Error getting refund method breakdown:', error);
      return [];
    }
  }

  // ========================================
  // PURCHASE RETURNS METHODS
  // ========================================

  public async getPurchaseReturns(supplierId?: number): Promise<any[]> {
    const db = this.getDatabase();
    try {
      let query = `SELECT pr.*, s.name as supplier_name, u.full_name as processed_by_name
                   FROM purchase_returns pr
                   LEFT JOIN suppliers s ON pr.supplier_id = s.id
                   LEFT JOIN users u ON pr.processed_by = u.id`;

      if (supplierId) {
        query += ` WHERE pr.supplier_id = ?`;
      }
      query += ` ORDER BY pr.return_date DESC`;

      const returns = supplierId
        ? await db.getAllAsync<any>(query, [supplierId])
        : await db.getAllAsync<any>(query);

      return returns;
    } catch (error) {
      console.error('Error getting purchase returns:', error);
      return [];
    }
  }

  public async getPurchaseForReturn(purchaseId: string): Promise<any | null> {
    const db = this.getDatabase();
    try {
      const purchase = await db.getFirstAsync<any>(
        `SELECT p.*, s.name as supplier_name
         FROM purchases p
         LEFT JOIN suppliers s ON p.supplier_id = s.id
         WHERE p.purchase_number = ? OR p.id = ?`,
        [purchaseId, purchaseId]
      );

      if (purchase) {
        const items = await db.getAllAsync<any>(
          `SELECT pd.*, pr.name as product_name, pr.stock_quantity as current_stock
           FROM purchase_details pd
           LEFT JOIN products pr ON pd.product_id = pr.id
           WHERE pd.purchase_id = ?`,
          [purchase.id]
        );
        purchase.items = items;
      }

      return purchase || null;
    } catch (error) {
      console.error('Error getting purchase for return:', error);
      return null;
    }
  }

  public async processPurchaseReturn(returnData: {
    original_purchase_id?: string;
    supplier_id: number;
    supplier_name: string;
    items: Array<{
      product_id: number;
      product_name: string;
      quantity: number;
      unit_cost: number;
      reason: string;
    }>;
    refund_method: 'CASH' | 'CREDIT' | 'REPLACEMENT';
    notes?: string;
    created_by: number;
  }): Promise<{ returnId: number; returnNumber: string }> {
    const db = this.getDatabase();

    // Generate return number
    const countResult = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM purchase_returns'
    );
    const returnNumber = `PR-${String((countResult?.count || 0) + 1).padStart(6, '0')}`;

    // Calculate total
    const totalAmount = returnData.items.reduce(
      (sum, item) => sum + (item.quantity * item.unit_cost), 0
    );

    // Create return record with Philippine date/time
    const phDateTime = getPhilippineDateTimeString();
    const result = await db.runAsync(
      `INSERT INTO purchase_returns (
        return_number, original_purchase_id, supplier_id, supplier_name,
        return_date, total_amount, refund_method, reason, notes, processed_by, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?)`,
      [
        returnNumber,
        returnData.original_purchase_id || null,
        returnData.supplier_id,
        returnData.supplier_name,
        phDateTime,
        totalAmount,
        returnData.refund_method,
        returnData.items.map(i => i.reason).join('; '),
        returnData.notes || null,
        returnData.created_by,
        phDateTime
      ]
    );

    const returnId = result.lastInsertRowId as number;

    // Process each item
    for (const item of returnData.items) {
      // Insert return item
      await db.runAsync(
        `INSERT INTO purchase_return_items (
          purchase_return_id, product_id, product_name,
          quantity, unit_cost, total_cost, reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [returnId, item.product_id, item.product_name,
         item.quantity, item.unit_cost, item.quantity * item.unit_cost, item.reason]
      );

      // Record inventory movement (this also updates stock quantity)
      await this.recordInventoryMovement({
        product_id: item.product_id,
        movement_type: 'OUT',
        quantity: item.quantity,
        reference_type: 'PURCHASE_RETURN',
        reference_id: returnId,
        reference_number: returnNumber,
        notes: `Return to supplier: ${item.reason}`,
        created_by: returnData.created_by
      });
    }

    // Handle CREDIT refund - reduce AP
    if (returnData.refund_method === 'CREDIT') {
      await db.runAsync(
        `UPDATE accounts_payable
         SET paid_amount = paid_amount + ?,
             balance_amount = CASE WHEN balance_amount - ? < 0 THEN 0 ELSE balance_amount - ? END,
             status = CASE WHEN balance_amount - ? <= 0 THEN 'PAID' ELSE 'PARTIALLY_PAID' END,
             updated_at = ?
         WHERE id = (SELECT id FROM accounts_payable WHERE supplier_id = ? AND balance_amount > 0 ORDER BY created_at ASC LIMIT 1)`,
        [totalAmount, totalAmount, totalAmount, totalAmount, phDateTime, returnData.supplier_id]
      );
    }

    // Create eJournal entry with Philippine time
    const phDateTimePR = getPhilippineDateTimeString();
    await db.runAsync(
      `INSERT INTO ejournal (entry_type, reference_number, description, amount, cashier_id, timestamp, created_at)
       VALUES ('PURCHASE_RETURN', ?, ?, ?, ?, ?, ?)`,
      [returnNumber, `Purchase return to ${returnData.supplier_name}`, -totalAmount, returnData.created_by, phDateTimePR, phDateTimePR]
    );

    console.log(`Purchase return processed: ${returnNumber}, Total: ${totalAmount}`);
    return { returnId, returnNumber };
  }

  // ========================================
  // EJOURNAL REPORT METHODS (BIR Compliance)
  // ========================================

  public async getEJournalEntries(options: {
    startDate?: string;
    endDate?: string;
    entryType?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{
    entries: Array<{
      id: number;
      transaction_id: number | null;
      entry_type: string;
      reference_number: string;
      description: string;
      amount: number | null;
      cashier_id: number;
      cashier_name: string;
      timestamp: string;
      created_at: string;
    }>;
    total: number;
  }> {
    const db = this.getDatabase();

    // eSales Journal: only sales-related entry types
    const SALES_ENTRY_TYPES = ['SALE', 'VOID', 'REFUND', 'RETURN', 'PURCHASE_RETURN', 'PAYMENT'];

    let whereClause = `1=1 AND e.entry_type IN (${SALES_ENTRY_TYPES.map(() => '?').join(',')})`;
    const params: any[] = [...SALES_ENTRY_TYPES];

    if (options.startDate) {
      whereClause += ' AND DATE(e.timestamp) >= ?';
      params.push(options.startDate);
    }

    if (options.endDate) {
      whereClause += ' AND DATE(e.timestamp) <= ?';
      params.push(options.endDate);
    }

    if (options.entryType && options.entryType !== 'ALL') {
      whereClause += ' AND e.entry_type = ?';
      params.push(options.entryType);
    }

    // Get total count
    const countResult = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM ejournal e WHERE ${whereClause}`,
      params
    );

    // Get entries with cashier name
    const limit = options.limit || 100;
    const offset = options.offset || 0;

    const entries = await db.getAllAsync<{
      id: number;
      transaction_id: number | null;
      entry_type: string;
      reference_number: string;
      description: string;
      amount: number | null;
      cashier_id: number;
      cashier_name: string;
      timestamp: string;
      created_at: string;
    }>(
      `SELECT
        e.id,
        e.transaction_id,
        e.entry_type,
        e.reference_number,
        e.description,
        e.amount,
        e.cashier_id,
        COALESCE(u.full_name, u.username, 'System') as cashier_name,
        e.timestamp,
        e.created_at
      FROM ejournal e
      LEFT JOIN users u ON e.cashier_id = u.id
      WHERE ${whereClause}
      ORDER BY e.timestamp DESC, e.id DESC
      LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      entries,
      total: countResult?.count || 0
    };
  }

  public async getEJournalSummary(startDate: string, endDate: string): Promise<{
    totalEntries: number;
    totalSales: number;
    totalVoids: number;
    totalRefunds: number;
    totalReturns: number;
    totalPayments: number;
    byType: Array<{ entry_type: string; count: number; total_amount: number }>;
  }> {
    const db = this.getDatabase();

    // eSales Journal: only sales-related entry types
    const salesFilter = `AND entry_type IN ('SALE', 'VOID', 'REFUND', 'RETURN', 'PURCHASE_RETURN', 'PAYMENT')`;

    const summary = await db.getFirstAsync<{
      totalEntries: number;
      totalSales: number;
      totalVoids: number;
      totalRefunds: number;
      totalReturns: number;
      totalPayments: number;
    }>(
      `SELECT
        COUNT(*) as totalEntries,
        COALESCE(SUM(CASE WHEN entry_type = 'SALE' THEN amount ELSE 0 END), 0) as totalSales,
        COALESCE(SUM(CASE WHEN entry_type = 'VOID' THEN ABS(amount) ELSE 0 END), 0) as totalVoids,
        COALESCE(SUM(CASE WHEN entry_type = 'REFUND' THEN ABS(amount) ELSE 0 END), 0) as totalRefunds,
        COALESCE(SUM(CASE WHEN entry_type IN ('RETURN', 'PURCHASE_RETURN') THEN ABS(amount) ELSE 0 END), 0) as totalReturns,
        COALESCE(SUM(CASE WHEN entry_type = 'PAYMENT' THEN amount ELSE 0 END), 0) as totalPayments
      FROM ejournal
      WHERE DATE(timestamp) >= ? AND DATE(timestamp) <= ? ${salesFilter}`,
      [startDate, endDate]
    );

    const byType = await db.getAllAsync<{ entry_type: string; count: number; total_amount: number }>(
      `SELECT
        entry_type,
        COUNT(*) as count,
        COALESCE(SUM(ABS(amount)), 0) as total_amount
      FROM ejournal
      WHERE DATE(timestamp) >= ? AND DATE(timestamp) <= ? ${salesFilter}
      GROUP BY entry_type
      ORDER BY count DESC`,
      [startDate, endDate]
    );

    return {
      totalEntries: summary?.totalEntries || 0,
      totalSales: summary?.totalSales || 0,
      totalVoids: summary?.totalVoids || 0,
      totalRefunds: summary?.totalRefunds || 0,
      totalReturns: summary?.totalReturns || 0,
      totalPayments: summary?.totalPayments || 0,
      byType
    };
  }

  // ========================================
  // CASH MOVEMENT MANAGEMENT METHODS
  // ========================================

  public async createCashMovement(movementData: {
    movement_type: 'OPENING_FUND' | 'CASH_IN' | 'CASH_OUT' | 'PETTY_CASH' | 'CASH_REFUND';
    amount: number;
    description: string;
    reference_number?: string;
    approved_by?: string;
    cashier_id: number;
  }): Promise<number> {
    const db = this.getDatabase();
    try {
      // Use Philippine timezone
      const phDateTime = getPhilippineDateTimeString();

      const result = await db.runAsync(
        `INSERT INTO cash_movements (movement_type, amount, description, reference_number, approved_by, cashier_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          movementData.movement_type,
          movementData.amount,
          movementData.description,
          movementData.reference_number || null,
          movementData.approved_by || null,
          movementData.cashier_id,
          phDateTime
        ]
      );

      // Add eJournal entry with Philippine time
      await db.runAsync(
        `INSERT INTO ejournal (entry_type, reference_number, description, amount, cashier_id, timestamp, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'SYSTEM',
          movementData.reference_number || `CASH-${result.lastInsertRowId}`,
          `Cash ${movementData.movement_type}: ${movementData.description}`,
          movementData.movement_type === 'PETTY_CASH' || movementData.movement_type === 'CASH_OUT' || movementData.movement_type === 'CASH_REFUND'
            ? -movementData.amount
            : movementData.amount,
          movementData.cashier_id,
          phDateTime,
          phDateTime
        ]
      );

      console.log(`Cash movement recorded: ${movementData.movement_type} - ₱${movementData.amount}`);
      return result.lastInsertRowId as number;
    } catch (error) {
      console.error('Error creating cash movement:', error);
      throw error;
    }
  }

  public async getCashMovements(date?: string, cashierId?: number): Promise<any[]> {
    const db = this.getDatabase();
    try {
      let whereClause = '1=1';
      const params: any[] = [];

      if (date) {
        whereClause += ' AND DATE(cm.created_at) = ?';
        params.push(date);
      }
      if (cashierId) {
        whereClause += ' AND cm.cashier_id = ?';
        params.push(cashierId);
      }

      const movements = await db.getAllAsync<any>(
        `SELECT cm.*, u.full_name as cashier_name
         FROM cash_movements cm
         LEFT JOIN users u ON cm.cashier_id = u.id
         WHERE ${whereClause}
         ORDER BY cm.created_at DESC`,
        params
      );

      return movements;
    } catch (error) {
      console.error('Error getting cash movements:', error);
      return [];
    }
  }

  public async getCashDrawerBalance(date?: string, shiftStartTime?: string, cashierId?: number): Promise<{
    opening_fund: number;
    cash_in: number;
    cash_out: number;
    petty_cash: number;
    cash_refunds: number;
    net_balance: number;
  }> {
    const db = this.getDatabase();
    try {
      // If shiftStartTime provided, filter by shift; otherwise filter by date
      // Normalize ISO format (with 'T') to SQLite format (with space) for proper comparison
      let dateFilter: string;
      if (shiftStartTime) {
        const normalizedShiftTime = shiftStartTime.replace('T', ' ').replace('Z', '').split('.')[0];
        dateFilter = `AND datetime(created_at) >= datetime('${normalizedShiftTime}')`;
      } else if (date) {
        dateFilter = `AND DATE(created_at) = '${date}'`;
      } else {
        dateFilter = `AND DATE(created_at) = DATE('now')`;
      }

      // Filter by cashier if provided
      const cashierFilter = cashierId ? `AND cashier_id = ${cashierId}` : '';

      const result = await db.getFirstAsync<any>(`
        SELECT
          COALESCE(SUM(CASE WHEN movement_type = 'OPENING_FUND' THEN amount ELSE 0 END), 0) as opening_fund,
          COALESCE(SUM(CASE WHEN movement_type = 'CASH_IN' THEN amount ELSE 0 END), 0) as cash_in,
          COALESCE(SUM(CASE WHEN movement_type = 'CASH_OUT' THEN amount ELSE 0 END), 0) as cash_out,
          COALESCE(SUM(CASE WHEN movement_type = 'PETTY_CASH' THEN amount ELSE 0 END), 0) as petty_cash,
          COALESCE(SUM(CASE WHEN movement_type = 'CASH_REFUND' THEN amount ELSE 0 END), 0) as cash_refunds
        FROM cash_movements
        WHERE 1=1 ${dateFilter} ${cashierFilter}
      `);

      const balance = result || {
        opening_fund: 0,
        cash_in: 0,
        cash_out: 0,
        petty_cash: 0,
        cash_refunds: 0
      };

      balance.net_balance = balance.opening_fund + balance.cash_in - balance.cash_out - balance.petty_cash - balance.cash_refunds;
      return balance;
    } catch (error) {
      console.error('Error getting cash drawer balance:', error);
      return {
        opening_fund: 0,
        cash_in: 0,
        cash_out: 0,
        petty_cash: 0,
        cash_refunds: 0,
        net_balance: 0
      };
    }
  }

  // ========================================
  // VOID TRANSACTION WITH INVENTORY RESTORATION
  // ========================================

  public async voidTransaction(voidData: {
    transaction_id: number;
    void_reason: string;
    void_by: number;
  }): Promise<boolean> {
    const db = this.getDatabase();
    try {
      let success = false;

      await db.withTransactionAsync(async () => {
        // Get transaction details
        const transaction = await db.getFirstAsync<any>(
          'SELECT * FROM transactions WHERE id = ? AND status = ?',
          [voidData.transaction_id, 'COMPLETED']
        );

        if (!transaction) {
          throw new Error('Transaction not found or already voided');
        }

        // Get transaction items
        const items = await db.getAllAsync<any>(
          'SELECT * FROM transaction_items WHERE transaction_id = ?',
          [voidData.transaction_id]
        );

        // Restore inventory for each item
        for (const item of items) {
          await this.recordInventoryMovement({
            product_id: item.product_id,
            movement_type: 'IN',
            quantity: item.quantity,
            reference_type: 'VOID',
            reference_id: voidData.transaction_id,
            reference_number: `VOID-${transaction.invoice_number}`,
            notes: `Void: ${voidData.void_reason}`,
            created_by: voidData.void_by
          });
        }

        // If this was a credit transaction, reverse AR entry
        // Set to 'PAID' with zero balance since transaction is voided (CHECK constraint doesn't allow 'VOID')
        if (transaction.payment_method === 'CHARGE_INVOICE') {
          await db.runAsync(
            `UPDATE accounts_receivable
             SET status = 'PAID', balance_amount = 0, paid_amount = original_amount, updated_at = CURRENT_TIMESTAMP
             WHERE transaction_id = ?`,
            [voidData.transaction_id]
          );
        }

        // Update transaction status with Philippine time
        const phDateTime = getPhilippineDateTimeString();
        await db.runAsync(
          `UPDATE transactions
           SET status = 'VOID', void_reason = ?, void_by = ?, void_date = ?, updated_at = ?
           WHERE id = ?`,
          [voidData.void_reason, voidData.void_by, phDateTime, phDateTime, voidData.transaction_id]
        );

        // Add eJournal entry with Philippine time
        await db.runAsync(
          `INSERT INTO ejournal (transaction_id, entry_type, reference_number, description, amount, cashier_id, timestamp, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            voidData.transaction_id,
            'VOID',
            transaction.invoice_number,
            `Transaction voided: ${voidData.void_reason}`,
            -transaction.total_amount,
            voidData.void_by,
            phDateTime,
            phDateTime
          ]
        );

        success = true;
      });

      console.log(`Transaction ${voidData.transaction_id} voided successfully`);
      return success;
    } catch (error) {
      console.error('Error voiding transaction:', error);
      throw error;
    }
  }

  public async getTransactionById(transactionId: number): Promise<any> {
    const db = this.getDatabase();
    try {
      const transaction = await db.getFirstAsync<any>(
        `SELECT t.*, c.name as customer_full_name, u.full_name as cashier_name
         FROM transactions t
         LEFT JOIN customers c ON t.customer_id = c.id
         LEFT JOIN users u ON t.cashier_id = u.id
         WHERE t.id = ?`,
        [transactionId]
      );

      if (transaction) {
        const items = await db.getAllAsync<any>(
          `SELECT ti.*, p.stock_quantity as current_stock
           FROM transaction_items ti
           LEFT JOIN products p ON ti.product_id = p.id
           WHERE ti.transaction_id = ?`,
          [transactionId]
        );
        transaction.items = items;
      }

      return transaction || null;
    } catch (error) {
      console.error('Error getting transaction by ID:', error);
      return null;
    }
  }

  public async searchTransactionByInvoice(invoiceNumber: string): Promise<any> {
    const db = this.getDatabase();
    try {
      const transaction = await db.getFirstAsync<any>(
        `SELECT t.*, c.name as customer_full_name, u.full_name as cashier_name
         FROM transactions t
         LEFT JOIN customers c ON t.customer_id = c.id
         LEFT JOIN users u ON t.cashier_id = u.id
         WHERE t.invoice_number LIKE ? OR t.transaction_number LIKE ?`,
        [`%${invoiceNumber}%`, `%${invoiceNumber}%`]
      );

      if (transaction) {
        const items = await db.getAllAsync<any>(
          `SELECT ti.*, p.stock_quantity as current_stock
           FROM transaction_items ti
           LEFT JOIN products p ON ti.product_id = p.id
           WHERE ti.transaction_id = ?`,
          [transaction.id]
        );
        transaction.items = items;
      }

      return transaction || null;
    } catch (error) {
      console.error('Error searching transaction by invoice:', error);
      return null;
    }
  }

  // ========================================
  // CUSTOMER WITH AUDIT TRAIL METHODS
  // ========================================

  public async createCustomerWithAudit(customerData: {
    name: string;
    contact_person?: string;
    phone?: string;
    email?: string;
    address?: string;
    tin?: string;
    credit_terms?: number;
    credit_limit?: number;
    notes?: string;
  }, createdBy: number): Promise<number> {
    const db = this.getDatabase();
    try {
      // Check for duplicate customer name (case-insensitive, includes inactive)
      const existing = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM customers WHERE LOWER(name) = LOWER(?)',
        [customerData.name.trim()]
      );
      if (existing) {
        throw new Error(`Customer "${customerData.name.trim()}" already exists. Please use a unique name.`);
      }

      const { getNextCustomerCode, updateCustomerNumber } = await import('./schema');
      const customerCode = await getNextCustomerCode(db);

      const result = await db.runAsync(
        `INSERT INTO customers (
          code, name, contact_person, phone, email, address, tin,
          credit_terms, credit_limit, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customerCode,
          customerData.name.trim(),
          customerData.contact_person || null,
          customerData.phone || null,
          customerData.email || null,
          customerData.address || null,
          customerData.tin || null,
          customerData.credit_terms || 30,
          customerData.credit_limit || 0,
          customerData.notes || null
        ]
      );

      const customerId = result.lastInsertRowId as number;
      await updateCustomerNumber(db, customerCode);

      // Create audit trail for CREATE action
      await db.runAsync(
        `INSERT INTO customer_audit (customer_id, action, field_name, old_value, new_value, changed_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [customerId, 'CREATE', 'ALL', null, JSON.stringify(customerData), createdBy]
      );

      console.log(`Customer created with audit: ${customerData.name} (ID: ${customerId})`);
      return customerId;
    } catch (error) {
      console.error('Error creating customer with audit:', error);
      throw error;
    }
  }

  public async updateCustomerWithAudit(
    customerId: number,
    updates: {
      name?: string;
      contact_person?: string;
      phone?: string;
      email?: string;
      address?: string;
      tin?: string;
      credit_terms?: number;
      credit_limit?: number;
      is_active?: boolean;
      notes?: string;
    },
    updatedBy: number
  ): Promise<boolean> {
    const db = this.getDatabase();
    try {
      // Check for duplicate customer name if name is being updated
      if (updates.name !== undefined) {
        const existingName = await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM customers WHERE LOWER(name) = LOWER(?) AND id != ?',
          [updates.name.trim(), customerId]
        );
        if (existingName) {
          throw new Error(`Customer "${updates.name.trim()}" already exists. Please use a unique name.`);
        }
      }

      // Get existing customer data for audit trail
      const existingCustomer = await db.getFirstAsync<any>(
        'SELECT * FROM customers WHERE id = ?',
        [customerId]
      );

      if (!existingCustomer) {
        throw new Error('Customer not found');
      }

      const setParts: string[] = [];
      const values: any[] = [];

      // Track changes for audit
      for (const [key, newValue] of Object.entries(updates)) {
        if (newValue !== undefined && existingCustomer[key] !== newValue) {
          setParts.push(`${key} = ?`);
          values.push(typeof newValue === 'string' ? newValue.trim() : newValue);

          // Record audit entry for each changed field
          await db.runAsync(
            `INSERT INTO customer_audit (customer_id, action, field_name, old_value, new_value, changed_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              customerId,
              'UPDATE',
              key,
              String(existingCustomer[key] ?? ''),
              String(newValue ?? ''),
              updatedBy
            ]
          );
        }
      }

      if (setParts.length > 0) {
        setParts.push('updated_at = CURRENT_TIMESTAMP');
        values.push(customerId);

        await db.runAsync(
          `UPDATE customers SET ${setParts.join(', ')} WHERE id = ?`,
          values
        );
      }

      console.log(`Customer ${customerId} updated with audit trail`);
      return setParts.length > 0;
    } catch (error) {
      console.error('Error updating customer with audit:', error);
      throw error;
    }
  }

  public async getCustomerAuditTrail(customerId: number): Promise<any[]> {
    const db = this.getDatabase();
    try {
      const auditRecords = await db.getAllAsync<any>(
        `SELECT ca.*, u.full_name as changed_by_name
         FROM customer_audit ca
         LEFT JOIN users u ON ca.changed_by = u.id
         WHERE ca.customer_id = ?
         ORDER BY ca.changed_at DESC`,
        [customerId]
      );
      return auditRecords;
    } catch (error) {
      console.error('Error getting customer audit trail:', error);
      return [];
    }
  }

  public async searchCustomers(searchTerm: string, limit: number = 20): Promise<any[]> {
    const db = this.getDatabase();
    try {
      const customers = await db.getAllAsync<any>(
        `SELECT c.*,
          (SELECT COALESCE(SUM(balance_amount), 0) FROM accounts_receivable WHERE customer_id = c.id AND status != 'PAID') as outstanding_balance
         FROM customers c
         WHERE c.is_active = 1 AND (c.name LIKE ? OR c.code LIKE ? OR c.phone LIKE ?)
         ORDER BY c.name ASC
         LIMIT ?`,
        [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, limit]
      );
      return customers;
    } catch (error) {
      console.error('Error searching customers:', error);
      return [];
    }
  }

  public async getCustomerWithBalance(customerId: number): Promise<any> {
    const db = this.getDatabase();
    try {
      const customer = await db.getFirstAsync<any>(
        `SELECT c.*,
          (SELECT COALESCE(SUM(balance_amount), 0) FROM accounts_receivable WHERE customer_id = c.id AND status != 'PAID') as outstanding_balance
         FROM customers c
         WHERE c.id = ?`,
        [customerId]
      );
      return customer || null;
    } catch (error) {
      console.error('Error getting customer with balance:', error);
      return null;
    }
  }

  // ========================================
  // SHIFT MANAGEMENT METHODS
  // ========================================

  public async startShift(userId: number, beginningCash: number): Promise<number> {
    const db = this.getDatabase();
    try {
      // Check if there's already an open shift for this user
      const existingShift = await this.getCurrentShift(userId);
      if (existingShift) {
        throw new Error('User already has an open shift. Please close the current shift first.');
      }

      const now = getPhilippineDateTimeString();
      const result = await db.runAsync(
        `INSERT INTO shifts (user_id, start_time, beginning_cash, status, created_at)
         VALUES (?, ?, ?, 'OPEN', ?)`,
        [userId, now, beginningCash, now]
      );

      // NOTE: Beginning cash is stored in shifts table per shift, not in settings

      console.log(`Shift started: ID ${result.lastInsertRowId} for user ${userId}`);
      return result.lastInsertRowId as number;
    } catch (error) {
      console.error('Error starting shift:', error);
      throw error;
    }
  }

  public async endShift(shiftId: number, endingCash: number, zReadingId?: number): Promise<void> {
    const db = this.getDatabase();
    try {
      const now = getPhilippineDateTimeString();
      await db.runAsync(
        `UPDATE shifts
         SET end_time = ?, ending_cash = ?, status = 'CLOSED', z_reading_id = ?
         WHERE id = ?`,
        [now, endingCash, zReadingId || null, shiftId]
      );

      // NOTE: Do NOT auto-update beginning_cash setting
      // Each cashier enters their own beginning cash (given by owner)

      console.log(`Shift ${shiftId} closed with ending cash: ${endingCash}`);
    } catch (error) {
      console.error('Error ending shift:', error);
      throw error;
    }
  }

  // Close ALL open shifts for a user (handles multiple stuck open shifts)
  public async closeAllOpenShifts(userId: number, endingCash: number): Promise<number> {
    const db = this.getDatabase();
    try {
      const now = getPhilippineDateTimeString();

      // Get all open shifts for this user
      const openShifts = await db.getAllAsync<any>(
        `SELECT id FROM shifts WHERE user_id = ? AND status = 'OPEN'`,
        [userId]
      );

      if (openShifts.length === 0) {
        console.log(`No open shifts found for user ${userId}`);
        return 0;
      }

      // Close all open shifts
      const result = await db.runAsync(
        `UPDATE shifts
         SET end_time = ?, ending_cash = ?, status = 'CLOSED'
         WHERE user_id = ? AND status = 'OPEN'`,
        [now, endingCash, userId]
      );

      console.log(`Closed ${openShifts.length} open shift(s) for user ${userId}`);
      return openShifts.length;
    } catch (error) {
      console.error('Error closing all open shifts:', error);
      throw error;
    }
  }

  public async getCurrentShift(userId: number): Promise<{
    id: number;
    user_id: number;
    start_time: string;
    beginning_cash: number;
    status: string;
  } | null> {
    const db = this.getDatabase();
    try {
      const shift = await db.getFirstAsync<any>(
        `SELECT id, user_id, start_time, beginning_cash, status
         FROM shifts
         WHERE user_id = ? AND status = 'OPEN'
         ORDER BY start_time DESC
         LIMIT 1`,
        [userId]
      );
      return shift || null;
    } catch (error) {
      console.error('Error getting current shift:', error);
      return null;
    }
  }

  public async getLastClosedShift(userId: number): Promise<{
    id: number;
    ending_cash: number;
    end_time: string;
  } | null> {
    const db = this.getDatabase();
    try {
      const shift = await db.getFirstAsync<any>(
        `SELECT id, ending_cash, end_time
         FROM shifts
         WHERE user_id = ? AND status = 'CLOSED'
         ORDER BY end_time DESC
         LIMIT 1`,
        [userId]
      );
      return shift || null;
    } catch (error) {
      console.error('Error getting last closed shift:', error);
      return null;
    }
  }

  // ========================================
  // X-READING (MID-DAY INQUIRY) METHODS
  // ========================================

  public async getXReadingData(date?: string, shiftStartTime?: string, cashierId?: number): Promise<{
    date: string;
    time: string;
    day_closed: boolean;
    transaction_count: number;
    gross_sales: number;
    vat_sales: number;
    vat_amount: number;
    vat_exempt_sales: number;
    zero_rated_sales: number;
    discount_amount: number;
    void_amount: number;
    void_count: number;
    exchange_amount: number;
    exchange_count: number;
    refund_amount: number;
    refund_count: number;
    net_sales: number;
    cash_sales: number;
    card_sales: number;
    check_sales: number;
    credit_sales: number;
    online_sales: number;
    beginning_cash: number;
    opening_fund: number;
    cash_in: number;
    cash_out: number;
    cash_fund: number;
    petty_cash: number;
    cash_refunds: number;
    customer_payments_cash: number;
    customer_payments_check: number;
    customer_payments_card: number;
    customer_payments_online: number;
    customer_payments_bank_transfer: number;
    customer_payments_total: number;
    expected_cash: number;
  }> {
    const db = this.getDatabase();
    const targetDate = date || getPhilippineDateString();
    const currentTime = getPhilippineTimeString();

    // If shiftStartTime provided, filter by shift; otherwise filter by date
    const useShiftFilter = !!shiftStartTime;
    // Normalize ISO format (with 'T') to SQLite format (with space) for proper comparison
    const normalizedShiftTime = shiftStartTime ? shiftStartTime.replace('T', ' ').replace('Z', '').split('.')[0] : '';

    // Build cashier filter if provided
    const cashierFilter = cashierId ? `AND cashier_id = ${cashierId}` : '';

    const dateFilter = useShiftFilter
      ? `datetime(transaction_date) >= datetime('${normalizedShiftTime}') ${cashierFilter}`
      : `DATE(transaction_date) = '${targetDate}' ${cashierFilter}`;

    try {
      // Check if Z-Reading was already completed today (day is closed)
      const todayEod = await db.getFirstAsync<any>(`
        SELECT id, next_day_beginning_cash FROM end_of_day_records
        WHERE DATE(date) = ?
      `, [targetDate]);

      const dayIsClosed = !!todayEod;

      // Get beginning cash - use shift's beginning_cash if filtering by shift
      let beginningCash = 0;

      if (shiftStartTime) {
        // Get beginning cash from the current shift
        const currentShift = await db.getFirstAsync<any>(`
          SELECT beginning_cash FROM shifts
          WHERE start_time = ?
        `, [shiftStartTime]);
        beginningCash = currentShift?.beginning_cash || 0;
      } else {
        // Fall back to previous day's EOD or settings
        const lastEod = await db.getFirstAsync<any>(`
          SELECT next_day_beginning_cash
          FROM end_of_day_records
          WHERE DATE(date) < ?
          ORDER BY date DESC
          LIMIT 1
        `, [targetDate]);

        beginningCash = lastEod?.next_day_beginning_cash || 0;

        // Fall back to settings if no previous EOD exists
        if (!beginningCash) {
          const savedBeginningCash = await this.getSetting('beginning_cash');
          beginningCash = savedBeginningCash ? parseFloat(savedBeginningCash) : 0;
        }
      }

      // Get sales summary with payment method breakdown
      // NOTE: gross_sales = total_amount + discount_amount (handles old transactions where subtotal is NULL)
      // Filter by shift start time if provided, otherwise by date
      const salesSummary = await db.getFirstAsync<any>(`
        SELECT
          COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as transaction_count,
          COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN (COALESCE(total_amount, 0) + COALESCE(discount_amount, 0)) ELSE 0 END), 0) as gross_sales,
          COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN tax_amount ELSE 0 END), 0) as vat_amount,
          COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN discount_amount ELSE 0 END), 0) as discount_amount,
          COALESCE(SUM(CASE WHEN status = 'VOID' THEN total_amount ELSE 0 END), 0) as void_amount,
          COUNT(CASE WHEN status = 'VOID' THEN 1 END) as void_count,
          COALESCE(SUM(CASE WHEN status = 'COMPLETED' AND payment_method = 'CASH' THEN total_amount ELSE 0 END), 0) as cash_sales,
          COALESCE(SUM(CASE WHEN status = 'COMPLETED' AND payment_method = 'CARD' THEN total_amount ELSE 0 END), 0) as card_sales,
          COALESCE(SUM(CASE WHEN status = 'COMPLETED' AND payment_method = 'CHECK' THEN total_amount ELSE 0 END), 0) as check_sales,
          COALESCE(SUM(CASE WHEN status = 'COMPLETED' AND (payment_method = 'CHARGE_INVOICE' OR payment_method = 'CREDIT') THEN total_amount ELSE 0 END), 0) as credit_sales,
          COALESCE(SUM(CASE WHEN status = 'COMPLETED' AND payment_method = 'ONLINE' THEN total_amount ELSE 0 END), 0) as online_sales
        FROM transactions
        WHERE ${dateFilter}
      `);

      // Get VAT breakdown by joining transaction_items with products
      // Filter by shift start time if provided, and by cashier if provided
      const cashierFilterT = cashierId ? `AND t.cashier_id = ${cashierId}` : '';
      const vatDateFilter = useShiftFilter
        ? `datetime(t.transaction_date) >= datetime('${normalizedShiftTime}') ${cashierFilterT}`
        : `DATE(t.transaction_date) = '${targetDate}' ${cashierFilterT}`;

      const vatBreakdown = await db.getFirstAsync<any>(`
        SELECT
          COALESCE(SUM(CASE WHEN p.vat_type = 'vatable' OR p.vat_type IS NULL THEN ti.total_amount ELSE 0 END), 0) as vatable_total,
          COALESCE(SUM(CASE WHEN p.vat_type = 'vat_exempt' THEN ti.total_amount ELSE 0 END), 0) as vat_exempt_sales,
          COALESCE(SUM(CASE WHEN p.vat_type = 'zero_rated' THEN ti.total_amount ELSE 0 END), 0) as zero_rated_sales
        FROM transaction_items ti
        INNER JOIN transactions t ON ti.transaction_id = t.id
        LEFT JOIN products p ON ti.product_id = p.id
        WHERE ${vatDateFilter} AND t.status = 'COMPLETED'
      `);

      // Calculate proper VAT breakdown for vatable items (price is VAT-inclusive)
      const vatableTotal = vatBreakdown?.vatable_total || 0;
      const vatableSales = Math.round((vatableTotal / 1.12) * 100) / 100; // VAT-exclusive amount
      const vatAmount = Math.round((vatableTotal - vatableSales) * 100) / 100; // VAT amount (12%)

      // Get refund and exchange amounts (filter by shift if provided, and by cashier)
      const cashierRefundFilter = cashierId ? `AND processed_by = ${cashierId}` : '';
      const refundDateFilter = useShiftFilter
        ? `datetime(return_date) >= datetime('${normalizedShiftTime}') ${cashierRefundFilter}`
        : `DATE(return_date) = '${targetDate}' ${cashierRefundFilter}`;

      // Get refunds (CASH, CREDIT, STORE_CREDIT) - excludes exchanges
      const refundSummary = await db.getFirstAsync<any>(`
        SELECT
          COALESCE(SUM(total_amount), 0) as refund_amount,
          COUNT(*) as refund_count
        FROM sales_returns
        WHERE ${refundDateFilter} AND status = 'COMPLETED' AND refund_method != 'EXCHANGE'
      `);

      // Get exchanges separately
      const exchangeSummary = await db.getFirstAsync<any>(`
        SELECT
          COALESCE(SUM(total_amount), 0) as exchange_amount,
          COUNT(*) as exchange_count
        FROM sales_returns
        WHERE ${refundDateFilter} AND status = 'COMPLETED' AND refund_method = 'EXCHANGE'
      `);

      // Get cash movements (filter by shift if provided, and by cashier)
      const cashMovements = await this.getCashDrawerBalance(useShiftFilter ? undefined : targetDate, shiftStartTime, cashierId);

      // Get customer payments (AR collections) - filter by shift if provided, and by cashier
      // Note: customer_payments table uses 'amount_paid' and 'received_by' columns
      // IMPORTANT: Always filter by payment_date to ensure we only get today's payments
      const cashierPaymentFilter = cashierId ? `AND received_by = ${cashierId}` : '';
      const paymentDateFilter = useShiftFilter
        ? `DATE(payment_date) = '${targetDate}' AND datetime(created_at) >= datetime('${normalizedShiftTime}') ${cashierPaymentFilter}`
        : `DATE(payment_date) = '${targetDate}' ${cashierPaymentFilter}`;

      console.log('[getXReadingData] Customer payments filter:', paymentDateFilter);
      console.log('[getXReadingData] targetDate:', targetDate, 'normalizedShiftTime:', normalizedShiftTime);

      // Debug: Log all customer payments for today
      const allPaymentsToday = await db.getAllAsync<any>(`
        SELECT id, payment_number, payment_method, amount_paid, received_by, payment_date, created_at
        FROM customer_payments
        WHERE DATE(payment_date) = '${targetDate}'
        ORDER BY created_at DESC
      `);
      console.log('[getXReadingData] All payments today:', JSON.stringify(allPaymentsToday));

      const customerPaymentsSummary = await db.getFirstAsync<any>(`
        SELECT
          COALESCE(SUM(CASE WHEN payment_method = 'CASH' THEN amount_paid ELSE 0 END), 0) as cash_payments,
          COALESCE(SUM(CASE WHEN payment_method = 'CHECK' THEN amount_paid ELSE 0 END), 0) as check_payments,
          COALESCE(SUM(CASE WHEN payment_method = 'CARD' THEN amount_paid ELSE 0 END), 0) as card_payments,
          COALESCE(SUM(CASE WHEN payment_method = 'ONLINE' OR payment_method = 'GCASH' THEN amount_paid ELSE 0 END), 0) as online_payments,
          COALESCE(SUM(CASE WHEN payment_method = 'BANK_TRANSFER' THEN amount_paid ELSE 0 END), 0) as bank_transfer_payments,
          COALESCE(SUM(amount_paid), 0) as total_payments,
          COUNT(*) as payment_count
        FROM customer_payments
        WHERE ${paymentDateFilter}
      `);

      console.log('[getXReadingData] Customer payments result:', JSON.stringify(customerPaymentsSummary));

      const customerPaymentsCash = customerPaymentsSummary?.cash_payments || 0;
      const customerPaymentsCheck = customerPaymentsSummary?.check_payments || 0;
      const customerPaymentsCard = customerPaymentsSummary?.card_payments || 0;
      const customerPaymentsOnline = customerPaymentsSummary?.online_payments || 0;
      const customerPaymentsBankTransfer = customerPaymentsSummary?.bank_transfer_payments || 0;
      const customerPaymentsTotal = customerPaymentsSummary?.total_payments || 0;

      const grossSales = salesSummary?.gross_sales || 0;
      const discountAmount = salesSummary?.discount_amount || 0;
      const refundAmount = refundSummary?.refund_amount || 0;
      const refundCount = refundSummary?.refund_count || 0;
      const exchangeAmount = exchangeSummary?.exchange_amount || 0;
      const exchangeCount = exchangeSummary?.exchange_count || 0;
      const netSales = grossSales - discountAmount - refundAmount;

      const cashSales = salesSummary?.cash_sales || 0;

      // Expected Cash = Beginning Cash + Cash Fund + Cash Sales + AR Collections (Cash) - Cash Out - Petty Cash - Cash Refunds
      // Where Cash Fund = opening_fund + cash_in
      // NOTE: Cash refunds are already included in cashMovements.net_balance (which deducts cash_refunds)
      // Do NOT subtract refundAmount here as it includes ALL refunds (CASH, CREDIT, STORE_CREDIT, etc.)
      const expectedCash = beginningCash + cashMovements.net_balance + cashSales + customerPaymentsCash;

      const result = {
        date: targetDate,
        time: currentTime,
        day_closed: dayIsClosed,
        transaction_count: salesSummary?.transaction_count || 0,
        gross_sales: grossSales,
        vat_sales: vatableSales,
        vat_amount: vatAmount,
        vat_exempt_sales: vatBreakdown?.vat_exempt_sales || 0,
        zero_rated_sales: vatBreakdown?.zero_rated_sales || 0,
        discount_amount: discountAmount,
        void_amount: salesSummary?.void_amount || 0,
        void_count: salesSummary?.void_count || 0,
        exchange_amount: exchangeAmount,
        exchange_count: exchangeCount,
        refund_amount: refundAmount,
        refund_count: refundCount,
        net_sales: netSales,
        cash_sales: cashSales,
        card_sales: salesSummary?.card_sales || 0,
        check_sales: salesSummary?.check_sales || 0,
        credit_sales: salesSummary?.credit_sales || 0,
        online_sales: salesSummary?.online_sales || 0,
        beginning_cash: beginningCash,
        opening_fund: cashMovements.opening_fund,
        cash_in: cashMovements.cash_in,
        cash_out: cashMovements.cash_out,
        cash_fund: cashMovements.opening_fund + cashMovements.cash_in,  // For backward compatibility
        petty_cash: cashMovements.petty_cash,
        cash_refunds: cashMovements.cash_refunds,
        customer_payments_cash: customerPaymentsCash,
        customer_payments_check: customerPaymentsCheck,
        customer_payments_card: customerPaymentsCard,
        customer_payments_online: customerPaymentsOnline,
        customer_payments_bank_transfer: customerPaymentsBankTransfer,
        customer_payments_total: customerPaymentsTotal,
        expected_cash: expectedCash
      };

      console.log('[getXReadingData] Result - AR Cash:', customerPaymentsCash, 'AR Total:', customerPaymentsTotal, 'Expected Cash:', expectedCash);

      return result;
    } catch (error) {
      console.error('Error getting X-Reading data:', error);
      return {
        date: targetDate,
        time: currentTime,
        day_closed: false,
        transaction_count: 0,
        gross_sales: 0,
        vat_sales: 0,
        vat_amount: 0,
        vat_exempt_sales: 0,
        zero_rated_sales: 0,
        discount_amount: 0,
        void_amount: 0,
        void_count: 0,
        exchange_amount: 0,
        exchange_count: 0,
        refund_amount: 0,
        refund_count: 0,
        net_sales: 0,
        cash_sales: 0,
        card_sales: 0,
        check_sales: 0,
        credit_sales: 0,
        online_sales: 0,
        beginning_cash: 0,
        opening_fund: 0,
        cash_in: 0,
        cash_out: 0,
        cash_fund: 0,
        petty_cash: 0,
        cash_refunds: 0,
        customer_payments_cash: 0,
        customer_payments_check: 0,
        customer_payments_card: 0,
        customer_payments_online: 0,
        customer_payments_bank_transfer: 0,
        customer_payments_total: 0,
        expected_cash: 0
      };
    }
  }

  public async saveXReading(cashierId: number, targetDate?: string): Promise<number> {
    const db = this.getDatabase();
    try {
      let xReadingData;
      if (targetDate) {
        // EOD call: find the cashier's first shift of the day so we use the same
        // shift-based code path as manual X-Reading (correct beginning_cash, cash movements, etc.)
        // datetime >= firstShiftStart captures all transactions across all shifts for the day
        const firstShift = await db.getFirstAsync<{ start_time: string }>(
          `SELECT start_time FROM shifts WHERE DATE(start_time) = ? AND user_id = ? ORDER BY start_time ASC LIMIT 1`,
          [targetDate, cashierId]
        );
        if (firstShift?.start_time) {
          xReadingData = await this.getXReadingData(targetDate, firstShift.start_time, cashierId);
        } else {
          // Fallback if no shift record found: use date-based scope
          xReadingData = await this.getXReadingData(targetDate, undefined, cashierId);
        }
      } else {
        // Manual call: use current shift scope
        let shiftStartTime: string | undefined;
        const currentShift = await this.getCurrentShift(cashierId);
        if (currentShift) {
          shiftStartTime = currentShift.start_time;
        }
        xReadingData = await this.getXReadingData(undefined, shiftStartTime);
      }

      // Get last invoice number for the date
      const dateForInvoice = targetDate || xReadingData.date;
      const lastInvoiceRow = await db.getFirstAsync<{ invoice_number: string }>(
        `SELECT invoice_number FROM transactions WHERE DATE(transaction_date) = ? AND status = 'COMPLETED' ORDER BY id DESC LIMIT 1`,
        [dateForInvoice]
      );
      const lastInvoiceNumber = lastInvoiceRow?.invoice_number || '';

      const result = await db.runAsync(
        `INSERT INTO x_readings (
          date, time, current_invoice_number, gross_sales, vat_sales, vat_amount,
          vat_exempt_sales, zero_rated_sales, discount_amount, void_amount, refund_amount,
          net_sales, transaction_count, cashier_id,
          cash_sales, card_sales, check_sales, credit_sales, online_sales,
          void_count, exchange_count, exchange_amount, refund_count,
          beginning_cash, opening_fund, cash_in, cash_out, cash_fund, petty_cash, cash_refunds,
          customer_payments_cash, customer_payments_check, customer_payments_card,
          customer_payments_online, customer_payments_bank_transfer, customer_payments_total,
          expected_cash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          xReadingData.date,
          xReadingData.time,
          lastInvoiceNumber,
          xReadingData.gross_sales,
          xReadingData.vat_sales,
          xReadingData.vat_amount,
          xReadingData.vat_exempt_sales,
          xReadingData.zero_rated_sales,
          xReadingData.discount_amount,
          xReadingData.void_amount,
          xReadingData.refund_amount,
          xReadingData.net_sales,
          xReadingData.transaction_count,
          cashierId,
          xReadingData.cash_sales,
          xReadingData.card_sales,
          xReadingData.check_sales,
          xReadingData.credit_sales,
          xReadingData.online_sales,
          xReadingData.void_count,
          xReadingData.exchange_count,
          xReadingData.exchange_amount,
          xReadingData.refund_count,
          xReadingData.beginning_cash,
          xReadingData.opening_fund,
          xReadingData.cash_in,
          xReadingData.cash_out,
          xReadingData.cash_fund,
          xReadingData.petty_cash,
          xReadingData.cash_refunds,
          xReadingData.customer_payments_cash,
          xReadingData.customer_payments_check,
          xReadingData.customer_payments_card,
          xReadingData.customer_payments_online,
          xReadingData.customer_payments_bank_transfer,
          xReadingData.customer_payments_total,
          xReadingData.expected_cash,
        ]
      );

      // Add eJournal entry with Philippine time
      const phDateTime = getPhilippineDateTimeString();
      await db.runAsync(
        `INSERT INTO ejournal (entry_type, reference_number, description, amount, cashier_id, timestamp, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['X_READING', `XREAD-${result.lastInsertRowId}`, targetDate ? 'X-Reading auto-generated with Z-Reading' : 'X-Reading generated', xReadingData.net_sales, cashierId, phDateTime, phDateTime]
      );

      console.log(`X-Reading saved: ID ${result.lastInsertRowId}`);
      return result.lastInsertRowId as number;
    } catch (error) {
      console.error('Error saving X-Reading:', error);
      throw error;
    }
  }

  /**
   * Get X-Reading history records
   */
  public async getXReadingHistory(limit: number = 30): Promise<any[]> {
    const db = this.getDatabase();
    try {
      const records = await db.getAllAsync<any>(
        `SELECT x.*, u.full_name as cashier_name, u.username as cashier_username
         FROM x_readings x
         LEFT JOIN users u ON x.cashier_id = u.id
         ORDER BY x.date DESC, x.time DESC, x.id DESC
         LIMIT ?`,
        [limit]
      );
      return records;
    } catch (error) {
      console.error('Error getting X-Reading history:', error);
      return [];
    }
  }

  // ========================================
  // RESET DATA METHODS
  // ========================================

  /**
   * Reset all transactional data while preserving master data.
   * Master data preserved: Products, Suppliers, Customers, Categories, Brands, Units, Sizes, Users, Settings, Role Permissions
   * Transactional data deleted: Sales, Purchases, Payments, Inventory Movements, Returns, BIR readings, etc.
   */
  public async resetTransactionalData(): Promise<{
    success: boolean;
    deletedCounts: Record<string, number>;
    errors: string[];
  }> {
    const db = this.getDatabase();
    const deletedCounts: Record<string, number> = {};
    const errors: string[] = [];

    try {
      console.log('Starting transactional data reset...');

      // Order matters due to foreign key constraints - delete child tables first

      // 1. Sales Returns and Items
      try {
        const salesReturnItems = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM sales_return_items');
        await db.runAsync('DELETE FROM sales_return_items');
        deletedCounts['sales_return_items'] = salesReturnItems?.count || 0;
      } catch (e) {
        errors.push(`sales_return_items: ${e}`);
      }

      try {
        const salesReturns = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM sales_returns');
        await db.runAsync('DELETE FROM sales_returns');
        deletedCounts['sales_returns'] = salesReturns?.count || 0;
      } catch (e) {
        errors.push(`sales_returns: ${e}`);
      }

      // 2. Customer Payments and Accounts Receivable (must delete before transactions due to FK)
      try {
        const customerPayments = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM customer_payments');
        await db.runAsync('DELETE FROM customer_payments');
        deletedCounts['customer_payments'] = customerPayments?.count || 0;
      } catch (e) {
        errors.push(`customer_payments: ${e}`);
      }

      try {
        const accountsReceivable = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM accounts_receivable');
        await db.runAsync('DELETE FROM accounts_receivable');
        deletedCounts['accounts_receivable'] = accountsReceivable?.count || 0;
      } catch (e) {
        errors.push(`accounts_receivable: ${e}`);
      }

      // 3. Transaction Items and Transactions
      try {
        const transactionItems = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM transaction_items');
        await db.runAsync('DELETE FROM transaction_items');
        deletedCounts['transaction_items'] = transactionItems?.count || 0;
      } catch (e) {
        errors.push(`transaction_items: ${e}`);
      }

      try {
        const transactions = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM transactions');
        await db.runAsync('DELETE FROM transactions');
        deletedCounts['transactions'] = transactions?.count || 0;
      } catch (e) {
        errors.push(`transactions: ${e}`);
      }

      // 4. Purchase Details and Purchases
      try {
        const purchaseDetails = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM purchase_details');
        await db.runAsync('DELETE FROM purchase_details');
        deletedCounts['purchase_details'] = purchaseDetails?.count || 0;
      } catch (e) {
        errors.push(`purchase_details: ${e}`);
      }

      try {
        const purchases = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM purchases');
        await db.runAsync('DELETE FROM purchases');
        deletedCounts['purchases'] = purchases?.count || 0;
      } catch (e) {
        errors.push(`purchases: ${e}`);
      }

      // 5. Supplier Payments and Accounts Payable
      try {
        const supplierPayments = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM supplier_payments');
        await db.runAsync('DELETE FROM supplier_payments');
        deletedCounts['supplier_payments'] = supplierPayments?.count || 0;
      } catch (e) {
        errors.push(`supplier_payments: ${e}`);
      }

      try {
        const accountsPayable = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM accounts_payable');
        await db.runAsync('DELETE FROM accounts_payable');
        deletedCounts['accounts_payable'] = accountsPayable?.count || 0;
      } catch (e) {
        errors.push(`accounts_payable: ${e}`);
      }

      // 6. Inventory Movements (Item Ledger)
      try {
        const inventoryMovements = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM inventory_movements');
        await db.runAsync('DELETE FROM inventory_movements');
        deletedCounts['inventory_movements'] = inventoryMovements?.count || 0;
      } catch (e) {
        errors.push(`inventory_movements: ${e}`);
      }

      // 7. Physical Count Sessions and Details
      try {
        const physicalCountDetails = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM physical_count_details');
        await db.runAsync('DELETE FROM physical_count_details');
        deletedCounts['physical_count_details'] = physicalCountDetails?.count || 0;
      } catch (e) {
        errors.push(`physical_count_details: ${e}`);
      }

      try {
        const physicalCountSessions = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM physical_count_sessions');
        await db.runAsync('DELETE FROM physical_count_sessions');
        deletedCounts['physical_count_sessions'] = physicalCountSessions?.count || 0;
      } catch (e) {
        errors.push(`physical_count_sessions: ${e}`);
      }

      // 8. Damaged Items Sessions and Details
      try {
        const damagedItemsDetails = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM damaged_items_details');
        await db.runAsync('DELETE FROM damaged_items_details');
        deletedCounts['damaged_items_details'] = damagedItemsDetails?.count || 0;
      } catch (e) {
        errors.push(`damaged_items_details: ${e}`);
      }

      try {
        const damagedItemsSessions = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM damaged_items_sessions');
        await db.runAsync('DELETE FROM damaged_items_sessions');
        deletedCounts['damaged_items_sessions'] = damagedItemsSessions?.count || 0;
      } catch (e) {
        errors.push(`damaged_items_sessions: ${e}`);
      }

      // 9. BIR Compliance Tables
      try {
        const ejournal = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM ejournal');
        await db.runAsync('DELETE FROM ejournal');
        deletedCounts['ejournal'] = ejournal?.count || 0;
      } catch (e) {
        errors.push(`ejournal: ${e}`);
      }

      try {
        const xReadings = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM x_readings');
        await db.runAsync('DELETE FROM x_readings');
        deletedCounts['x_readings'] = xReadings?.count || 0;
      } catch (e) {
        errors.push(`x_readings: ${e}`);
      }

      try {
        const zReadings = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM z_readings');
        await db.runAsync('DELETE FROM z_readings');
        deletedCounts['z_readings'] = zReadings?.count || 0;
      } catch (e) {
        errors.push(`z_readings: ${e}`);
      }

      // 10. End of Day and Shift Management
      try {
        const endOfDayRecords = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM end_of_day_records');
        await db.runAsync('DELETE FROM end_of_day_records');
        deletedCounts['end_of_day_records'] = endOfDayRecords?.count || 0;
      } catch (e) {
        errors.push(`end_of_day_records: ${e}`);
      }

      try {
        const shifts = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM shifts');
        await db.runAsync('DELETE FROM shifts');
        deletedCounts['shifts'] = shifts?.count || 0;
      } catch (e) {
        errors.push(`shifts: ${e}`);
      }

      try {
        const cashMovements = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM cash_movements');
        await db.runAsync('DELETE FROM cash_movements');
        deletedCounts['cash_movements'] = cashMovements?.count || 0;
      } catch (e) {
        errors.push(`cash_movements: ${e}`);
      }

      // 11. Customer Audit Trail
      try {
        const customerAudit = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM customer_audit');
        await db.runAsync('DELETE FROM customer_audit');
        deletedCounts['customer_audit'] = customerAudit?.count || 0;
      } catch (e) {
        errors.push(`customer_audit: ${e}`);
      }

      // 12. Reset counters in settings
      try {
        await db.runAsync(`UPDATE settings SET value = '0' WHERE key = 'current_invoice_number'`);
        await db.runAsync(`UPDATE settings SET value = '0' WHERE key = 'z_counter'`);
        await db.runAsync(`UPDATE settings SET value = '0' WHERE key = 'current_purchase_number'`);
        await db.runAsync(`UPDATE settings SET value = '0' WHERE key = 'current_payment_number'`);
        await db.runAsync(`UPDATE settings SET value = '0' WHERE key = 'current_damage_session_number'`);
        await db.runAsync(`UPDATE settings SET value = '0' WHERE key = 'current_customer_payment_number'`);
        console.log('Reset all counters to 0');
      } catch (e) {
        errors.push(`reset_counters: ${e}`);
      }

      // 13. Reset product stock quantities to zero
      try {
        await db.runAsync('UPDATE products SET stock_quantity = 0');
        console.log('Reset all product stock quantities to 0');
      } catch (e) {
        errors.push(`reset_stock: ${e}`);
      }

      console.log('Transactional data reset completed!');
      console.log('Deleted counts:', deletedCounts);
      if (errors.length > 0) {
        console.log('Errors encountered:', errors);
      }

      return {
        success: errors.length === 0,
        deletedCounts,
        errors
      };

    } catch (error) {
      console.error('Error during transactional data reset:', error);
      throw error;
    }
  }

  /**
   * Reset all transactional data AND set beginning inventory (100 units) for all active products
   * Creates inventory movement records with reference_type 'BEGINNING_BALANCE'
   */
  public async resetTransactionalDataWithBeginningInventory(userId: number): Promise<{
    success: boolean;
    deletedCounts: Record<string, number>;
    productsInitialized: number;
    errors: string[];
  }> {
    // Step 1: Call existing resetTransactionalData first
    const resetResult = await this.resetTransactionalData();

    const db = this.getDatabase();
    const errors = [...resetResult.errors];
    let productsInitialized = 0;

    try {
      // Step 2: Get all active products
      const products = await db.getAllAsync<{id: number, code: string, name: string, cost: number}>(
        'SELECT id, code, name, cost FROM products WHERE is_active = 1'
      );

      const phDateTime = getPhilippineDateTimeString();
      const BEGINNING_QUANTITY = 100;

      console.log(`Setting beginning inventory for ${products.length} active products...`);

      // Step 3: For each product, set stock to 100 and create inventory movement
      for (const product of products) {
        try {
          // Update stock quantity to 100
          await db.runAsync(
            'UPDATE products SET stock_quantity = ? WHERE id = ?',
            [BEGINNING_QUANTITY, product.id]
          );

          // Create beginning balance inventory movement
          await db.runAsync(
            `INSERT INTO inventory_movements (
              product_id, product_code, product_name, movement_type, quantity,
              quantity_before, quantity_after, unit_cost, total_value,
              reference_type, reference_number, notes, created_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              product.id,
              product.code,
              product.name,
              'ADJUSTMENT',
              BEGINNING_QUANTITY,
              0, // quantity_before
              BEGINNING_QUANTITY, // quantity_after
              product.cost || 0,
              BEGINNING_QUANTITY * (product.cost || 0),
              'BEGINNING_BALANCE',
              null, // reference_number
              'Beginning balance after data reset',
              userId,
              phDateTime
            ]
          );

          productsInitialized++;
        } catch (e) {
          errors.push(`Product ${product.code}: ${e}`);
        }
      }

      console.log(`Beginning inventory set for ${productsInitialized} products`);

    } catch (error) {
      errors.push(`Beginning inventory setup: ${error}`);
    }

    return {
      success: errors.length === 0,
      deletedCounts: resetResult.deletedCounts,
      productsInitialized,
      errors
    };
  }

  /**
   * Get summary of data that will be deleted during reset
   */
  public async getTransactionalDataSummary(): Promise<Record<string, number>> {
    const db = this.getDatabase();
    const summary: Record<string, number> = {};

    const tables = [
      'transactions',
      'transaction_items',
      'purchases',
      'purchase_details',
      'supplier_payments',
      'customer_payments',
      'accounts_payable',
      'accounts_receivable',
      'inventory_movements',
      'sales_returns',
      'sales_return_items',
      'physical_count_sessions',
      'physical_count_details',
      'damaged_items_sessions',
      'damaged_items_details',
      'ejournal',
      'x_readings',
      'z_readings',
      'end_of_day_records',
      'shifts',
      'cash_movements',
      'customer_audit'
    ];

    for (const table of tables) {
      try {
        const result = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM ${table}`);
        summary[table] = result?.count || 0;
      } catch (e) {
        summary[table] = 0;
      }
    }

    return summary;
  }

  /**
   * Log a reset operation attempt for audit trail
   */
  public async logResetOperation(params: {
    userId: number;
    username: string;
    fullName: string;
    operationType: 'TRANSACTIONAL_DATA_RESET' | 'DATABASE_RESTORE' | 'MASTER_DATA_RESET';
    status: 'ATTEMPTED' | 'SUCCESS' | 'FAILED' | 'DENIED' | 'CANCELLED';
    recordsDeleted?: number;
    details?: Record<string, any>;
  }): Promise<void> {
    const db = this.getDatabase();
    try {
      const detailsJson = params.details ? JSON.stringify(params.details) : null;

      await db.runAsync(
        `INSERT INTO reset_operations_log
         (user_id, username, full_name, operation_type, status, records_deleted, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
        [
          params.userId,
          params.username,
          params.fullName,
          params.operationType,
          params.status,
          params.recordsDeleted || 0,
          detailsJson
        ]
      );

      console.log(`[ResetLog] ${params.status}: ${params.operationType} by ${params.username}`);
    } catch (error) {
      console.error('[ResetLog] Error logging reset operation:', error);
      // Don't throw - logging failure shouldn't block the operation
    }
  }

  /**
   * Get reset operations log for admin viewing
   */
  public async getResetOperationsLog(limit: number = 50): Promise<Array<{
    id: number;
    user_id: number;
    username: string;
    full_name: string;
    operation_type: string;
    status: string;
    records_deleted: number;
    details: string | null;
    created_at: string;
  }>> {
    const db = this.getDatabase();
    try {
      const logs = await db.getAllAsync<{
        id: number;
        user_id: number;
        username: string;
        full_name: string;
        operation_type: string;
        status: string;
        records_deleted: number;
        details: string | null;
        created_at: string;
      }>(
        `SELECT * FROM reset_operations_log
         ORDER BY created_at DESC
         LIMIT ?`,
        [limit]
      );

      return logs;
    } catch (error) {
      console.error('[ResetLog] Error getting reset operations log:', error);
      return [];
    }
  }

  // ==================== DATABASE HEALTH & CORRUPTION PREVENTION ====================

  /**
   * Enable corruption prevention settings
   * Call this during database initialization
   */
  public async enableCorruptionPrevention(): Promise<void> {
    const db = this.getDatabase();
    try {
      // Enable Write-Ahead Logging for better crash recovery
      await db.execAsync('PRAGMA journal_mode = WAL');

      // Set synchronous mode to FULL for maximum durability
      // FULL ensures data is written to disk before returning
      await db.execAsync('PRAGMA synchronous = FULL');

      // Enable foreign key constraints for data integrity
      await db.execAsync('PRAGMA foreign_keys = ON');

      // Set a reasonable cache size (negative = KB, positive = pages)
      await db.execAsync('PRAGMA cache_size = -2000'); // 2MB cache

      // Auto-vacuum to prevent database bloat
      await db.execAsync('PRAGMA auto_vacuum = INCREMENTAL');

      // Set busy timeout to handle concurrent access
      await db.execAsync('PRAGMA busy_timeout = 5000'); // 5 seconds

      console.log('[DatabaseService] Corruption prevention settings enabled');
    } catch (error) {
      console.error('[DatabaseService] Error enabling corruption prevention:', error);
    }
  }

  /**
   * Check database health and return status
   */
  public async checkDatabaseHealth(): Promise<{
    isHealthy: boolean;
    walMode: boolean;
    synchronousMode: string;
    integrityOk: boolean;
    foreignKeyViolations: number;
    freePageCount: number;
    totalPages: number;
    issues: string[];
  }> {
    const db = this.getDatabase();
    const issues: string[] = [];

    try {
      // Check journal mode
      const journalMode = await db.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode');
      const walMode = journalMode?.journal_mode?.toLowerCase() === 'wal';
      if (!walMode) {
        issues.push('WAL mode not enabled - crash recovery may be slower');
      }

      // Check synchronous mode
      const syncMode = await db.getFirstAsync<{ synchronous: number }>('PRAGMA synchronous');
      const syncModeStr = syncMode?.synchronous === 2 ? 'FULL' :
                          syncMode?.synchronous === 1 ? 'NORMAL' : 'OFF';
      if (syncMode?.synchronous !== 2) {
        issues.push('Synchronous mode not FULL - data may be lost on crash');
      }

      // Run integrity check
      const integrityResult = await db.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check');
      const integrityOk = integrityResult?.integrity_check === 'ok';
      if (!integrityOk) {
        issues.push(`Integrity check failed: ${integrityResult?.integrity_check}`);
      }

      // Check for foreign key violations
      const fkViolations = await db.getAllAsync('PRAGMA foreign_key_check');
      const foreignKeyViolations = fkViolations?.length || 0;
      if (foreignKeyViolations > 0) {
        issues.push(`${foreignKeyViolations} foreign key violations found`);
      }

      // Get database page info
      const freePages = await db.getFirstAsync<{ freelist_count: number }>('PRAGMA freelist_count');
      const pageCount = await db.getFirstAsync<{ page_count: number }>('PRAGMA page_count');

      return {
        isHealthy: issues.length === 0,
        walMode,
        synchronousMode: syncModeStr,
        integrityOk,
        foreignKeyViolations,
        freePageCount: freePages?.freelist_count || 0,
        totalPages: pageCount?.page_count || 0,
        issues,
      };
    } catch (error) {
      console.error('[DatabaseService] Error checking database health:', error);
      return {
        isHealthy: false,
        walMode: false,
        synchronousMode: 'UNKNOWN',
        integrityOk: false,
        foreignKeyViolations: 0,
        freePageCount: 0,
        totalPages: 0,
        issues: [`Health check failed: ${error}`],
      };
    }
  }

  /**
   * Perform full integrity check
   */
  public async performIntegrityCheck(): Promise<{ passed: boolean; details: string }> {
    const db = this.getDatabase();
    try {
      const result = await db.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check');
      const passed = result?.integrity_check === 'ok';
      return {
        passed,
        details: result?.integrity_check || 'Unknown',
      };
    } catch (error) {
      return {
        passed: false,
        details: `Error running integrity check: ${error}`,
      };
    }
  }

  /**
   * Force WAL checkpoint to ensure all changes are written to main database
   */
  public async checkpointWAL(): Promise<{ success: boolean; pagesCheckpointed: number }> {
    const db = this.getDatabase();
    try {
      // TRUNCATE mode moves all WAL content to database and truncates WAL file
      const result = await db.getFirstAsync<{ busy: number; log: number; checkpointed: number }>(
        'PRAGMA wal_checkpoint(TRUNCATE)'
      );
      return {
        success: true,
        pagesCheckpointed: result?.checkpointed || 0,
      };
    } catch (error) {
      console.error('[DatabaseService] WAL checkpoint error:', error);
      return {
        success: false,
        pagesCheckpointed: 0,
      };
    }
  }

  /**
   * Optimize database (VACUUM and REINDEX)
   */
  public async optimizeDatabase(): Promise<void> {
    const db = this.getDatabase();
    try {
      // Checkpoint WAL first
      await this.checkpointWAL();

      // Analyze tables for query optimization
      await db.execAsync('ANALYZE');

      // Rebuild indexes
      await db.execAsync('REINDEX');

      // Compact database (reclaim free pages)
      await db.execAsync('VACUUM');

      console.log('[DatabaseService] Database optimization completed');
    } catch (error) {
      console.error('[DatabaseService] Database optimization error:', error);
      throw error;
    }
  }

  /**
   * Attempt automatic database repair
   * This should be called when database health check fails
   * Returns detailed results of repair attempts
   */
  public async attemptDatabaseRepair(): Promise<{
    success: boolean;
    repairSteps: { step: string; success: boolean; message: string }[];
    finalHealthCheck: {
      isHealthy: boolean;
      integrityOk: boolean;
      issues: string[];
    };
  }> {
    const db = this.getDatabase();
    const repairSteps: { step: string; success: boolean; message: string }[] = [];

    console.log('[DatabaseService] Starting automatic database repair...');

    // Step 1: Enable WAL mode if not already enabled
    try {
      console.log('[DatabaseService] Step 1: Enabling WAL mode...');
      await db.execAsync('PRAGMA journal_mode = WAL');
      repairSteps.push({ step: 'Enable WAL Mode', success: true, message: 'WAL mode enabled' });
    } catch (error) {
      repairSteps.push({ step: 'Enable WAL Mode', success: false, message: `Failed: ${error}` });
    }

    // Step 2: Checkpoint any pending WAL transactions
    try {
      console.log('[DatabaseService] Step 2: Checkpointing WAL...');
      await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)');
      repairSteps.push({ step: 'WAL Checkpoint', success: true, message: 'WAL checkpoint completed' });
    } catch (error) {
      repairSteps.push({ step: 'WAL Checkpoint', success: false, message: `Failed: ${error}` });
    }

    // Step 3: Rebuild all indexes (fixes index corruption)
    try {
      console.log('[DatabaseService] Step 3: Rebuilding indexes...');
      await db.execAsync('REINDEX');
      repairSteps.push({ step: 'Rebuild Indexes', success: true, message: 'All indexes rebuilt' });
    } catch (error) {
      repairSteps.push({ step: 'Rebuild Indexes', success: false, message: `Failed: ${error}` });
    }

    // Step 4: Run ANALYZE for query optimization
    try {
      console.log('[DatabaseService] Step 4: Analyzing tables...');
      await db.execAsync('ANALYZE');
      repairSteps.push({ step: 'Analyze Tables', success: true, message: 'Table statistics updated' });
    } catch (error) {
      repairSteps.push({ step: 'Analyze Tables', success: false, message: `Failed: ${error}` });
    }

    // Step 5: Check and auto-fix foreign key violations
    try {
      console.log('[DatabaseService] Step 5: Checking and fixing foreign key violations...');
      const fkViolations = await db.getAllAsync<{ table: string; rowid: number; parent: string; fkid: number }>(
        'PRAGMA foreign_key_check'
      );
      if (fkViolations && fkViolations.length > 0) {
        console.log(`[DatabaseService] Found ${fkViolations.length} FK violations, attempting to fix...`);
        let fixedCount = 0;
        let unfixableCount = 0;

        // Get FK info for each table to know which column to fix
        const tableFixAttempts = new Map<string, Set<number>>();
        for (const violation of fkViolations) {
          if (!tableFixAttempts.has(violation.table)) {
            tableFixAttempts.set(violation.table, new Set());
          }
          tableFixAttempts.get(violation.table)?.add(violation.rowid);
        }

        // For each table with violations, get the FK column info and try to set to NULL
        for (const [tableName, rowids] of tableFixAttempts) {
          try {
            // Get foreign key info for this table
            const fkInfo = await db.getAllAsync<{ id: number; seq: number; table: string; from: string; to: string; on_update: string; on_delete: string; match: string }>(
              `PRAGMA foreign_key_list(${tableName})`
            );

            for (const fk of fkInfo) {
              // Try to set the FK column to NULL for orphaned rows
              try {
                const updateResult = await db.runAsync(
                  `UPDATE ${tableName} SET ${fk.from} = NULL WHERE rowid IN (${Array.from(rowids).join(',')}) AND ${fk.from} IS NOT NULL AND ${fk.from} NOT IN (SELECT id FROM ${fk.table})`
                );
                if (updateResult.changes > 0) {
                  console.log(`[DatabaseService] Fixed ${updateResult.changes} FK violations in ${tableName}.${fk.from}`);
                  fixedCount += updateResult.changes;
                }
              } catch (updateError: any) {
                // Column might be NOT NULL, can't fix automatically
                if (updateError?.message?.includes('NOT NULL')) {
                  console.log(`[DatabaseService] Cannot fix ${tableName}.${fk.from} - column is NOT NULL`);
                  unfixableCount += rowids.size;
                }
              }
            }
          } catch (tableError) {
            console.warn(`[DatabaseService] Could not get FK info for table ${tableName}:`, tableError);
          }
        }

        // Check remaining violations
        const remainingViolations = await db.getAllAsync('PRAGMA foreign_key_check');
        const remainingCount = remainingViolations?.length || 0;

        if (remainingCount === 0) {
          repairSteps.push({
            step: 'Fix Foreign Keys',
            success: true,
            message: `Fixed all ${fkViolations.length} FK violations`
          });
        } else {
          repairSteps.push({
            step: 'Fix Foreign Keys',
            success: false,
            message: `Fixed ${fixedCount} of ${fkViolations.length} violations, ${remainingCount} remain (require manual fix)`
          });
        }
      } else {
        repairSteps.push({ step: 'Check Foreign Keys', success: true, message: 'No violations found' });
      }
    } catch (error) {
      repairSteps.push({ step: 'Check Foreign Keys', success: false, message: `Failed: ${error}` });
    }

    // Step 6: VACUUM to rebuild database file (most thorough repair)
    try {
      console.log('[DatabaseService] Step 6: Vacuuming database...');
      await db.execAsync('VACUUM');
      repairSteps.push({ step: 'Vacuum Database', success: true, message: 'Database compacted and rebuilt' });
    } catch (error) {
      repairSteps.push({ step: 'Vacuum Database', success: false, message: `Failed: ${error}` });
    }

    // Step 7: Re-enable protection settings
    try {
      console.log('[DatabaseService] Step 7: Re-enabling protection settings...');
      await db.execAsync('PRAGMA synchronous = FULL');
      await db.execAsync('PRAGMA foreign_keys = ON');
      await db.execAsync('PRAGMA busy_timeout = 5000');
      repairSteps.push({ step: 'Enable Protection', success: true, message: 'Protection settings enabled' });
    } catch (error) {
      repairSteps.push({ step: 'Enable Protection', success: false, message: `Failed: ${error}` });
    }

    // Final: Run integrity check to verify repair was successful
    console.log('[DatabaseService] Running final integrity check...');
    let finalHealthCheck = {
      isHealthy: false,
      integrityOk: false,
      issues: [] as string[],
    };

    try {
      const integrityResult = await db.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check');
      const integrityOk = integrityResult?.integrity_check === 'ok';

      if (!integrityOk) {
        finalHealthCheck.issues.push(`Integrity check: ${integrityResult?.integrity_check}`);
      }

      // Check for remaining FK violations
      const remainingViolations = await db.getAllAsync('PRAGMA foreign_key_check');
      if (remainingViolations && remainingViolations.length > 0) {
        finalHealthCheck.issues.push(`${remainingViolations.length} foreign key violations remain`);
      }

      finalHealthCheck.integrityOk = integrityOk;
      finalHealthCheck.isHealthy = integrityOk && (!remainingViolations || remainingViolations.length === 0);
    } catch (error) {
      finalHealthCheck.issues.push(`Final check failed: ${error}`);
    }

    const success = finalHealthCheck.isHealthy;
    console.log(`[DatabaseService] Repair ${success ? 'SUCCEEDED' : 'COMPLETED WITH ISSUES'}`);

    return {
      success,
      repairSteps,
      finalHealthCheck,
    };
  }

  /**
   * Quick repair - just the essential steps (faster)
   */
  public async quickRepair(): Promise<{ success: boolean; message: string }> {
    const db = this.getDatabase();
    try {
      console.log('[DatabaseService] Running quick repair...');

      // Essential repairs only
      await db.execAsync('PRAGMA journal_mode = WAL');
      await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)');
      await db.execAsync('REINDEX');
      await db.execAsync('PRAGMA synchronous = FULL');

      // Quick integrity check
      const result = await db.getFirstAsync<{ integrity_check: string }>('PRAGMA quick_check');
      const passed = result?.integrity_check === 'ok';

      return {
        success: passed,
        message: passed ? 'Quick repair successful' : `Issues found: ${result?.integrity_check}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Quick repair failed: ${error}`,
      };
    }
  }

  /**
   * Fix common database issues (synchronous mode, WAL mode, etc.)
   * Returns list of fixes applied
   */
  public async fixDatabaseIssues(): Promise<{
    success: boolean;
    fixesApplied: string[];
    message: string;
  }> {
    const db = this.getDatabase();
    const fixesApplied: string[] = [];

    try {
      console.log('[DatabaseService] ========== STARTING DATABASE FIX ==========');

      // Check current state BEFORE fixes
      const beforeSync = await db.getFirstAsync<{ synchronous: number }>('PRAGMA synchronous');
      const beforeWal = await db.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode');
      console.log('[DatabaseService] BEFORE - synchronous:', beforeSync?.synchronous, 'journal_mode:', beforeWal?.journal_mode);

      // Fix 1: Ensure WAL mode is enabled
      console.log('[DatabaseService] Setting WAL mode...');
      await db.execAsync('PRAGMA journal_mode = WAL;');
      const afterWal = await db.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode');
      console.log('[DatabaseService] After WAL fix - journal_mode:', afterWal?.journal_mode);
      if (beforeWal?.journal_mode?.toLowerCase() !== 'wal') {
        fixesApplied.push('Enabled WAL mode for crash recovery');
      }

      // Fix 2: Set synchronous mode to FULL for maximum durability
      console.log('[DatabaseService] Setting synchronous = FULL...');
      await db.execAsync('PRAGMA synchronous = FULL;');
      const afterSync = await db.getFirstAsync<{ synchronous: number }>('PRAGMA synchronous');
      console.log('[DatabaseService] After FULL fix - synchronous:', afterSync?.synchronous);
      if (beforeSync?.synchronous !== 2) {
        fixesApplied.push('Set synchronous mode to FULL for data safety');
      }

      // Fix 3: Enable foreign keys
      console.log('[DatabaseService] Enabling foreign keys...');
      await db.execAsync('PRAGMA foreign_keys = ON;');
      fixesApplied.push('Enabled foreign key constraints');

      // Fix 4: Set busy timeout
      console.log('[DatabaseService] Setting busy timeout...');
      await db.execAsync('PRAGMA busy_timeout = 5000;');

      // Fix 5: Checkpoint WAL to ensure data is flushed to disk
      console.log('[DatabaseService] Checkpointing WAL...');
      await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
      fixesApplied.push('Flushed pending changes to disk');

      // Final verification
      const verifySync = await db.getFirstAsync<{ synchronous: number }>('PRAGMA synchronous');
      const verifyWal = await db.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode');

      console.log('[DatabaseService] FINAL STATE - synchronous:', verifySync?.synchronous, 'journal_mode:', verifyWal?.journal_mode);

      const syncFixed = verifySync?.synchronous === 2;
      const walFixed = verifyWal?.journal_mode?.toLowerCase() === 'wal';

      console.log('[DatabaseService] syncFixed:', syncFixed, 'walFixed:', walFixed);
      console.log('[DatabaseService] ========== DATABASE FIX COMPLETE ==========');

      if (!syncFixed) {
        return {
          success: false,
          fixesApplied,
          message: `Synchronous mode is still ${verifySync?.synchronous === 1 ? 'NORMAL' : 'OFF'}. This may be a device limitation. Please restart the app.`,
        };
      }

      return {
        success: syncFixed && walFixed,
        fixesApplied,
        message: `Successfully applied ${fixesApplied.length} fixes. Database is now properly configured.`,
      };
    } catch (error) {
      console.error('[DatabaseService] Error fixing database issues:', error);
      return {
        success: false,
        fixesApplied,
        message: `Error during fix: ${error}`,
      };
    }
  }

  /**
   * Verify admin password for sensitive operations
   */
  public async verifyAdminPassword(password: string): Promise<boolean> {
    const db = this.getDatabase();
    try {
      // Get admin user
      const admin = await db.getFirstAsync<{ id: number; password_hash: string }>(
        "SELECT id, password_hash FROM users WHERE role = 'ADMIN' LIMIT 1"
      );

      if (!admin || !admin.password_hash) {
        return false;
      }

      // Import verifyPassword function
      const { verifyPassword } = require('../utils/passwordHash');
      return verifyPassword(password, admin.password_hash);
    } catch (error) {
      console.error('[DatabaseService] Error verifying admin password:', error);
      return false;
    }
  }

  /**
   * Get database file size and storage info
   */
  public async getDatabaseInfo(): Promise<{
    pageSize: number;
    pageCount: number;
    estimatedSizeKB: number;
    walEnabled: boolean;
  }> {
    const db = this.getDatabase();
    try {
      const pageSize = await db.getFirstAsync<{ page_size: number }>('PRAGMA page_size');
      const pageCount = await db.getFirstAsync<{ page_count: number }>('PRAGMA page_count');
      const journalMode = await db.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode');

      const size = (pageSize?.page_size || 4096) * (pageCount?.page_count || 0);

      return {
        pageSize: pageSize?.page_size || 4096,
        pageCount: pageCount?.page_count || 0,
        estimatedSizeKB: Math.round(size / 1024),
        walEnabled: journalMode?.journal_mode?.toLowerCase() === 'wal',
      };
    } catch (error) {
      console.error('[DatabaseService] Error getting database info:', error);
      return {
        pageSize: 0,
        pageCount: 0,
        estimatedSizeKB: 0,
        walEnabled: false,
      };
    }
  }

  // ==================== BIR eSALES REPORT ====================

  /**
   * Get eSales report data for BIR submission
   * Returns data formatted for eSales CSV/Excel export
   */
  public async getESalesReportData(year: number, month: number): Promise<{
    tin: string;
    branch: string;
    month: string;
    year: string;
    min: string;
    lastOR: string;
    vatableSales: number;
    vatZeroRatedSales: number;
    vatExemptSales: number;
    otherPercentageTaxSales: number;
  }> {
    const db = this.getDatabase();

    try {
      // Format month with leading zero
      const monthStr = month.toString().padStart(2, '0');
      const yearStr = year.toString();

      // Build date range for the month
      const startDate = `${year}-${monthStr}-01`;
      const endDate = month === 12
        ? `${year + 1}-01-01`
        : `${year}-${(month + 1).toString().padStart(2, '0')}-01`;

      // Get TIN from settings
      const tinSetting = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM settings WHERE key = 'tin'"
      );
      const tin = tinSetting?.value?.replace(/-/g, '') || '000000000000';

      // Get Branch from settings (default to "000" for main branch)
      const branchSetting = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM settings WHERE key = 'branch_code'"
      );
      const branch = branchSetting?.value || '000';

      // Get MIN (Machine Identification Number) from settings
      const minSetting = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM settings WHERE key = 'min_number'"
      );
      const min = minSetting?.value || '';

      // Get last invoice number in the period
      const lastInvoice = await db.getFirstAsync<{ invoice_number: string }>(
        `SELECT invoice_number FROM transactions
         WHERE status = 'COMPLETED'
         AND date(transaction_date) >= ?
         AND date(transaction_date) < ?
         ORDER BY transaction_date DESC, id DESC
         LIMIT 1`,
        [startDate, endDate]
      );
      const lastOR = lastInvoice?.invoice_number || '';

      // Calculate sales by VAT type
      // Join transaction_items with products to get vat_type
      const salesByVatType = await db.getAllAsync<{
        vat_type: string;
        total_sales: number;
      }>(
        `SELECT
           COALESCE(p.vat_type, 'vatable') as vat_type,
           SUM(ti.total_amount) as total_sales
         FROM transaction_items ti
         INNER JOIN transactions t ON t.id = ti.transaction_id
         LEFT JOIN products p ON p.id = ti.product_id
         WHERE t.status = 'COMPLETED'
         AND date(t.transaction_date) >= ?
         AND date(t.transaction_date) < ?
         GROUP BY COALESCE(p.vat_type, 'vatable')`,
        [startDate, endDate]
      );

      // Initialize values
      let vatableSales = 0;
      let vatZeroRatedSales = 0;
      let vatExemptSales = 0;

      // Process results
      for (const row of salesByVatType) {
        const sales = row.total_sales || 0;
        switch (row.vat_type) {
          case 'vatable':
            // For vatable sales, we need to get the VAT-exclusive amount
            // Assuming 12% VAT is already included in the price
            vatableSales = sales / 1.12;
            break;
          case 'zero_rated':
            vatZeroRatedSales = sales;
            break;
          case 'vat_exempt':
            vatExemptSales = sales;
            break;
        }
      }

      return {
        tin,
        branch,
        month: monthStr,
        year: yearStr,
        min,
        lastOR,
        vatableSales: Math.round(vatableSales * 100) / 100,
        vatZeroRatedSales: Math.round(vatZeroRatedSales * 100) / 100,
        vatExemptSales: Math.round(vatExemptSales * 100) / 100,
        otherPercentageTaxSales: 0, // Usually 0 for most businesses
      };
    } catch (error) {
      console.error('[DatabaseService] Error getting eSales report data:', error);
      throw error;
    }
  }

  // ========================================
  // DASHBOARD ANALYTICS METHODS
  // ========================================

  public async getDashboardAnalytics(): Promise<{
    todaySales: number;
    todayTransactions: number;
    yesterdaySales: number;
    weekSales: number;
    monthSales: number;
    avgTransactionValue: number;
    topProducts: Array<{ id: number; name: string; quantity_sold: number; total_sales: number }>;
    lowStockProducts: Array<{ id: number; name: string; stock_quantity: number; reorder_level: number }>;
    paymentBreakdown: Array<{ method: string; amount: number; count: number; percentage: number }>;
    recentTransactions: Array<{ id: number; invoice_number: string; total_amount: number; payment_method: string; customer_name: string; transaction_date: string }>;
    hourlyData: Array<{ hour: number; sales: number }>;
  }> {
    const db = this.getDatabase();
    const today = getPhilippineDateString();

    try {
      // Get yesterday's date
      const yesterdayDate = new Date();
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterday = yesterdayDate.toISOString().split('T')[0];

      // Get week start (Sunday)
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekStartStr = weekStart.toISOString().split('T')[0];

      // Get month start
      const monthStart = new Date();
      monthStart.setDate(1);
      const monthStartStr = monthStart.toISOString().split('T')[0];

      // Get today's sales summary
      const todaySummary = await db.getFirstAsync<any>(`
        SELECT
          COALESCE(SUM(total_amount), 0) as total_sales,
          COUNT(*) as transaction_count
        FROM transactions
        WHERE DATE(transaction_date) = ? AND status = 'COMPLETED'
      `, [today]);

      // Get yesterday's sales
      const yesterdaySummary = await db.getFirstAsync<any>(`
        SELECT COALESCE(SUM(total_amount), 0) as total_sales
        FROM transactions
        WHERE DATE(transaction_date) = ? AND status = 'COMPLETED'
      `, [yesterday]);

      // Get this week's sales
      const weekSummary = await db.getFirstAsync<any>(`
        SELECT COALESCE(SUM(total_amount), 0) as total_sales
        FROM transactions
        WHERE DATE(transaction_date) >= ? AND status = 'COMPLETED'
      `, [weekStartStr]);

      // Get this month's sales
      const monthSummary = await db.getFirstAsync<any>(`
        SELECT COALESCE(SUM(total_amount), 0) as total_sales
        FROM transactions
        WHERE DATE(transaction_date) >= ? AND status = 'COMPLETED'
      `, [monthStartStr]);

      const avgTransaction = todaySummary?.transaction_count > 0
        ? todaySummary.total_sales / todaySummary.transaction_count
        : 0;

      // Get top selling products (today)
      const topProducts = await db.getAllAsync<any>(`
        SELECT
          p.id,
          p.name,
          SUM(ti.quantity) as quantity_sold,
          SUM(ti.total_amount) as total_sales
        FROM transaction_items ti
        INNER JOIN transactions t ON ti.transaction_id = t.id
        INNER JOIN products p ON ti.product_id = p.id
        WHERE DATE(t.transaction_date) = ? AND t.status = 'COMPLETED'
        GROUP BY p.id, p.name
        ORDER BY quantity_sold DESC
        LIMIT 5
      `, [today]) || [];

      // Get low stock products
      const lowStockProducts = await db.getAllAsync<any>(`
        SELECT id, name, stock_quantity, reorder_level
        FROM products
        WHERE is_active = 1
          AND stock_quantity <= reorder_level
          AND reorder_level > 0
        ORDER BY (stock_quantity * 1.0 / NULLIF(reorder_level, 0)) ASC
        LIMIT 10
      `) || [];

      // Get payment method breakdown (today)
      const paymentData = await db.getAllAsync<any>(`
        SELECT
          payment_method as method,
          COALESCE(SUM(total_amount), 0) as amount,
          COUNT(*) as count
        FROM transactions
        WHERE DATE(transaction_date) = ? AND status = 'COMPLETED'
        GROUP BY payment_method
        ORDER BY amount DESC
      `, [today]) || [];

      const totalPayments = paymentData.reduce((sum: number, p: any) => sum + p.amount, 0) || 0;
      const paymentBreakdown = paymentData.map((p: any) => ({
        method: p.method,
        amount: p.amount,
        count: p.count,
        percentage: totalPayments > 0 ? (p.amount / totalPayments) * 100 : 0,
      }));

      // Get recent transactions
      const recentTransactions = await db.getAllAsync<any>(`
        SELECT
          t.id,
          t.invoice_number,
          t.total_amount,
          t.payment_method,
          COALESCE(c.name, 'Walk-in Customer') as customer_name,
          t.transaction_date
        FROM transactions t
        LEFT JOIN customers c ON t.customer_id = c.id
        WHERE t.status = 'COMPLETED'
        ORDER BY t.transaction_date DESC
        LIMIT 10
      `) || [];

      // Get hourly sales data for today
      const hourlyDataRaw = await db.getAllAsync<any>(`
        SELECT
          CAST(strftime('%H', transaction_date) AS INTEGER) as hour,
          COALESCE(SUM(total_amount), 0) as sales
        FROM transactions
        WHERE DATE(transaction_date) = ? AND status = 'COMPLETED'
        GROUP BY hour
        ORDER BY hour
      `, [today]) || [];

      // Fill in missing hours with 0 (6 AM to 10 PM)
      const hourlyMap = new Map(hourlyDataRaw.map((h: any) => [h.hour, h.sales]));
      const hourlyData = [];
      for (let i = 6; i <= 22; i++) {
        hourlyData.push({
          hour: i,
          sales: hourlyMap.get(i) || 0,
        });
      }

      return {
        todaySales: todaySummary?.total_sales || 0,
        todayTransactions: todaySummary?.transaction_count || 0,
        yesterdaySales: yesterdaySummary?.total_sales || 0,
        weekSales: weekSummary?.total_sales || 0,
        monthSales: monthSummary?.total_sales || 0,
        avgTransactionValue: avgTransaction,
        topProducts,
        lowStockProducts,
        paymentBreakdown,
        recentTransactions,
        hourlyData,
      };
    } catch (error) {
      console.error('[DatabaseService] Error getting dashboard analytics:', error);
      throw error;
    }
  }

  // ==================== PURGE OLD TRANSACTIONS ====================

  public async purgeOldTransactions(cutoffDate: Date): Promise<{
    success: boolean;
    totalDeleted: number;
    details: { table: string; count: number }[];
    message: string;
  }> {
    const db = this.getDatabase();
    const details: { table: string; count: number }[] = [];
    let totalDeleted = 0;
    const cutoffStr = cutoffDate.toISOString();

    try {
      console.log('[DatabaseService] ========== STARTING PURGE OLD TRANSACTIONS ==========');
      console.log('[DatabaseService] Cutoff date:', cutoffStr);

      // Disable foreign keys temporarily for safe deletion order
      await db.execAsync('PRAGMA foreign_keys = OFF;');

      // 1. sales_return_items (via join on sales_returns by date)
      let result = await db.runAsync(
        `DELETE FROM sales_return_items WHERE sales_return_id IN (
          SELECT id FROM sales_returns WHERE return_date < ?
        )`, [cutoffStr]
      );
      if (result.changes > 0) { details.push({ table: 'sales_return_items', count: result.changes }); totalDeleted += result.changes; }

      // 2. sales_returns
      result = await db.runAsync('DELETE FROM sales_returns WHERE return_date < ?', [cutoffStr]);
      if (result.changes > 0) { details.push({ table: 'sales_returns', count: result.changes }); totalDeleted += result.changes; }

      // 3. customer_payments
      result = await db.runAsync('DELETE FROM customer_payments WHERE payment_date < ?', [cutoffStr]);
      if (result.changes > 0) { details.push({ table: 'customer_payments', count: result.changes }); totalDeleted += result.changes; }

      // 4. accounts_receivable (only PAID — never delete unpaid)
      result = await db.runAsync('DELETE FROM accounts_receivable WHERE created_at < ? AND status = ?', [cutoffStr, 'PAID']);
      if (result.changes > 0) { details.push({ table: 'accounts_receivable', count: result.changes }); totalDeleted += result.changes; }

      // 5. transaction_items (via join on transactions by date)
      result = await db.runAsync(
        `DELETE FROM transaction_items WHERE transaction_id IN (
          SELECT id FROM transactions WHERE transaction_date < ?
        )`, [cutoffStr]
      );
      if (result.changes > 0) { details.push({ table: 'transaction_items', count: result.changes }); totalDeleted += result.changes; }

      // 6. transactions
      result = await db.runAsync('DELETE FROM transactions WHERE transaction_date < ?', [cutoffStr]);
      if (result.changes > 0) { details.push({ table: 'transactions', count: result.changes }); totalDeleted += result.changes; }

      // 7. purchase_return_items (via join on purchase_returns by date)
      result = await db.runAsync(
        `DELETE FROM purchase_return_items WHERE purchase_return_id IN (
          SELECT id FROM purchase_returns WHERE return_date < ?
        )`, [cutoffStr]
      );
      if (result.changes > 0) { details.push({ table: 'purchase_return_items', count: result.changes }); totalDeleted += result.changes; }

      // 8. purchase_returns
      result = await db.runAsync('DELETE FROM purchase_returns WHERE return_date < ?', [cutoffStr]);
      if (result.changes > 0) { details.push({ table: 'purchase_returns', count: result.changes }); totalDeleted += result.changes; }

      // 9. supplier_payments
      result = await db.runAsync('DELETE FROM supplier_payments WHERE payment_date < ?', [cutoffStr]);
      if (result.changes > 0) { details.push({ table: 'supplier_payments', count: result.changes }); totalDeleted += result.changes; }

      // 10. accounts_payable (only PAID — never delete unpaid)
      result = await db.runAsync('DELETE FROM accounts_payable WHERE created_at < ? AND status = ?', [cutoffStr, 'PAID']);
      if (result.changes > 0) { details.push({ table: 'accounts_payable', count: result.changes }); totalDeleted += result.changes; }

      // 11. purchase_details (via join on purchases by date)
      result = await db.runAsync(
        `DELETE FROM purchase_details WHERE purchase_id IN (
          SELECT id FROM purchases WHERE purchase_date < ?
        )`, [cutoffStr]
      );
      if (result.changes > 0) { details.push({ table: 'purchase_details', count: result.changes }); totalDeleted += result.changes; }

      // 12. purchases
      result = await db.runAsync('DELETE FROM purchases WHERE purchase_date < ?', [cutoffStr]);
      if (result.changes > 0) { details.push({ table: 'purchases', count: result.changes }); totalDeleted += result.changes; }

      // 13. inventory_movements
      result = await db.runAsync('DELETE FROM inventory_movements WHERE created_at < ?', [cutoffStr]);
      if (result.changes > 0) { details.push({ table: 'inventory_movements', count: result.changes }); totalDeleted += result.changes; }

      // 14. cash_movements
      result = await db.runAsync('DELETE FROM cash_movements WHERE created_at < ?', [cutoffStr]);
      if (result.changes > 0) { details.push({ table: 'cash_movements', count: result.changes }); totalDeleted += result.changes; }

      // 15. ejournal
      result = await db.runAsync('DELETE FROM ejournal WHERE created_at < ?', [cutoffStr]);
      if (result.changes > 0) { details.push({ table: 'ejournal', count: result.changes }); totalDeleted += result.changes; }

      // 16. x_readings
      result = await db.runAsync('DELETE FROM x_readings WHERE date < ?', [cutoffStr]);
      if (result.changes > 0) { details.push({ table: 'x_readings', count: result.changes }); totalDeleted += result.changes; }

      // 17. z_readings
      result = await db.runAsync('DELETE FROM z_readings WHERE date < ?', [cutoffStr]);
      if (result.changes > 0) { details.push({ table: 'z_readings', count: result.changes }); totalDeleted += result.changes; }

      // 18. end_of_day_records
      result = await db.runAsync('DELETE FROM end_of_day_records WHERE date < ?', [cutoffStr]);
      if (result.changes > 0) { details.push({ table: 'end_of_day_records', count: result.changes }); totalDeleted += result.changes; }

      // 19. shifts (only CLOSED)
      result = await db.runAsync('DELETE FROM shifts WHERE start_time < ? AND status = ?', [cutoffStr, 'CLOSED']);
      if (result.changes > 0) { details.push({ table: 'shifts', count: result.changes }); totalDeleted += result.changes; }

      // Re-enable foreign keys
      await db.execAsync('PRAGMA foreign_keys = ON;');

      // VACUUM to reclaim disk space
      await db.execAsync('VACUUM;');

      console.log('[DatabaseService] Purge complete. Total deleted:', totalDeleted);
      console.log('[DatabaseService] ========== PURGE COMPLETE ==========');

      return {
        success: true,
        totalDeleted,
        details,
        message: `Successfully purged ${totalDeleted} old records.`,
      };
    } catch (error) {
      // Re-enable foreign keys even on error
      try { await db.execAsync('PRAGMA foreign_keys = ON;'); } catch (e) { /* ignore */ }
      console.error('[DatabaseService] Error purging old transactions:', error);
      return {
        success: false,
        totalDeleted,
        details,
        message: `Error during purge: ${error}`,
      };
    }
  }
}