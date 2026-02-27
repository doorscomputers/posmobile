/**
 * ESC/POS Command Utilities for Thermal Printers
 *
 * Supports common 58mm (32 chars) and 80mm (48 chars) thermal printers.
 * These commands follow the ESC/POS standard used by most POS printers.
 */

import { formatPrinterTime, formatPrinterDateNumeric, formatPrinterDateTime } from './dateTime';

// Printer width constants
export const PRINTER_WIDTH = {
  MM_58: 32,  // 58mm printer - 32 characters per line
  MM_80: 48,  // 80mm printer - 48 characters per line
};

// ESC/POS Command Constants
export const ESC = 0x1B;  // Escape
export const GS = 0x1D;   // Group Separator
export const LF = 0x0A;   // Line Feed
export const CR = 0x0D;   // Carriage Return
export const HT = 0x09;   // Horizontal Tab
export const FF = 0x0C;   // Form Feed

// Command builders
export const COMMANDS = {
  // Initialize printer
  INIT: [ESC, 0x40],

  // Text alignment
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_RIGHT: [ESC, 0x61, 0x02],

  // Text style
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  UNDERLINE_ON: [ESC, 0x2D, 0x01],
  UNDERLINE_OFF: [ESC, 0x2D, 0x00],
  DOUBLE_HEIGHT_ON: [GS, 0x21, 0x11],
  DOUBLE_WIDTH_ON: [GS, 0x21, 0x10],
  DOUBLE_SIZE_ON: [GS, 0x21, 0x11],
  NORMAL_SIZE: [GS, 0x21, 0x00],

  // Font size (alternative method)
  FONT_A: [ESC, 0x4D, 0x00],  // Standard font
  FONT_B: [ESC, 0x4D, 0x01],  // Smaller font

  // Line spacing
  LINE_SPACING_DEFAULT: [ESC, 0x32],
  LINE_SPACING: (n: number) => [ESC, 0x33, n],  // n/180 inch

  // Paper feed and cut
  FEED_LINE: [LF],
  FEED_LINES: (n: number) => [ESC, 0x64, n],
  CUT_PAPER: [GS, 0x56, 0x00],      // Full cut
  CUT_PAPER_PARTIAL: [GS, 0x56, 0x01],  // Partial cut

  // Cash drawer
  OPEN_CASH_DRAWER: [ESC, 0x70, 0x00, 0x19, 0xFA],

  // Barcode printing
  BARCODE_HEIGHT: (n: number) => [GS, 0x68, n],
  BARCODE_WIDTH: (n: number) => [GS, 0x77, n],
  BARCODE_TEXT_BELOW: [GS, 0x48, 0x02],
  BARCODE_TEXT_NONE: [GS, 0x48, 0x00],
};

// Barcode types
export const BARCODE_TYPE = {
  UPC_A: 0x00,
  UPC_E: 0x01,
  EAN13: 0x02,
  EAN8: 0x03,
  CODE39: 0x04,
  ITF: 0x05,
  CODABAR: 0x06,
  CODE93: 0x43,
  CODE128: 0x49,
};

/**
 * ESC/POS Printer Command Builder
 */
export class ESCPOSBuilder {
  private buffer: number[] = [];
  private printerWidth: number;

  constructor(printerWidth: number = PRINTER_WIDTH.MM_58) {
    this.printerWidth = printerWidth;
    this.initialize();
  }

  /**
   * Initialize the printer
   */
  initialize(): this {
    this.buffer.push(...COMMANDS.INIT);
    return this;
  }

  /**
   * Add raw bytes to buffer
   */
  raw(bytes: number[]): this {
    this.buffer.push(...bytes);
    return this;
  }

  /**
   * Add text to the buffer
   */
  text(content: string): this {
    const encoder = new TextEncoder();
    const bytes = Array.from(encoder.encode(content));
    this.buffer.push(...bytes);
    return this;
  }

  /**
   * Add text with a newline
   */
  println(content: string = ''): this {
    this.text(content);
    this.buffer.push(LF);
    return this;
  }

  /**
   * Set text alignment
   */
  align(alignment: 'left' | 'center' | 'right'): this {
    switch (alignment) {
      case 'left':
        this.buffer.push(...COMMANDS.ALIGN_LEFT);
        break;
      case 'center':
        this.buffer.push(...COMMANDS.ALIGN_CENTER);
        break;
      case 'right':
        this.buffer.push(...COMMANDS.ALIGN_RIGHT);
        break;
    }
    return this;
  }

  /**
   * Set bold text
   */
  bold(on: boolean = true): this {
    this.buffer.push(...(on ? COMMANDS.BOLD_ON : COMMANDS.BOLD_OFF));
    return this;
  }

  /**
   * Set underline
   */
  underline(on: boolean = true): this {
    this.buffer.push(...(on ? COMMANDS.UNDERLINE_ON : COMMANDS.UNDERLINE_OFF));
    return this;
  }

  /**
   * Set double height
   */
  doubleHeight(): this {
    this.buffer.push(...COMMANDS.DOUBLE_HEIGHT_ON);
    return this;
  }

  /**
   * Set double width
   */
  doubleWidth(): this {
    this.buffer.push(...COMMANDS.DOUBLE_WIDTH_ON);
    return this;
  }

  /**
   * Set double size (height and width)
   */
  doubleSize(): this {
    this.buffer.push(...COMMANDS.DOUBLE_SIZE_ON);
    return this;
  }

  /**
   * Reset to normal size
   */
  normalSize(): this {
    this.buffer.push(...COMMANDS.NORMAL_SIZE);
    return this;
  }

  /**
   * Feed specified number of lines
   */
  feed(lines: number = 1): this {
    if (lines === 1) {
      this.buffer.push(...COMMANDS.FEED_LINE);
    } else {
      this.buffer.push(...COMMANDS.FEED_LINES(lines));
    }
    return this;
  }

  /**
   * Print a separator line
   */
  separator(char: string = '-'): this {
    this.println(char.repeat(this.printerWidth));
    return this;
  }

