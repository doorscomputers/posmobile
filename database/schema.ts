import * as SQLite from 'expo-sqlite';

export interface DatabaseSchema {
  // Store configuration and BIR details
  stores: {
    id: number;
    name: string;
    address: string;
    tin: string; // Tax Identification Number for BIR
    bir_permit_number: string;
    pos_machine_serial: string;
    accreditation_number: string;
    created_at: string;
    updated_at: string;
  };

  // Product catalog
  products: {
    id: number;
    code: string;
    name: string;
    description?: string;
    price: number;
    wholesale_price?: number; // Wholesale price (must be <= retail price)
    cost: number;
    category_id?: number;
    brand_id?: number;
    unit_id?: number;
    size_id?: number;
    vat_type: 'vatable' | 'vat_exempt' | 'zero_rated'; // BIR VAT classification
    tax_rate: number; // VAT rate (12% for vatable, 0% for exempt/zero-rated)
    is_vat_inclusive: boolean; // Only applicable for vatable items
    stock_quantity: number;
    reorder_level: number;
    unit: string; // Legacy field for backward compatibility
    is_active: boolean;
    created_at: string;
    updated_at: string;
  };

  // Product categories
  categories: {
    id: number;
    name: string;
    description?: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  };

  // Product brands
  brands: {
    id: number;
    name: string;
    description?: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  };

  // Product units of measure
  units: {
    id: number;
    name: string;
    abbreviation: string;
    description?: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  };

  // Product sizes
  sizes: {
    id: number;
    name: string;
    description?: string;
    sort_order: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  };

  // Sales transactions (BIR compliant)
  transactions: {
    id: number;
    transaction_number: string; // Sequential BIR-compliant numbering
    invoice_number: string; // BIR Invoice number (replaced OR)
    customer_name?: string;
    customer_tin?: string;
    customer_address?: string;
    subtotal: number;
    tax_amount: number; // VAT amount
    discount_amount: number;
    total_amount: number;
    payment_method: 'CASH' | 'CARD' | 'CHECK' | 'ONLINE' | 'CHARGE_INVOICE';
    amount_tendered: number;
    change_amount: number;
    payment_status: 'PAID' | 'UNPAID' | 'PARTIAL'; // For tracking charge invoice payments
    cashier_id: number;
    status: 'COMPLETED' | 'VOID' | 'REFUNDED';
    void_reason?: string;
    void_by?: number;
    void_date?: string;
    // SC/PWD Discount fields (BIR requirement)
    sc_pwd_id?: string; // Senior Citizen or PWD ID number
    sc_pwd_name?: string; // Name of SC/PWD for receipt
    sc_pwd_type?: 'SENIOR' | 'PWD'; // Type of discount applied
    transaction_date: string;
    created_at: string;
    updated_at: string;
  };

  // Transaction line items
  transaction_items: {
    id: number;
    transaction_id: number;
    product_id: number;
    product_code: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    discount_amount: number;
    tax_amount: number;
    total_amount: number;
    price_type: 'retail' | 'wholesale'; // Price type used for this item
    created_at: string;
  };

  // BIR Z-Reading data (End-of-day reports)
  z_readings: {
    id: number;
    reading_number: number; // Sequential Z-Reading number
    date: string;
    start_invoice_number: string;
    end_invoice_number: string;
    gross_sales: number;
    vat_sales: number;
    vat_amount: number;
    vat_exempt_sales: number;
    zero_rated_sales: number;
    discount_amount: number;
    void_amount: number;
    void_count: number;
    refund_amount: number;
    refund_count: number;
    exchange_amount: number;
    exchange_count: number;
    net_sales: number;
    cumulative_grand_total: number; // Running total of net_sales across all Z-Readings (BIR requirement)
    reset_counter: number; // Cumulative counter (never resets)
    cashier_id: number;
    created_at: string;
  };

  // BIR X-Reading data (Mid-day inquiry)
  x_readings: {
    id: number;
    date: string;
    time: string;
    current_invoice_number: string;
    gross_sales: number;
    vat_sales: number;
    vat_amount: number;
    vat_exempt_sales: number;
    zero_rated_sales: number;
    discount_amount: number;
    void_amount: number;
    refund_amount: number;
    net_sales: number;
    transaction_count: number;
    cashier_id: number;
    created_at: string;
  };

  // eJournal entries for BIR compliance
  ejournal: {
    id: number;
    transaction_id?: number;
    entry_type: 'SALE' | 'VOID' | 'REFUND' | 'RETURN' | 'PURCHASE_RETURN' | 'PAYMENT' | 'Z_READING' | 'X_READING' | 'SYSTEM';
    reference_number: string;
    description: string;
    amount?: number;
    cashier_id: number;
    timestamp: string;
    created_at: string;
  };

  // Users/Cashiers
  users: {
    id: number;
    username: string;
    full_name: string;
    role: 'ADMIN' | 'CASHIER' | 'MANAGER';
    is_active: boolean;
    password_hash: string;
    last_login?: string;
    created_at: string;
    updated_at: string;
  };

  // Inventory tracking with before/after quantities
  inventory_movements: {
    id: number;
    product_id: number;
    product_code: string;
    product_name: string;
    movement_type: 'IN' | 'OUT' | 'ADJUSTMENT';
    quantity: number;
    quantity_before: number; // Stock quantity before the transaction
    quantity_after: number;  // Stock quantity after the transaction
    unit_cost: number;       // Cost per unit at time of transaction
    total_value: number;     // Total value of the movement (quantity * unit_cost)
    reference_type: 'SALE' | 'PURCHASE' | 'MANUAL_ADJUSTMENT' | 'DAMAGE' | 'DAMAGE_REVERSAL' | 'PHYSICAL_COUNT' | 'SALES_RETURN' | 'PURCHASE_RETURN' | 'EXCHANGE' | 'VOID' | 'BEGINNING_BALANCE';
    reference_id?: number;
    reference_number?: string; // Human-readable reference (invoice number, purchase order, etc.)
    notes?: string;
    created_by: number;
    created_at: string;
  };

  // System settings
  settings: {
    id: number;
    key: string;
    value: string;
    description?: string;
    updated_at: string;
  };

  // Physical count sessions for inventory audit trail
  physical_count_sessions: {
    id: number;
    session_id: string;
    date: string;
    started_by: number;
    completed_by?: number;
    status: 'in_progress' | 'completed' | 'cancelled';
    total_items: number;
    counted_items: number;
    discrepancy_count: number;
    total_discrepancy_value: number;
    notes?: string;
    started_at: string;
    completed_at?: string;
    created_at: string;
  };

  // Physical count details for each product in a session
  physical_count_details: {
    id: number;
    session_id: string;
    product_id: number;
    product_code: string;
    product_name: string;
    system_quantity: number;
    physical_quantity: number;
    discrepancy: number;
    unit_cost: number;
    value_discrepancy: number;
    status: 'pending' | 'counted' | 'reviewed';
    counted_by?: number;
    notes?: string;
    counted_at?: string;
    created_at: string;
  };

  // Dynamic role permissions
  role_permissions: {
    id: number;
    role: 'MANAGER' | 'CASHIER';
    permission: string;
    is_enabled: boolean;
    updated_by: number;
    updated_at: string;
  };

  // Suppliers for purchase management
  suppliers: {
    id: number;
    code: string;
    name: string;
    contact_person?: string;
    phone?: string;
    email?: string;
    address?: string;
    tin?: string;
    credit_terms?: number; // Days for payment terms
    credit_limit?: number;
    is_active: boolean;
    notes?: string;
    created_at: string;
    updated_at: string;
  };

  // Purchase Orders/Headers
  purchases: {
    id: number;
    purchase_number: string;
    supplier_id: number;
    purchase_date: string;
    expected_delivery_date?: string;
    reference_number?: string; // Supplier's reference
    status: 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';
    subtotal: number;
    tax_amount: number;
    discount_amount: number;
    total_amount: number;
    paid_amount: number;
    balance_amount: number;
    payment_terms: string; // e.g., "30 days", "COD", "Net 15"
    notes?: string;
    created_by: number;
    received_by?: number;
    cancelled_by?: number;
    cancelled_reason?: string;
    created_at: string;
    updated_at: string;
  };

  // Purchase Order Line Items/Details
  purchase_details: {
    id: number;
    purchase_id: number;
    product_id: number;
    product_code: string;
    product_name: string;
    quantity_ordered: number;
    quantity_received: number;
    unit_cost: number;
    discount_amount: number;
    tax_amount: number;
    total_amount: number;
    notes?: string;
    created_at: string;
  };

  // Supplier Payments for Accounts Payable
  supplier_payments: {
    id: number;
    payment_number: string;
    supplier_id: number;
    purchase_id?: number; // Optional - payment might be for multiple purchases
    payment_date: string;
    payment_method: 'CASH' | 'CHEQUE' | 'OTHERS';
    // For OTHERS payment type (Gcash, Maya, Bank Transfer, etc.)
    others_type?: 'GCASH' | 'MAYA' | 'BANK_TRANSFER' | 'PAYPAL' | 'OTHER';
    reference_number?: string; // For OTHERS: Gcash ref, Maya ref, etc.
    // Cheque-specific fields
    cheque_number?: string;
    bank_name?: string;
    payee_name?: string;
    cheque_date?: string; // Date on the cheque (for post-dated cheques)
    cheque_status?: 'PENDING' | 'DEPOSITED' | 'CLEARED' | 'BOUNCED';
    deposited_date?: string;
    cleared_date?: string;
    bounced_date?: string;
    bounced_reason?: 'INSUFFICIENT_FUNDS' | 'ACCOUNT_CLOSED' | 'SIGNATURE_MISMATCH' | 'POST_DATED' | 'STALE_EXPIRED' | 'OTHER';
    amount: number;
    notes?: string;
    created_by: number;
    created_at: string;
  };

  // Accounts Payable aging and tracking
  accounts_payable: {
    id: number;
    purchase_id: number;
    supplier_id: number;
    invoice_number?: string;
    invoice_date: string;
    due_date: string;
    original_amount: number;
    paid_amount: number;
    balance_amount: number;
    status: 'OUTSTANDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';
    days_outstanding: number;
    aging_bucket: '0-30' | '31-60' | '61-90' | '90+';
    created_at: string;
    updated_at: string;
  };

  // Customer information for charge invoices
  customers: {
    id: number;
    code: string;
    name: string;
    contact_person?: string;
    phone?: string;
    email?: string;
    address?: string;
    tin?: string;
    credit_terms?: number; // Days for payment terms
    credit_limit?: number;
    is_active: boolean;
    notes?: string;
    created_at: string;
    updated_at: string;
  };

  // Customer Payments for charge invoices
  customer_payments: {
    id: number;
    payment_number: string;
    customer_id?: number;
    transaction_id: number; // Reference to original charge invoice
    payment_date: string;
    payment_method: 'CASH' | 'CARD' | 'CHECK' | 'BANK_TRANSFER' | 'ONLINE';
    amount_paid: number;
    reference_number?: string; // Check number, bank ref, etc.
    notes?: string;
    received_by: number;
    created_at: string;
  };

  // Accounts Receivable aging and tracking
  accounts_receivable: {
    id: number;
    transaction_id: number;
    customer_id?: number;
    customer_name?: string;
    invoice_number: string;
    invoice_date: string;
    due_date: string;
    original_amount: number;
    paid_amount: number;
    balance_amount: number;
    status: 'OUTSTANDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';
    days_outstanding: number;
    aging_bucket: '0-30' | '31-60' | '61-90' | '90+';
    created_at: string;
    updated_at: string;
  };

