import { useState, useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import { Product } from '../database/schema';

export interface CartItem {
  id: number;
  code: string;
  name: string;
  price: number;
  cost: number;
  quantity: number;
  vat_type: 'vatable' | 'vat_exempt' | 'zero_rated';
  tax_rate: number;
  is_vat_inclusive: boolean;
  stock_quantity: number;
  price_type: 'retail' | 'wholesale';
  item_type: 'sale' | 'return';
}

// Composite key for uniquely identifying cart items (same product can be sale + return)
export function getCartKey(item: { id: number; price_type: string; item_type: string }): string {
  return `${item.id}-${item.price_type}-${item.item_type}`;
}

export interface CartTotals {
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  grossTotal: number;  // Total before discount (what customer sees as item prices sum)
  itemCount: number;
  // BIR VAT breakdown
  vatableSales: number;
  vatExemptSales: number;
  zeroRatedSales: number;
  vatAmount: number;
  // Buy & Return (BO) breakdown
  saleSubtotal: number;
  returnSubtotal: number;
  saleItemCount: number;
  returnItemCount: number;
}

export interface DiscountState {
  type: 'none' | 'percent' | 'amount' | 'senior';
  value: string;
  isSeniorCitizen: boolean;
  // Senior Citizen discount details
  totalCustomers: number;
  seniorCount: number;
  // BIR Compliance: SC/PWD ID tracking
  scPwdId?: string;
  scPwdName?: string;
  scPwdType?: 'SENIOR' | 'PWD';
}

interface UsePOSCartReturn {
  cart: CartItem[];
  totals: CartTotals;
  discount: DiscountState;
  priceType: 'retail' | 'wholesale';
  setPriceType: (type: 'retail' | 'wholesale') => void;
  itemMode: 'sale' | 'return';
  setItemMode: (mode: 'sale' | 'return') => void;
  addItem: (product: Product) => boolean;
  removeItem: (productId: number, itemType?: 'sale' | 'return') => void;
  updateQuantity: (productId: number, quantity: number, itemType?: 'sale' | 'return') => boolean;
  incrementQuantity: (productId: number, itemType?: 'sale' | 'return') => void;
  decrementQuantity: (productId: number, itemType?: 'sale' | 'return') => void;
  clearCart: () => void;
  setDiscountType: (type: DiscountState['type']) => void;
  setDiscountValue: (value: string) => void;
  toggleSeniorCitizen: () => void;
  setSeniorDiscount: (totalCustomers: number, seniorCount: number, scPwdInfo?: { id: string; name: string; type: 'SENIOR' | 'PWD' }) => void;
  clearSeniorDiscount: () => void;
  getItemQuantity: (productId: number) => number;
}

const roundCurrency = (value: number): number => Math.round(value * 100) / 100;

export function usePOSCart(): UsePOSCartReturn {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState<DiscountState>({
    type: 'none',
    value: '',
    isSeniorCitizen: false,
    totalCustomers: 1,
    seniorCount: 0,
  });
  const [priceType, setPriceType] = useState<'retail' | 'wholesale'>('retail');
  const [itemMode, setItemMode] = useState<'sale' | 'return'>('sale');

  // Add item to cart
  const addItem = useCallback((product: Product): boolean => {
    // Find existing item with SAME product id, SAME price type, AND SAME item type
    const existingItem = cart.find(item => item.id === product.id && item.price_type === priceType && item.item_type === itemMode);

    // For sale items: check stock. For return items: skip stock check (customer is returning stock)
    if (itemMode === 'sale') {
      // Calculate total SALE quantity for this product across all price types (for stock validation)
      const totalSaleQuantityInCart = cart
        .filter(item => item.id === product.id && item.item_type === 'sale')
        .reduce((sum, item) => sum + item.quantity, 0);
      const availableStock = product.stock_quantity || 0;

      if (totalSaleQuantityInCart + 1 > availableStock) {
        Alert.alert(
          'Insufficient Stock',
          `Only ${availableStock} units of "${product.name}" available.${totalSaleQuantityInCart > 0 ? ` You already have ${totalSaleQuantityInCart} in cart.` : ''}`
        );
        return false;
      }
    }

    // Determine the price based on priceType
    const selectedPrice = priceType === 'wholesale' && product.wholesale_price
      ? product.wholesale_price
      : product.price;

    if (existingItem) {
      // Increment quantity for existing item with same price type and item type
      setCart(prevCart =>
        prevCart.map(item =>
          item.id === product.id && item.price_type === priceType && item.item_type === itemMode
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      // Add new cart item with the current price type and item mode
      setCart(prevCart => [
        ...prevCart,
        {
          id: product.id,
          code: product.code,
          name: product.name,
          price: selectedPrice,
          cost: product.cost || 0,
          quantity: 1,
          vat_type: (product.vat_type || 'vatable') as 'vatable' | 'vat_exempt' | 'zero_rated',
          tax_rate: product.tax_rate,
          is_vat_inclusive: product.is_vat_inclusive,
          stock_quantity: product.stock_quantity,
          price_type: priceType,
          item_type: itemMode,
        },
      ]);
    }
    return true;
  }, [cart, priceType, itemMode]);

  // Remove item from cart (matches by productId + itemType)
  const removeItem = useCallback((productId: number, itemType?: 'sale' | 'return'): void => {
    setCart(prevCart => prevCart.filter(item =>
      !(item.id === productId && (itemType === undefined || item.item_type === itemType))
    ));
  }, []);

  // Update item quantity (matches by productId + itemType)
  const updateQuantity = useCallback((productId: number, quantity: number, itemType?: 'sale' | 'return'): boolean => {
    if (quantity <= 0) {
      removeItem(productId, itemType);
      return true;
    }

    const item = cart.find(i => i.id === productId && (itemType === undefined || i.item_type === itemType));
    // Only check stock for sale items
    if (item && item.item_type === 'sale' && quantity > item.stock_quantity) {
      Alert.alert(
        'Insufficient Stock',
        `Only ${item.stock_quantity} units of "${item.name}" available.`
      );
      return false;
    }

    setCart(prevCart =>
      prevCart.map(item =>
        item.id === productId && (itemType === undefined || item.item_type === itemType)
          ? { ...item, quantity }
          : item
      )
    );
    return true;
  }, [cart, removeItem]);

  // Increment quantity
  const incrementQuantity = useCallback((productId: number, itemType?: 'sale' | 'return'): void => {
    const item = cart.find(i => i.id === productId && (itemType === undefined || i.item_type === itemType));
    if (item) {
      updateQuantity(productId, item.quantity + 1, itemType);
    }
  }, [cart, updateQuantity]);

  // Decrement quantity
  const decrementQuantity = useCallback((productId: number, itemType?: 'sale' | 'return'): void => {
    const item = cart.find(i => i.id === productId && (itemType === undefined || i.item_type === itemType));
    if (item) {
      updateQuantity(productId, item.quantity - 1, itemType);
    }
  }, [cart, updateQuantity]);

  // Clear cart
  const clearCart = useCallback((): void => {
    setCart([]);
    setDiscount({ type: 'none', value: '', isSeniorCitizen: false, totalCustomers: 1, seniorCount: 0, scPwdId: undefined, scPwdName: undefined, scPwdType: undefined });
    setPriceType('retail');
    setItemMode('sale');
  }, []);

  // Set discount type
  const setDiscountType = useCallback((type: DiscountState['type']): void => {
    setDiscount(prev => ({
      ...prev,
      type,
      value: '',
      isSeniorCitizen: type === 'senior',
    }));
  }, []);

  // Set discount value
  const setDiscountValue = useCallback((value: string): void => {
    // Only allow valid numeric input
    const cleaned = value.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    const sanitized = parts.length > 2
      ? parts[0] + '.' + parts.slice(1).join('')
      : cleaned;

    // For percent, limit to 100
    if (discount.type === 'percent') {
      const num = parseFloat(sanitized);
      if (!isNaN(num) && num > 100) {
        setDiscount(prev => ({ ...prev, value: '100' }));
        return;
      }
    }

    setDiscount(prev => ({ ...prev, value: sanitized }));
  }, [discount.type]);

  // Toggle senior citizen discount (legacy - use setSeniorDiscount instead)
  const toggleSeniorCitizen = useCallback((): void => {
    setDiscount(prev => ({
      type: prev.isSeniorCitizen ? 'none' : 'senior',
      value: '',
      isSeniorCitizen: !prev.isSeniorCitizen,
      totalCustomers: prev.isSeniorCitizen ? 1 : prev.totalCustomers,
      seniorCount: prev.isSeniorCitizen ? 0 : prev.seniorCount,
    }));
  }, []);

  // Set senior citizen discount with customer counts and BIR-required SC/PWD info
  const setSeniorDiscount = useCallback((totalCustomers: number, seniorCount: number, scPwdInfo?: { id: string; name: string; type: 'SENIOR' | 'PWD' }): void => {
    if (seniorCount > 0 && totalCustomers >= seniorCount) {
      setDiscount({
        type: 'senior',
        value: '',
        isSeniorCitizen: true,
        totalCustomers,
        seniorCount,
        scPwdId: scPwdInfo?.id,
        scPwdName: scPwdInfo?.name,
        scPwdType: scPwdInfo?.type,
      });
    }
  }, []);

  // Clear senior citizen discount
  const clearSeniorDiscount = useCallback((): void => {
    setDiscount({
      type: 'none',
      value: '',
      isSeniorCitizen: false,
      totalCustomers: 1,
      seniorCount: 0,
      scPwdId: undefined,
      scPwdName: undefined,
      scPwdType: undefined,
    });
  }, []);

  // Get quantity of specific item in cart
  const getItemQuantity = useCallback((productId: number): number => {
    // Return total quantity for this product across all price types
    return cart
      .filter(i => i.id === productId)
      .reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // Calculate totals
  const totals = useMemo((): CartTotals => {
    let subtotal = 0;
    let taxAmount = 0;
    let itemCount = 0;
    let vatableSales = 0;
    let vatExemptSales = 0;
    let zeroRatedSales = 0;
    let vatAmount = 0;
    let grossTotal = 0;  // Sum of item prices (what customer sees)
    let saleSubtotal = 0;
    let returnSubtotal = 0;
    let saleItemCount = 0;
    let returnItemCount = 0;

    cart.forEach(item => {
      const itemTotal = roundCurrency(item.price * item.quantity);
      const isReturn = item.item_type === 'return';
      // Sign multiplier: returns subtract from totals
      const sign = isReturn ? -1 : 1;

      grossTotal += itemTotal * sign;
      itemCount += item.quantity;

      if (isReturn) {
        returnSubtotal += itemTotal;
        returnItemCount += item.quantity;
      } else {
        saleSubtotal += itemTotal;
        saleItemCount += item.quantity;
      }

      // Calculate based on VAT type
      if (item.vat_type === 'vatable') {
        // VATable items - 12% VAT
        if (item.is_vat_inclusive) {
          // Price includes VAT - extract the VAT-exclusive amount
          const vatExclusive = roundCurrency(itemTotal / 1.12);
          const itemVat = roundCurrency(itemTotal - vatExclusive);
          vatableSales += vatExclusive * sign;
          vatAmount += itemVat * sign;
          subtotal += vatExclusive * sign;
          taxAmount += itemVat * sign;
        } else {
          // Price excludes VAT - calculate VAT on top
          const itemVat = roundCurrency(itemTotal * 0.12);
          vatableSales += itemTotal * sign;
          vatAmount += itemVat * sign;
          subtotal += itemTotal * sign;
          taxAmount += itemVat * sign;
        }
      } else if (item.vat_type === 'vat_exempt') {
        // VAT-Exempt items - no VAT
        vatExemptSales += itemTotal * sign;
        subtotal += itemTotal * sign;
      } else {
        // Zero-Rated items - no VAT (but technically 0% rated)
        zeroRatedSales += itemTotal * sign;
        subtotal += itemTotal * sign;
      }
    });

    subtotal = roundCurrency(subtotal);
    taxAmount = roundCurrency(taxAmount);
    vatableSales = roundCurrency(vatableSales);
    vatExemptSales = roundCurrency(vatExemptSales);
    zeroRatedSales = roundCurrency(zeroRatedSales);
    vatAmount = roundCurrency(vatAmount);
    grossTotal = roundCurrency(grossTotal);
    saleSubtotal = roundCurrency(saleSubtotal);
    returnSubtotal = roundCurrency(returnSubtotal);

    const totalBeforeDiscount = roundCurrency(subtotal + taxAmount);
    // Discounts only apply to sale items portion, not return items
    const salePortionTotal = returnItemCount > 0
      ? roundCurrency(saleSubtotal + (saleSubtotal > 0 ? roundCurrency(taxAmount * (saleSubtotal / Math.max(subtotal, 0.01))) : 0))
      : totalBeforeDiscount;
    let discountAmount = 0;

    // Calculate discount (only on sale items)
    if (discount.isSeniorCitizen && discount.seniorCount > 0) {
      // Senior Citizen/PWD: Per-person calculation for group dining
      // Formula:
      // 1. Calculate per-person share
      // 2. Apply 20% discount only on senior's VAT-exclusive portion
      // 3. VAT exemption only applies to senior's portion

      const totalCustomers = Math.max(1, discount.totalCustomers);
      const seniorCount = Math.min(discount.seniorCount, totalCustomers);
      const nonSeniorCount = totalCustomers - seniorCount;

      // Per-person share of VAT-exclusive subtotal (only sale items)
      const saleOnlySubtotal = returnItemCount > 0 ? Math.max(0, subtotal + returnSubtotal) : subtotal;
      const saleOnlyVat = returnItemCount > 0 ? Math.max(0, vatAmount + roundCurrency(returnSubtotal * 0.12 / 1.12)) : vatAmount;
      const perPersonSubtotal = saleOnlySubtotal / totalCustomers;
      const perPersonVat = saleOnlyVat / totalCustomers;

      // Senior portion calculations
      const seniorSubtotal = roundCurrency(perPersonSubtotal * seniorCount);
      const seniorVat = roundCurrency(perPersonVat * seniorCount);

      // Non-senior portion (keeps VAT)
      const nonSeniorSubtotal = roundCurrency(perPersonSubtotal * nonSeniorCount);
      const nonSeniorVat = roundCurrency(perPersonVat * nonSeniorCount);

      // Senior discount: 20% of senior's VAT-exclusive amount
      discountAmount = roundCurrency(seniorSubtotal * 0.20);

      // Update tax - seniors are VAT exempt, non-seniors pay VAT
      taxAmount = nonSeniorVat;
      vatAmount = nonSeniorVat;

    } else if (discount.type === 'percent' && discount.value) {
      const percentValue = parseFloat(discount.value);
      if (!isNaN(percentValue) && percentValue >= 0 && percentValue <= 100) {
        discountAmount = roundCurrency((salePortionTotal * percentValue) / 100);
      }
    } else if (discount.type === 'amount' && discount.value) {
      const amountValue = parseFloat(discount.value);
      if (!isNaN(amountValue) && amountValue >= 0) {
        discountAmount = roundCurrency(Math.min(amountValue, salePortionTotal));
      }
    }

    // Allow negative total when returns exceed sales (customer gets refund)
    const total = roundCurrency(totalBeforeDiscount - discountAmount);

    return {
      subtotal,
      taxAmount,
      discountAmount,
      total,
      grossTotal,
      itemCount,
      vatableSales,
      vatExemptSales,
      zeroRatedSales,
      vatAmount,
      saleSubtotal,
      returnSubtotal,
      saleItemCount,
      returnItemCount,
    };
  }, [cart, discount]);

  return {
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
    toggleSeniorCitizen,
    setSeniorDiscount,
    clearSeniorDiscount,
    getItemQuantity,
  };
}

export default usePOSCart;
