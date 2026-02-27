import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Modal,
  TextInput as RNTextInput,
  TouchableOpacity,
  Keyboard,
  Alert,
} from 'react-native';
import {
  TextInput,
  useTheme,
  IconButton,
  Text,
  Button,
} from 'react-native-paper';

import { StackNavigationProp } from '@react-navigation/stack';
import { useFocusEffect, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../App';
import { getDatabase } from '../database/getDatabase';
import { useAuth } from '../contexts/AuthContext';
import { Product } from '../database/schema';
import StartShiftDialog from '../components/StartShiftDialog';

// POS Components
import {
  POSCartItem,
  POSPaymentModal,
  POSSearchDropdown,
  POSProductBrowser,
  POSProductBrowserContent,
  POSDiscountModal,
  POSQuantityModal,
  POSHamburgerMenu,
  POSCashFundModal,
  POSPettyCashModal,
  POSXReadingModal,
  POSVoidModal,
  POSQuickCustomerModal,
  POSUnterminatedSessionModal,
  POSReprintModal,
} from '../components/pos';
import POSSeniorDiscountModal from '../components/pos/POSSeniorDiscountModal';
import { useResponsiveTheme, useLandscapeLayout } from '../utils/responsive';
import { CartItem, getCartKey } from '../hooks/usePOSCart';
import ReceiptPreview, { ReceiptData } from '../components/ReceiptPreview';
import BluetoothPrinterService from '../utils/BluetoothPrinterService';
import { buildReceipt, PRINTER_WIDTH } from '../utils/escpos';
import { generateReceiptPdf } from '../utils/ReceiptPdfService';

// Hooks
import usePOSCart from '../hooks/usePOSCart';
import usePOSProducts from '../hooks/usePOSProducts';

type SalesScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Sales'>;
type SalesScreenRouteProp = RouteProp<RootStackParamList, 'Sales'>;

interface Props {
  navigation: SalesScreenNavigationProp;
  route: SalesScreenRouteProp;
}

export default function SalesScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const theme = useTheme();
  const { sp, fs, lo, isPhone } = useResponsiveTheme();
  const { canSplit, leftPanelWidth, rightPanelWidth } = useLandscapeLayout({ leftRatio: 0.55 });
  const printerService = BluetoothPrinterService.getInstance();

  // Responsive style overrides (scales with screen size)
  const actionBtnSize = isPhone ? Math.max(sp.xxl, 44) : sp.xxl + sp.sm;
  const rs = {
    searchSection: { paddingHorizontal: sp.sm + sp.xs, paddingVertical: sp.xs + 2 },
    priceTypeLabel: { fontSize: fs.bodySmall },
    priceTypeButton: { paddingHorizontal: sp.md, paddingVertical: sp.sm },
    priceTypeButtonText: { fontSize: fs.bodySmall },
    actionButton: { width: actionBtnSize, height: actionBtnSize },
    actionButtonIcon: { fontSize: isPhone ? fs.h3 + 2 : fs.h2 - 2 },
    cartHeader: { paddingHorizontal: sp.md, paddingVertical: sp.sm },
    cartTitle: { fontSize: fs.cardTitle },
    cartCount: { fontSize: fs.bodySmall },
    clearButtonText: { fontSize: fs.caption },
    cartListContent: { padding: sp.sm },
    emptyCartIcon: { fontSize: fs.hero * 2 },
    emptyCartTitle: { fontSize: fs.cardTitle },
    emptyCartSubtitle: { fontSize: fs.bodySmall },
    emptyCartPadding: { paddingVertical: sp.xxl + sp.xl },
    checkoutSection: { paddingHorizontal: sp.md, paddingTop: sp.xs, paddingBottom: sp.xxl },
    totalLabel: { fontSize: fs.bodySmall },
    totalValue: { fontSize: fs.bodySmall },
    grandTotalLabel: { fontSize: fs.cardTitle },
    grandTotalValue: { fontSize: fs.h3 },
    checkoutButton: { paddingVertical: sp.sm + sp.xs, borderRadius: sp.sm + sp.xs },
    checkoutButtonText: { fontSize: fs.cardTitle },
  };
  const searchInputRef = useRef<RNTextInput>(null);
  const productsRef = useRef<Product[]>([]);
  const cartListRef = useRef<FlatList>(null);

  // Custom hooks for state management
  const {
    cart,
    totals,
    discount,
    priceType,
    setPriceType,
    itemMode,
    setItemMode,
    addItem,
    removeItem,
    updateQuantity,
    incrementQuantity,
    decrementQuantity,
    clearCart,
    setDiscountType,
    setDiscountValue,
    setSeniorDiscount,
    clearSeniorDiscount,
    getItemQuantity,
  } = usePOSCart();

  const {
    products,
    categories,
    searchQuery,
    filteredProducts,
    loading,
    setSearchQuery,
    refreshProducts,
    findProductByBarcode,
  } = usePOSProducts();

  // Keep productsRef in sync with products (to avoid stale closure in callbacks)
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  // Auto-scroll cart to bottom when new item is added
  const prevCartLengthRef = useRef(0);
  useEffect(() => {
    if (cart.length > prevCartLengthRef.current && cartListRef.current) {
      // New item added - scroll to end after a short delay for render
      setTimeout(() => {
        cartListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
    prevCartLengthRef.current = cart.length;
  }, [cart.length]);

  // Local state
  const [customers, setCustomers] = useState<any[]>([]);
  const [transactionType, setTransactionType] = useState<'CASH' | 'CREDIT'>('CASH');
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [paymentVisible, setPaymentVisible] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [browseVisible, setBrowseVisible] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [discountModalVisible, setDiscountModalVisible] = useState(false);
  const [seniorDiscountModalVisible, setSeniorDiscountModalVisible] = useState(false);
  const [quantityModalVisible, setQuantityModalVisible] = useState(false);
  const [selectedItemForQty, setSelectedItemForQty] = useState<CartItem | null>(null);
  const [hamburgerMenuVisible, setHamburgerMenuVisible] = useState(false);
  const [lastReceiptData, setLastReceiptData] = useState<ReceiptData | null>(null);
  const [requireCustomerName, setRequireCustomerName] = useState(false);

  // POS Operation Modal States
  const [cashFundModalVisible, setCashFundModalVisible] = useState(false);
  const [pettyCashModalVisible, setPettyCashModalVisible] = useState(false);
  const [xReadingModalVisible, setXReadingModalVisible] = useState(false);
  const [xReadingTargetDate, setXReadingTargetDate] = useState<string | undefined>(undefined);
  const [voidModalVisible, setVoidModalVisible] = useState(false);
  const [quickCustomerModalVisible, setQuickCustomerModalVisible] = useState(false);
  const [reprintModalVisible, setReprintModalVisible] = useState(false);

  // Shift Management State
  const [currentShift, setCurrentShift] = useState<{id: number; beginning_cash: number} | null>(null);
  const [shiftDialogVisible, setShiftDialogVisible] = useState(false);
  const [checkingShift, setCheckingShift] = useState(true);

  // Unterminated Session State
  const [unterminatedSessions, setUnterminatedSessions] = useState<{date: string; transaction_count: number; total_sales: number}[]>([]);
  const [unterminatedModalVisible, setUnterminatedModalVisible] = useState(false);

  // Check for active shift on mount
  useEffect(() => {
    checkActiveShift();
  }, [user?.id]);

  const checkActiveShift = async () => {
    if (!user?.id) return;
    setCheckingShift(true);
    try {
      const dbService = getDatabase();

      // Check if database is ready
      if (!dbService.isReady()) {
        console.warn('Database not ready, skipping shift check');
        setCheckingShift(false);
        return;
      }

      // First check for unterminated sessions from previous days
      const unterminated = await dbService.getUnterminatedSalesDates();
      if (unterminated.length > 0) {
        setUnterminatedSessions(unterminated);
        setUnterminatedModalVisible(true);
        setCheckingShift(false);
        return; // Don't check shift until unterminated sessions are resolved
      }

      const shift = await dbService.getCurrentShift(user.id);
      if (shift) {
        setCurrentShift({ id: shift.id, beginning_cash: shift.beginning_cash });
        setShiftDialogVisible(false);
      } else {
        setCurrentShift(null);
        // No active shift - show dialog to start shift
        setShiftDialogVisible(true);
      }
    } catch (error) {
      console.error('Error checking active shift:', error);
      // Allow sales even if shift check fails (fallback behavior)
      setShiftDialogVisible(false);
    } finally {
      setCheckingShift(false);
    }
  };

  const handleShiftStarted = (shiftId: number) => {
    setCurrentShift({ id: shiftId, beginning_cash: 0 });
    setShiftDialogVisible(false);
    // Refresh after shift start
    refreshProducts();
  };

  // Handle unterminated session actions
  const handleUnterminatedXReading = () => {
    setUnterminatedModalVisible(false);
    // Pass the oldest unterminated date for X-Reading view
    const oldestDate = unterminatedSessions.length > 0 ? unterminatedSessions[0].date : undefined;
    setXReadingTargetDate(oldestDate);
    setXReadingModalVisible(true);
  };

  const handleUnterminatedZReading = () => {
    setUnterminatedModalVisible(false);
    // Pass the oldest unterminated date to close that specific day
    const oldestDate = unterminatedSessions.length > 0 ? unterminatedSessions[0].date : undefined;
    navigation.navigate('EndOfDay', { targetDate: oldestDate });
  };

  // Load customers and settings
  useEffect(() => {
    loadCustomers();
    loadRequireCustomerSetting();
  }, []);

  // Refresh on focus and auto-focus search
  useFocusEffect(
    useCallback(() => {
      refreshProducts();
      // Re-check for unterminated sessions when returning to this screen
      checkActiveShift();
      // Reload setting in case it changed
      loadRequireCustomerSetting();
      // Auto-focus search field for barcode scanning
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }, [refreshProducts])
  );

  // Show/hide search dropdown based on query
  useEffect(() => {
    setShowSearchDropdown(searchQuery.length >= 1 && filteredProducts.length > 0);
  }, [searchQuery, filteredProducts.length]);

  const loadCustomers = async () => {
    try {
      const dbService = getDatabase();
      const customerList = await dbService.getCustomers(true);
      setCustomers(customerList);
    } catch (error) {
      console.error('Error loading customers:', error);
    }
  };

  const loadRequireCustomerSetting = async () => {
    try {
      const dbService = getDatabase();
      const val = await dbService.getSetting('require_customer_name');
      setRequireCustomerName(val === 'true');
    } catch (error) {
      console.error('Error loading require_customer_name setting:', error);
    }
  };

  // Filter customers for dropdown
  const filteredCustomers = customers.filter(c => {
    if (!customerSearch.trim()) return true;
    const search = customerSearch.toLowerCase();
    return (
      c.name?.toLowerCase().includes(search) ||
      c.phone?.toLowerCase().includes(search) ||
      c.code?.toLowerCase().includes(search)
    );
  });

  // Handle barcode scan / search submit
  const handleSearchSubmit = useCallback(() => {
    if (filteredProducts.length === 1) {
      // Exact match - add to cart
      addItem(filteredProducts[0]);
      setSearchQuery('');
      setShowSearchDropdown(false);
    } else if (filteredProducts.length > 1) {
      // Multiple matches - keep dropdown open
      setShowSearchDropdown(true);
    }
    // Keep focus for next scan
    searchInputRef.current?.focus();
  }, [filteredProducts, addItem, setSearchQuery]);

  // Handle product selection from dropdown
  const handleSelectFromDropdown = useCallback((product: Product) => {
    addItem(product);
    setSearchQuery('');
    setShowSearchDropdown(false);
    // Keep focus on search field for faster selling
    searchInputRef.current?.focus();
  }, [addItem, setSearchQuery]);

  // Handle product selection from browser
  const handleSelectFromBrowser = useCallback((product: Product) => {
    addItem(product);
    setBrowseVisible(false);
    // Re-focus for next scan
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, [addItem]);

  // Handle barcode scanned from camera
  const handleBarcodeScan = useCallback((barcode: string) => {
    console.log('Barcode scanned:', barcode);
    const currentProducts = productsRef.current;
    const barcodeUpper = barcode.toUpperCase().trim();

    // Try multiple matching strategies
    let product = currentProducts.find(p =>
      (p.code || '').toUpperCase().trim() === barcodeUpper
    );

    // Try with leading 0 added (UPC-A to EAN-13)
    if (!product) {
      const withLeadingZero = '0' + barcodeUpper;
      product = currentProducts.find(p =>
        (p.code || '').toUpperCase().trim() === withLeadingZero
      );
    }

    // Try with leading 0 removed
    if (!product && barcodeUpper.startsWith('0')) {
      const withoutLeadingZero = barcodeUpper.substring(1);
      product = currentProducts.find(p =>
        (p.code || '').toUpperCase().trim() === withoutLeadingZero
      );
    }

    console.log('Match found:', product ? product.name : 'NONE');
    if (product) {
      addItem(product);
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      Alert.alert('Product Not Found', `No product found with barcode "${barcode}".`);
    }
  }, [addItem, setSearchQuery]);

  // Handle checkout button
  const handleCheckout = useCallback(() => {
    if (cart.length === 0) return;
    setPaymentVisible(true);
  }, [cart.length]);

  // Process payment
  const handlePaymentComplete = useCallback(async (data: {
    paymentMethod: 'CASH' | 'CARD' | 'CHECK' | 'ONLINE' | 'CHARGE_INVOICE';
    amountTendered: number;
    customerId?: number;
    customerName?: string;
  }) => {
    if (!user) return;

    setIsProcessing(true);

    try {
      const dbService = getDatabase();
      const changeAmount = data.amountTendered - totals.total;

      const transactionData = {
        customer_id: data.customerId,
        customer_name: data.customerName,
        subtotal: totals.subtotal,
        tax_amount: totals.taxAmount,
        discount_amount: totals.discountAmount || 0,  // Save discount amount to database
        total_amount: totals.total,
        payment_method: data.paymentMethod,
        amount_tendered: data.paymentMethod === 'CHARGE_INVOICE' ? 0 : data.amountTendered,
        change_amount: data.paymentMethod === 'CHARGE_INVOICE' ? 0 : changeAmount,
        cashier_id: user.id,
        // BIR Compliance: SC/PWD discount info
        sc_pwd_id: discount.scPwdId,
        sc_pwd_name: discount.scPwdName,
        sc_pwd_type: discount.scPwdType,
        items: cart.map(item => ({
          product_id: item.id,
          product_code: item.code,
          product_name: item.name,
          quantity: item.quantity,
          unit_price: item.price,
          tax_amount: item.is_vat_inclusive
            ? (item.price * item.quantity) - ((item.price * item.quantity) / (1 + item.tax_rate / 100))
            : (item.price * item.quantity * item.tax_rate) / 100,
          total_amount: item.price * item.quantity,
          price_type: item.price_type,
          item_type: item.item_type,
        })),
      };

      const result = await dbService.createTransaction(transactionData);

      // Get store settings for receipt
      const storeName = await dbService.getSetting('company_name') || 'IgoroTech POS';
      const storeAddress = await dbService.getSetting('company_address') || '';
      const storePhone = await dbService.getSetting('store_phone') || '';
      const tin = await dbService.getSetting('company_tin') || '';
      const permitNumber = await dbService.getSetting('permit_number') || '';
      // BIR Compliance: Additional required fields
      const minNumber = await dbService.getSetting('min_number') || '';
      const ptuNumber = await dbService.getSetting('ptu_number') || '';
      const ptuDate = await dbService.getSetting('ptu_date') || '';
      const atpNumber = await dbService.getSetting('atp_number') || '';
      const atpDate = await dbService.getSetting('atp_date') || '';
      const accreditationNumber = await dbService.getSetting('accreditation_number') || '';
      const accreditationDate = await dbService.getSetting('accreditation_date') || '';
      const serialNumberFrom = await dbService.getSetting('serial_number_from') || '';
      const serialNumberTo = await dbService.getSetting('serial_number_to') || '';
      const supplierName = await dbService.getSetting('supplier_name') || '';
      const supplierAddress = await dbService.getSetting('supplier_address') || '';
      const supplierTin = await dbService.getSetting('supplier_tin') || '';
      const supplierAccreditation = await dbService.getSetting('supplier_accreditation') || '';

      // Prepare receipt data with BIR VAT breakdown
      const newReceiptData: ReceiptData = {
        businessName: storeName,
        businessAddress: storeAddress,
        businessPhone: storePhone,
        tin: tin,
        permitNumber: permitNumber,
        // BIR Compliance fields
        minNumber: minNumber,
        ptuNumber: ptuNumber,
        ptuDate: ptuDate,
        atpNumber: atpNumber,
        atpDate: atpDate,
        accreditationNumber: accreditationNumber,
        accreditationDate: accreditationDate,
        serialNumberFrom: serialNumberFrom,
        serialNumberTo: serialNumberTo,
        supplierName: supplierName,
        supplierAddress: supplierAddress,
        supplierTin: supplierTin,
        supplierAccreditation: supplierAccreditation,
        invoiceNumber: result.invoiceNumber,
        transactionDate: new Date(),
        cashierName: user.full_name || user.username,
        items: cart.map(item => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.price,
          totalPrice: item.price * item.quantity,
          item_type: item.item_type,
        })),
        hasReturnItems: totals.returnItemCount > 0,
        saleSubtotal: totals.saleSubtotal,
        returnSubtotal: totals.returnSubtotal,
        subtotal: totals.grossTotal || 0,  // Use gross total (sum of item prices)
        taxAmount: totals.taxAmount || 0,
        discountAmount: totals.discountAmount || 0,
        discountLabel: discount.isSeniorCitizen ? 'SC/PWD Discount' : 'Discount',
        total: totals.total || 0,
        // BIR VAT Breakdown
        vatableSales: totals.vatableSales || 0,
        vatExemptSales: totals.vatExemptSales || 0,
        zeroRatedSales: totals.zeroRatedSales || 0,
        vatAmount: totals.vatAmount || 0,
        // BIR Compliance: SC/PWD info for receipt
        scPwdId: discount.scPwdId,
        scPwdName: discount.scPwdName,
        scPwdType: discount.scPwdType,
        paymentMethod: data.paymentMethod,
        amountTendered: data.paymentMethod === 'CHARGE_INVOICE' ? 0 : data.amountTendered,
        changeAmount: data.paymentMethod === 'CHARGE_INVOICE' ? 0 : changeAmount,
        customerName: data.customerName,
      };

      setReceiptData(newReceiptData);
      setLastReceiptData(newReceiptData);  // Store for reprint
      setPaymentVisible(false);
      setReceiptVisible(true);

      // Save return items before clearing cart (needed for damage prompt)
      const returnItems = totals.returnItemCount > 0
        ? cart.filter(item => item.item_type === 'return')
        : [];

      // Clear cart and reset state immediately after successful transaction
      // This ensures everything is reset even if receipt modal is dismissed unexpectedly
      clearCart();
      refreshProducts();
      setTransactionType('CASH');
      setSelectedCustomer(null);
      setShowCustomerDropdown(false);
      setCustomerSearch('');

      // Check if we should prompt for damage on return items
      if (returnItems.length > 0) {
        const askDmg = await dbService.getSetting('ask_damage_on_return');
        if (askDmg === 'true') {
          const returnNames = returnItems.map(item => `${item.name} x${item.quantity}`).join('\n');
          Alert.alert(
            'Record Returned Items as Damaged?',
            `The following items were returned:\n\n${returnNames}\n\nShould these be recorded as damaged (stock will be deducted)?`,
            [
              { text: 'No', style: 'cancel' },
              {
                text: 'Yes, Record as Damaged',
                onPress: async () => {
                  try {
                    const session = await dbService.createDamageSession({
                      session_name: `Auto-Return-${result.invoiceNumber}`,
                      notes: `Auto-damage from return transaction ${result.invoiceNumber}`,
                      started_by: user.id,
                    });
                    for (const item of returnItems) {
                      await dbService.addDamagedItem({
                        session_id: session.sessionId,
                        product_id: item.id,
                        damaged_quantity: item.quantity,
                        damage_reason: 'DEFECTIVE',
                        damage_description: `Auto-recorded from return (BO) - Invoice ${result.invoiceNumber}`,
                        recorded_by: user.id,
                      });
                    }
                    refreshProducts();
                  } catch (dmgError) {
                    console.error('Error recording damage for returns:', dmgError);
                    Alert.alert('Warning', 'Failed to record damaged items. Please record manually in Damaged Items.');
                  }
                },
              },
            ]
          );
        }
      }
    } catch (error) {
      console.error('Transaction error:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [user, cart, totals, discount]);

  // Print receipt
  const handlePrintReceipt = async () => {
    if (!receiptData) {
      Alert.alert('Print Error', 'No receipt data available.');
      return;
    }

    if (!printerService.isConnected()) {
      Alert.alert(
        'Printer Not Connected',
        'No printer is connected. Would you like to set up a printer?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Setup Printer', onPress: () => navigation.navigate('PrinterSettings') },
        ]
      );
      return;
    }

    try {
      setIsPrinting(true);
      const settings = printerService.getSettings();
      const printerWidth = settings.printerWidth || PRINTER_WIDTH.MM_58;
      const receiptBuilder = buildReceipt(receiptData, printerWidth);
      await printerService.print(receiptBuilder);
      Alert.alert('Success', 'Receipt printed successfully.');
    } catch (error: any) {
      console.error('Print error:', error);
      Alert.alert('Print Failed', error?.message || 'Failed to print receipt. Please check printer connection and try again.');
    } finally {
      setIsPrinting(false);
    }
  };

  // Email/Share PDF receipt
  const handleEmailReceipt = async () => {
    if (!receiptData) return;

    try {
      setIsPrinting(true);
      await generateReceiptPdf(receiptData);
    } catch (error: any) {
      console.error('Email receipt error:', error);
      Alert.alert('Error', error?.message || 'Failed to generate PDF receipt.');
    } finally {
      setIsPrinting(false);
    }
  };

  // Close receipt and reset
  const handleCloseReceipt = useCallback(() => {
    setReceiptVisible(false);
    setReceiptData(null);
    clearCart();
    refreshProducts();
    // Reset transaction type and customer for next sale
    setTransactionType('CASH');
    setSelectedCustomer(null);
    setShowCustomerDropdown(false);
    setCustomerSearch('');
    // Re-focus for next customer
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, [clearCart, refreshProducts]);

  // Handle reprint from transaction history
  const handleReprintTransaction = useCallback(async (transactionId: number) => {
    try {
      const dbService = getDatabase();

      // Get transaction details
      const transaction = await dbService.getTransactionById(transactionId);
      if (!transaction) {
        Alert.alert('Error', 'Transaction not found.');
        return;
      }

      // Get transaction items
      const items = await dbService.getTransactionItems(transactionId);

      // Get store settings
      const storeName = await dbService.getSetting('company_name') || 'IgoroTech POS';
      const storeAddress = await dbService.getSetting('company_address') || '';
      const storePhone = await dbService.getSetting('store_phone') || '';
      const tin = await dbService.getSetting('company_tin') || '';
      const permitNumber = await dbService.getSetting('permit_number') || '';
      const minNumber = await dbService.getSetting('min_number') || '';
      const ptuNumber = await dbService.getSetting('ptu_number') || '';
      const ptuDate = await dbService.getSetting('ptu_date') || '';
      const atpNumber = await dbService.getSetting('atp_number') || '';
      const atpDate = await dbService.getSetting('atp_date') || '';
      const accreditationNumber = await dbService.getSetting('accreditation_number') || '';
      const accreditationDate = await dbService.getSetting('accreditation_date') || '';
      const serialNumberFrom = await dbService.getSetting('serial_number_from') || '';
      const serialNumberTo = await dbService.getSetting('serial_number_to') || '';
      const supplierName = await dbService.getSetting('supplier_name') || '';
      const supplierAddress = await dbService.getSetting('supplier_address') || '';
      const supplierTin = await dbService.getSetting('supplier_tin') || '';
      const supplierAccreditation = await dbService.getSetting('supplier_accreditation') || '';

      // Build receipt data
      const reprintReceiptData: ReceiptData = {
        businessName: storeName,
        businessAddress: storeAddress,
        businessPhone: storePhone,
        tin: tin,
        permitNumber: permitNumber,
        minNumber: minNumber,
        ptuNumber: ptuNumber,
        ptuDate: ptuDate,
        atpNumber: atpNumber,
        atpDate: atpDate,
        accreditationNumber: accreditationNumber,
        accreditationDate: accreditationDate,
        serialNumberFrom: serialNumberFrom,
        serialNumberTo: serialNumberTo,
        supplierName: supplierName,
        supplierAddress: supplierAddress,
        supplierTin: supplierTin,
        supplierAccreditation: supplierAccreditation,
        invoiceNumber: transaction.invoice_number,
        transactionDate: new Date(transaction.transaction_date),
        cashierName: transaction.cashier_name || 'Cashier',
        items: items.map((item: any) => ({
          name: item.product_name,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          totalPrice: item.total_amount,
          item_type: item.item_type || 'sale',
        })),
        hasReturnItems: items.some((item: any) => item.item_type === 'return'),
        saleSubtotal: items.filter((item: any) => item.item_type !== 'return').reduce((sum: number, item: any) => sum + (item.total_amount || 0), 0),
        returnSubtotal: items.filter((item: any) => item.item_type === 'return').reduce((sum: number, item: any) => sum + (item.total_amount || 0), 0),
        subtotal: transaction.subtotal || 0,
        taxAmount: transaction.tax_amount || 0,
        discountAmount: transaction.discount_amount || 0,
        discountLabel: transaction.sc_pwd_id ? 'SC/PWD Discount' : 'Discount',
        total: transaction.total_amount || 0,
        vatableSales: transaction.vatable_sales || 0,
        vatExemptSales: transaction.vat_exempt_sales || 0,
        zeroRatedSales: transaction.zero_rated_sales || 0,
        vatAmount: transaction.vat_amount || 0,
        scPwdId: transaction.sc_pwd_id,
        scPwdName: transaction.sc_pwd_name,
        scPwdType: transaction.sc_pwd_type,
        paymentMethod: transaction.payment_method,
        amountTendered: transaction.amount_tendered || 0,
        changeAmount: transaction.change_amount || 0,
        customerName: transaction.customer_name || transaction.customer_full_name,
      };

      setReceiptData(reprintReceiptData);
      setReceiptVisible(true);
    } catch (error) {
      console.error('Error loading transaction for reprint:', error);
      Alert.alert('Error', 'Failed to load transaction details.');
    }
  }, []);

  // Handle quantity press (manual input)
  const handleQuantityPress = useCallback((item: CartItem) => {
    setSelectedItemForQty(item);
    setQuantityModalVisible(true);
  }, []);

  // Handle quantity confirm from modal
  const handleQuantityConfirm = useCallback((productId: number, quantity: number) => {
    updateQuantity(productId, quantity);
    setQuantityModalVisible(false);
    setSelectedItemForQty(null);
  }, [updateQuantity]);

  // Render cart item
  const renderCartItem = useCallback(({ item, index }: { item: any; index: number }) => (
    <POSCartItem
      item={item}
      index={index + 1}
      onIncrement={incrementQuantity}
      onDecrement={decrementQuantity}
      onRemove={removeItem}
      onQuantityPress={handleQuantityPress}
    />
  ), [incrementQuantity, decrementQuantity, removeItem, handleQuantityPress]);

  return (
    <View style={[styles.container, { backgroundColor: '#F5F5F5' }]}>
      {canSplit ? (
        /* ===== LANDSCAPE TWO-COLUMN LAYOUT ===== */
        <View style={styles.landscapeRow}>
          {/* LEFT PANEL: Product Browser */}
          <View style={[styles.landscapeLeftPanel, { width: leftPanelWidth }]}>
            <POSProductBrowserContent
              products={products}
              categories={categories}
              onSelect={handleSelectFromDropdown}
              getCartQuantity={getItemQuantity}
              containerWidth={leftPanelWidth}
            />
          </View>

          {/* RIGHT PANEL: Search + Cart + Checkout */}
          <View style={[styles.landscapeRightPanel, { width: rightPanelWidth }]}>
            {/* Search Bar */}
            <View style={[styles.searchSection, rs.searchSection]}>
              <View style={styles.priceTypeRow}>
                <Text style={[styles.priceTypeLabel, rs.priceTypeLabel]}>Price Type:</Text>
                <View style={styles.priceTypeButtons}>
                  <TouchableOpacity
                    style={[styles.priceTypeButton, rs.priceTypeButton, priceType === 'retail' && styles.priceTypeButtonActive]}
                    onPress={() => setPriceType('retail')}
                  >
                    <Text style={[styles.priceTypeButtonText, rs.priceTypeButtonText, priceType === 'retail' && styles.priceTypeButtonTextActive]}>Retail</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.priceTypeButton, rs.priceTypeButton, priceType === 'wholesale' && styles.priceTypeButtonActive]}
                    onPress={() => setPriceType('wholesale')}
                  >
                    <Text style={[styles.priceTypeButtonText, rs.priceTypeButtonText, priceType === 'wholesale' && styles.priceTypeButtonTextActive]}>Wholesale</Text>
                  </TouchableOpacity>
                </View>
                <View style={[styles.priceTypeButtons, { marginLeft: 12 }]}>
                  <TouchableOpacity
                    style={[styles.priceTypeButton, rs.priceTypeButton, itemMode === 'sale' && styles.priceTypeButtonActive]}
                    onPress={() => setItemMode('sale')}
                  >
                    <Text style={[styles.priceTypeButtonText, rs.priceTypeButtonText, itemMode === 'sale' && styles.priceTypeButtonTextActive]}>Sale</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.priceTypeButton, rs.priceTypeButton, itemMode === 'return' && styles.returnModeButtonActive]}
                    onPress={() => setItemMode('return')}
                  >
                    <Text style={[styles.priceTypeButtonText, rs.priceTypeButtonText, itemMode === 'return' && styles.returnModeButtonTextActive]}>Return</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.searchRow}>
                <View style={styles.searchInputWrapper}>
                  <TextInput
                    ref={searchInputRef}
                    placeholder="Scan barcode or search..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    onSubmitEditing={handleSearchSubmit}
                    mode="outlined"
                    style={styles.searchInput}
                    dense
                    left={<TextInput.Icon icon="magnify" />}
                    right={searchQuery ? (
                      <TextInput.Icon icon="close" onPress={() => { setSearchQuery(''); setShowSearchDropdown(false); }} />
                    ) : null}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                  />
                  <POSSearchDropdown
                    products={filteredProducts.slice(0, 10)}
                    visible={showSearchDropdown}
                    onSelect={handleSelectFromDropdown}
                    searchQuery={searchQuery}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.actionButton, rs.actionButton]}
                  onPress={() => navigation.navigate('BarcodeScanner', { onScan: handleBarcodeScan })}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.actionButtonIcon, rs.actionButtonIcon]}>📷</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.menuButton, rs.actionButton]}
                  onPress={() => setHamburgerMenuVisible(true)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.actionButtonIcon, rs.actionButtonIcon]}>☰</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Cart */}
            <View style={styles.cartSection}>
              <View style={[styles.cartHeader, rs.cartHeader]}>
                <Text style={[styles.cartTitle, rs.cartTitle]}>🛒 Cart</Text>
                <Text style={[styles.cartCount, rs.cartCount]}>
                  {cart.length} item{cart.length !== 1 ? 's' : ''}
                </Text>
                {cart.length > 0 && (
                  <TouchableOpacity onPress={clearCart} style={styles.clearButton}>
                    <Text style={[styles.clearButtonText, rs.clearButtonText]}>Clear All</Text>
                  </TouchableOpacity>
                )}
              </View>
              <FlatList
                ref={cartListRef}
                data={cart}
                keyExtractor={item => getCartKey(item)}
                renderItem={renderCartItem}
                style={styles.cartList}
                contentContainerStyle={[styles.cartListContent, rs.cartListContent]}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={[styles.emptyCart, rs.emptyCartPadding]}>
                    <Text style={[styles.emptyCartIcon, rs.emptyCartIcon]}>🛒</Text>
                    <Text style={[styles.emptyCartTitle, rs.emptyCartTitle]}>Cart is empty</Text>
                    <Text style={[styles.emptyCartSubtitle, rs.emptyCartSubtitle]}>
                      Tap a product on the left to add
                    </Text>
                  </View>
                }
              />
            </View>

            {/* Totals + Checkout */}
            <View style={[styles.checkoutSection, rs.checkoutSection]}>
              <View style={styles.totalsContainer}>
                {(totals.discountAmount || 0) > 0 && (
                  <>
                    <View style={styles.totalRow}>
                      <Text style={[styles.totalLabel, rs.totalLabel]}>Sub-Total</Text>
                      <Text style={[styles.totalValue, rs.totalValue]}>₱{(totals.grossTotal || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                    </View>
                    <View style={styles.totalRow}>
                      <Text style={[styles.totalLabel, rs.totalLabel]}>Discount</Text>
                      <Text style={[styles.totalValue, rs.totalValue, { color: '#F44336' }]}>
                        -₱{(totals.discountAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                  </>
                )}
                <View style={[styles.totalRow, (totals.discountAmount || 0) > 0 && styles.grandTotalRow]}>
                  <Text style={[styles.grandTotalLabel, rs.grandTotalLabel]}>TOTAL</Text>
                  <Text style={[styles.grandTotalValue, rs.grandTotalValue]}>₱{(totals.total || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[
                  styles.checkoutButton,
                  rs.checkoutButton,
                  { marginTop: sp.xs },
                  cart.length === 0 && styles.checkoutButtonDisabled,
                ]}
                onPress={handleCheckout}
                disabled={cart.length === 0 || isProcessing}
                activeOpacity={0.8}
              >
                <Text style={[styles.checkoutButtonText, rs.checkoutButtonText]}>
                  💳 CHECKOUT ₱{(totals.total || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : (
        /* ===== PORTRAIT SINGLE-COLUMN LAYOUT (unchanged) ===== */
        <>
          {/* Search Bar */}
          <View style={[styles.searchSection, rs.searchSection]}>
            <View style={styles.priceTypeRow}>
              <Text style={[styles.priceTypeLabel, rs.priceTypeLabel]}>Price Type:</Text>
              <View style={styles.priceTypeButtons}>
                <TouchableOpacity
                  style={[
                    styles.priceTypeButton,
                    rs.priceTypeButton,
                    priceType === 'retail' && styles.priceTypeButtonActive
                  ]}
                  onPress={() => setPriceType('retail')}
                >
                  <Text style={[
                    styles.priceTypeButtonText,
                    rs.priceTypeButtonText,
                    priceType === 'retail' && styles.priceTypeButtonTextActive
                  ]}>Retail</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.priceTypeButton,
                    rs.priceTypeButton,
                    priceType === 'wholesale' && styles.priceTypeButtonActive
                  ]}
                  onPress={() => setPriceType('wholesale')}
                >
                  <Text style={[
                    styles.priceTypeButtonText,
                    rs.priceTypeButtonText,
                    priceType === 'wholesale' && styles.priceTypeButtonTextActive
                  ]}>Wholesale</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.priceTypeButtons, { marginLeft: 12 }]}>
                <TouchableOpacity
                  style={[
                    styles.priceTypeButton,
                    rs.priceTypeButton,
                    itemMode === 'sale' && styles.priceTypeButtonActive
                  ]}
                  onPress={() => setItemMode('sale')}
                >
                  <Text style={[
                    styles.priceTypeButtonText,
                    rs.priceTypeButtonText,
                    itemMode === 'sale' && styles.priceTypeButtonTextActive
                  ]}>Sale</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.priceTypeButton,
                    rs.priceTypeButton,
                    itemMode === 'return' && styles.returnModeButtonActive
                  ]}
                  onPress={() => setItemMode('return')}
                >
                  <Text style={[
                    styles.priceTypeButtonText,
                    rs.priceTypeButtonText,
                    itemMode === 'return' && styles.returnModeButtonTextActive
                  ]}>Return</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.searchRow}>
              <View style={styles.searchInputWrapper}>
                <TextInput
                  ref={searchInputRef}
                  placeholder="Scan barcode or search..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onSubmitEditing={handleSearchSubmit}
                  mode="outlined"
                  style={styles.searchInput}
                  dense
                  left={<TextInput.Icon icon="magnify" />}
                  right={searchQuery ? (
                    <TextInput.Icon
                      icon="close"
                      onPress={() => {
                        setSearchQuery('');
                        setShowSearchDropdown(false);
                      }}
                    />
                  ) : null}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                />
                <POSSearchDropdown
                  products={filteredProducts.slice(0, 10)}
                  visible={showSearchDropdown}
                  onSelect={handleSelectFromDropdown}
                  searchQuery={searchQuery}
                />
              </View>
              <TouchableOpacity
                style={[styles.actionButton, rs.actionButton]}
                onPress={() => navigation.navigate('BarcodeScanner', { onScan: handleBarcodeScan })}
                activeOpacity={0.7}
              >
                <Text style={[styles.actionButtonIcon, rs.actionButtonIcon]}>📷</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.browseButton, rs.actionButton]}
                onPress={() => setBrowseVisible(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.actionButtonIcon, rs.actionButtonIcon]}>📦</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.menuButton, rs.actionButton]}
                onPress={() => setHamburgerMenuVisible(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.actionButtonIcon, rs.actionButtonIcon]}>☰</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Cart */}
          <View style={styles.cartSection}>
            <View style={[styles.cartHeader, rs.cartHeader]}>
              <Text style={[styles.cartTitle, rs.cartTitle]}>🛒 Cart</Text>
              <Text style={[styles.cartCount, rs.cartCount]}>
                {cart.length} item{cart.length !== 1 ? 's' : ''}
              </Text>
              {cart.length > 0 && (
                <TouchableOpacity onPress={clearCart} style={styles.clearButton}>
                  <Text style={[styles.clearButtonText, rs.clearButtonText]}>Clear All</Text>
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              ref={cartListRef}
              data={cart}
              keyExtractor={item => item.id.toString()}
              renderItem={renderCartItem}
              style={styles.cartList}
              contentContainerStyle={[styles.cartListContent, rs.cartListContent]}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={[styles.emptyCart, rs.emptyCartPadding]}>
                  <Text style={[styles.emptyCartIcon, rs.emptyCartIcon]}>🛒</Text>
                  <Text style={[styles.emptyCartTitle, rs.emptyCartTitle]}>Cart is empty</Text>
                  <Text style={[styles.emptyCartSubtitle, rs.emptyCartSubtitle]}>
                    Scan a barcode or search for products
                  </Text>
                </View>
              }
            />
          </View>

          {/* Totals + Checkout */}
          <View style={[styles.checkoutSection, rs.checkoutSection]}>
            <View style={styles.totalsContainer}>
              {(totals.discountAmount || 0) > 0 && (
                <>
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, rs.totalLabel]}>Sub-Total</Text>
                    <Text style={[styles.totalValue, rs.totalValue]}>₱{(totals.grossTotal || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                  </View>
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, rs.totalLabel]}>Discount</Text>
                    <Text style={[styles.totalValue, rs.totalValue, { color: '#F44336' }]}>
                      -₱{(totals.discountAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                </>
              )}
              <View style={[styles.totalRow, (totals.discountAmount || 0) > 0 && styles.grandTotalRow]}>
                <Text style={[styles.grandTotalLabel, rs.grandTotalLabel]}>TOTAL</Text>
                <Text style={[styles.grandTotalValue, rs.grandTotalValue]}>₱{(totals.total || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[
                styles.checkoutButton,
                rs.checkoutButton,
                { marginTop: sp.xs },
                cart.length === 0 && styles.checkoutButtonDisabled,
              ]}
              onPress={handleCheckout}
              disabled={cart.length === 0 || isProcessing}
              activeOpacity={0.8}
            >
              <Text style={[styles.checkoutButtonText, rs.checkoutButtonText]}>
                💳 CHECKOUT ₱{(totals.total || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ===== MODALS ===== */}

      {/* Product Browser Modal */}
      <POSProductBrowser
        visible={browseVisible}
        products={products}
        categories={categories}
        onSelect={handleSelectFromBrowser}
        onClose={() => setBrowseVisible(false)}
        getCartQuantity={getItemQuantity}
      />

      {/* Payment Modal */}
      <POSPaymentModal
        visible={paymentVisible}
        totals={totals}
        discount={discount}
        customers={customers}
        onClose={() => setPaymentVisible(false)}
        onComplete={handlePaymentComplete}
        onQuickAddCustomer={() => {
          setQuickCustomerModalVisible(true);
        }}
        onOpenSeniorDiscount={() => {
          setSeniorDiscountModalVisible(true);
        }}
        onOpenDiscount={() => {
          setDiscountModalVisible(true);
        }}
        loading={isProcessing}
        initialPaymentMethod="CASH"
        initialCustomer={null}
        requireCustomerName={requireCustomerName}
      />

      {/* Discount Modal */}
      <POSDiscountModal
        visible={discountModalVisible}
        subtotal={totals.subtotal + totals.taxAmount}
        currentType={discount.type}
        currentValue={discount.value}
        onApply={(type, value) => {
          clearSeniorDiscount();  // Clear SC discount first
          setDiscountType(type);
          setDiscountValue(value);
        }}
        onClear={() => {
          setDiscountType('none');
          setDiscountValue('');
        }}
        onClose={() => setDiscountModalVisible(false)}
      />

      {/* Quantity Modal */}
      <POSQuantityModal
        visible={quantityModalVisible}
        item={selectedItemForQty}
        onConfirm={handleQuantityConfirm}
        onClose={() => {
          setQuantityModalVisible(false);
          setSelectedItemForQty(null);
        }}
      />

      {/* Senior Discount Modal */}
      <POSSeniorDiscountModal
        visible={seniorDiscountModalVisible}
        subtotal={totals.subtotal}
        vatAmount={totals.vatAmount}
        currentTotalCustomers={discount.totalCustomers}
        currentSeniorCount={discount.seniorCount}
        isSeniorApplied={discount.isSeniorCitizen}
        currentScPwdInfo={discount.scPwdId ? { id: discount.scPwdId, name: discount.scPwdName || '', type: discount.scPwdType || 'SENIOR' } : undefined}
        onApply={(totalCustomers, seniorCount, scPwdInfo) => {
          setDiscountType('none');  // Clear regular discount first
          setDiscountValue('');
          setSeniorDiscount(totalCustomers, seniorCount, scPwdInfo);
        }}
        onClear={clearSeniorDiscount}
        onClose={() => setSeniorDiscountModalVisible(false)}
      />

      {/* Receipt Modal */}
      <Modal
        visible={receiptVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCloseReceipt}
      >
        <View style={styles.receiptOverlay}>
          <View style={[styles.receiptContainer, { maxWidth: lo.modalMaxWidth, padding: sp.md }]}>
            <View style={styles.receiptHeader}>
              <Text style={[styles.receiptTitle, { fontSize: fs.h3 }]}>Transaction Complete</Text>
              <IconButton icon="close" size={24} onPress={handleCloseReceipt} />
            </View>

            {receiptData && (
              <ReceiptPreview
                data={receiptData}
                width={printerService.getSettings().printerWidth === PRINTER_WIDTH.MM_80 ? '80mm' : '58mm'}
                onPrint={handlePrintReceipt}
                onEmail={handleEmailReceipt}
                onClose={handleCloseReceipt}
                isPrinting={isPrinting}
                showActions={true}
              />
            )}

            <View style={styles.receiptFooter}>
              <Text style={styles.receiptFooterText}>
                Tap "New Sale" to start another transaction
              </Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* Hamburger Menu */}
      <POSHamburgerMenu
        visible={hamburgerMenuVisible}
        onClose={() => setHamburgerMenuVisible(false)}
        hasLastTransaction={lastReceiptData !== null}
        onReprint={() => {
          if (lastReceiptData) {
            setReceiptData(lastReceiptData);
            setReceiptVisible(true);
          }
        }}
        onReprintHistory={() => {
          setHamburgerMenuVisible(false);
          setReprintModalVisible(true);
        }}
        onXReading={() => {
          setHamburgerMenuVisible(false);
          setXReadingModalVisible(true);
        }}
        onZReading={() => {
          setHamburgerMenuVisible(false);
          navigation.navigate('EndOfDay');
        }}
        onCashFund={() => {
          setHamburgerMenuVisible(false);
          setCashFundModalVisible(true);
        }}
        onPettyCash={() => {
          setHamburgerMenuVisible(false);
          setPettyCashModalVisible(true);
        }}
        onRefund={() => {
          setHamburgerMenuVisible(false);
          navigation.navigate('Refund', { cashierId: user?.id || 0 });
        }}
        onExchange={() => {
          setHamburgerMenuVisible(false);
          navigation.navigate('Exchange', { cashierId: user?.id || 0 });
        }}
        onVoid={() => {
          setHamburgerMenuVisible(false);
          setVoidModalVisible(true);
        }}
        onQuickAddCustomer={() => {
          setHamburgerMenuVisible(false);
          setQuickCustomerModalVisible(true);
        }}
      />

      {/* Cash Fund Modal */}
      <POSCashFundModal
        visible={cashFundModalVisible}
        onClose={() => setCashFundModalVisible(false)}
        onSuccess={() => {}}
        cashierId={user?.id || 0}
        cashierName={user?.full_name || 'Cashier'}
      />

      {/* Petty Cash Modal */}
      <POSPettyCashModal
        visible={pettyCashModalVisible}
        onClose={() => setPettyCashModalVisible(false)}
        onSuccess={() => {}}
        cashierId={user?.id || 0}
        cashierName={user?.full_name || 'Cashier'}
      />

      {/* X-Reading Modal */}
      <POSXReadingModal
        visible={xReadingModalVisible}
        onClose={() => {
          setXReadingModalVisible(false);
          setXReadingTargetDate(undefined);  // Clear target date when closing
        }}
        cashierId={user?.id || 0}
        targetDate={xReadingTargetDate}
      />

      {/* Void Transaction Modal */}
      <POSVoidModal
        visible={voidModalVisible}
        onClose={() => setVoidModalVisible(false)}
        onSuccess={() => {
          setVoidModalVisible(false);
          refreshProducts();
        }}
        cashierId={user?.id || 0}
      />

      {/* Quick Add Customer Modal */}
      <POSQuickCustomerModal
        visible={quickCustomerModalVisible}
        onClose={() => setQuickCustomerModalVisible(false)}
        onCustomerCreated={(customer) => {
          setQuickCustomerModalVisible(false);
          loadCustomers();
          // If credit sale, auto-select the newly created customer
          if (transactionType === 'CREDIT' && customer) {
            setSelectedCustomer(customer);
            setShowCustomerDropdown(false);
          }
        }}
        userId={user?.id || 0}
      />

      {/* Reprint Receipt Modal */}
      <POSReprintModal
        visible={reprintModalVisible}
        onClose={() => setReprintModalVisible(false)}
        onSelectTransaction={handleReprintTransaction}
      />

      {/* Unterminated Session Modal - Must close previous day's session */}
      <POSUnterminatedSessionModal
        visible={unterminatedModalVisible}
        sessions={unterminatedSessions}
        onDoXReading={handleUnterminatedXReading}
        onDoZReading={handleUnterminatedZReading}
      />

      {/* Start Shift Dialog - Required before sales can be made */}
      <StartShiftDialog
        visible={shiftDialogVisible && !checkingShift && !unterminatedModalVisible}
        userId={user?.id || 0}
        onShiftStarted={handleShiftStarted}
        onCancel={() => {
          setShiftDialogVisible(false);
          // Navigate back to Dashboard when user cancels
          navigation.navigate('Dashboard');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Landscape two-column
  landscapeRow: {
    flex: 1,
    flexDirection: 'row',
  },
  landscapeLeftPanel: {
    flex: 0,
    borderRightWidth: 1,
    borderRightColor: '#E0E0E0',
  },
  landscapeRightPanel: {
    flex: 1,
  },

  // Search Section
  searchSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  priceTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  priceTypeLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginRight: 10,
  },
  priceTypeButtons: {
    flexDirection: 'row',
    flex: 1,
  },
  priceTypeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  priceTypeButtonActive: {
    backgroundColor: '#1976D2',
    borderColor: '#1976D2',
  },
  priceTypeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  priceTypeButtonTextActive: {
    color: '#FFFFFF',
  },
  returnModeButtonActive: {
    backgroundColor: '#D32F2F',
    borderColor: '#D32F2F',
  },
  returnModeButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInputWrapper: {
    flex: 1,
    marginRight: 8,
    position: 'relative',
    zIndex: 1000,
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    fontSize: 13,
  },
  actionButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  browseButton: {
    backgroundColor: '#FFF3E0',
  },
  menuButton: {
    backgroundColor: '#F3E5F5',
  },
  actionButtonIcon: {
    fontSize: 22,
  },

  // Cart Section
  cartSection: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  cartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  cartTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
  },
  cartCount: {
    fontSize: 14,
    color: '#616161',
    marginLeft: 12,
    flex: 1,
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FFEBEE',
  },
  clearButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F44336',
  },
  cartList: {
    flex: 1,
  },
  cartListContent: {
    padding: 8,
    paddingBottom: 8,
  },
  emptyCart: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyCartIcon: {
    fontSize: 64,
    marginBottom: 16,
    opacity: 0.5,
  },
  emptyCartTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#616161',
    marginBottom: 8,
  },
  emptyCartSubtitle: {
    fontSize: 14,
    color: '#9E9E9E',
    textAlign: 'center',
  },

  // Checkout Section
  checkoutSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 48,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  discountRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  discountButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    marginRight: 8,
    alignItems: 'center',
  },
  discountButtonActive: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  discountButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#616161',
  },
  discountButtonTextActive: {
    color: '#2E7D32',
  },
  discountButtonDisabled: {
    backgroundColor: '#E0E0E0',
    opacity: 0.6,
  },
  discountButtonTextDisabled: {
    color: '#9E9E9E',
  },
  totalsContainer: {
    marginBottom: 2,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  totalLabel: {
    fontSize: 14,
    color: '#616161',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#212121',
  },
  grandTotalRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  grandTotalLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
  },
  grandTotalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2E7D32',
  },
  checkoutButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  checkoutButtonDisabled: {
    backgroundColor: '#BDBDBD',
  },
  checkoutButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Receipt Modal
  receiptOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  receiptContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    maxHeight: '95%',
    elevation: 8,
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  receiptTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4CAF50',
  },
  receiptFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    alignItems: 'center',
  },
  receiptFooterText: {
    fontSize: 14,
    color: '#616161',
  },

  // Transaction Type Selector
  transactionTypeRow: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
  },
  transactionTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  transactionTypeButtonActive: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  transactionTypeCreditActive: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FF9800',
  },
  transactionTypeIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  transactionTypeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#616161',
  },
  transactionTypeTextActive: {
    color: '#2E7D32',
  },
  transactionTypeCreditTextActive: {
    color: '#E65100',
  },

  // Customer Selection
  customerSelectionSection: {
    marginBottom: 12,
  },
  selectCustomerBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF9800',
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  selectCustomerBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E65100',
  },
  selectedCustomerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  selectedCustomerInfo: {
    flex: 1,
  },
  selectedCustomerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D32',
  },
  selectedCustomerBalance: {
    fontSize: 12,
    color: '#F44336',
    marginTop: 2,
  },
  changeCustomerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FFEBEE',
    borderRadius: 6,
  },
  changeCustomerBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F44336',
  },
  customerDropdown: {
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  customerDropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  customerSearchInput: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 6,
    fontSize: 14,
  },
  quickAddCustomerBtn: {
    marginLeft: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#E3F2FD',
    borderRadius: 6,
  },
  quickAddCustomerBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1976D2',
  },
  closeCustomerDropdownBtn: {
    marginLeft: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  closeCustomerDropdownBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9E9E9E',
  },
  customerDropdownList: {
    maxHeight: 150,
  },
  customerDropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  customerDropdownName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#212121',
  },
  customerDropdownBalance: {
    fontSize: 12,
    fontWeight: '500',
    color: '#F44336',
  },
  noCustomersText: {
    textAlign: 'center',
    paddingVertical: 16,
    color: '#9E9E9E',
    fontSize: 14,
  },
});
