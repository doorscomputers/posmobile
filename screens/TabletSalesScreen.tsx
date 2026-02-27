/**
 * TabletSalesScreen - Landscape-optimized two-panel POS terminal
 *
 * Left panel: Cart items with search bar
 * Right panel: Inline payment, discounts, customer, totals
 * Designed for tablet landscape use
 */

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
  ScrollView,
} from 'react-native';
import { TextInput, useTheme, IconButton, Text } from 'react-native-paper';
import { StackNavigationProp } from '@react-navigation/stack';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RootStackParamList } from '../App';
import { getDatabase } from '../database/getDatabase';
import { useAuth } from '../contexts/AuthContext';
import { useAppTheme } from '../contexts/ThemeContext';
import { Product } from '../database/schema';

// POS Components
import {
  POSCartItem,
  POSSearchDropdown,
  POSProductBrowser,
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
import StartShiftDialog from '../components/StartShiftDialog';
import { CartItem, getCartKey } from '../hooks/usePOSCart';
import ReceiptPreview, { ReceiptData } from '../components/ReceiptPreview';
import BluetoothPrinterService from '../utils/BluetoothPrinterService';
import { buildReceipt, PRINTER_WIDTH } from '../utils/escpos';
import { generateReceiptPdf } from '../utils/ReceiptPdfService';

// Custom hooks
import { usePOSCart } from '../hooks/usePOSCart';
import { usePOSProducts } from '../hooks/usePOSProducts';

type PaymentMethod = 'CASH' | 'CARD' | 'CHECK' | 'ONLINE' | 'CHARGE_INVOICE';

const formatCurrency = (amount: number): string => {
  return amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

type TabletSalesScreenNavigationProp = StackNavigationProp<RootStackParamList, 'TabletSales'>;

interface Props {
  navigation: TabletSalesScreenNavigationProp;
}

export default function TabletSalesScreen({ navigation }: Props) {
  const { user } = useAuth();
  const theme = useTheme();
  const { colors } = useAppTheme();
  const printerService = BluetoothPrinterService.getInstance();

  const searchInputRef = useRef<RNTextInput>(null);
  const productsRef = useRef<Product[]>([]);
  const cartListRef = useRef<FlatList>(null);
  const prevCartLengthRef = useRef(0);

  // ===== HOOKS =====
  const {
    cart, totals, discount, priceType, setPriceType,
    itemMode, setItemMode,
    addItem, removeItem, updateQuantity, incrementQuantity, decrementQuantity,
    clearCart, setDiscountType, setDiscountValue,
    setSeniorDiscount, clearSeniorDiscount, getItemQuantity,
  } = usePOSCart();

  const {
    products, categories, searchQuery, filteredProducts,
    loading, setSearchQuery, refreshProducts, findProductByBarcode,
  } = usePOSProducts();

  // Keep productsRef in sync
  useEffect(() => { productsRef.current = products; }, [products]);

  // Auto-scroll cart on new item
  useEffect(() => {
    if (cart.length > prevCartLengthRef.current && cartListRef.current) {
      setTimeout(() => cartListRef.current?.scrollToEnd({ animated: true }), 100);
    }
    prevCartLengthRef.current = cart.length;
  }, [cart.length]);

  // ===== STATE =====
  // Customer
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  // Payment (inline - right panel)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [amountTendered, setAmountTendered] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [checkPayee, setCheckPayee] = useState('');
  const [checkAmount, setCheckAmount] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [remarks, setRemarks] = useState('');

  // Modals
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

  // POS Operation Modals
  const [cashFundModalVisible, setCashFundModalVisible] = useState(false);
  const [pettyCashModalVisible, setPettyCashModalVisible] = useState(false);
  const [xReadingModalVisible, setXReadingModalVisible] = useState(false);
  const [xReadingTargetDate, setXReadingTargetDate] = useState<string | undefined>(undefined);
  const [voidModalVisible, setVoidModalVisible] = useState(false);
  const [quickCustomerModalVisible, setQuickCustomerModalVisible] = useState(false);
  const [reprintModalVisible, setReprintModalVisible] = useState(false);

  // Shift Management
  const [currentShift, setCurrentShift] = useState<{ id: number; beginning_cash: number } | null>(null);
  const [shiftDialogVisible, setShiftDialogVisible] = useState(false);
  const [checkingShift, setCheckingShift] = useState(true);

  // Unterminated Sessions
  const [unterminatedSessions, setUnterminatedSessions] = useState<{ date: string; transaction_count: number; total_sales: number }[]>([]);
  const [unterminatedModalVisible, setUnterminatedModalVisible] = useState(false);

  // ===== SHIFT MANAGEMENT =====
  useEffect(() => { checkActiveShift(); }, [user?.id]);

  const checkActiveShift = async () => {
    if (!user?.id) return;
    setCheckingShift(true);
    try {
      const dbService = getDatabase();
      if (!dbService.isReady()) { setCheckingShift(false); return; }

      const unterminated = await dbService.getUnterminatedSalesDates();
      if (unterminated.length > 0) {
        setUnterminatedSessions(unterminated);
        setUnterminatedModalVisible(true);
        setCheckingShift(false);
        return;
      }

      const shift = await dbService.getCurrentShift(user.id);
      if (shift) {
        setCurrentShift({ id: shift.id, beginning_cash: shift.beginning_cash });
        setShiftDialogVisible(false);
      } else {
        setCurrentShift(null);
        setShiftDialogVisible(true);
      }
    } catch (error) {
      console.error('Error checking active shift:', error);
      setShiftDialogVisible(false);
    } finally {
      setCheckingShift(false);
    }
  };

  const handleShiftStarted = (shiftId: number) => {
    setCurrentShift({ id: shiftId, beginning_cash: 0 });
    setShiftDialogVisible(false);
    refreshProducts();
  };

  const handleUnterminatedXReading = () => {
    setUnterminatedModalVisible(false);
    const oldestDate = unterminatedSessions.length > 0 ? unterminatedSessions[0].date : undefined;
    setXReadingTargetDate(oldestDate);
    setXReadingModalVisible(true);
  };

  const handleUnterminatedZReading = () => {
    setUnterminatedModalVisible(false);
    const oldestDate = unterminatedSessions.length > 0 ? unterminatedSessions[0].date : undefined;
    navigation.navigate('EndOfDay', { targetDate: oldestDate });
  };

  // ===== CUSTOMER LOADING =====
  useEffect(() => { loadCustomers(); }, []);

  const loadCustomers = async () => {
    try {
      const dbService = getDatabase();
      const customerList = await dbService.getCustomers(true);
      setCustomers(customerList);
    } catch (error) {
      console.error('Error loading customers:', error);
    }
  };

  const filteredCustomers = customers.filter(c => {
    if (!customerSearch.trim()) return true;
    const search = customerSearch.toLowerCase();
    return (
      c.name?.toLowerCase().includes(search) ||
      c.phone?.toLowerCase().includes(search) ||
      c.code?.toLowerCase().includes(search)
    );
  });

  // ===== FOCUS EFFECT =====
  useFocusEffect(
    useCallback(() => {
      refreshProducts();
      checkActiveShift();
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }, [])
  );

  // ===== SEARCH =====
  useEffect(() => {
    setShowSearchDropdown(searchQuery.length >= 1 && filteredProducts.length > 0);
  }, [searchQuery, filteredProducts.length]);

  const handleSearchSubmit = useCallback(() => {
    if (filteredProducts.length === 1) {
      addItem(filteredProducts[0]);
      setSearchQuery('');
      setShowSearchDropdown(false);
    } else if (filteredProducts.length > 1) {
      setShowSearchDropdown(true);
    }
    searchInputRef.current?.focus();
  }, [filteredProducts, addItem, setSearchQuery]);

  const handleSelectFromDropdown = useCallback((product: Product) => {
    addItem(product);
    setSearchQuery('');
    setShowSearchDropdown(false);
    searchInputRef.current?.focus();
  }, [addItem, setSearchQuery]);

  const handleSelectFromBrowser = useCallback((product: Product) => {
    addItem(product);
  }, [addItem]);

  // ===== BARCODE =====
  const handleBarcodeScan = useCallback((barcode: string) => {
    const currentProducts = productsRef.current;
    const barcodeUpper = barcode.toUpperCase().trim();

    let product = currentProducts.find(p => (p.code || '').toUpperCase().trim() === barcodeUpper);
    if (!product) {
      const withLeadingZero = '0' + barcodeUpper;
      product = currentProducts.find(p => (p.code || '').toUpperCase().trim() === withLeadingZero);
    }
    if (!product && barcodeUpper.startsWith('0')) {
      const withoutLeadingZero = barcodeUpper.substring(1);
      product = currentProducts.find(p => (p.code || '').toUpperCase().trim() === withoutLeadingZero);
    }

    if (product) {
      addItem(product);
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      Alert.alert('Product Not Found', `No product found with barcode "${barcode}".`);
    }
  }, [addItem]);

  // ===== PAYMENT LOGIC (Inline) =====
  const tenderedAmount = parseFloat(amountTendered) || 0;
  const checkAmountValue = parseFloat(checkAmount) || 0;
  const changeAmount = paymentMethod === 'CHECK'
    ? checkAmountValue - totals.total
    : tenderedAmount - totals.total;

  const handlePaymentMethodChange = useCallback((method: PaymentMethod) => {
    setPaymentMethod(method);
    setCheckNumber('');
    setCheckPayee('');
    setCheckAmount('');
    setReferenceNumber('');
    if (method === 'CARD' || method === 'ONLINE') {
      setAmountTendered(totals.total.toFixed(2));
    } else {
      setAmountTendered('');
    }
  }, [totals.total]);

  const quickAmounts = [
    { label: 'Exact', value: totals.total },
    { label: '₱100', value: 100 },
    { label: '₱200', value: 200 },
    { label: '₱500', value: 500 },
    { label: '₱1000', value: 1000 },
  ];

  const isPaymentValid = (() => {
    if (cart.length === 0) return false;
    if (paymentMethod === 'CHARGE_INVOICE') return selectedCustomer !== null;
    if (paymentMethod === 'CHECK') return checkNumber.trim() !== '' && checkPayee.trim() !== '' && checkAmountValue >= totals.total;
    if (paymentMethod === 'CARD' || paymentMethod === 'ONLINE') return true;
    return tenderedAmount >= totals.total;
  })();

  // ===== COMPLETE SALE =====
  const handleCompleteSale = useCallback(async () => {
    if (!user || cart.length === 0) return;

    // Validation
    if (paymentMethod === 'CHARGE_INVOICE' && !selectedCustomer) {
      Alert.alert('Customer Required', 'Please select a customer for charge invoice.');
      return;
    }
    if (paymentMethod === 'CHARGE_INVOICE' && selectedCustomer) {
      if (!selectedCustomer.credit_limit || selectedCustomer.credit_limit === 0) {
        Alert.alert('No Credit Limit', 'This customer has zero credit limit.');
        return;
      }
      const currentBalance = selectedCustomer.outstanding_balance || 0;
      const newBalance = currentBalance + totals.total;
      if (newBalance > selectedCustomer.credit_limit) {
        const availableCredit = selectedCustomer.credit_limit - currentBalance;
        Alert.alert('Credit Limit Exceeded',
          `Credit Limit: ₱${formatCurrency(selectedCustomer.credit_limit)}\n` +
          `Current Balance: ₱${formatCurrency(currentBalance)}\n` +
          `Available Credit: ₱${formatCurrency(availableCredit)}\n` +
          `Transaction: ₱${formatCurrency(totals.total)}`
        );
        return;
      }
    }
    // For refund/zero totals (returns >= sales), skip payment validation
    const isRefundOrZero = totals.total <= 0;

    if (!isRefundOrZero) {
      if (paymentMethod === 'CHECK') {
        if (!checkNumber.trim()) { Alert.alert('Check Number Required', 'Please enter the check number.'); return; }
        if (!checkPayee.trim()) { Alert.alert('Payee Required', 'Please enter the payee name.'); return; }
        if (checkAmountValue < totals.total) { Alert.alert('Insufficient Amount', 'Check amount must be at least the total.'); return; }
      }
      if (paymentMethod === 'CASH' && tenderedAmount < totals.total) {
        Alert.alert('Insufficient Payment', 'Amount tendered must be at least the total amount.');
        return;
      }
    }

    let finalAmountTendered = 0;
    let finalChange = 0;
    if (isRefundOrZero) {
      // Refund: customer gets money back
      finalAmountTendered = 0;
      finalChange = Math.abs(totals.total);
    } else if (paymentMethod === 'CHARGE_INVOICE') {
      finalAmountTendered = 0;
    } else if (paymentMethod === 'CHECK') {
      finalAmountTendered = checkAmountValue;
    } else if (paymentMethod === 'CARD' || paymentMethod === 'ONLINE') {
      finalAmountTendered = totals.total;
    } else {
      finalAmountTendered = tenderedAmount;
    }

    if (!isRefundOrZero) {
      finalChange = paymentMethod === 'CHARGE_INVOICE' ? 0 : (finalAmountTendered - totals.total);
    }

    setIsProcessing(true);
    try {
      const dbService = getDatabase();

      const transactionData = {
        customer_id: selectedCustomer?.id,
        customer_name: selectedCustomer?.name,
        subtotal: totals.subtotal,
        tax_amount: totals.taxAmount,
        discount_amount: totals.discountAmount || 0,
        total_amount: totals.total,
        payment_method: paymentMethod,
        amount_tendered: paymentMethod === 'CHARGE_INVOICE' ? 0 : finalAmountTendered,
        change_amount: paymentMethod === 'CHARGE_INVOICE' ? 0 : finalChange,
        cashier_id: user.id,
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

      const newReceiptData: ReceiptData = {
        businessName: storeName,
        businessAddress: storeAddress,
        businessPhone: storePhone,
        tin, permitNumber, minNumber, ptuNumber, ptuDate,
        atpNumber, atpDate, accreditationNumber, accreditationDate,
        serialNumberFrom, serialNumberTo,
        supplierName, supplierAddress, supplierTin, supplierAccreditation,
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
        subtotal: totals.grossTotal || 0,
        taxAmount: totals.taxAmount || 0,
        discountAmount: totals.discountAmount || 0,
        discountLabel: discount.isSeniorCitizen ? 'SC/PWD Discount' : 'Discount',
        total: totals.total || 0,
        vatableSales: totals.vatableSales || 0,
        vatExemptSales: totals.vatExemptSales || 0,
        zeroRatedSales: totals.zeroRatedSales || 0,
        vatAmount: totals.vatAmount || 0,
        scPwdId: discount.scPwdId,
        scPwdName: discount.scPwdName,
        scPwdType: discount.scPwdType,
        paymentMethod: paymentMethod,
        amountTendered: paymentMethod === 'CHARGE_INVOICE' ? 0 : finalAmountTendered,
        changeAmount: paymentMethod === 'CHARGE_INVOICE' ? 0 : finalChange,
        customerName: selectedCustomer?.name,
      };

      setReceiptData(newReceiptData);
      setLastReceiptData(newReceiptData);
      setReceiptVisible(true);

      // Save return items before clearing cart (needed for damage prompt)
      const returnItems = totals.returnItemCount > 0
        ? cart.filter(item => item.item_type === 'return')
        : [];

      // Reset state
      clearCart();
      refreshProducts();
      setSelectedCustomer(null);
      setShowCustomerDropdown(false);
      setCustomerSearch('');
      setPaymentMethod('CASH');
      setAmountTendered('');
      setCheckNumber('');
      setCheckPayee('');
      setCheckAmount('');
      setReferenceNumber('');
      setRemarks('');

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
      Alert.alert('Error', 'Failed to complete transaction.');
    } finally {
      setIsProcessing(false);
    }
  }, [user, cart, totals, discount, paymentMethod, tenderedAmount, checkAmountValue, checkNumber, checkPayee, selectedCustomer, clearCart, refreshProducts]);

  // ===== RECEIPT HANDLERS =====
  const handlePrintReceipt = async () => {
    if (!receiptData) { Alert.alert('Print Error', 'No receipt data available.'); return; }
    if (!printerService.isConnected()) {
      Alert.alert('Printer Not Connected', 'No printer is connected.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Setup Printer', onPress: () => navigation.navigate('PrinterSettings') },
      ]);
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
      Alert.alert('Print Failed', error?.message || 'Failed to print receipt.');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleEmailReceipt = async () => {
    if (!receiptData) return;
    try {
      setIsPrinting(true);
      await generateReceiptPdf(receiptData);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to generate PDF receipt.');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleCloseReceipt = useCallback(() => {
    setReceiptVisible(false);
    setReceiptData(null);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, []);

  // Reprint handler
  const handleReprintTransaction = useCallback(async (transactionId: number) => {
    try {
      const dbService = getDatabase();
      const transaction = await dbService.getTransactionById(transactionId);
      if (!transaction) { Alert.alert('Error', 'Transaction not found.'); return; }

      const items = await dbService.getTransactionItems(transactionId);
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

      const reprintReceiptData: ReceiptData = {
        businessName: storeName, businessAddress: storeAddress, businessPhone: storePhone,
        tin, permitNumber, minNumber, ptuNumber, ptuDate,
        atpNumber, atpDate, accreditationNumber, accreditationDate,
        serialNumberFrom, serialNumberTo,
        supplierName, supplierAddress, supplierTin, supplierAccreditation,
        invoiceNumber: transaction.invoice_number,
        transactionDate: new Date(transaction.transaction_date),
        cashierName: transaction.cashier_name || 'Cashier',
        items: items.map((item: any) => ({
          name: item.product_name, quantity: item.quantity,
          unitPrice: item.unit_price, totalPrice: item.total_amount,
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

  // ===== QUANTITY HANDLERS =====
  const handleQuantityPress = useCallback((item: CartItem) => {
    setSelectedItemForQty(item);
    setQuantityModalVisible(true);
  }, []);

  const handleQuantityConfirm = useCallback((productId: number, quantity: number) => {
    updateQuantity(productId, quantity);
    setQuantityModalVisible(false);
    setSelectedItemForQty(null);
  }, [updateQuantity]);

  // ===== RENDER CART ITEM =====
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

  // ===== PAYMENT METHOD TABS =====
  const PAYMENT_METHODS: { key: PaymentMethod; label: string; icon: string }[] = [
    { key: 'CASH', label: 'Cash', icon: 'cash' },
    { key: 'ONLINE', label: 'GCash', icon: 'cellphone' },
    { key: 'CARD', label: 'Card', icon: 'credit-card' },
    { key: 'CHECK', label: 'Check', icon: 'checkbook' },
    { key: 'CHARGE_INVOICE', label: 'Charge', icon: 'file-document' },
  ];

  // ===== RENDER =====
  return (
    <View style={styles.container}>
      {/* ===== TOP BAR ===== */}
      <View style={[styles.topBar, { backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>POS Terminal</Text>

        {/* Search Input */}
        <View style={styles.searchContainer}>
          <MaterialCommunityIcons name="magnify" size={20} color="#999" style={styles.searchIcon} />
          <RNTextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search product or scan barcode..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQuery(''); setShowSearchDropdown(false); }}>
              <MaterialCommunityIcons name="close-circle" size={20} color="#999" />
            </TouchableOpacity>
          )}
        </View>

        {/* Price Type Toggle */}
        <View style={styles.priceTypeToggle}>
          <TouchableOpacity
            style={[styles.priceTypeBtn, priceType === 'retail' && styles.priceTypeBtnActive]}
            onPress={() => setPriceType('retail')}
          >
            <Text style={[styles.priceTypeBtnText, priceType === 'retail' && styles.priceTypeBtnTextActive]}>Retail</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.priceTypeBtn, priceType === 'wholesale' && styles.priceTypeBtnActive]}
            onPress={() => setPriceType('wholesale')}
          >
            <Text style={[styles.priceTypeBtnText, priceType === 'wholesale' && styles.priceTypeBtnTextActive]}>Wholesale</Text>
          </TouchableOpacity>
        </View>

        {/* Sale/Return Mode Toggle */}
        <View style={styles.priceTypeToggle}>
          <TouchableOpacity
            style={[styles.priceTypeBtn, itemMode === 'sale' && styles.priceTypeBtnActive]}
            onPress={() => setItemMode('sale')}
          >
            <Text style={[styles.priceTypeBtnText, itemMode === 'sale' && styles.priceTypeBtnTextActive]}>Sale</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.priceTypeBtn, itemMode === 'return' && styles.returnModeBtnActive]}
            onPress={() => setItemMode('return')}
          >
            <Text style={[styles.priceTypeBtnText, itemMode === 'return' && styles.returnModeBtnTextActive]}>Return</Text>
          </TouchableOpacity>
        </View>

        {/* Action Buttons */}
        <TouchableOpacity
          style={styles.topBarAction}
          onPress={() => navigation.navigate('BarcodeScanner', { onScan: handleBarcodeScan })}
        >
          <MaterialCommunityIcons name="barcode-scan" size={22} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.topBarAction} onPress={() => setBrowseVisible(true)}>
          <MaterialCommunityIcons name="view-grid" size={22} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.topBarAction} onPress={() => setHamburgerMenuVisible(true)}>
          <MaterialCommunityIcons name="menu" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Search Dropdown - positioned below top bar */}
      {showSearchDropdown && (
        <View style={styles.searchDropdownWrapper}>
          <POSSearchDropdown
            products={filteredProducts}
            visible={showSearchDropdown}
            onSelect={handleSelectFromDropdown}
            searchQuery={searchQuery}
          />
        </View>
      )}

      {/* ===== TWO-PANEL LAYOUT ===== */}
      <View style={styles.panelContainer}>
        {/* ===== LEFT PANEL - Cart ===== */}
        <View style={styles.leftPanel}>
          {/* Cart Header */}
          <View style={styles.cartHeader}>
            <View style={styles.cartHeaderLeft}>
              <Text style={styles.cartTitle}>Cart Items</Text>
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cart.length}</Text>
              </View>
            </View>
            {cart.length > 0 && (
              <TouchableOpacity onPress={clearCart}>
                <Text style={styles.clearAllText}>Clear All</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Cart Items List */}
          <FlatList
            ref={cartListRef}
            data={cart}
            keyExtractor={(item) => getCartKey(item)}
            renderItem={renderCartItem}
            contentContainerStyle={styles.cartListContent}
            ListEmptyComponent={
              <View style={styles.emptyCart}>
                <MaterialCommunityIcons name="cart-outline" size={48} color="#CCC" />
                <Text style={styles.emptyCartText}>Cart is empty</Text>
                <Text style={styles.emptyCartSubtext}>Search or scan products to add</Text>
              </View>
            }
          />

          {/* Cart Summary */}
          <View style={styles.cartSummary}>
            {totals.returnItemCount > 0 ? (
              <>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Sales Subtotal:</Text>
                  <Text style={styles.summaryValue}>₱{formatCurrency(totals.saleSubtotal || 0)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: '#D32F2F' }]}>Returns (BO):</Text>
                  <Text style={[styles.summaryValue, { color: '#D32F2F' }]}>-₱{formatCurrency(totals.returnSubtotal || 0)}</Text>
                </View>
              </>
            ) : (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal:</Text>
                <Text style={styles.summaryValue}>₱{formatCurrency(totals.grossTotal || 0)}</Text>
              </View>
            )}
            {totals.discountAmount > 0 && (
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: '#D32F2F' }]}>
                  {discount.isSeniorCitizen ? 'SC/PWD Discount:' : 'Discount:'}
                </Text>
                <Text style={[styles.summaryValue, { color: '#D32F2F' }]}>-₱{formatCurrency(totals.discountAmount)}</Text>
              </View>
            )}
            <View style={[styles.summaryRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>{totals.returnItemCount > 0 ? 'NET TOTAL:' : 'TOTAL:'}</Text>
              <Text style={[styles.totalValue, totals.total < 0 && { color: '#D32F2F' }]}>
                {totals.total < 0 ? '-' : ''}₱{formatCurrency(Math.abs(totals.total))}
              </Text>
            </View>
          </View>
        </View>

        {/* ===== RIGHT PANEL - Checkout ===== */}
        <ScrollView style={styles.rightPanel} contentContainerStyle={styles.rightPanelContent}>
          {/* Discount Section */}
          <View style={styles.sectionBox}>
            <Text style={styles.sectionLabel}>Discount</Text>
            <View style={styles.discountButtons}>
              <TouchableOpacity
                style={[styles.discountBtn, discount.type === 'none' && !discount.isSeniorCitizen && styles.discountBtnActive]}
                onPress={() => { setDiscountType('none'); setDiscountValue(''); clearSeniorDiscount(); }}
              >
                <Text style={[styles.discountBtnText, discount.type === 'none' && !discount.isSeniorCitizen && styles.discountBtnTextActive]}>None</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.discountBtn, (discount.type === 'percent' || discount.type === 'amount') && styles.discountBtnActive]}
                onPress={() => setDiscountModalVisible(true)}
              >
                <Text style={[styles.discountBtnText, (discount.type === 'percent' || discount.type === 'amount') && styles.discountBtnTextActive]}>
                  {discount.type === 'percent' ? `${discount.value}%` : discount.type === 'amount' ? `₱${discount.value}` : '%/Amt'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.discountBtn, discount.isSeniorCitizen && styles.discountBtnActive]}
                onPress={() => setSeniorDiscountModalVisible(true)}
              >
                <Text style={[styles.discountBtnText, discount.isSeniorCitizen && styles.discountBtnTextActive]}>SC/PWD</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Customer Section */}
          <View style={styles.sectionBox}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionLabel}>Customer</Text>
              <TouchableOpacity onPress={() => setQuickCustomerModalVisible(true)}>
                <MaterialCommunityIcons name="account-plus" size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>
            {selectedCustomer ? (
              <View style={styles.selectedCustomerRow}>
                <Text style={styles.selectedCustomerName} numberOfLines={1}>{selectedCustomer.name}</Text>
                <TouchableOpacity onPress={() => setSelectedCustomer(null)}>
                  <MaterialCommunityIcons name="close-circle" size={18} color="#999" />
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <RNTextInput
                  style={styles.customerInput}
                  placeholder="Walk-in (search customer...)"
                  placeholderTextColor="#999"
                  value={customerSearch}
                  onChangeText={(text) => {
                    setCustomerSearch(text);
                    setShowCustomerDropdown(text.length > 0);
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                />
                {showCustomerDropdown && filteredCustomers.length > 0 && (
                  <View style={styles.customerDropdown}>
                    <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled>
                      {filteredCustomers.slice(0, 10).map(customer => (
                        <TouchableOpacity
                          key={customer.id}
                          style={styles.customerDropdownItem}
                          onPress={() => {
                            setSelectedCustomer(customer);
                            setShowCustomerDropdown(false);
                            setCustomerSearch('');
                          }}
                        >
                          <Text style={styles.customerDropdownName}>{customer.name}</Text>
                          {customer.phone && <Text style={styles.customerDropdownPhone}>{customer.phone}</Text>}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Payment Method Section */}
          <View style={styles.sectionBox}>
            <Text style={styles.sectionLabel}>Payment Method</Text>
            <View style={styles.paymentMethodRow}>
              {PAYMENT_METHODS.map(pm => (
                <TouchableOpacity
                  key={pm.key}
                  style={[styles.paymentMethodBtn, paymentMethod === pm.key && { backgroundColor: colors.primary }]}
                  onPress={() => handlePaymentMethodChange(pm.key)}
                >
                  <MaterialCommunityIcons
                    name={pm.icon as any}
                    size={16}
                    color={paymentMethod === pm.key ? '#FFF' : '#666'}
                  />
                  <Text style={[styles.paymentMethodText, paymentMethod === pm.key && { color: '#FFF' }]}>
                    {pm.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Cash Amount Input */}
            {paymentMethod === 'CASH' && (
              <View style={styles.amountSection}>
                <Text style={styles.fieldLabel}>Cash Amount:</Text>
                <RNTextInput
                  style={styles.amountInput}
                  placeholder="0.00"
                  placeholderTextColor="#999"
                  value={amountTendered}
                  onChangeText={setAmountTendered}
                  keyboardType="decimal-pad"
                />
                <View style={styles.quickAmountRow}>
                  {quickAmounts.map(qa => (
                    <TouchableOpacity
                      key={qa.label}
                      style={styles.quickAmountBtn}
                      onPress={() => setAmountTendered(qa.value.toFixed(2))}
                    >
                      <Text style={styles.quickAmountText}>{qa.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Card/GCash - Reference Number */}
            {(paymentMethod === 'CARD' || paymentMethod === 'ONLINE') && (
              <View style={styles.amountSection}>
                <Text style={styles.fieldLabel}>Reference Number:</Text>
                <RNTextInput
                  style={styles.amountInput}
                  placeholder="Enter reference number"
                  placeholderTextColor="#999"
                  value={referenceNumber}
                  onChangeText={setReferenceNumber}
                />
                <Text style={styles.autoFillNote}>Amount auto-filled: ₱{formatCurrency(totals.total)}</Text>
              </View>
            )}

            {/* Check Fields */}
            {paymentMethod === 'CHECK' && (
              <View style={styles.amountSection}>
                <Text style={styles.fieldLabel}>Check Number:</Text>
                <RNTextInput
                  style={styles.amountInput}
                  placeholder="Enter check number"
                  placeholderTextColor="#999"
                  value={checkNumber}
                  onChangeText={setCheckNumber}
                />
                <Text style={styles.fieldLabel}>Payee:</Text>
                <RNTextInput
                  style={styles.amountInput}
                  placeholder="Enter payee name"
                  placeholderTextColor="#999"
                  value={checkPayee}
                  onChangeText={setCheckPayee}
                />
                <Text style={styles.fieldLabel}>Check Amount:</Text>
                <RNTextInput
                  style={styles.amountInput}
                  placeholder="0.00"
                  placeholderTextColor="#999"
                  value={checkAmount}
                  onChangeText={setCheckAmount}
                  keyboardType="decimal-pad"
                />
              </View>
            )}

            {/* Charge Invoice */}
            {paymentMethod === 'CHARGE_INVOICE' && (
              <View style={styles.amountSection}>
                {!selectedCustomer ? (
                  <Text style={[styles.autoFillNote, { color: '#D32F2F' }]}>
                    Please select a customer above for charge invoice.
                  </Text>
                ) : (
                  <Text style={styles.autoFillNote}>
                    Charging to: {selectedCustomer.name}
                    {selectedCustomer.credit_limit ? `\nCredit Limit: ₱${formatCurrency(selectedCustomer.credit_limit)}` : ''}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Remarks */}
          <View style={styles.sectionBox}>
            <Text style={styles.sectionLabel}>Remarks</Text>
            <RNTextInput
              style={styles.remarksInput}
              placeholder="Optional notes..."
              placeholderTextColor="#999"
              value={remarks}
              onChangeText={setRemarks}
              multiline
            />
          </View>

          {/* Totals Breakdown */}
          <View style={styles.totalsBox}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal:</Text>
              <Text style={styles.totalsValue}>₱{formatCurrency(totals.grossTotal || 0)}</Text>
            </View>
            {totals.discountAmount > 0 && (
              <View style={styles.totalsRow}>
                <Text style={[styles.totalsLabel, { color: '#D32F2F' }]}>Discount:</Text>
                <Text style={[styles.totalsValue, { color: '#D32F2F' }]}>-₱{formatCurrency(totals.discountAmount)}</Text>
              </View>
            )}
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>VAT:</Text>
              <Text style={styles.totalsValue}>₱{formatCurrency(totals.vatAmount || 0)}</Text>
            </View>
            <View style={[styles.totalsRow, styles.grandTotalRow]}>
              <Text style={styles.grandTotalLabel}>TOTAL:</Text>
              <Text style={styles.grandTotalValue}>₱{formatCurrency(totals.total)}</Text>
            </View>
            {paymentMethod === 'CASH' && tenderedAmount > 0 && changeAmount >= 0 && (
              <View style={styles.totalsRow}>
                <Text style={[styles.totalsLabel, { color: '#2E7D32' }]}>Change:</Text>
                <Text style={[styles.totalsValue, { color: '#2E7D32', fontWeight: '700' }]}>₱{formatCurrency(Math.max(0, changeAmount))}</Text>
              </View>
            )}
            {paymentMethod === 'CHECK' && checkAmountValue > 0 && changeAmount >= 0 && (
              <View style={styles.totalsRow}>
                <Text style={[styles.totalsLabel, { color: '#2E7D32' }]}>Change:</Text>
                <Text style={[styles.totalsValue, { color: '#2E7D32', fontWeight: '700' }]}>₱{formatCurrency(Math.max(0, changeAmount))}</Text>
              </View>
            )}
          </View>

          {/* COMPLETE SALE Button */}
          <TouchableOpacity
            style={[
              styles.completeSaleBtn,
              { backgroundColor: isPaymentValid ? '#2E7D32' : '#BDBDBD' },
            ]}
            onPress={handleCompleteSale}
            disabled={!isPaymentValid || isProcessing}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="check-circle" size={24} color="#FFF" style={{ marginRight: 8 }} />
            <Text style={styles.completeSaleBtnText}>
              {isProcessing ? 'Processing...' : `COMPLETE SALE  -  ₱${formatCurrency(totals.total)}`}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* ===== MODALS ===== */}

      {/* Product Browser */}
      <POSProductBrowser
        visible={browseVisible}
        products={products}
        categories={categories}
        onSelect={handleSelectFromBrowser}
        onClose={() => setBrowseVisible(false)}
        getCartQuantity={getItemQuantity}
      />

      {/* Discount Modal */}
      <POSDiscountModal
        visible={discountModalVisible}
        subtotal={totals.subtotal + totals.taxAmount}
        currentType={discount.type}
        currentValue={discount.value}
        onApply={(type, value) => {
          clearSeniorDiscount();
          setDiscountType(type);
          setDiscountValue(value);
        }}
        onClear={() => { setDiscountType('none'); setDiscountValue(''); }}
        onClose={() => setDiscountModalVisible(false)}
      />

      {/* Quantity Modal */}
      <POSQuantityModal
        visible={quantityModalVisible}
        item={selectedItemForQty}
        onConfirm={handleQuantityConfirm}
        onClose={() => { setQuantityModalVisible(false); setSelectedItemForQty(null); }}
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
          setDiscountType('none');
          setDiscountValue('');
          setSeniorDiscount(totalCustomers, seniorCount, scPwdInfo);
        }}
        onClear={clearSeniorDiscount}
        onClose={() => setSeniorDiscountModalVisible(false)}
      />

      {/* Receipt Modal */}
      <Modal visible={receiptVisible} animationType="slide" transparent onRequestClose={handleCloseReceipt}>
        <View style={styles.receiptOverlay}>
          <View style={styles.receiptContainer}>
            <View style={styles.receiptHeader}>
              <Text style={styles.receiptTitle}>Transaction Complete</Text>
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
          </View>
        </View>
      </Modal>

      {/* Hamburger Menu */}
      <POSHamburgerMenu
        visible={hamburgerMenuVisible}
        onClose={() => setHamburgerMenuVisible(false)}
        hasLastTransaction={lastReceiptData !== null}
        onReprint={() => {
          if (lastReceiptData) { setReceiptData(lastReceiptData); setReceiptVisible(true); }
        }}
        onReprintHistory={() => { setHamburgerMenuVisible(false); setReprintModalVisible(true); }}
        onXReading={() => { setHamburgerMenuVisible(false); setXReadingModalVisible(true); }}
        onZReading={() => { setHamburgerMenuVisible(false); navigation.navigate('EndOfDay'); }}
        onCashFund={() => { setHamburgerMenuVisible(false); setCashFundModalVisible(true); }}
        onPettyCash={() => { setHamburgerMenuVisible(false); setPettyCashModalVisible(true); }}
        onRefund={() => { setHamburgerMenuVisible(false); navigation.navigate('Refund', { cashierId: user?.id || 0 }); }}
        onExchange={() => { setHamburgerMenuVisible(false); navigation.navigate('Exchange', { cashierId: user?.id || 0 }); }}
        onVoid={() => { setHamburgerMenuVisible(false); setVoidModalVisible(true); }}
        onQuickAddCustomer={() => { setHamburgerMenuVisible(false); setQuickCustomerModalVisible(true); }}
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
        onClose={() => { setXReadingModalVisible(false); setXReadingTargetDate(undefined); }}
        cashierId={user?.id || 0}
        targetDate={xReadingTargetDate}
      />

      {/* Void */}
      <POSVoidModal
        visible={voidModalVisible}
        onClose={() => setVoidModalVisible(false)}
        onSuccess={() => { setVoidModalVisible(false); refreshProducts(); }}
        cashierId={user?.id || 0}
      />

      {/* Quick Add Customer */}
      <POSQuickCustomerModal
        visible={quickCustomerModalVisible}
        onClose={() => setQuickCustomerModalVisible(false)}
        onCustomerCreated={(customer) => {
          setQuickCustomerModalVisible(false);
          loadCustomers();
          if (paymentMethod === 'CHARGE_INVOICE' && customer) {
            setSelectedCustomer(customer);
            setShowCustomerDropdown(false);
          }
        }}
        userId={user?.id || 0}
      />

      {/* Reprint Modal */}
      <POSReprintModal
        visible={reprintModalVisible}
        onClose={() => setReprintModalVisible(false)}
        onSelectTransaction={handleReprintTransaction}
      />

      {/* Unterminated Session Modal */}
      <POSUnterminatedSessionModal
        visible={unterminatedModalVisible}
        sessions={unterminatedSessions}
        onDoXReading={handleUnterminatedXReading}
        onDoZReading={handleUnterminatedZReading}
      />

      {/* Start Shift Dialog */}
      <StartShiftDialog
        visible={shiftDialogVisible && !checkingShift && !unterminatedModalVisible}
        userId={user?.id || 0}
        onShiftStarted={handleShiftStarted}
        onCancel={() => {
          setShiftDialogVisible(false);
          navigation.navigate('Dashboard');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F0F0',
  },

  // ===== TOP BAR =====
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  backButton: {
    padding: 8,
  },
  topBarTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 12,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 8,
    height: 38,
    paddingHorizontal: 10,
    marginHorizontal: 8,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    padding: 0,
    height: 38,
  },
  priceTypeToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 6,
    marginHorizontal: 6,
  },
  priceTypeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  priceTypeBtnActive: {
    backgroundColor: '#FFF',
  },
  priceTypeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  priceTypeBtnTextActive: {
    color: '#333',
  },
  returnModeBtnActive: {
    backgroundColor: '#D32F2F',
  },
  returnModeBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  topBarAction: {
    padding: 8,
    marginHorizontal: 2,
  },

  // ===== SEARCH DROPDOWN =====
  searchDropdownWrapper: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    zIndex: 100,
  },

  // ===== TWO-PANEL LAYOUT =====
  panelContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  leftPanel: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRightWidth: 1,
    borderRightColor: '#E0E0E0',
  },
  rightPanel: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  rightPanelContent: {
    padding: 10,
    paddingBottom: 80,
  },

  // ===== CART =====
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  cartHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cartTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  cartBadge: {
    backgroundColor: '#1976D2',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    paddingHorizontal: 6,
  },
  cartBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  clearAllText: {
    fontSize: 13,
    color: '#D32F2F',
    fontWeight: '600',
  },
  cartListContent: {
    padding: 6,
  },
  emptyCart: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyCartText: {
    fontSize: 16,
    color: '#999',
    fontWeight: '600',
    marginTop: 12,
  },
  emptyCartSubtext: {
    fontSize: 13,
    color: '#BBB',
    marginTop: 4,
  },

  // ===== CART SUMMARY =====
  cartSummary: {
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#666',
  },
  summaryValue: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#DDD',
    marginTop: 6,
    paddingTop: 8,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1976D2',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1976D2',
  },

  // ===== RIGHT PANEL SECTIONS =====
  sectionBox: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#555',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  // Discount Buttons
  discountButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  discountBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
  },
  discountBtnActive: {
    backgroundColor: '#1976D2',
  },
  discountBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  discountBtnTextActive: {
    color: '#FFF',
  },

  // Customer
  selectedCustomerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E8F5E9',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  selectedCustomerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D32',
    flex: 1,
    marginRight: 8,
  },
  customerInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#FFF',
  },
  customerDropdown: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 6,
    backgroundColor: '#FFF',
    marginTop: 4,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  customerDropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  customerDropdownName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  customerDropdownPhone: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },

  // Payment Methods
  paymentMethodRow: {
    flexDirection: 'row',
    gap: 4,
  },
  paymentMethodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#F0F0F0',
    gap: 3,
  },
  paymentMethodText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },

  // Amount Inputs
  amountSection: {
    marginTop: 10,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
    marginTop: 6,
  },
  amountInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    backgroundColor: '#FFF',
  },
  autoFillNote: {
    fontSize: 12,
    color: '#888',
    marginTop: 6,
    fontStyle: 'italic',
  },
  quickAmountRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  quickAmountBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
  },
  quickAmountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1565C0',
  },

  // Remarks
  remarksInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#FFF',
    minHeight: 40,
    textAlignVertical: 'top',
  },

  // Totals
  totalsBox: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  totalsLabel: {
    fontSize: 14,
    color: '#666',
  },
  totalsValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  grandTotalRow: {
    borderTopWidth: 2,
    borderTopColor: '#1976D2',
    marginTop: 8,
    paddingTop: 10,
  },
  grandTotalLabel: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1976D2',
  },
  grandTotalValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1976D2',
  },

  // Complete Sale Button
  completeSaleBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  completeSaleBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Receipt Modal
  receiptOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  receiptContainer: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    width: '60%',
    maxHeight: '90%',
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  receiptTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
});