  // Damaged Items Sessions (like physical count sessions)
  damaged_items_sessions: {
    id: number;
    session_id: string; // Unique identifier like "DMG-2024-001"
    session_name: string;
    status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
    total_items: number;
    total_value: number;
    started_by: number;
    completed_by?: number;
    cancelled_by?: number;
    cancelled_reason?: string;
    notes?: string;
    started_at: string;
    completed_at?: string;
    created_at: string;
  };

  // Individual damaged items within a session
  damaged_items_details: {
    id: number;
    session_id: string;
    product_id: number;
    product_code: string;
    product_name: string;
    current_stock: number;
    damaged_quantity: number;
    unit_cost: number;
    total_value: number;
    damage_reason: 'EXPIRED' | 'BROKEN' | 'DEFECTIVE' | 'SPOILED' | 'LOST' | 'THEFT' | 'OTHER';
    damage_description?: string;
    recorded_by: number;
    recorded_at: string;
    created_at: string;
  };

  // End of Day records for Z-Reading
  end_of_day_records: {
    id: number;
    date: string;
    beginning_cash: number;
    gross_sales: number;
    discounts: number;
    sales_returns: number;
    refund_count: number;
    net_sales: number;
    cash_sales: number;
    credit_sales: number;
    gcash_sales: number;
    card_sales: number;
    check_sales: number;
    other_sales: number;
    void_amount: number;
    void_count: number;
    exchange_amount: number;
    exchange_count: number;
    transaction_count: number;
    customer_payments_received: number;
    customer_payments_cash: number;
    customer_payments_check: number;
    customer_payments_card: number;
    customer_payments_online: number;
    customer_payments_bank_transfer: number;
    supplier_payments_made: number;
    opening_fund: number;
    cash_in: number;
    cash_out: number;
    petty_cash: number;
    cash_refunds: number;
    cash_fund: number;
    expected_cash: number;
    actual_cash: number;
    cash_variance: number;
    denomination_breakdown: string; // JSON string
    next_day_beginning_cash: number;
    created_by: number;
    status: 'COMPLETED' | 'CANCELLED';
    created_at: string;
  };

  // Cashier Shifts - tracks when cashier starts/ends their shift
  shifts: {
    id: number;
    user_id: number;
    start_time: string;
    end_time?: string;
    beginning_cash: number;
    ending_cash?: number;
    status: 'OPEN' | 'CLOSED';
    z_reading_id?: number;
    created_at: string;
  };

  // Sales Returns
  sales_returns: {
    id: number;
    return_number: string;
    original_transaction_id?: number;
    original_invoice_number?: string;
    customer_id?: number;
    customer_name?: string;
    return_date: string;
    total_amount: number;
    refund_method: 'CASH' | 'CREDIT' | 'STORE_CREDIT' | 'EXCHANGE';
    reason: string;
    notes?: string;
    processed_by: number;
    status: 'COMPLETED' | 'CANCELLED';
    created_at: string;
  };

  // Sales Return Items
  sales_return_items: {
    id: number;
    sales_return_id: number;
    product_id: number;
    product_code: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    total_amount: number;
    created_at: string;
  };

  // Cash Movements for cash drawer management
  cash_movements: {
    id: number;
    movement_type: 'OPENING_FUND' | 'CASH_IN' | 'CASH_OUT' | 'PETTY_CASH' | 'CASH_REFUND';
    amount: number;
    description: string;
    reference_number?: string;
    approved_by?: string;
    cashier_id: number;
    created_at: string;
  };

  // Customer Audit Trail
  customer_audit: {
    id: number;
    customer_id: number;
    action: 'CREATE' | 'UPDATE' | 'DELETE';
    field_name: string;
    old_value?: string;
    new_value?: string;
    changed_by: number;
    changed_at: string;
  };

  // Device Binding for app protection
  device_binding: {
    id: number;
    device_id: string; // Unique device fingerprint hash
    license_key: string; // License key used for activation (empty for trial)
    device_name: string;
    device_brand: string;
    device_model: string;
    os_name: string;
    os_version: string;
    app_version: string;
    is_active: boolean;
    activated_at: string;
    last_verified_at: string;
    created_at: string;
    // Trial version fields
    license_type: 'trial' | 'full'; // Trial or full license
    trial_start_date: string | null; // When trial started
    trial_days: number; // Trial period in days (default 30)
  };

  // Reset Operations Log for audit trail
  reset_operations_log: {
    id: number;
    user_id: number;
    username: string;
    full_name: string;
    operation_type: 'TRANSACTIONAL_DATA_RESET' | 'DATABASE_RESTORE' | 'MASTER_DATA_RESET';
    status: 'ATTEMPTED' | 'SUCCESS' | 'FAILED' | 'DENIED' | 'CANCELLED';
    records_deleted: number;
    details?: string; // JSON with additional details
    created_at: string;
  };
}

// Type exports for components
export type Product = DatabaseSchema['products'];
export type Transaction = DatabaseSchema['transactions'];
export type TransactionItem = DatabaseSchema['transaction_items'];
export type Category = DatabaseSchema['categories'];
export type Brand = DatabaseSchema['brands'];
export type Unit = DatabaseSchema['units'];
export type Size = DatabaseSchema['sizes'];
export type User = DatabaseSchema['users'];
export type InventoryMovement = DatabaseSchema['inventory_movements'];
export type Supplier = DatabaseSchema['suppliers'];
export type Purchase = DatabaseSchema['purchases'];
export type PurchaseDetail = DatabaseSchema['purchase_details'];
export type SupplierPayment = DatabaseSchema['supplier_payments'];
export type AccountsPayable = DatabaseSchema['accounts_payable'];
export type Customer = DatabaseSchema['customers'];
export type CustomerPayment = DatabaseSchema['customer_payments'];
export type AccountsReceivable = DatabaseSchema['accounts_receivable'];
export type DamagedItemsSession = DatabaseSchema['damaged_items_sessions'];
export type DamagedItemsDetail = DatabaseSchema['damaged_items_details'];
export type EndOfDayRecord = DatabaseSchema['end_of_day_records'];
export type Shift = DatabaseSchema['shifts'];
export type SalesReturn = DatabaseSchema['sales_returns'];
export type SalesReturnItem = DatabaseSchema['sales_return_items'];
export type CashMovement = DatabaseSchema['cash_movements'];
export type CustomerAudit = DatabaseSchema['customer_audit'];
export type DeviceBinding = DatabaseSchema['device_binding'];
export type ResetOperationLog = DatabaseSchema['reset_operations_log'];