  /**
   * Print a double separator line
   */
  doubleSeparator(): this {
    this.println('='.repeat(this.printerWidth));
    return this;
  }

  /**
   * Print a row with left and right aligned text
   */
  leftRight(left: string, right: string, fillChar: string = ' '): this {
    const maxLeftWidth = this.printerWidth - right.length - 1;
    const truncatedLeft = left.length > maxLeftWidth
      ? left.substring(0, maxLeftWidth)
      : left;
    const padding = this.printerWidth - truncatedLeft.length - right.length;
    this.println(truncatedLeft + fillChar.repeat(Math.max(1, padding)) + right);
    return this;
  }

  /**
   * Print a row with three columns
   */
  columns(col1: string, col2: string, col3: string): this {
    const col1Width = Math.floor(this.printerWidth * 0.4);
    const col2Width = Math.floor(this.printerWidth * 0.2);
    const col3Width = this.printerWidth - col1Width - col2Width;

    const paddedCol1 = col1.substring(0, col1Width).padEnd(col1Width);
    const paddedCol2 = col2.substring(0, col2Width).padStart(col2Width);
    const paddedCol3 = col3.substring(0, col3Width).padStart(col3Width);

    this.println(paddedCol1 + paddedCol2 + paddedCol3);
    return this;
  }

  /**
   * Print a table row for receipt items
   * Format: Item Name | Qty x Price | Total
   */
  itemRow(name: string, qty: number, price: number, total: number): this {
    // First line: Item name
    const truncatedName = name.length > this.printerWidth - 2
      ? name.substring(0, this.printerWidth - 2) + '..'
      : name;
    this.println(truncatedName);

    // Second line: Qty x Price = Total (right aligned)
    const qtyPriceStr = `  ${qty} x ${price.toFixed(2)}`;
    const totalStr = total.toFixed(2);
    this.leftRight(qtyPriceStr, totalStr);

    return this;
  }

  /**
   * Cut the paper
   */
  cut(partial: boolean = false): this {
    this.feed(1); // Feed before cut (minimal spacing to save paper)
    this.buffer.push(...(partial ? COMMANDS.CUT_PAPER_PARTIAL : COMMANDS.CUT_PAPER));
    return this;
  }

  /**
   * Open cash drawer
   */
  openCashDrawer(): this {
    this.buffer.push(...COMMANDS.OPEN_CASH_DRAWER);
    return this;
  }

  /**
   * Print barcode
   */
  barcode(data: string, type: number = BARCODE_TYPE.CODE128, height: number = 50, width: number = 2): this {
    // Set barcode height
    this.buffer.push(...COMMANDS.BARCODE_HEIGHT(height));
    // Set barcode width
    this.buffer.push(...COMMANDS.BARCODE_WIDTH(width));
    // Show text below barcode
    this.buffer.push(...COMMANDS.BARCODE_TEXT_BELOW);
    // Print barcode
    this.buffer.push(GS, 0x6B, type, data.length);
    this.text(data);
    this.feed();
    return this;
  }