// Database initialization script
export const initializeDatabase = async (db: SQLite.SQLiteDatabase) => {
  console.log('Starting database schema initialization...');

  try {
    // Enable WAL mode FIRST - this is the #1 protection against SQLite corruption
    // WAL (Write-Ahead Logging) allows concurrent reads during writes and
    // provides better crash recovery than the default rollback journal
    console.log('Setting PRAGMA journal_mode = WAL...');
    await db.execAsync('PRAGMA journal_mode = WAL;');
    console.log('WAL mode enabled successfully');

    // Enable foreign keys
    console.log('Setting PRAGMA foreign_keys = ON...');
    await db.execAsync('PRAGMA foreign_keys = ON;');
    console.log('Foreign keys enabled successfully');

    // Set synchronous mode to FULL for maximum data durability
    // FULL ensures data is safely written to disk before continuing
    // This prevents data loss on crashes - critical for POS/financial data
    console.log('Setting PRAGMA synchronous = FULL...');
    await db.execAsync('PRAGMA synchronous = FULL;');
    console.log('Synchronous mode set to FULL');

    // Test that PRAGMAs work
    const fkResult = await db.getFirstAsync('PRAGMA foreign_keys;');
    const walResult = await db.getFirstAsync('PRAGMA journal_mode;');
    console.log('Foreign keys status:', fkResult);
    console.log('Journal mode:', walResult);

  } catch (pragmaError) {
    console.warn('PRAGMA commands failed, continuing without them:', pragmaError);
  }

  // Create tables with individual error handling
  console.log('Creating stores table...');
  try {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      tin TEXT NOT NULL,
      bir_permit_number TEXT NOT NULL,
      pos_machine_serial TEXT NOT NULL,
      accreditation_number TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✅ Stores table created successfully');
  } catch (error) {
    console.error('❌ Failed to create stores table:', error);
    throw error;
  }

  console.log('Creating categories table...');
  try {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✅ Categories table created successfully');
  } catch (error) {
    console.error('❌ Failed to create categories table:', error);
    throw error;
  }

  console.log('Creating brands table...');
  try {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✅ Brands table created successfully');
  } catch (error) {
    console.error('❌ Failed to create brands table:', error);
    throw error;
  }

  console.log('Creating units table...');
  try {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      abbreviation TEXT NOT NULL,
      description TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✅ Units table created successfully');
  } catch (error) {
    console.error('❌ Failed to create units table:', error);
    throw error;
  }

  console.log('Creating sizes table...');
  try {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sizes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✅ Sizes table created successfully');
  } catch (error) {
    console.error('❌ Failed to create sizes table:', error);
    throw error;
  }

  console.log('Creating products table...');
  try {
    await db.execAsync(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      price DECIMAL(10,2) NOT NULL,
      wholesale_price DECIMAL(10,2) DEFAULT NULL,
      cost DECIMAL(10,2) NOT NULL DEFAULT 0,
      category_id INTEGER,
      brand_id INTEGER,
      unit_id INTEGER,
      size_id INTEGER,
      vat_type TEXT CHECK (vat_type IN ('vatable', 'vat_exempt', 'zero_rated')) DEFAULT 'vatable',
      tax_rate DECIMAL(5,2) DEFAULT 12.00,
      is_vat_inclusive BOOLEAN DEFAULT 1,
      stock_quantity INTEGER DEFAULT 0,
      reorder_level INTEGER DEFAULT 0,
      unit TEXT DEFAULT 'pcs',
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories (id),
      FOREIGN KEY (brand_id) REFERENCES brands (id),
      FOREIGN KEY (unit_id) REFERENCES units (id),
      FOREIGN KEY (size_id) REFERENCES sizes (id)
    );
  `);
  console.log('✅ Products table created successfully');
  } catch (error) {
    console.error('❌ Failed to create products table:', error);
    throw error;
  }

  // Add new columns to products if they don't exist (for existing databases)
  try {
    await db.execAsync(`ALTER TABLE products ADD COLUMN brand_id INTEGER REFERENCES brands(id);`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE products ADD COLUMN unit_id INTEGER REFERENCES units(id);`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE products ADD COLUMN size_id INTEGER REFERENCES sizes(id);`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE products ADD COLUMN reorder_level INTEGER DEFAULT 0;`);
  } catch (e) { /* Column may already exist */ }
  // Add vat_type column for BIR compliance - default to 'vatable'
  try {
    await db.execAsync(`ALTER TABLE products ADD COLUMN vat_type TEXT DEFAULT 'vatable';`);
  } catch (e) { /* Column may already exist */ }

  // Add wholesale_price column for wholesale pricing feature
  try {
    await db.execAsync(`ALTER TABLE products ADD COLUMN wholesale_price DECIMAL(10,2) DEFAULT NULL;`);
  } catch (e) { /* Column may already exist */ }

  console.log('Creating users table...');
  try {
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
  console.log('✅ Users table created successfully');
  } catch (error) {
    console.error('❌ Failed to create users table:', error);
    throw error;
  }

  console.log('Creating remaining tables...');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_number TEXT NOT NULL UNIQUE,
      invoice_number TEXT NOT NULL UNIQUE,
      customer_id INTEGER,
      customer_name TEXT,
      customer_tin TEXT,
      customer_address TEXT,
      subtotal DECIMAL(10,2) NOT NULL,
      tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      discount_amount DECIMAL(10,2) DEFAULT 0,
      total_amount DECIMAL(10,2) NOT NULL,
      payment_method TEXT CHECK (payment_method IN ('CASH', 'CARD', 'CHECK', 'ONLINE', 'CHARGE_INVOICE')) DEFAULT 'CASH',
      amount_tendered DECIMAL(10,2) NOT NULL,
      change_amount DECIMAL(10,2) DEFAULT 0,
      payment_status TEXT CHECK (payment_status IN ('PAID', 'UNPAID', 'PARTIAL')) DEFAULT 'PAID',
      cashier_id INTEGER NOT NULL,
      status TEXT CHECK (status IN ('COMPLETED', 'VOID', 'REFUNDED')) DEFAULT 'COMPLETED',
      void_reason TEXT,
      void_by INTEGER,
      void_date DATETIME,
      sc_pwd_id TEXT,
      sc_pwd_name TEXT,
      sc_pwd_type TEXT CHECK (sc_pwd_type IN ('SENIOR', 'PWD')),
      transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers (id),
      FOREIGN KEY (cashier_id) REFERENCES users (id),
      FOREIGN KEY (void_by) REFERENCES users (id)
    );
  `);

  // Add customer_id column to transactions if it doesn't exist (for existing databases)
  try {
    await db.execAsync(`ALTER TABLE transactions ADD COLUMN customer_id INTEGER REFERENCES customers(id);`);
  } catch (e) { /* Column may already exist */ }

  // Add payment_status column to transactions if it doesn't exist (for existing databases)
  try {
    await db.execAsync(`ALTER TABLE transactions ADD COLUMN payment_status TEXT CHECK (payment_status IN ('PAID', 'UNPAID', 'PARTIAL')) DEFAULT 'PAID';`);
  } catch (e) { /* Column may already exist */ }

  // Migration: Add SC/PWD discount fields to transactions (BIR requirement)
  try {
    await db.execAsync(`ALTER TABLE transactions ADD COLUMN sc_pwd_id TEXT;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE transactions ADD COLUMN sc_pwd_name TEXT;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE transactions ADD COLUMN sc_pwd_type TEXT CHECK (sc_pwd_type IN ('SENIOR', 'PWD'));`);
  } catch (e) { /* Column may already exist */ }

  // Migration: Fix payment_method CHECK constraint to include CHARGE_INVOICE
  // SQLite doesn't support modifying CHECK constraints, so we need to recreate the table
  console.log('Checking if payment_method constraint needs update...');
  try {
    // Test if CHARGE_INVOICE is allowed by trying a temporary insert
    const testResult = await db.getFirstAsync<{count: number}>(
      `SELECT COUNT(*) as count FROM transactions WHERE payment_method = 'CHARGE_INVOICE'`
    );
    // If the query succeeds, the constraint either allows it or table is empty
    // Try an actual constraint test by checking the table info
    const tableInfo = await db.getAllAsync<{sql: string}>(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'`
    );

    if (tableInfo.length > 0 && tableInfo[0].sql) {
      const createSql = tableInfo[0].sql;
      // Check if the constraint includes CHARGE_INVOICE
      if (!createSql.includes('CHARGE_INVOICE')) {
        console.log('Migrating transactions table to add CHARGE_INVOICE support...');

        // Temporarily disable foreign keys for safe migration
        await db.execAsync('PRAGMA foreign_keys = OFF;');

        try {
          // Create new table with correct constraint
          await db.execAsync(`
            CREATE TABLE IF NOT EXISTS transactions_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              transaction_number TEXT NOT NULL UNIQUE,
              invoice_number TEXT NOT NULL UNIQUE,
              customer_id INTEGER,
              customer_name TEXT,
              customer_tin TEXT,
              customer_address TEXT,
              subtotal DECIMAL(10,2) NOT NULL,
              tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
              discount_amount DECIMAL(10,2) DEFAULT 0,
              total_amount DECIMAL(10,2) NOT NULL,
              payment_method TEXT CHECK (payment_method IN ('CASH', 'CARD', 'CHECK', 'ONLINE', 'CHARGE_INVOICE')) DEFAULT 'CASH',
              amount_tendered DECIMAL(10,2) NOT NULL,
              change_amount DECIMAL(10,2) DEFAULT 0,
              payment_status TEXT CHECK (payment_status IN ('PAID', 'UNPAID', 'PARTIAL')) DEFAULT 'PAID',
              cashier_id INTEGER NOT NULL,
              status TEXT CHECK (status IN ('COMPLETED', 'VOID', 'REFUNDED')) DEFAULT 'COMPLETED',
              void_reason TEXT,
              void_by INTEGER,
              void_date DATETIME,
              sc_pwd_id TEXT,
              sc_pwd_name TEXT,
              sc_pwd_type TEXT CHECK (sc_pwd_type IN ('SENIOR', 'PWD')),
              transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (customer_id) REFERENCES customers (id),
              FOREIGN KEY (cashier_id) REFERENCES users (id),
              FOREIGN KEY (void_by) REFERENCES users (id)
            );
          `);

          // Copy data from old table - handle missing columns gracefully
          await db.execAsync(`
            INSERT INTO transactions_new
              (id, transaction_number, invoice_number, customer_id, customer_name, customer_tin,
               customer_address, subtotal, tax_amount, discount_amount, total_amount, payment_method,
               amount_tendered, change_amount, payment_status, cashier_id, status, void_reason,
               void_by, void_date, transaction_date, created_at, updated_at)
            SELECT
              id, transaction_number, invoice_number,
              COALESCE(customer_id, NULL),
              customer_name, customer_tin, customer_address,
              subtotal, tax_amount, discount_amount, total_amount, payment_method,
              amount_tendered, change_amount,
              COALESCE(payment_status, 'PAID'),
              cashier_id, status, void_reason, void_by, void_date,
              transaction_date, created_at, updated_at
            FROM transactions;
          `);

          // Drop old table
          await db.execAsync(`DROP TABLE transactions;`);

          // Rename new table
          await db.execAsync(`ALTER TABLE transactions_new RENAME TO transactions;`);

          console.log('✅ Transactions table migrated successfully with CHARGE_INVOICE support');
        } finally {
          // Always re-enable foreign keys, even if migration fails
          await db.execAsync('PRAGMA foreign_keys = ON;');
        }
      } else {
        console.log('✅ Transactions table already supports CHARGE_INVOICE');
      }
    }
  } catch (e) {
    console.warn('Migration check/update for payment_method constraint:', e);
    // If migration fails, it might be because the table is new or already correct
  }

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS transaction_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_code TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price DECIMAL(10,2) NOT NULL,
      discount_amount DECIMAL(10,2) DEFAULT 0,
      tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      total_amount DECIMAL(10,2) NOT NULL,
      price_type TEXT DEFAULT 'retail',
      item_type TEXT DEFAULT 'sale',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (transaction_id) REFERENCES transactions (id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products (id)
    );
  `);

  // Add price_type column to transaction_items for existing databases
  try {
    await db.execAsync(`ALTER TABLE transaction_items ADD COLUMN price_type TEXT DEFAULT 'retail';`);
  } catch (e) { /* Column may already exist */ }

  // Add item_type column to transaction_items for existing databases (BO/return support)
  try {
    await db.execAsync(`ALTER TABLE transaction_items ADD COLUMN item_type TEXT DEFAULT 'sale';`);
  } catch (e) { /* Column may already exist */ }

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS z_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reading_number INTEGER NOT NULL UNIQUE,
      date DATE NOT NULL,
      start_invoice_number TEXT NOT NULL,
      end_invoice_number TEXT NOT NULL,
      gross_sales DECIMAL(10,2) NOT NULL DEFAULT 0,
      vat_sales DECIMAL(10,2) NOT NULL DEFAULT 0,
      vat_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      vat_exempt_sales DECIMAL(10,2) DEFAULT 0,
      zero_rated_sales DECIMAL(10,2) DEFAULT 0,
      discount_amount DECIMAL(10,2) DEFAULT 0,
      void_amount DECIMAL(10,2) DEFAULT 0,
      refund_amount DECIMAL(10,2) DEFAULT 0,
      net_sales DECIMAL(10,2) NOT NULL DEFAULT 0,
      cumulative_grand_total DECIMAL(12,2) NOT NULL DEFAULT 0,
      reset_counter INTEGER NOT NULL DEFAULT 0,
      cashier_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cashier_id) REFERENCES users (id),
      UNIQUE (date)
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS x_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL,
      time TIME NOT NULL,
      current_invoice_number TEXT NOT NULL,
      gross_sales DECIMAL(10,2) NOT NULL DEFAULT 0,
      vat_sales DECIMAL(10,2) NOT NULL DEFAULT 0,
      vat_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      vat_exempt_sales DECIMAL(10,2) DEFAULT 0,
      zero_rated_sales DECIMAL(10,2) DEFAULT 0,
      discount_amount DECIMAL(10,2) DEFAULT 0,
      void_amount DECIMAL(10,2) DEFAULT 0,
      refund_amount DECIMAL(10,2) DEFAULT 0,
      net_sales DECIMAL(10,2) NOT NULL DEFAULT 0,
      transaction_count INTEGER DEFAULT 0,
      cashier_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cashier_id) REFERENCES users (id)
    );
  `);

  // Migration: Add cumulative_grand_total to z_readings (BIR requirement)
  try {
    await db.execAsync(`ALTER TABLE z_readings ADD COLUMN cumulative_grand_total DECIMAL(12,2) NOT NULL DEFAULT 0;`);
  } catch (e) { /* Column may already exist */ }

  // Migration: Add void_count, refund_count, exchange_amount, exchange_count to z_readings
  try {
    await db.execAsync(`ALTER TABLE z_readings ADD COLUMN void_count INTEGER DEFAULT 0;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE z_readings ADD COLUMN refund_count INTEGER DEFAULT 0;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE z_readings ADD COLUMN exchange_amount DECIMAL(10,2) DEFAULT 0;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE z_readings ADD COLUMN exchange_count INTEGER DEFAULT 0;`);
  } catch (e) { /* Column may already exist */ }

  // Migration: Fix ejournal entry_type CHECK constraint to include PAYMENT, RETURN, PURCHASE_RETURN
  console.log('Checking if ejournal entry_type constraint needs update...');
  try {
    const ejournalInfo = await db.getFirstAsync<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='ejournal'"
    );

    if (ejournalInfo && ejournalInfo.sql) {
      const createSql = ejournalInfo.sql;
      // Check if the constraint is missing PAYMENT
      if (!createSql.includes('PAYMENT')) {
        console.log('Migrating ejournal table to add PAYMENT, RETURN, PURCHASE_RETURN support...');

        // Temporarily disable foreign keys for safe migration
        await db.execAsync('PRAGMA foreign_keys = OFF;');

        try {
          // Create new table with correct constraint
          await db.execAsync(`
            CREATE TABLE IF NOT EXISTS ejournal_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              transaction_id INTEGER,
              entry_type TEXT CHECK (entry_type IN ('SALE', 'VOID', 'REFUND', 'RETURN', 'PURCHASE_RETURN', 'PAYMENT', 'Z_READING', 'X_READING', 'SYSTEM')) NOT NULL,
              reference_number TEXT NOT NULL,
              description TEXT NOT NULL,
              amount DECIMAL(10,2),
              cashier_id INTEGER NOT NULL,
              timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (transaction_id) REFERENCES transactions (id),
              FOREIGN KEY (cashier_id) REFERENCES users (id)
            );
          `);

          // Copy data from old table to new table
          await db.execAsync(`
            INSERT INTO ejournal_new (id, transaction_id, entry_type, reference_number, description, amount, cashier_id, timestamp, created_at)
            SELECT id, transaction_id, entry_type, reference_number, description, amount, cashier_id, timestamp, created_at FROM ejournal;
          `);

          // Drop old table
          await db.execAsync('DROP TABLE ejournal;');

          // Rename new table to old name
          await db.execAsync('ALTER TABLE ejournal_new RENAME TO ejournal;');

          console.log('Ejournal table migrated successfully');
        } finally {
          // Always re-enable foreign keys, even if migration fails
          await db.execAsync('PRAGMA foreign_keys = ON;');
        }
      }
    }
  } catch (e) {
    console.warn('Migration check/update for ejournal entry_type constraint:', e);
    // If migration fails, it might be because the table is new or already correct
  }

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ejournal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER,
      entry_type TEXT CHECK (entry_type IN ('SALE', 'VOID', 'REFUND', 'RETURN', 'PURCHASE_RETURN', 'PAYMENT', 'Z_READING', 'X_READING', 'SYSTEM')) NOT NULL,
      reference_number TEXT NOT NULL,
      description TEXT NOT NULL,
      amount DECIMAL(10,2),
      cashier_id INTEGER NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (transaction_id) REFERENCES transactions (id),
      FOREIGN KEY (cashier_id) REFERENCES users (id)
    );
  `);

  // Migration for sales_returns table to make original_transaction_id nullable
  try {
    const salesReturnsInfo = await db.getFirstAsync<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='sales_returns'"
    );

    if (salesReturnsInfo && salesReturnsInfo.sql) {
      const createSql = salesReturnsInfo.sql;
      // Check if original_transaction_id is NOT NULL or if STORE_CREDIT is missing
      if (createSql.includes('original_transaction_id INTEGER NOT NULL') || !createSql.includes('STORE_CREDIT')) {
        console.log('Migrating sales_returns table to make original_transaction_id nullable and add STORE_CREDIT...');

        // Temporarily disable foreign keys for safe migration
        await db.execAsync('PRAGMA foreign_keys = OFF;');

        try {
          // Create new table with correct schema
          await db.execAsync(`
            CREATE TABLE IF NOT EXISTS sales_returns_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              return_number TEXT NOT NULL UNIQUE,
              original_transaction_id INTEGER,
              original_invoice_number TEXT,
              customer_id INTEGER,
              customer_name TEXT,
              return_date DATE NOT NULL,
              total_amount DECIMAL(12,2) NOT NULL,
              refund_method TEXT CHECK (refund_method IN ('CASH', 'CREDIT', 'STORE_CREDIT', 'EXCHANGE')) DEFAULT 'CASH',
              reason TEXT NOT NULL,
              notes TEXT,
              processed_by INTEGER NOT NULL,
              status TEXT CHECK (status IN ('COMPLETED', 'CANCELLED')) DEFAULT 'COMPLETED',
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (original_transaction_id) REFERENCES transactions (id),
              FOREIGN KEY (customer_id) REFERENCES customers (id),
              FOREIGN KEY (processed_by) REFERENCES users (id)
            );
          `);

          // Copy data from old table to new table
          await db.execAsync(`
            INSERT INTO sales_returns_new (id, return_number, original_transaction_id, original_invoice_number, customer_id, customer_name, return_date, total_amount, refund_method, reason, notes, processed_by, status, created_at)
            SELECT id, return_number, original_transaction_id, original_invoice_number, customer_id, customer_name, return_date, total_amount, refund_method, reason, notes, processed_by, status, created_at FROM sales_returns;
          `);

          // Drop old table
          await db.execAsync('DROP TABLE sales_returns;');

          // Rename new table to old name
          await db.execAsync('ALTER TABLE sales_returns_new RENAME TO sales_returns;');

          console.log('sales_returns table migrated successfully');
        } finally {
          // Always re-enable foreign keys, even if migration fails
          await db.execAsync('PRAGMA foreign_keys = ON;');
        }
      }
    }
  } catch (e) {
    console.warn('Migration check/update for sales_returns table:', e);
    // If migration fails, it might be because the table is new or already correct
  }

  // Migration for accounts_receivable table to add CREDIT status
  try {
    const arInfo = await db.getFirstAsync<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='accounts_receivable'"
    );

    if (arInfo && arInfo.sql && !arInfo.sql.includes('CREDIT')) {
      console.log('Migrating accounts_receivable table to add CREDIT status...');

      await db.execAsync('PRAGMA foreign_keys = OFF;');

      try {
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS accounts_receivable_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_id INTEGER NOT NULL UNIQUE,
            customer_id INTEGER,
            customer_name TEXT,
            invoice_number TEXT NOT NULL,
            invoice_date DATE NOT NULL,
            due_date DATE NOT NULL,
            original_amount DECIMAL(12,2) NOT NULL,
            paid_amount DECIMAL(12,2) DEFAULT 0,
            balance_amount DECIMAL(12,2) NOT NULL,
            status TEXT CHECK (status IN ('OUTSTANDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CREDIT')) DEFAULT 'OUTSTANDING',
            days_outstanding INTEGER DEFAULT 0,
            aging_bucket TEXT CHECK (aging_bucket IN ('0-30', '31-60', '61-90', '90+')) DEFAULT '0-30',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (transaction_id) REFERENCES transactions (id),
            FOREIGN KEY (customer_id) REFERENCES customers (id)
          );
        `);

        await db.execAsync(`
          INSERT INTO accounts_receivable_new (id, transaction_id, customer_id, customer_name, invoice_number, invoice_date, due_date, original_amount, paid_amount, balance_amount, status, days_outstanding, aging_bucket, created_at, updated_at)
          SELECT id, transaction_id, customer_id, customer_name, invoice_number, invoice_date, due_date, original_amount, paid_amount, balance_amount, status, days_outstanding, aging_bucket, created_at, updated_at FROM accounts_receivable;
        `);

        await db.execAsync('DROP TABLE accounts_receivable;');
        await db.execAsync('ALTER TABLE accounts_receivable_new RENAME TO accounts_receivable;');

        console.log('accounts_receivable table migrated successfully');
      } finally {
        // Always re-enable foreign keys, even if migration fails
        await db.execAsync('PRAGMA foreign_keys = ON;');
      }
    }
  } catch (e) {
    console.warn('Migration check/update for accounts_receivable table:', e);
  }

  // Fix any NULL paid_amount values in accounts_receivable (critical for partial payment calculations)
  try {
    await db.runAsync(`
      UPDATE accounts_receivable
      SET paid_amount = 0
      WHERE paid_amount IS NULL
    `);
    console.log('Fixed NULL paid_amount values in accounts_receivable');
  } catch (e) {
    console.warn('Error fixing NULL paid_amount:', e);
  }

  // Create inventory_movements table if it doesn't exist
  console.log('Creating inventory_movements table if not exists...');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      product_code TEXT NOT NULL DEFAULT '',
      product_name TEXT NOT NULL DEFAULT '',
      movement_type TEXT CHECK (movement_type IN ('IN', 'OUT', 'ADJUSTMENT')) NOT NULL,
      quantity INTEGER NOT NULL,
      quantity_before INTEGER NOT NULL DEFAULT 0,
      quantity_after INTEGER NOT NULL DEFAULT 0,
      unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
      total_value DECIMAL(10,2) NOT NULL DEFAULT 0,
      reference_type TEXT CHECK (reference_type IN ('SALE', 'PURCHASE', 'MANUAL_ADJUSTMENT', 'DAMAGE', 'DAMAGE_REVERSAL', 'PHYSICAL_COUNT', 'SALES_RETURN', 'PURCHASE_RETURN', 'EXCHANGE', 'VOID', 'BEGINNING_BALANCE')) NOT NULL,
      reference_id INTEGER,
      reference_number TEXT,
      notes TEXT,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products (id),
      FOREIGN KEY (created_by) REFERENCES users (id)
    );
  `);

  // Migration: Add missing columns to inventory_movements for existing databases
  try {
    await db.execAsync(`ALTER TABLE inventory_movements ADD COLUMN product_code TEXT NOT NULL DEFAULT '';`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE inventory_movements ADD COLUMN product_name TEXT NOT NULL DEFAULT '';`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE inventory_movements ADD COLUMN quantity_before INTEGER NOT NULL DEFAULT 0;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE inventory_movements ADD COLUMN quantity_after INTEGER NOT NULL DEFAULT 0;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE inventory_movements ADD COLUMN unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE inventory_movements ADD COLUMN total_value DECIMAL(10,2) NOT NULL DEFAULT 0;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE inventory_movements ADD COLUMN reference_number TEXT;`);
  } catch (e) { /* Column may already exist */ }

  // Migration: Update CHECK constraint to include BEGINNING_BALANCE
  // SQLite doesn't support ALTER CONSTRAINT, so we need to recreate the table
  try {
    // Check if migration is needed by trying to insert a test value
    const testResult = await db.getFirstAsync<{ cnt: number }>(`
      SELECT COUNT(*) as cnt FROM sqlite_master
      WHERE type='table' AND name='inventory_movements'
      AND sql NOT LIKE '%BEGINNING_BALANCE%'
    `);

    if (testResult && testResult.cnt > 0) {
      console.log('Migrating inventory_movements table to add BEGINNING_BALANCE...');

      // Create new table with updated constraint
      await db.execAsync(`
        CREATE TABLE inventory_movements_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL,
          product_code TEXT NOT NULL DEFAULT '',
          product_name TEXT NOT NULL DEFAULT '',
          movement_type TEXT CHECK (movement_type IN ('IN', 'OUT', 'ADJUSTMENT')) NOT NULL,
          quantity INTEGER NOT NULL,
          quantity_before INTEGER NOT NULL DEFAULT 0,
          quantity_after INTEGER NOT NULL DEFAULT 0,
          unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
          total_value DECIMAL(10,2) NOT NULL DEFAULT 0,
          reference_type TEXT CHECK (reference_type IN ('SALE', 'PURCHASE', 'MANUAL_ADJUSTMENT', 'DAMAGE', 'DAMAGE_REVERSAL', 'PHYSICAL_COUNT', 'SALES_RETURN', 'PURCHASE_RETURN', 'EXCHANGE', 'VOID', 'BEGINNING_BALANCE')) NOT NULL,
          reference_id INTEGER,
          reference_number TEXT,
          notes TEXT,
          created_by INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (product_id) REFERENCES products (id),
          FOREIGN KEY (created_by) REFERENCES users (id)
        );
      `);

      // Copy data from old table
      await db.execAsync(`
        INSERT INTO inventory_movements_new
        SELECT * FROM inventory_movements;
      `);

      // Drop old table
      await db.execAsync(`DROP TABLE inventory_movements;`);

      // Rename new table
      await db.execAsync(`ALTER TABLE inventory_movements_new RENAME TO inventory_movements;`);

      // Recreate index
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_movements(product_id);`);

      console.log('inventory_movements table migrated successfully');
    }
  } catch (e) {
    console.log('inventory_movements migration check/update:', e);
  }

  console.log('inventory_movements table ready');

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT CHECK (role IN ('MANAGER', 'CASHIER')) NOT NULL,
      permission TEXT NOT NULL,
      is_enabled BOOLEAN DEFAULT 1,
      updated_by INTEGER NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (updated_by) REFERENCES users (id),
      UNIQUE (role, permission)
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS physical_count_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL UNIQUE,
      date DATE NOT NULL,
      started_by INTEGER NOT NULL,
      completed_by INTEGER,
      status TEXT CHECK (status IN ('in_progress', 'completed', 'cancelled')) DEFAULT 'in_progress',
      total_items INTEGER NOT NULL DEFAULT 0,
      counted_items INTEGER DEFAULT 0,
      discrepancy_count INTEGER DEFAULT 0,
      total_discrepancy_value DECIMAL(10,2) DEFAULT 0,
      notes TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (started_by) REFERENCES users (id),
      FOREIGN KEY (completed_by) REFERENCES users (id)
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS physical_count_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      product_id INTEGER NOT NULL,
      product_code TEXT NOT NULL,
      product_name TEXT NOT NULL,
      system_quantity INTEGER NOT NULL,
      physical_quantity INTEGER DEFAULT 0,
      discrepancy INTEGER DEFAULT 0,
      unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
      value_discrepancy DECIMAL(10,2) DEFAULT 0,
      status TEXT CHECK (status IN ('pending', 'counted', 'reviewed')) DEFAULT 'pending',
      counted_by INTEGER,
      notes TEXT,
      counted_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES physical_count_sessions (session_id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products (id),
      FOREIGN KEY (counted_by) REFERENCES users (id)
    );
  `);

  // Create suppliers table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      contact_person TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      tin TEXT,
      credit_terms INTEGER DEFAULT 30,
      credit_limit DECIMAL(12,2) DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create purchases table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_number TEXT NOT NULL UNIQUE,
      supplier_id INTEGER NOT NULL,
      purchase_date DATE NOT NULL,
      expected_delivery_date DATE,
      reference_number TEXT,
      status TEXT CHECK (status IN ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')) DEFAULT 'DRAFT',
      subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
      tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      discount_amount DECIMAL(12,2) DEFAULT 0,
      total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      paid_amount DECIMAL(12,2) DEFAULT 0,
      balance_amount DECIMAL(12,2) DEFAULT 0,
      payment_terms TEXT DEFAULT '30 days',
      notes TEXT,
      created_by INTEGER NOT NULL,
      received_by INTEGER,
      cancelled_by INTEGER,
      cancelled_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES suppliers (id),
      FOREIGN KEY (created_by) REFERENCES users (id),
      FOREIGN KEY (received_by) REFERENCES users (id),
      FOREIGN KEY (cancelled_by) REFERENCES users (id)
    );
  `);

  // Create purchase_details table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS purchase_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_code TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity_ordered INTEGER NOT NULL,
      quantity_received INTEGER DEFAULT 0,
      unit_cost DECIMAL(10,2) NOT NULL,
      discount_amount DECIMAL(10,2) DEFAULT 0,
      tax_amount DECIMAL(10,2) DEFAULT 0,
      total_amount DECIMAL(10,2) NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (purchase_id) REFERENCES purchases (id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products (id)
    );
  `);

  // Create supplier_payments table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS supplier_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_number TEXT NOT NULL UNIQUE,
      supplier_id INTEGER NOT NULL,
      purchase_id INTEGER,
      payment_date DATE NOT NULL,
      payment_method TEXT CHECK (payment_method IN ('CASH', 'CHEQUE', 'OTHERS')) DEFAULT 'CASH',
      others_type TEXT CHECK (others_type IN ('GCASH', 'MAYA', 'BANK_TRANSFER', 'PAYPAL', 'OTHER')),
      reference_number TEXT,
      cheque_number TEXT,
      bank_name TEXT,
      payee_name TEXT,
      cheque_date DATE,
      cheque_status TEXT CHECK (cheque_status IN ('PENDING', 'DEPOSITED', 'CLEARED', 'BOUNCED')) DEFAULT 'PENDING',
      deposited_date DATE,
      cleared_date DATE,
      bounced_date DATE,
      bounced_reason TEXT CHECK (bounced_reason IN ('INSUFFICIENT_FUNDS', 'ACCOUNT_CLOSED', 'SIGNATURE_MISMATCH', 'POST_DATED', 'STALE_EXPIRED', 'OTHER')),
      amount DECIMAL(12,2) NOT NULL,
      notes TEXT,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES suppliers (id),
      FOREIGN KEY (purchase_id) REFERENCES purchases (id),
      FOREIGN KEY (created_by) REFERENCES users (id)
    );
  `);

  // Migration: Add cheque columns to supplier_payments if they don't exist (for existing databases)
  try {
    await db.execAsync(`ALTER TABLE supplier_payments ADD COLUMN cheque_number TEXT;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE supplier_payments ADD COLUMN bank_name TEXT;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE supplier_payments ADD COLUMN payee_name TEXT;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE supplier_payments ADD COLUMN cheque_date DATE;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE supplier_payments ADD COLUMN cheque_status TEXT DEFAULT 'PENDING';`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE supplier_payments ADD COLUMN deposited_date DATE;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE supplier_payments ADD COLUMN cleared_date DATE;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE supplier_payments ADD COLUMN bounced_date DATE;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE supplier_payments ADD COLUMN bounced_reason TEXT;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE supplier_payments ADD COLUMN others_type TEXT;`);
  } catch (e) { /* Column may already exist */ }

  // Create accounts_payable table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS accounts_payable (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL UNIQUE,
      supplier_id INTEGER NOT NULL,
      invoice_number TEXT,
      invoice_date DATE NOT NULL,
      due_date DATE NOT NULL,
      original_amount DECIMAL(12,2) NOT NULL,
      paid_amount DECIMAL(12,2) DEFAULT 0,
      balance_amount DECIMAL(12,2) NOT NULL,
      status TEXT CHECK (status IN ('OUTSTANDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CREDIT')) DEFAULT 'OUTSTANDING',
      days_outstanding INTEGER DEFAULT 0,
      aging_bucket TEXT CHECK (aging_bucket IN ('0-30', '31-60', '61-90', '90+')) DEFAULT '0-30',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (purchase_id) REFERENCES purchases (id) ON DELETE CASCADE,
      FOREIGN KEY (supplier_id) REFERENCES suppliers (id)
    );
  `);

  // Create purchase_returns table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS purchase_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_number TEXT NOT NULL UNIQUE,
      original_purchase_id INTEGER,
      supplier_id INTEGER NOT NULL,
      supplier_name TEXT,
      return_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      refund_method TEXT DEFAULT 'CREDIT',
      reason TEXT,
      notes TEXT,
      processed_by INTEGER,
      status TEXT CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED')) DEFAULT 'PENDING',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (original_purchase_id) REFERENCES purchases (id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers (id),
      FOREIGN KEY (processed_by) REFERENCES users (id)
    );
  `);

  // Create purchase_return_items table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS purchase_return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_return_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT,
      quantity INTEGER NOT NULL DEFAULT 0,
      unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
      total_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (purchase_return_id) REFERENCES purchase_returns (id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products (id)
    );
  `);

  // Create customers table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      contact_person TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      tin TEXT,
      credit_terms INTEGER DEFAULT 30,
      credit_limit DECIMAL(12,2) DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create customer_payments table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS customer_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_number TEXT NOT NULL UNIQUE,
      customer_id INTEGER,
      transaction_id INTEGER NOT NULL,
      payment_date DATE NOT NULL,
      payment_method TEXT CHECK (payment_method IN ('CASH', 'CARD', 'CHECK', 'BANK_TRANSFER', 'ONLINE')) NOT NULL,
      amount_paid DECIMAL(12,2) NOT NULL,
      reference_number TEXT,
      notes TEXT,
      received_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers (id),
      FOREIGN KEY (transaction_id) REFERENCES transactions (id) ON DELETE CASCADE,
      FOREIGN KEY (received_by) REFERENCES users (id)
    );
  `);

  // Create accounts_receivable table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS accounts_receivable (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL UNIQUE,
      customer_id INTEGER,
      customer_name TEXT,
      invoice_number TEXT NOT NULL,
      invoice_date DATE NOT NULL,
      due_date DATE NOT NULL,
      original_amount DECIMAL(12,2) NOT NULL,
      paid_amount DECIMAL(12,2) DEFAULT 0,
      balance_amount DECIMAL(12,2) NOT NULL,
      status TEXT CHECK (status IN ('OUTSTANDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CREDIT')) DEFAULT 'OUTSTANDING',
      days_outstanding INTEGER DEFAULT 0,
      aging_bucket TEXT CHECK (aging_bucket IN ('0-30', '31-60', '61-90', '90+')) DEFAULT '0-30',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (transaction_id) REFERENCES transactions (id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers (id)
    );
  `);

  // Create damaged_items_sessions table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS damaged_items_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL UNIQUE,
      session_name TEXT NOT NULL,
      status TEXT CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')) DEFAULT 'ACTIVE',
      total_items INTEGER DEFAULT 0,
      total_value DECIMAL(12,2) DEFAULT 0,
      started_by INTEGER NOT NULL,
      completed_by INTEGER,
      cancelled_by INTEGER,
      cancelled_reason TEXT,
      notes TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (started_by) REFERENCES users (id),
      FOREIGN KEY (completed_by) REFERENCES users (id),
      FOREIGN KEY (cancelled_by) REFERENCES users (id)
    );
  `);

  // Create damaged_items_details table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS damaged_items_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      product_id INTEGER NOT NULL,
      product_code TEXT NOT NULL,
      product_name TEXT NOT NULL,
      current_stock INTEGER NOT NULL,
      damaged_quantity INTEGER NOT NULL,
      unit_cost DECIMAL(10,2) NOT NULL,
      total_value DECIMAL(10,2) NOT NULL,
      damage_reason TEXT CHECK (damage_reason IN ('EXPIRED', 'BROKEN', 'DEFECTIVE', 'SPOILED', 'LOST', 'THEFT', 'OTHER')) NOT NULL,
      damage_description TEXT,
      recorded_by INTEGER NOT NULL,
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES damaged_items_sessions (session_id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products (id),
      FOREIGN KEY (recorded_by) REFERENCES users (id)
    );
  `);

  // Create end_of_day_records table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS end_of_day_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL,
      beginning_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
      gross_sales DECIMAL(12,2) NOT NULL DEFAULT 0,
      discounts DECIMAL(12,2) DEFAULT 0,
      sales_returns DECIMAL(12,2) DEFAULT 0,
      net_sales DECIMAL(12,2) NOT NULL DEFAULT 0,
      cash_sales DECIMAL(12,2) DEFAULT 0,
      credit_sales DECIMAL(12,2) DEFAULT 0,
      gcash_sales DECIMAL(12,2) DEFAULT 0,
      card_sales DECIMAL(12,2) DEFAULT 0,
      other_sales DECIMAL(12,2) DEFAULT 0,
      void_amount DECIMAL(12,2) DEFAULT 0,
      void_count INTEGER DEFAULT 0,
      transaction_count INTEGER DEFAULT 0,
      customer_payments_received DECIMAL(12,2) DEFAULT 0,
      supplier_payments_made DECIMAL(12,2) DEFAULT 0,
      expected_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
      actual_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
      cash_variance DECIMAL(12,2) DEFAULT 0,
      denomination_breakdown TEXT,
      next_day_beginning_cash DECIMAL(12,2) DEFAULT 0,
      created_by INTEGER NOT NULL,
      status TEXT CHECK (status IN ('COMPLETED', 'CANCELLED')) DEFAULT 'COMPLETED',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users (id)
    );
  `);

  // Migration: Add exchange and refund count columns to end_of_day_records (for existing databases)
  try {
    await db.execAsync(`ALTER TABLE end_of_day_records ADD COLUMN exchange_amount DECIMAL(12,2) DEFAULT 0;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE end_of_day_records ADD COLUMN exchange_count INTEGER DEFAULT 0;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE end_of_day_records ADD COLUMN refund_count INTEGER DEFAULT 0;`);
  } catch (e) { /* Column may already exist */ }

  // Migration: Add AR payment breakdown columns to end_of_day_records
  try {
    await db.execAsync(`ALTER TABLE end_of_day_records ADD COLUMN customer_payments_cash DECIMAL(12,2) DEFAULT 0;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE end_of_day_records ADD COLUMN customer_payments_check DECIMAL(12,2) DEFAULT 0;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE end_of_day_records ADD COLUMN customer_payments_card DECIMAL(12,2) DEFAULT 0;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE end_of_day_records ADD COLUMN customer_payments_online DECIMAL(12,2) DEFAULT 0;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE end_of_day_records ADD COLUMN customer_payments_bank_transfer DECIMAL(12,2) DEFAULT 0;`);
  } catch (e) { /* Column may already exist */ }

  // Migration: Add cash movement columns to end_of_day_records
  try {
    await db.execAsync(`ALTER TABLE end_of_day_records ADD COLUMN opening_fund DECIMAL(12,2) DEFAULT 0;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE end_of_day_records ADD COLUMN cash_in DECIMAL(12,2) DEFAULT 0;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE end_of_day_records ADD COLUMN cash_out DECIMAL(12,2) DEFAULT 0;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE end_of_day_records ADD COLUMN petty_cash DECIMAL(12,2) DEFAULT 0;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE end_of_day_records ADD COLUMN cash_refunds DECIMAL(12,2) DEFAULT 0;`);
  } catch (e) { /* Column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE end_of_day_records ADD COLUMN cash_fund DECIMAL(12,2) DEFAULT 0;`);
  } catch (e) { /* Column may already exist */ }
  // Migration: Add check_sales column to end_of_day_records
  try {
    await db.execAsync(`ALTER TABLE end_of_day_records ADD COLUMN check_sales DECIMAL(12,2) DEFAULT 0;`);
  } catch (e) { /* Column may already exist */ }

  // Create shifts table for tracking cashier shifts
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME,
      beginning_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
      ending_cash DECIMAL(12,2),
      status TEXT CHECK (status IN ('OPEN', 'CLOSED')) DEFAULT 'OPEN',
      z_reading_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (z_reading_id) REFERENCES end_of_day_records (id)
    );
  `);

  // Create sales_returns table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sales_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_number TEXT NOT NULL UNIQUE,
      original_transaction_id INTEGER,
      original_invoice_number TEXT,
      customer_id INTEGER,
      customer_name TEXT,
      return_date DATE NOT NULL,
      total_amount DECIMAL(12,2) NOT NULL,
      refund_method TEXT CHECK (refund_method IN ('CASH', 'CREDIT', 'STORE_CREDIT', 'EXCHANGE')) DEFAULT 'CASH',
      reason TEXT NOT NULL,
      notes TEXT,
      processed_by INTEGER NOT NULL,
      status TEXT CHECK (status IN ('COMPLETED', 'CANCELLED')) DEFAULT 'COMPLETED',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (original_transaction_id) REFERENCES transactions (id),
      FOREIGN KEY (customer_id) REFERENCES customers (id),
      FOREIGN KEY (processed_by) REFERENCES users (id)
    );
  `);

  // Create sales_return_items table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sales_return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sales_return_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_code TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price DECIMAL(10,2) NOT NULL,
      total_amount DECIMAL(10,2) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sales_return_id) REFERENCES sales_returns (id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products (id)
    );
  `);

  // Create cash_movements table for cash drawer management
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS cash_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      movement_type TEXT CHECK (movement_type IN ('OPENING_FUND', 'CASH_IN', 'CASH_OUT', 'PETTY_CASH', 'CASH_REFUND')) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      description TEXT NOT NULL,
      reference_number TEXT,
      approved_by TEXT,
      cashier_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cashier_id) REFERENCES users (id)
    );
  `);

  // Create customer_audit table for tracking customer changes
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS customer_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      action TEXT CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')) NOT NULL,
      field_name TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      changed_by INTEGER NOT NULL,
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers (id),
      FOREIGN KEY (changed_by) REFERENCES users (id)
    );
  `);

  // Create device_binding table for app protection/licensing
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS device_binding (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL UNIQUE,
      license_key TEXT NOT NULL DEFAULT '',
      device_name TEXT NOT NULL,
      device_brand TEXT NOT NULL,
      device_model TEXT NOT NULL,
      os_name TEXT NOT NULL,
      os_version TEXT NOT NULL,
      app_version TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      activated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_verified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      license_type TEXT DEFAULT 'trial' CHECK (license_type IN ('trial', 'full')),
      trial_start_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      trial_days INTEGER DEFAULT 30
    );
  `);

  // Migration: Add trial fields if they don't exist (for existing databases)
  try {
    await db.execAsync(`ALTER TABLE device_binding ADD COLUMN license_type TEXT DEFAULT 'trial' CHECK (license_type IN ('trial', 'full'));`);
  } catch (e) { /* Column already exists */ }
  try {
    await db.execAsync(`ALTER TABLE device_binding ADD COLUMN trial_start_date DATETIME DEFAULT CURRENT_TIMESTAMP;`);
  } catch (e) { /* Column already exists */ }
  try {
    await db.execAsync(`ALTER TABLE device_binding ADD COLUMN trial_days INTEGER DEFAULT 30;`);
  } catch (e) { /* Column already exists */ }

  // Create reset_operations_log table for tracking reset attempts
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS reset_operations_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      full_name TEXT NOT NULL,
      operation_type TEXT CHECK (operation_type IN ('TRANSACTIONAL_DATA_RESET', 'DATABASE_RESTORE', 'MASTER_DATA_RESET')) NOT NULL,
      status TEXT CHECK (status IN ('ATTEMPTED', 'SUCCESS', 'FAILED', 'DENIED', 'CANCELLED')) NOT NULL,
      records_deleted INTEGER DEFAULT 0,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    );
  `);

  // Create indexes
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (transaction_date);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_transactions_invoice ON transactions (invoice_number);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions (customer_id);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction ON transaction_items (transaction_id);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_ejournal_timestamp ON ejournal (timestamp);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_products_code ON products (code);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_movements (product_id);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_role_permissions ON role_permissions (role, permission);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_physical_count_sessions_date ON physical_count_sessions (date);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_physical_count_sessions_user ON physical_count_sessions (started_by);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_physical_count_details_session ON physical_count_details (session_id);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_physical_count_details_user ON physical_count_details (counted_by);');

  // Purchase management indexes
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_suppliers_code ON suppliers (code);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers (name);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases (supplier_id);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases (purchase_date);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases (status);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_purchases_number ON purchases (purchase_number);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_purchase_details_purchase ON purchase_details (purchase_id);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_purchase_details_product ON purchase_details (product_id);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments (supplier_id);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_supplier_payments_purchase ON supplier_payments (purchase_id);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_supplier_payments_date ON supplier_payments (payment_date);');
  try {
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_supplier_payments_cheque_status ON supplier_payments (cheque_status);');
  } catch (e) { /* Column may not exist in old databases */ }
  try {
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_supplier_payments_cheque_date ON supplier_payments (cheque_date);');
  } catch (e) { /* Column may not exist in old databases */ }
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_supplier_payments_method ON supplier_payments (payment_method);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_accounts_payable_supplier ON accounts_payable (supplier_id);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_accounts_payable_status ON accounts_payable (status);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_accounts_payable_due_date ON accounts_payable (due_date);');

  // Customer indexes
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_customers_code ON customers (code);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_customers_name ON customers (name);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_customers_active ON customers (is_active);');

  // Customer payment indexes
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payments (customer_id);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_customer_payments_transaction ON customer_payments (transaction_id);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_customer_payments_date ON customer_payments (payment_date);');

  // Accounts receivable indexes
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_accounts_receivable_customer ON accounts_receivable (customer_id);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_accounts_receivable_status ON accounts_receivable (status);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_accounts_receivable_due_date ON accounts_receivable (due_date);');

  // Damaged items indexes
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_damaged_items_sessions_status ON damaged_items_sessions (status);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_damaged_items_sessions_started ON damaged_items_sessions (started_at);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_damaged_items_sessions_user ON damaged_items_sessions (started_by);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_damaged_items_details_session ON damaged_items_details (session_id);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_damaged_items_details_product ON damaged_items_details (product_id);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_damaged_items_details_reason ON damaged_items_details (damage_reason);');

  // End of day indexes
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_end_of_day_records_date ON end_of_day_records (date);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_end_of_day_records_created_by ON end_of_day_records (created_by);');

  // Sales returns indexes
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_sales_returns_date ON sales_returns (return_date);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_sales_returns_transaction ON sales_returns (original_transaction_id);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_sales_return_items_return ON sales_return_items (sales_return_id);');

  // Cash movements indexes
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_cash_movements_type ON cash_movements (movement_type);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_cash_movements_cashier ON cash_movements (cashier_id);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_cash_movements_date ON cash_movements (created_at);');

  // Customer audit indexes
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_customer_audit_customer ON customer_audit (customer_id);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_customer_audit_changed_by ON customer_audit (changed_by);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_customer_audit_date ON customer_audit (changed_at);');

  // Device binding indexes
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_device_binding_device_id ON device_binding (device_id);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_device_binding_license_key ON device_binding (license_key);');

  // Reset operations log indexes
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_reset_operations_log_user ON reset_operations_log (user_id);');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_reset_operations_log_date ON reset_operations_log (created_at);');

  // Insert default settings
  await db.execAsync(`
    INSERT OR IGNORE INTO settings (key, value, description) VALUES
      ('company_name', 'Your Company Name', 'Company name for receipts'),
      ('company_address', 'Your Company Address', 'Company address for receipts'),
      ('company_tin', '000-000-000-000', 'Company TIN for BIR compliance'),
      ('bir_permit', 'FP-000000000-000', 'BIR Permit Number'),
      ('pos_serial', 'POS000000', 'POS Machine Serial Number'),
      ('accreditation_number', 'ACC000000', 'BIR Accreditation Number'),
      ('vat_rate', '12.00', 'VAT rate percentage'),
      ('receipt_footer', 'Thank you for your Purchase!', 'Receipt footer message'),
      ('z_counter', '0', 'Z-Reading counter (cumulative)'),
      ('current_invoice_series', 'INV', 'Current invoice series prefix'),
      ('current_invoice_number', '1', 'Current invoice number');
  `);

  // Insert BIR compliance settings (Phase 1 - Critical for legal operation)
  await db.execAsync(`
    INSERT OR IGNORE INTO settings (key, value, description) VALUES
      ('min_number', '', 'Machine Identification Number (MIN) - BIR assigned'),
      ('ptu_number', '', 'Permit to Use (PTU) Number'),
      ('ptu_date', '', 'Permit to Use Issue Date'),
      ('atp_number', '', 'Authority to Print (ATP) Number'),
      ('atp_date', '', 'Authority to Print Issue Date'),
      ('accreditation_date', '', 'BIR Accreditation Date'),
      ('serial_number_from', '00000001', 'Invoice Serial Number Range Start'),
      ('serial_number_to', '99999999', 'Invoice Serial Number Range End'),
      ('supplier_name', 'IgoroTech Solutions', 'POS Software Supplier/Developer Name'),
      ('supplier_address', 'Baguio City, Philippines', 'POS Software Supplier Address'),
      ('supplier_tin', '000-000-000-000', 'POS Software Supplier TIN'),
      ('supplier_accreditation', '', 'POS Software Supplier Accreditation Number'),
      ('cumulative_grand_total', '0', 'Cumulative Grand Total for Z-Readings');
  `);

  // Insert default categories
  await db.execAsync(`
    INSERT OR IGNORE INTO categories (name, description) VALUES
      ('Beverages', 'Drinks, juices, sodas, and other beverages'),
      ('Food', 'Snacks, canned goods, and prepared foods'),
      ('Personal Care', 'Hygiene products, toiletries, and cosmetics'),
      ('Household', 'Cleaning supplies and household items'),
      ('Electronics', 'Electronic devices and accessories'),
      ('General Merchandise', 'Other general products');
  `);

  // Insert default brands
  await db.execAsync(`
    INSERT OR IGNORE INTO brands (name, description) VALUES
      ('Generic', 'Unbranded or generic products'),
      ('Coca-Cola', 'Coca-Cola Company products'),
      ('Pepsi', 'PepsiCo products'),
      ('Nestle', 'Nestle products'),
      ('Unilever', 'Unilever products'),
      ('P&G', 'Procter & Gamble products'),
      ('San Miguel', 'San Miguel Corporation products'),
      ('Universal Robina', 'URC products'),
      ('Monde Nissin', 'Monde Nissin products'),
      ('Other', 'Other brands');
  `);

  // Insert default units of measure
  await db.execAsync(`
    INSERT OR IGNORE INTO units (name, abbreviation, description) VALUES
      ('Piece', 'pc', 'Individual piece or item'),
      ('Pack', 'pk', 'Package or pack'),
      ('Box', 'bx', 'Box or carton'),
      ('Kilogram', 'kg', 'Weight in kilograms'),
      ('Gram', 'g', 'Weight in grams'),
      ('Liter', 'L', 'Volume in liters'),
      ('Milliliter', 'mL', 'Volume in milliliters'),
      ('Dozen', 'dz', '12 pieces'),
      ('Ream', 'rm', '500 sheets of paper'),
      ('Case', 'cs', 'Case or crate'),
      ('Bottle', 'btl', 'Bottle'),
      ('Can', 'can', 'Can or tin'),
      ('Sachet', 'sac', 'Small packet or sachet'),
      ('Bag', 'bag', 'Bag or pouch');
  `);

  // Insert default sizes
  await db.execAsync(`
    INSERT OR IGNORE INTO sizes (name, description, sort_order) VALUES
      ('N/A', 'Not applicable', 0),
      ('Extra Small', 'XS size', 1),
      ('Small', 'S size', 2),
      ('Medium', 'M size', 3),
      ('Large', 'L size', 4),
      ('Extra Large', 'XL size', 5),
      ('XXL', '2XL size', 6),
      ('250ml', '250 milliliters', 10),
      ('330ml', '330 milliliters', 11),
      ('500ml', '500 milliliters or half liter', 12),
      ('1L', '1 liter', 13),
      ('1.5L', '1.5 liters', 14),
      ('2L', '2 liters', 15),
      ('100g', '100 grams', 20),
      ('250g', '250 grams', 21),
      ('500g', '500 grams or half kilo', 22),
      ('1kg', '1 kilogram', 23);
  `);

  // Insert default users with proper password hashes
  // Admin: 1122, Manager: 1111, Cashier: 1234
  await db.execAsync(`
    INSERT OR IGNORE INTO users (username, full_name, role, password_hash) VALUES
      ('admin', 'System Administrator', 'ADMIN', '$simple$AdminSalt1234567$6d4a5ab4'),
      ('manager', 'Store Manager', 'MANAGER', '$simple$ManagerSalt12345$5d2db5b7'),
      ('cashier', 'Cashier User', 'CASHIER', '$simple$CashierSalt12345$26740ee1');
  `);

  // Migration: Update existing users with legacy/demo hashes to proper password hashes
  // Admin: 1122, Manager: 1111, Cashier: 1234
  // Updates any user that doesn't already have the proper $simple$ hash format
  await db.execAsync(`
    UPDATE users SET password_hash = '$simple$AdminSalt1234567$6d4a5ab4'
    WHERE username = 'admin' AND password_hash NOT LIKE '$simple$%';
  `);
  await db.execAsync(`
    UPDATE users SET password_hash = '$simple$ManagerSalt12345$5d2db5b7'
    WHERE username = 'manager' AND password_hash NOT LIKE '$simple$%';
  `);
  await db.execAsync(`
    UPDATE users SET password_hash = '$simple$CashierSalt12345$26740ee1'
    WHERE username = 'cashier' AND password_hash NOT LIKE '$simple$%';
  `);

  // Insert default role permissions for MANAGER
  // Manager has most permissions except MANAGE_USERS, MANAGE_SETTINGS, MANAGE_PERMISSIONS
  // ACCESS_ADMIN_TOOLS is disabled by default but Admin can enable it
  const managerPermissions = [
    { permission: 'VIEW_DASHBOARD', enabled: 1 },
    { permission: 'CREATE_SALE', enabled: 1 },
    { permission: 'VIEW_ALL_SALES', enabled: 1 },
    { permission: 'VIEW_OWN_SALES', enabled: 1 },
    { permission: 'VOID_SALE', enabled: 1 },
    { permission: 'REFUND_SALE', enabled: 1 },
    { permission: 'MANAGE_PRODUCTS', enabled: 1 },
    { permission: 'VIEW_PRODUCTS', enabled: 1 },
    { permission: 'ADD_PRODUCT', enabled: 1 },
    { permission: 'EDIT_PRODUCT', enabled: 1 },
    { permission: 'DELETE_PRODUCT', enabled: 1 },
    { permission: 'VIEW_PRODUCT_COST', enabled: 1 },
    { permission: 'MANAGE_INVENTORY', enabled: 1 },
    { permission: 'VIEW_REPORTS', enabled: 1 },
    { permission: 'VIEW_SETTINGS', enabled: 1 },
    { permission: 'PERFORM_Z_READING', enabled: 1 },
    { permission: 'PERFORM_X_READING', enabled: 1 },
    { permission: 'VIEW_EJOURNAL', enabled: 1 },
    { permission: 'MANAGE_PURCHASES', enabled: 1 },
    { permission: 'MANAGE_SUPPLIERS', enabled: 1 },
    { permission: 'CREATE_PURCHASE_ORDER', enabled: 1 },
    { permission: 'RECEIVE_PURCHASE', enabled: 1 },
    { permission: 'MANAGE_SUPPLIER_PAYMENTS', enabled: 1 },
    { permission: 'PAY_PAYABLES', enabled: 1 },
    { permission: 'VIEW_ACCOUNTS_PAYABLE', enabled: 1 },
    { permission: 'PROCESS_PAYMENTS', enabled: 1 },
    { permission: 'MANAGE_DAMAGED_ITEMS', enabled: 1 },
    { permission: 'CREATE_DAMAGE_SESSION', enabled: 1 },
    { permission: 'VIEW_DAMAGE_REPORTS', enabled: 1 },
    { permission: 'MANAGE_CUSTOMERS', enabled: 1 },
    { permission: 'ADD_CUSTOMER', enabled: 1 },
    { permission: 'EDIT_CUSTOMER', enabled: 1 },
    { permission: 'DELETE_CUSTOMER', enabled: 1 },
    { permission: 'COLLECT_CUSTOMER_PAYMENTS', enabled: 1 },
    { permission: 'VIEW_ACCOUNTS_RECEIVABLE', enabled: 1 },
    { permission: 'CREATE_CHARGE_INVOICE', enabled: 1 },
    { permission: 'ACCESS_ADMIN_TOOLS', enabled: 0 },    // Disabled by default, Admin can enable
    { permission: 'MANAGE_PERMISSIONS', enabled: 0 },   // Admin only - cannot be enabled for Manager
  ];

  // Use parameterized queries to prevent SQL injection
  for (const { permission, enabled } of managerPermissions) {
    await db.runAsync(
      `INSERT OR IGNORE INTO role_permissions (role, permission, is_enabled, updated_by)
       VALUES (?, ?, ?, ?)`,
      ['MANAGER', permission, enabled, 1]
    );
  }

  // Insert default role permissions for CASHIER
  // Cashier can: sell, accept deliveries, add customers (no edit), collect receivables, pay payables
  // Cashier cannot: delete records, void/refund, see cost, edit products/customers
  const cashierPermissions = [
    { permission: 'VIEW_DASHBOARD', enabled: 1 },
    { permission: 'CREATE_SALE', enabled: 1 },
    { permission: 'VIEW_ALL_SALES', enabled: 0 },
    { permission: 'VIEW_OWN_SALES', enabled: 1 },
    { permission: 'VOID_SALE', enabled: 0 },
    { permission: 'REFUND_SALE', enabled: 0 },
    { permission: 'MANAGE_PRODUCTS', enabled: 0 },
    { permission: 'VIEW_PRODUCTS', enabled: 1 },
    { permission: 'ADD_PRODUCT', enabled: 1 },         // Can add products
    { permission: 'EDIT_PRODUCT', enabled: 0 },        // Cannot edit products
    { permission: 'DELETE_PRODUCT', enabled: 0 },      // Cannot delete products
    { permission: 'VIEW_PRODUCT_COST', enabled: 0 },   // Cannot see cost prices
    { permission: 'MANAGE_INVENTORY', enabled: 0 },
    { permission: 'VIEW_REPORTS', enabled: 0 },
    { permission: 'VIEW_SETTINGS', enabled: 0 },
    { permission: 'PERFORM_Z_READING', enabled: 0 },
    { permission: 'PERFORM_X_READING', enabled: 0 },
    { permission: 'VIEW_EJOURNAL', enabled: 0 },
    { permission: 'MANAGE_PURCHASES', enabled: 0 },
    { permission: 'MANAGE_SUPPLIERS', enabled: 0 },
    { permission: 'CREATE_PURCHASE_ORDER', enabled: 0 },
    { permission: 'RECEIVE_PURCHASE', enabled: 1 },    // Can accept deliveries
    { permission: 'MANAGE_SUPPLIER_PAYMENTS', enabled: 0 },
    { permission: 'PAY_PAYABLES', enabled: 1 },        // Can pay suppliers
    { permission: 'VIEW_ACCOUNTS_PAYABLE', enabled: 0 },
    { permission: 'PROCESS_PAYMENTS', enabled: 0 },
    { permission: 'MANAGE_DAMAGED_ITEMS', enabled: 0 },
    { permission: 'CREATE_DAMAGE_SESSION', enabled: 0 },
    { permission: 'VIEW_DAMAGE_REPORTS', enabled: 0 },
    { permission: 'MANAGE_CUSTOMERS', enabled: 0 },
    { permission: 'ADD_CUSTOMER', enabled: 1 },        // Can add customers
    { permission: 'EDIT_CUSTOMER', enabled: 0 },       // Cannot edit customers
    { permission: 'DELETE_CUSTOMER', enabled: 0 },     // Cannot delete customers
    { permission: 'COLLECT_CUSTOMER_PAYMENTS', enabled: 1 },
    { permission: 'VIEW_ACCOUNTS_RECEIVABLE', enabled: 0 },
    { permission: 'CREATE_CHARGE_INVOICE', enabled: 1 },
    { permission: 'DELETE_RECORDS', enabled: 0 },       // Cannot delete any records
    { permission: 'ACCESS_ADMIN_TOOLS', enabled: 0 },   // No admin tools access
    { permission: 'MANAGE_PERMISSIONS', enabled: 0 }    // No permission management
  ];

  // Use parameterized queries to prevent SQL injection
  for (const { permission, enabled } of cashierPermissions) {
    await db.runAsync(
      `INSERT OR IGNORE INTO role_permissions (role, permission, is_enabled, updated_by)
       VALUES (?, ?, ?, ?)`,
      ['CASHIER', permission, enabled, 1]
    );
  }

  // Insert sample suppliers
  await db.execAsync(`
    INSERT OR IGNORE INTO suppliers (code, name, contact_person, phone, email, address, credit_terms, credit_limit, notes) VALUES
      ('SUP001', 'Metro Food Distributors', 'Juan dela Cruz', '+63-917-1234567', 'juan@metrofood.ph', '123 Edsa Ave., Makati City', 30, 100000.00, 'Main food supplier for beverages and snacks'),
      ('SUP002', 'Fresh Goods Trading', 'Maria Santos', '+63-928-7654321', 'maria@freshgoods.com', '456 Commonwealth Ave., Quezon City', 15, 50000.00, 'Supplier for fresh products and dairy'),
      ('SUP003', 'Global Supplies Inc.', 'Roberto Lim', '+63-939-1111222', 'rob@globalsupplies.com.ph', '789 Ortigas Ave., Pasig City', 45, 200000.00, 'Office supplies and equipment provider'),
      ('SUP004', 'PharmaCare Distributors', 'Dr. Grace Tan', '+63-916-3333444', 'grace@pharmacare.ph', '321 Taft Ave., Manila', 30, 75000.00, 'Pharmaceutical and health products'),
      ('SUP005', 'Local Farm Produce', 'Pedro Farmer', '+63-927-5555666', 'pedro@localfarm.ph', 'Km 15 South Superhighway, Laguna', 7, 25000.00, 'Fresh local vegetables and fruits');
  `);

  // Insert purchase-related settings
  await db.execAsync(`
    INSERT OR IGNORE INTO settings (key, value, description) VALUES
      ('current_purchase_series', 'PO', 'Current purchase order series prefix'),
      ('current_purchase_number', '1', 'Current purchase order number'),
      ('current_payment_series', 'PAY', 'Current payment series prefix'),
      ('current_payment_number', '1', 'Current payment number'),
      ('default_payment_terms', '30 days', 'Default payment terms for new purchases');
  `);

  // Insert damaged items settings
  await db.execAsync(`
    INSERT OR IGNORE INTO settings (key, value, description) VALUES
      ('current_damage_series', 'DMG', 'Current damage session series prefix'),
      ('current_damage_number', '1', 'Current damage session number');
  `);

  // Insert customer-related settings
  await db.execAsync(`
    INSERT OR IGNORE INTO settings (key, value, description) VALUES
      ('current_customer_series', 'CUS', 'Current customer code series prefix'),
      ('current_customer_number', '1', 'Current customer number'),
      ('current_customer_payment_series', 'CPAY', 'Current customer payment series prefix'),
      ('current_customer_payment_number', '1', 'Current customer payment number'),
      ('default_customer_credit_terms', '30', 'Default credit terms for customers in days');
  `);

  // Migration: Add extended columns to x_readings for complete X-Reading snapshots
  const xReadingColumns = [
    'cash_sales DECIMAL(10,2) DEFAULT 0',
    'card_sales DECIMAL(10,2) DEFAULT 0',
    'check_sales DECIMAL(10,2) DEFAULT 0',
    'credit_sales DECIMAL(10,2) DEFAULT 0',
    'online_sales DECIMAL(10,2) DEFAULT 0',
    'void_count INTEGER DEFAULT 0',
    'exchange_count INTEGER DEFAULT 0',
    'exchange_amount DECIMAL(10,2) DEFAULT 0',
    'refund_count INTEGER DEFAULT 0',
    'beginning_cash DECIMAL(10,2) DEFAULT 0',
    'opening_fund DECIMAL(10,2) DEFAULT 0',
    'cash_in DECIMAL(10,2) DEFAULT 0',
    'cash_out DECIMAL(10,2) DEFAULT 0',
    'cash_fund DECIMAL(10,2) DEFAULT 0',
    'petty_cash DECIMAL(10,2) DEFAULT 0',
    'cash_refunds DECIMAL(10,2) DEFAULT 0',
    'customer_payments_cash DECIMAL(10,2) DEFAULT 0',
    'customer_payments_check DECIMAL(10,2) DEFAULT 0',
    'customer_payments_card DECIMAL(10,2) DEFAULT 0',
    'customer_payments_online DECIMAL(10,2) DEFAULT 0',
    'customer_payments_bank_transfer DECIMAL(10,2) DEFAULT 0',
    'customer_payments_total DECIMAL(10,2) DEFAULT 0',
    'expected_cash DECIMAL(10,2) DEFAULT 0',
  ];
  for (const col of xReadingColumns) {
    try {
      await db.execAsync(`ALTER TABLE x_readings ADD COLUMN ${col};`);
    } catch (e) { /* Column may already exist */ }
  }
};

export const getNextInvoiceNumber = async (db: SQLite.SQLiteDatabase): Promise<string> => {
  const result = await db.getFirstAsync<{value: string, series: string}>(
    `SELECT
       (SELECT value FROM settings WHERE key = 'current_invoice_number') as value,
       (SELECT value FROM settings WHERE key = 'current_invoice_series') as series`
  );

  if (!result) {
    throw new Error('Invoice settings not found');
  }

  // Get the max existing invoice number to prevent duplicates
  const maxExisting = await db.getFirstAsync<{max_num: string}>(
    `SELECT MAX(CAST(SUBSTR(invoice_number, LENGTH(?) + 1) AS INTEGER)) as max_num
     FROM transactions
     WHERE invoice_number LIKE ? || '%'`,
    [result.series, result.series]
  );

  const counterValue = parseInt(result.value) || 0;
  const maxExistingValue = maxExisting?.max_num ? parseInt(maxExisting.max_num) : 0;

  // Use the higher of counter or max existing to prevent duplicates
  const nextValue = Math.max(counterValue, maxExistingValue) + 1;
  const nextNumber = nextValue.toString().padStart(8, '0');
  return `${result.series}${nextNumber}`;
};

export const updateInvoiceNumber = async (db: SQLite.SQLiteDatabase, invoiceNumber: string) => {
  const numericPart = invoiceNumber.replace(/^\D+/, '');
  await db.runAsync(
    'UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
    [numericPart, 'current_invoice_number']
  );
};

export const getNextPurchaseNumber = async (db: SQLite.SQLiteDatabase): Promise<string> => {
  const result = await db.getFirstAsync<{value: string, series: string}>(
    `SELECT
       (SELECT value FROM settings WHERE key = 'current_purchase_number') as value,
       (SELECT value FROM settings WHERE key = 'current_purchase_series') as series`
  );

  if (!result) {
    throw new Error('Purchase settings not found');
  }

  const nextNumber = (parseInt(result.value) + 1).toString().padStart(6, '0');
  return `${result.series}${nextNumber}`;
};

export const updatePurchaseNumber = async (db: SQLite.SQLiteDatabase, purchaseNumber: string) => {
  const numericPart = purchaseNumber.replace(/^\D+/, '');
  await db.runAsync(
    'UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
    [numericPart, 'current_purchase_number']
  );
};

export const getNextPaymentNumber = async (db: SQLite.SQLiteDatabase): Promise<string> => {
  const result = await db.getFirstAsync<{value: string, series: string}>(
    `SELECT
       (SELECT value FROM settings WHERE key = 'current_payment_number') as value,
       (SELECT value FROM settings WHERE key = 'current_payment_series') as series`
  );

  if (!result) {
    throw new Error('Payment settings not found');
  }

  const nextNumber = (parseInt(result.value) + 1).toString().padStart(6, '0');
  return `${result.series}${nextNumber}`;
};

export const updatePaymentNumber = async (db: SQLite.SQLiteDatabase, paymentNumber: string) => {
  const numericPart = paymentNumber.replace(/^\D+/, '');
  await db.runAsync(
    'UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
    [numericPart, 'current_payment_number']
  );
};

export const getNextDamageSessionId = async (db: SQLite.SQLiteDatabase): Promise<string> => {
  const result = await db.getFirstAsync<{value: string, series: string}>(
    `SELECT
       (SELECT value FROM settings WHERE key = 'current_damage_number') as value,
       (SELECT value FROM settings WHERE key = 'current_damage_series') as series`
  );

  if (!result) {
    throw new Error('Damage session settings not found');
  }

  const nextNumber = (parseInt(result.value) + 1).toString().padStart(3, '0');
  const year = new Date().getFullYear();
  return `${result.series}-${year}-${nextNumber}`;
};

export const updateDamageSessionNumber = async (db: SQLite.SQLiteDatabase, sessionId: string) => {
  const numericPart = sessionId.split('-').pop() || '1';
  await db.runAsync(
    'UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
    [numericPart, 'current_damage_number']
  );
};

export const getNextCustomerCode = async (db: SQLite.SQLiteDatabase): Promise<string> => {
  const result = await db.getFirstAsync<{value: string | null, series: string | null}>(
    `SELECT
       (SELECT value FROM settings WHERE key = 'current_customer_number') as value,
       (SELECT value FROM settings WHERE key = 'current_customer_series') as series`
  );

  if (!result || result.value === null || result.series === null) {
    // Settings don't exist, create them with defaults
    await db.execAsync(`
      INSERT OR IGNORE INTO settings (key, value, description) VALUES
        ('current_customer_series', 'CUS', 'Current customer code series prefix'),
        ('current_customer_number', '0', 'Current customer number');
    `);
    // Return first customer code
    return 'CUS001';
  }

  const nextNumber = (parseInt(result.value) + 1).toString().padStart(3, '0');
  return `${result.series}${nextNumber}`;
};

export const updateCustomerNumber = async (db: SQLite.SQLiteDatabase, customerCode: string) => {
  const numericPart = customerCode.replace(/^\D+/, '');
  await db.runAsync(
    'UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
    [numericPart, 'current_customer_number']
  );
};

export const getNextCustomerPaymentNumber = async (db: SQLite.SQLiteDatabase): Promise<string> => {
  const result = await db.getFirstAsync<{value: string, series: string}>(
    `SELECT
       (SELECT value FROM settings WHERE key = 'current_customer_payment_number') as value,
       (SELECT value FROM settings WHERE key = 'current_customer_payment_series') as series`
  );

  if (!result) {
    throw new Error('Customer payment settings not found');
  }

  const nextNumber = (parseInt(result.value) + 1).toString().padStart(6, '0');
  return `${result.series}${nextNumber}`;
};

export const updateCustomerPaymentNumber = async (db: SQLite.SQLiteDatabase, paymentNumber: string) => {
  const numericPart = paymentNumber.replace(/^\D+/, '');
  await db.runAsync(
    'UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
    [numericPart, 'current_customer_payment_number']
  );
};