  /**
   * Get the buffer as Uint8Array
   */
  build(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  /**
   * Get the buffer as base64 string (for BLE transmission)
   */
  toBase64(): string {
    const bytes = this.build();
    let binary = '';
    bytes.forEach(byte => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  /**
   * Get buffer length
   */
  get length(): number {
    return this.buffer.length;
  }

  /**
   * Clear the buffer
   */
  clear(): this {
    this.buffer = [];
    return this;
  }
}

/**
 * Receipt Template Builder
 * Creates formatted receipts for the POS system
 */
export interface ReceiptData {
  // Business info
  businessName: string;
  businessAddress?: string;
  businessPhone?: string;
  tin?: string;
  permitNumber?: string;

  // Transaction info
  invoiceNumber: string;
  transactionDate: Date;
  cashierName: string;

  // Items
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    item_type?: 'sale' | 'return';
  }>;

  // Totals
  subtotal: number;
  taxAmount: number;
  discountAmount?: number;
  discountLabel?: string;
  total: number;

  // BIR VAT Breakdown
  vatableSales?: number;
  vatExemptSales?: number;
  zeroRatedSales?: number;
  vatAmount?: number;

  // Buy & Return (BO)
  hasReturnItems?: boolean;
  saleSubtotal?: number;
  returnSubtotal?: number;

  // Payment
  paymentMethod: string;
  amountTendered: number;
  changeAmount: number;

  // Customer
  customerName?: string;

  // Footer
  footerText?: string;
}

/**
 * Build a complete receipt for printing
 */
export function buildReceipt(data: ReceiptData, printerWidth: number = PRINTER_WIDTH.MM_58): ESCPOSBuilder {
  const builder = new ESCPOSBuilder(printerWidth);

  // Header
  builder
    .align('center')
    .bold(true)
    .doubleSize()
    .println(data.businessName)
    .normalSize()
    .bold(false);

  if (data.businessAddress) {
    builder.println(data.businessAddress);
  }

  if (data.businessPhone) {
    builder.println(`Tel: ${data.businessPhone}`);
  }

  if (data.tin) {
    builder.println(`TIN: ${data.tin}`);
  }

  if (data.permitNumber) {
    builder.println(`Permit No: ${data.permitNumber}`);
  }

  builder
    .feed()
    .doubleSeparator()
    .align('left');

  // Transaction info
  builder
    .bold(true)
    .align('center')
    .println('SALES INVOICE')
    .bold(false)
    .align('left')
    .feed();

  const dateStr = formatPrinterDateNumeric(data.transactionDate);
  const timeStr = formatPrinterTime(data.transactionDate);

  builder
    .leftRight('Invoice #:', data.invoiceNumber)
    .leftRight('Date:', dateStr)
    .leftRight('Time:', timeStr)
    .leftRight('Cashier:', data.cashierName);

  if (data.customerName) {
    builder.leftRight('Customer:', data.customerName);
  }

  builder.separator();

  if (data.hasReturnItems) {
    // === Two-section receipt for Buy & Return (BO) ===

    // Section 1: Items Purchased
    builder
      .bold(true)
      .align('center')
      .println('ITEMS PURCHASED')
      .align('left')
      .bold(false)
      .separator('-');

    const saleItems = data.items.filter(i => i.item_type !== 'return');
    for (const item of saleItems) {
      builder.itemRow(item.name, item.quantity, item.unitPrice, item.totalPrice);
    }

    builder.separator();

    // Section 2: Items Returned (BO)
    builder
      .bold(true)
      .align('center')
      .println('ITEMS RETURNED (BO)')
      .align('left')
      .bold(false)
      .separator('-');

    const returnItems = data.items.filter(i => i.item_type === 'return');
    for (const item of returnItems) {
      builder.itemRow(item.name, item.quantity, item.unitPrice, item.totalPrice);
    }

    builder.separator();

    // Sale/Return subtotals
    builder
      .leftRight('Sales Subtotal:', `P${(data.saleSubtotal || 0).toFixed(2)}`)
      .leftRight('Returns (BO):', `-P${(data.returnSubtotal || 0).toFixed(2)}`);

  } else {
    // === Standard single-section receipt ===

    // Items header
    builder
      .bold(true)
      .columns('Item', 'Qty', 'Amount')
      .bold(false)
      .separator('-');

    // Items
    for (const item of data.items) {
      builder.itemRow(item.name, item.quantity, item.unitPrice, item.totalPrice);
    }

    builder.separator();
  }

  // BIR VAT Breakdown (if available) or legacy totals
  if (data.vatableSales !== undefined || data.vatExemptSales !== undefined || data.zeroRatedSales !== undefined) {
    // BIR-compliant VAT breakdown
    builder
      .leftRight('VATable Sales:', `P${(data.vatableSales || 0).toFixed(2)}`)
      .leftRight('VAT-Exempt Sales:', `P${(data.vatExemptSales || 0).toFixed(2)}`)
      .leftRight('Zero-Rated Sales:', `P${(data.zeroRatedSales || 0).toFixed(2)}`)
      .leftRight('VAT Amount (12%):', `P${(data.vatAmount || 0).toFixed(2)}`);
  } else {
    // Legacy format
    builder
      .leftRight('Subtotal:', `P${data.subtotal.toFixed(2)}`)
      .leftRight('VAT (12%):', `P${data.taxAmount.toFixed(2)}`);
  }

  if (data.discountAmount && data.discountAmount > 0) {
    const discountLabel = data.discountLabel || 'Discount';
    builder.leftRight(`${discountLabel}:`, `-P${data.discountAmount.toFixed(2)}`);
  }

  builder
    .doubleSeparator()
    .bold(true)
    .leftRight(data.hasReturnItems ? 'NET TOTAL:' : 'TOTAL:', `P${data.total.toFixed(2)}`)
    .bold(false)
    .separator();

  // Payment
  if (data.total <= 0) {
    // Refund or zero total
    builder
      .leftRight('Payment:', data.total < 0 ? 'REFUND' : 'NO PAYMENT')
      .leftRight('Refund Amount:', `P${Math.abs(data.changeAmount || 0).toFixed(2)}`);
  } else {
    builder
      .leftRight('Payment:', data.paymentMethod)
      .leftRight('Tendered:', `P${data.amountTendered.toFixed(2)}`)
      .leftRight('Change:', `P${data.changeAmount.toFixed(2)}`);
  }

  builder.feed();

  // Footer
  builder
    .align('center')
    .separator()
    .println('Thank you for your purchase!')
    .println('Please come again');

  if (data.footerText) {
    builder.feed().println(data.footerText);
  }

  // Cut paper
  builder.cut();

  return builder;
}

/**
 * Build a simple test print
 */
export function buildTestPrint(printerWidth: number = PRINTER_WIDTH.MM_58): ESCPOSBuilder {
  const builder = new ESCPOSBuilder(printerWidth);

  builder
    .align('center')
    .bold(true)
    .doubleSize()
    .println('PRINTER TEST')
    .normalSize()
    .bold(false)
    .feed()
    .separator()
    .align('left')
    .println('Normal text line')
    .bold(true)
    .println('Bold text line')
    .bold(false)
    .underline(true)
    .println('Underlined text')
    .underline(false)
    .feed()
    .leftRight('Left', 'Right')
    .columns('Col1', 'Col2', 'Col3')
    .separator()
    .align('center')
    .println('Printer is working!')
    .feed()
    .println(formatPrinterDateTime(new Date()))
    .cut();

  return builder;
}

/**
 * Build X-Reading report
 */
export function buildXReading(
  data: {
    businessName: string;
    businessAddress?: string;
    tin?: string;
    cashierName: string;
    date: string;
    time: string;
    // Sales Summary
    transactionCount: number;
    grossSales: number;
    discounts: number;
    refundAmount: number;
    netSales: number;
    // VAT Breakdown
    vatSales: number;
    vatAmount: number;
    vatExemptSales: number;
    zeroRatedSales: number;
    // Payment Methods
    cashSales: number;
    cardSales: number;
    checkSales: number;
    onlineSales: number;
    creditSales: number;
    // Voids / Exchanges / Refunds
    voidCount: number;
    voidAmount: number;
    exchangeCount: number;
    exchangeAmount: number;
    refundCount: number;
    // AR Collections
    customerPaymentsCash?: number;
    customerPaymentsCheck?: number;
    customerPaymentsCard?: number;
    customerPaymentsOnline?: number;
    customerPaymentsBankTransfer?: number;
    customerPaymentsTotal?: number;
    // Cash Drawer
    beginningCash: number;
    openingFund: number;
    cashIn: number;
    cashOut: number;
    pettyCash: number;
    cashRefunds: number;
    expectedCash: number;
  },
  printerWidth: number = PRINTER_WIDTH.MM_58
): ESCPOSBuilder {
  const builder = new ESCPOSBuilder(printerWidth);
  const fmt = (v: number) => `P${v.toFixed(2)}`;

  // Header
  builder
    .align('center')
    .bold(true)
    .doubleSize()
    .println('X-READING')
    .normalSize()
    .bold(false)
    .println(data.businessName);

  if (data.businessAddress) {
    builder.println(data.businessAddress);
  }

  builder
    .println(`TIN: ${data.tin || 'N/A'}`)
    .feed()
    .doubleSeparator()
    .align('left');

  // Info
  builder
    .leftRight('Date:', data.date)
    .leftRight('Time:', data.time)
    .leftRight('Cashier:', data.cashierName)
    .separator();

  // Sales Summary
  builder
    .bold(true)
    .println('SALES SUMMARY')
    .bold(false)
    .leftRight('Transactions:', data.transactionCount.toString())
    .leftRight('Gross Sales:', fmt(data.grossSales))
    .leftRight('Less: Discounts:', `-${fmt(data.discounts)}`)
    .leftRight('Less: Refunds:', `-${fmt(data.refundAmount)}`)
    .separator()
    .bold(true)
    .leftRight('NET SALES:', fmt(data.netSales))
    .bold(false)
    .separator();

  // VAT Breakdown
  builder
    .bold(true)
    .println('VAT BREAKDOWN')
    .bold(false)
    .leftRight('VATable Sales:', fmt(data.vatSales))
    .leftRight('VAT Amount (12%):', fmt(data.vatAmount))
    .leftRight('VAT Exempt Sales:', fmt(data.vatExemptSales))
    .leftRight('Zero-Rated Sales:', fmt(data.zeroRatedSales))
    .separator();

  // Payment Methods
  builder
    .bold(true)
    .println('BY PAYMENT METHOD')
    .bold(false)
    .leftRight('Cash Sales:', fmt(data.cashSales))
    .leftRight('Card Sales:', fmt(data.cardSales))
    .leftRight('Check Sales:', fmt(data.checkSales))
    .leftRight('GCash/Maya:', fmt(data.onlineSales))
    .leftRight('Credit/Charge:', fmt(data.creditSales))
    .separator();

  // Voids / Exchanges / Refunds
  builder
    .bold(true)
    .println('VOIDS / EXCHANGES / REFUNDS')
    .bold(false)
    .leftRight('Void Count:', data.voidCount.toString())
    .leftRight('Void Amount:', fmt(data.voidAmount))
    .leftRight('Exchange Count:', data.exchangeCount.toString())
    .leftRight('Exchange Amount:', fmt(data.exchangeAmount))
    .leftRight('Refund Count:', data.refundCount.toString())
    .leftRight('Refund Amount:', fmt(data.refundAmount))
    .separator();

  // AR Collections (only if there are any)
  const arTotal = data.customerPaymentsTotal || 0;
  if (arTotal > 0) {
    builder
      .bold(true)
      .println('AR COLLECTIONS')
      .bold(false)
      .leftRight('Cash:', fmt(data.customerPaymentsCash || 0))
      .leftRight('Check:', fmt(data.customerPaymentsCheck || 0))
      .leftRight('Card:', fmt(data.customerPaymentsCard || 0))
      .leftRight('GCash/Online:', fmt(data.customerPaymentsOnline || 0))
      .leftRight('Bank Transfer:', fmt(data.customerPaymentsBankTransfer || 0))
      .bold(true)
      .leftRight('Total Collections:', fmt(arTotal))
      .bold(false)
      .separator();
  }

  // Cash Drawer
  builder
    .bold(true)
    .println('CASH DRAWER')
    .bold(false)
    .leftRight('Beginning Cash:', fmt(data.beginningCash))
    .leftRight('Add: Opening Fund:', fmt(data.openingFund))
    .leftRight('Add: Cash In:', fmt(data.cashIn))
    .leftRight('Add: Cash Sales:', fmt(data.cashSales));

  if (arTotal > 0 && (data.customerPaymentsCash || 0) > 0) {
    builder.leftRight('Add: AR Cash:', fmt(data.customerPaymentsCash || 0));
  }

  builder
    .leftRight('Less: Cash Out:', `-${fmt(data.cashOut)}`)
    .leftRight('Less: Petty Cash:', `-${fmt(data.pettyCash)}`)
    .leftRight('Less: Cash Refunds:', `-${fmt(data.cashRefunds)}`)
    .separator()
    .bold(true)
    .leftRight('EXPECTED CASH:', fmt(data.expectedCash))
    .bold(false);

  // Footer
  builder
    .feed()
    .align('center')
    .println('*** NON-FISCAL ***')
    .println('*** INQUIRY ONLY ***')
    .cut();

  return builder;
}

/**
 * Build Z-Reading report (End of Day)
 */
export function buildZReading(
  data: {
    businessName: string;
    businessAddress?: string;
    tin?: string;
    permitNumber?: string;
    machineId?: string;
    zReadingNumber: number;
    date: Date;
    resetCounter: number;
    beginningOR: string;
    endingOR: string;
    grossSales: number;
    regularDiscount: number;
    seniorDiscount: number;
    voidAmount: number;
    returnAmount: number;
    netSales: number;
    vatableSales: number;
    vatAmount: number;
    vatExemptSales: number;
    zeroRatedSales: number;
    transactionCount: number;
    cashierName: string;
    // Voids / Exchanges / Refunds
    voidCount?: number;
    exchangeCount?: number;
    exchangeAmount?: number;
    refundCount?: number;
    refundAmount?: number;
    // AR Collections
    customerPaymentsCash?: number;
    customerPaymentsCheck?: number;
    customerPaymentsCard?: number;
    customerPaymentsOnline?: number;
    customerPaymentsBankTransfer?: number;
    customerPaymentsTotal?: number;
    // Supplier Payments
    supplierPaymentsMade?: number;
    // Cash Drawer (optional)
    beginningCash?: number;
    openingFund?: number;
    cashIn?: number;
    cashOut?: number;
    cashSales?: number;
    cashFund?: number;       // For backward compatibility (opening_fund + cash_in)
    pettyCash?: number;
    cashRefunds?: number;
    expectedCash?: number;
    actualCash?: number;
    cashVariance?: number;
  },
  printerWidth: number = PRINTER_WIDTH.MM_58
): ESCPOSBuilder {
  const builder = new ESCPOSBuilder(printerWidth);

  // Header
  builder
    .align('center')
    .bold(true)
    .doubleSize()
    .println('Z-READING')
    .normalSize()
    .bold(false)
    .println(data.businessName);

  if (data.businessAddress) {
    builder.println(data.businessAddress);
  }

  builder.println(`TIN: ${data.tin || 'N/A'}`);

  if (data.permitNumber) {
    builder.println(`Permit: ${data.permitNumber}`);
  }

  if (data.machineId) {
    builder.println(`Machine ID: ${data.machineId}`);
  }

  builder
    .feed()
    .doubleSeparator()
    .align('left');

  // Report info
  builder
    .leftRight('Z-Reading No:', `#${data.zReadingNumber}`)
    .leftRight('Date:', formatPrinterDateNumeric(data.date))
    .leftRight('Reset Counter:', data.resetCounter.toString())
    .separator();

  // OR Range
  builder
    .leftRight('Beginning OR:', data.beginningOR)
    .leftRight('Ending OR:', data.endingOR)
    .separator();

  // Sales breakdown
  builder
    .bold(true)
    .println('SALES BREAKDOWN')
    .bold(false)
    .leftRight('Gross Sales:', `P${data.grossSales.toFixed(2)}`)
    .leftRight('Regular Discount:', `-P${data.regularDiscount.toFixed(2)}`)
    .leftRight('SC/PWD Discount:', `-P${data.seniorDiscount.toFixed(2)}`)
    .leftRight('Void:', `-P${data.voidAmount.toFixed(2)}`)
    .leftRight('Returns:', `-P${data.returnAmount.toFixed(2)}`)
    .separator()
    .bold(true)
    .leftRight('NET SALES:', `P${data.netSales.toFixed(2)}`)
    .bold(false)
    .separator();

  // VAT breakdown
  builder
    .bold(true)
    .println('VAT BREAKDOWN')
    .bold(false)
    .leftRight('VATable Sales:', `P${data.vatableSales.toFixed(2)}`)
    .leftRight('VAT Amount:', `P${data.vatAmount.toFixed(2)}`)
    .leftRight('VAT Exempt:', `P${data.vatExemptSales.toFixed(2)}`)
    .leftRight('Zero Rated:', `P${data.zeroRatedSales.toFixed(2)}`)
    .separator();

  // Voids / Exchanges / Refunds
  builder
    .bold(true)
    .println('VOIDS / EXCHANGES / REFUNDS')
    .bold(false)
    .leftRight('Void Count:', (data.voidCount || 0).toString())
    .leftRight('Void Amount:', `P${data.voidAmount.toFixed(2)}`)
    .leftRight('Exchange Count:', (data.exchangeCount || 0).toString())
    .leftRight('Exchange Amount:', `P${(data.exchangeAmount || 0).toFixed(2)}`)
    .leftRight('Refund Count:', (data.refundCount || 0).toString())
    .leftRight('Refund Amount:', `P${(data.refundAmount || data.returnAmount).toFixed(2)}`)
    .separator();

  // AR Collections (only if there are any)
  const zArTotal = data.customerPaymentsTotal || 0;
  if (zArTotal > 0) {
    builder
      .bold(true)
      .println('AR COLLECTIONS')
      .bold(false)
      .leftRight('Cash:', `P${(data.customerPaymentsCash || 0).toFixed(2)}`)
      .leftRight('Check:', `P${(data.customerPaymentsCheck || 0).toFixed(2)}`)
      .leftRight('Card:', `P${(data.customerPaymentsCard || 0).toFixed(2)}`)
      .leftRight('GCash/Online:', `P${(data.customerPaymentsOnline || 0).toFixed(2)}`)
      .leftRight('Bank Transfer:', `P${(data.customerPaymentsBankTransfer || 0).toFixed(2)}`)
      .bold(true)
      .leftRight('Total Collections:', `P${zArTotal.toFixed(2)}`)
      .bold(false)
      .separator();
  }

  // Supplier Payments (only if there are any)
  if ((data.supplierPaymentsMade || 0) > 0) {
    builder
      .bold(true)
      .println('SUPPLIER PAYMENTS')
      .bold(false)
      .leftRight('Total Paid:', `P${(data.supplierPaymentsMade || 0).toFixed(2)}`)
      .separator();
  }

  // Summary
  builder
    .leftRight('Trans Count:', data.transactionCount.toString())
    .leftRight('Cashier:', data.cashierName);

  // Cash Drawer Section (if provided)
  if (data.beginningCash !== undefined || data.expectedCash !== undefined) {
    builder
      .separator()
      .bold(true)
      .println('CASH DRAWER')
      .bold(false);

    if (data.beginningCash !== undefined) {
      builder.leftRight('Beginning Cash:', `P${data.beginningCash.toFixed(2)}`);
    }

    // Show detailed breakdown if available, otherwise fall back to combined cashFund
    if (data.openingFund !== undefined || data.cashIn !== undefined) {
      if ((data.openingFund || 0) > 0) {
        builder.leftRight('Add: Opening Fund:', `P${(data.openingFund || 0).toFixed(2)}`);
      }
      if ((data.cashIn || 0) > 0) {
        builder.leftRight('Add: Cash In:', `P${(data.cashIn || 0).toFixed(2)}`);
      }
    } else if (data.cashFund !== undefined && data.cashFund > 0) {
      builder.leftRight('Add: Cash Fund:', `P${data.cashFund.toFixed(2)}`);
    }

    if (data.cashSales !== undefined) {
      builder.leftRight('Add: Cash Sales:', `P${data.cashSales.toFixed(2)}`);
    }

    if ((data.customerPaymentsCash || 0) > 0) {
      builder.leftRight('Add: AR Cash:', `P${(data.customerPaymentsCash || 0).toFixed(2)}`);
    }

    // Show detailed breakdown if available, otherwise fall back to combined pettyCash
    if (data.cashOut !== undefined) {
      if ((data.cashOut || 0) > 0) {
        builder.leftRight('Less: Cash Out:', `-P${(data.cashOut || 0).toFixed(2)}`);
      }
      if ((data.pettyCash || 0) > 0) {
        builder.leftRight('Less: Petty Cash:', `-P${(data.pettyCash || 0).toFixed(2)}`);
      }
    } else if (data.pettyCash !== undefined && data.pettyCash > 0) {
      builder.leftRight('Less: Petty Cash:', `-P${data.pettyCash.toFixed(2)}`);
    }

    if (data.cashRefunds !== undefined && data.cashRefunds > 0) {
      builder.leftRight('Less: Cash Refunds:', `-P${data.cashRefunds.toFixed(2)}`);
    }

    if (data.expectedCash !== undefined) {
      builder
        .separator()
        .bold(true)
        .leftRight('Expected Cash:', `P${data.expectedCash.toFixed(2)}`)
        .bold(false);
    }

    if (data.actualCash !== undefined) {
      builder.leftRight('Actual Cash:', `P${data.actualCash.toFixed(2)}`);
    }

    if (data.cashVariance !== undefined) {
      const varianceLabel = data.cashVariance === 0 ? 'BALANCED' :
        data.cashVariance < 0 ? `SHORT:` : `OVER:`;
      const varianceValue = data.cashVariance === 0 ? '' : `P${Math.abs(data.cashVariance).toFixed(2)}`;

      builder
        .bold(true)
        .leftRight(varianceLabel, varianceValue)
        .bold(false);
    }
  }

  builder
    .feed()
    .align('center')
    .doubleSeparator()
    .bold(true)
    .println('*** END OF DAY REPORT ***')
    .bold(false)
    .println(formatPrinterDateTime(new Date()))
    .cut();

  return builder;
}

// Payment Receipt Data interface
export interface PaymentReceiptPrintData {
  businessName: string;
  businessAddress?: string;
  businessPhone?: string;
  tin?: string;
  paymentNumber: string;
  paymentDate: Date;
  receivedBy: string;
  customerName: string;
  customerCode?: string;
  invoiceNumber: string;
  originalAmount: number;
  previouslyPaid: number;
  amountPaid: number;
  balanceAfterPayment: number;
  paymentMethod: string;
  referenceNumber?: string;
  notes?: string;
  footerText?: string;
}

export function buildPaymentReceipt(
  data: PaymentReceiptPrintData,
  printerWidth: number = PRINTER_WIDTH.MM_58
): ESCPOSBuilder {
  const builder = new ESCPOSBuilder(printerWidth);

  const formatDate = (date: Date): string => {
    return formatPrinterDateNumeric(date);
  };

  const formatTime = (date: Date): string => {
    return formatPrinterTime(date);
  };

  // Header
  builder
    .initialize()
    .align('center')
    .bold(true)
    .println(data.businessName || 'STORE')
    .bold(false);

  if (data.businessAddress) {
    builder.println(data.businessAddress);
  }
  if (data.businessPhone) {
    builder.println(`Tel: ${data.businessPhone}`);
  }
  if (data.tin) {
    builder.println(`TIN: ${data.tin}`);
  }

  builder
    .doubleSeparator()
    .bold(true)
    .println('PAYMENT RECEIPT')
    .bold(false)
    .separator()
    .align('left');

  // Payment details
  builder
    .leftRight('Receipt #:', data.paymentNumber)
    .leftRight('Date:', formatDate(data.paymentDate))
    .leftRight('Time:', formatTime(data.paymentDate))
    .leftRight('Received By:', data.receivedBy)
    .separator();

  // Customer info
  builder
    .bold(true)
    .println('CUSTOMER')
    .bold(false)
    .leftRight('Name:', data.customerName);

  if (data.customerCode) {
    builder.leftRight('Code:', data.customerCode);
  }

  builder.separator();

  // Invoice info
  builder
    .bold(true)
    .println('PAYMENT FOR')
    .bold(false)
    .leftRight('Invoice #:', data.invoiceNumber)
    .leftRight('Invoice Amount:', `P${data.originalAmount.toFixed(2)}`)
    .leftRight('Previously Paid:', `P${data.previouslyPaid.toFixed(2)}`)
    .doubleSeparator();

  // Amount paid
  builder
    .bold(true)
    .leftRight('AMOUNT PAID:', `P${data.amountPaid.toFixed(2)}`)
    .bold(false)
    .feed()
    .leftRight('Balance:', `P${data.balanceAfterPayment.toFixed(2)}`)
    .separator();

  // Payment method
  builder.leftRight('Payment Method:', data.paymentMethod);

  if (data.referenceNumber) {
    builder.leftRight('Reference #:', data.referenceNumber);
  }

  if (data.notes) {
    builder
      .feed()
      .println(`Notes: ${data.notes}`);
  }

  builder.separator();

  // Footer
  builder
    .align('center')
    .println('Thank you for your payment!')
    .feed();

  if (data.footerText) {
    builder.println(data.footerText);
  }

  builder
    .doubleSeparator()
    .bold(true)
    .println('*** PAYMENT ACKNOWLEDGMENT ***')
    .bold(false)
    .println(formatPrinterDateTime(new Date()))
    .cut();

  return builder;
}

// Return Receipt Data interface
export interface ReturnReceiptItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  reason: string;
}

export interface ReturnReceiptPrintData {
  businessName: string;
  businessAddress?: string;
  businessPhone?: string;
  tin?: string;
  returnNumber: string;
  returnDate: Date;
  processedBy: string;
  originalTransactionNumber?: string;
  customerName?: string;
  customerCode?: string;
  items: ReturnReceiptItem[];
  totalAmount: number;
  refundMethod: string;
  notes?: string;
  footerText?: string;
}

export function buildReturnReceipt(
  data: ReturnReceiptPrintData,
  printerWidth: number = PRINTER_WIDTH.MM_58
): ESCPOSBuilder {
  const builder = new ESCPOSBuilder(printerWidth);

  const formatDate = (date: Date): string => {
    return formatPrinterDateNumeric(date);
  };

  const formatTime = (date: Date): string => {
    return formatPrinterTime(date);
  };

  // Header
  builder
    .initialize()
    .align('center')
    .bold(true)
    .println(data.businessName || 'STORE')
    .bold(false);

  if (data.businessAddress) {
    builder.println(data.businessAddress);
  }
  if (data.businessPhone) {
    builder.println(`Tel: ${data.businessPhone}`);
  }
  if (data.tin) {
    builder.println(`TIN: ${data.tin}`);
  }

  builder
    .doubleSeparator()
    .bold(true)
    .println('SALES RETURN RECEIPT')
    .bold(false)
    .separator()
    .align('left');

  // Return details
  builder
    .leftRight('Return #:', data.returnNumber)
    .leftRight('Date:', formatDate(data.returnDate))
    .leftRight('Time:', formatTime(data.returnDate))
    .leftRight('Processed By:', data.processedBy);

  if (data.originalTransactionNumber) {
    builder.leftRight('Orig Trans #:', data.originalTransactionNumber);
  }

  builder.separator();

  // Customer info (if available)
  if (data.customerName) {
    builder
      .bold(true)
      .println('CUSTOMER')
      .bold(false)
      .leftRight('Name:', data.customerName);

    if (data.customerCode) {
      builder.leftRight('Code:', data.customerCode);
    }

    builder.separator();
  }

  // Items header
  builder
    .bold(true)
    .println('RETURNED ITEMS')
    .bold(false)
    .separator();

  // Items
  for (const item of data.items) {
    builder
      .println(item.productName)
      .leftRight(`  ${item.quantity} x P${item.unitPrice.toFixed(2)}`, `P${item.total.toFixed(2)}`)
      .println(`  Reason: ${item.reason}`);
  }

  builder.doubleSeparator();

  // Total
  builder
    .bold(true)
    .leftRight('TOTAL REFUND:', `P${data.totalAmount.toFixed(2)}`)
    .bold(false)
    .separator();

  // Refund method
  builder.leftRight('Refund Method:', data.refundMethod);

  if (data.notes) {
    builder
      .feed()
      .println(`Notes: ${data.notes}`);
  }

  builder.separator();

  // Footer
  builder
    .align('center')
    .println('Thank you!')
    .feed();

  if (data.footerText) {
    builder.println(data.footerText);
  }

  builder
    .doubleSeparator()
    .bold(true)
    .println('*** SALES RETURN ACKNOWLEDGMENT ***')
    .bold(false)
    .println(formatPrinterDateTime(new Date()))
    .cut();

  return builder;
}

/**
 * Build a Purchase Order print for thermal printer
 */
export interface PurchaseOrderPrintData {
  purchaseNumber: string;
  supplierName: string;
  purchaseDate: string;
  referenceNumber?: string;
  expectedDeliveryDate?: string;
  paymentTerms?: string;
  notes?: string;
  status: string;
  items: {
    productName: string;
    productCode: string;
    quantityOrdered: number;
    quantityReceived?: number;
    unitCost: number;
    totalAmount: number;
  }[];
  totalAmount: number;
  businessName?: string;
  businessAddress?: string;
  businessPhone?: string;
}

export function buildPurchaseOrder(
  data: PurchaseOrderPrintData,
  printerWidth: number = PRINTER_WIDTH.MM_58
): ESCPOSBuilder {
  const builder = new ESCPOSBuilder(printerWidth);

  // Header
  builder.align('center').bold(true);
  if (data.businessName) builder.println(data.businessName);
  builder.bold(false);
  if (data.businessAddress) builder.println(data.businessAddress);
  if (data.businessPhone) builder.println(`Tel: ${data.businessPhone}`);

  builder.doubleSeparator();
  builder.bold(true).println('PURCHASE ORDER').bold(false);
  builder.separator();

  // PO Details
  builder.align('left');
  builder.leftRight('PO #:', data.purchaseNumber);
  builder.leftRight('Supplier:', data.supplierName);
  builder.leftRight('Date:', data.purchaseDate);
  builder.leftRight('Status:', data.status);
  if (data.referenceNumber) builder.leftRight('Ref #:', data.referenceNumber);
  if (data.expectedDeliveryDate) builder.leftRight('Delivery:', data.expectedDeliveryDate);
  if (data.paymentTerms) builder.leftRight('Terms:', data.paymentTerms);

  builder.separator();

  // Items header
  builder.bold(true);
  builder.columns('Item', 'Qty', 'Amount');
  builder.bold(false);
  builder.separator();

  // Items
  for (const item of data.items) {
    const truncName = item.productName.length > printerWidth - 2
      ? item.productName.substring(0, printerWidth - 2) + '..'
      : item.productName;
    builder.println(truncName);
    const qtyStr = `  ${item.quantityOrdered} x ${item.unitCost.toFixed(2)}`;
    builder.leftRight(qtyStr, item.totalAmount.toFixed(2));
    if (item.quantityReceived !== undefined && item.quantityReceived > 0) {
      builder.println(`  Received: ${item.quantityReceived}`);
    }
  }

  builder.doubleSeparator();

  // Total
  builder.bold(true);
  builder.leftRight('TOTAL:', `P${data.totalAmount.toFixed(2)}`);
  builder.bold(false);

  builder.separator();

  if (data.notes) {
    builder.println(`Notes: ${data.notes}`);
    builder.separator();
  }

  builder.align('center');
  builder.println(formatPrinterDateTime(new Date()));
  builder.cut();

  return builder;
}

/**
 * Label Template Configuration Interface
 */
export interface LabelTemplate {
  showCode: boolean;          // Show product code below barcode
  showName: boolean;          // Show product name
  showPrice: boolean;         // Show selling price
  showCategory: boolean;      // Show category name
  showAdditionalText: boolean; // Show custom text
  additionalText: string;     // Custom text content
}

/**
 * Barcode Label Data Interface
 */
export interface BarcodeLabelData {
  productCode: string;        // Barcode data (CODE128 format)
  productName?: string;
  price?: number;
  categoryName?: string;
  additionalText?: string;
}

/**
 * Build a barcode label for thermal printer
 * Optimized for product label printing on 58mm and 80mm printers
 */
export function buildBarcodeLabel(
  data: BarcodeLabelData,
  template: LabelTemplate,
  printerWidth: number = PRINTER_WIDTH.MM_58
): ESCPOSBuilder {
  const builder = new ESCPOSBuilder(printerWidth);

  // Barcode dimensions based on paper size
  const barcodeHeight = printerWidth === PRINTER_WIDTH.MM_80 ? 80 : 60;
  const barcodeWidth = printerWidth === PRINTER_WIDTH.MM_80 ? 3 : 2;

  // Maximum text width for word wrapping
  const maxTextWidth = printerWidth === PRINTER_WIDTH.MM_80 ? 44 : 28;

  // Helper function to truncate or wrap text
  const truncateText = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 2) + '..';
  };

  // Top margin
  builder.feed(1);

  // Center align all content
  builder.align('center');

  // Print barcode using native ESC/POS command
  builder.barcode(data.productCode, BARCODE_TYPE.CODE128, barcodeHeight, barcodeWidth);

  // Spacing after barcode
  builder.feed(1);

  // Print product code (if enabled in template)
  if (template.showCode) {
    builder.bold(true);
    builder.println(data.productCode);
    builder.bold(false);
  }

  // Print product name (if enabled and provided)
  if (template.showName && data.productName) {
    const truncatedName = truncateText(data.productName, maxTextWidth);
    builder.println(truncatedName);
  }

  // Print price (if enabled and provided)
  if (template.showPrice && data.price !== undefined) {
    builder.bold(true);
    builder.println(`₱${data.price.toFixed(2)}`);
    builder.bold(false);
  }

  // Print category (if enabled and provided)
  if (template.showCategory && data.categoryName) {
    const truncatedCategory = truncateText(data.categoryName, maxTextWidth);
    builder.println(truncatedCategory);
  }

  // Print additional text (if enabled)
  if (template.showAdditionalText && template.additionalText) {
    const truncatedText = truncateText(template.additionalText, maxTextWidth);
    builder.println(truncatedText);
  }

  // Cut paper
  builder.cut();

  return builder;
}

// Cash Movement Receipt Data interface
export interface CashMovementReceiptData {
  businessName: string;
  businessAddress?: string;
  businessPhone?: string;
  tin?: string;
  movementType: 'OPENING_FUND' | 'CASH_IN' | 'PETTY_CASH' | 'CASH_OUT';
  amount: number;
  description: string;
  approvedBy?: string;
  cashierName: string;
  movementDate: Date;
  referenceNumber?: string;
  footerText?: string;
}

export function buildCashMovementReceipt(
  data: CashMovementReceiptData,
  printerWidth: number = PRINTER_WIDTH.MM_58
): ESCPOSBuilder {
  const builder = new ESCPOSBuilder(printerWidth);

  const formatDate = (date: Date): string => {
    return formatPrinterDateNumeric(date);
  };

  const formatTime = (date: Date): string => {
    return formatPrinterTime(date);
  };

  const typeLabels: Record<string, string> = {
    OPENING_FUND: 'CASH FUND',
    CASH_IN: 'CASH IN',
    PETTY_CASH: 'PETTY CASH WITHDRAWAL',
    CASH_OUT: 'CASH OUT',
  };

  const typeLabel = typeLabels[data.movementType] || data.movementType;
  const isWithdrawal = data.movementType === 'PETTY_CASH' || data.movementType === 'CASH_OUT';

  // Header
  builder
    .initialize()
    .align('center')
    .bold(true)
    .println(data.businessName || 'STORE')
    .bold(false);

  if (data.businessAddress) {
    builder.println(data.businessAddress);
  }
  if (data.businessPhone) {
    builder.println(`Tel: ${data.businessPhone}`);
  }
  if (data.tin) {
    builder.println(`TIN: ${data.tin}`);
  }

  builder
    .doubleSeparator()
    .bold(true)
    .println(typeLabel)
    .bold(false)
    .separator()
    .align('left');

  // Details
  builder
    .leftRight('Date:', formatDate(data.movementDate))
    .leftRight('Time:', formatTime(data.movementDate))
    .leftRight('Cashier:', data.cashierName);

  if (data.referenceNumber) {
    builder.leftRight('Ref #:', data.referenceNumber);
  }

  builder.separator();

  // Amount
  builder
    .bold(true)
    .leftRight(
      isWithdrawal ? 'AMOUNT WITHDRAWN:' : 'AMOUNT ADDED:',
      `P${data.amount.toFixed(2)}`
    )
    .bold(false)
    .separator();

  // Description
  builder.println(`Purpose: ${data.description}`);

  if (data.approvedBy) {
    builder
      .feed()
      .leftRight('Approved By:', data.approvedBy);
  }

  builder.separator();

  // Footer
  builder
    .align('center')
    .println(isWithdrawal ? 'Cash Withdrawal Acknowledged' : 'Cash Fund Acknowledged');

  if (data.footerText) {
    builder.feed().println(data.footerText);
  }

  builder
    .feed()
    .doubleSeparator()
    .bold(true)
    .println(isWithdrawal ? '*** PETTY CASH VOUCHER ***' : '*** CASH FUND RECEIPT ***')
    .bold(false)
    .println(formatPrinterDateTime(new Date()))
    .cut();

  return builder;
}

export default {
  ESCPOSBuilder,
  PRINTER_WIDTH,
  COMMANDS,
  BARCODE_TYPE,
  buildReceipt,
  buildTestPrint,
  buildXReading,
  buildZReading,
  buildPaymentReceipt,
  buildReturnReceipt,
  buildPurchaseOrder,
  buildBarcodeLabel,
  buildCashMovementReceipt,
};
