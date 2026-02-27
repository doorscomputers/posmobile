import React, { memo, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Button, useTheme } from 'react-native-paper';
import POSCartItem from './POSCartItem';
import { useResponsiveTheme } from '../../utils/responsive';
import { CartItem, CartTotals, DiscountState, getCartKey } from '../../hooks/usePOSCart';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Format currency with commas
const formatCurrency = (amount: number): string => {
  return amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

interface POSCartPanelProps {
  cart: CartItem[];
  totals: CartTotals;
  discount: DiscountState;
  onIncrement: (productId: number, itemType?: 'sale' | 'return') => void;
  onDecrement: (productId: number, itemType?: 'sale' | 'return') => void;
  onRemove: (productId: number, itemType?: 'sale' | 'return') => void;
  onToggleSeniorCitizen: () => void;
  onSetDiscountType: (type: DiscountState['type']) => void;
  onSetDiscountValue: (value: string) => void;
  onCheckout: () => void;
  loading?: boolean;
}

function POSCartPanel({
  cart,
  totals,
  discount,
  onIncrement,
  onDecrement,
  onRemove,
  onToggleSeniorCitizen,
  onSetDiscountType,
  onSetDiscountValue,
  onCheckout,
  loading = false,
}: POSCartPanelProps) {
  const theme = useTheme();
  const { sp, fs, lo } = useResponsiveTheme();
  const [isExpanded, setIsExpanded] = useState(true);
  const [showDiscounts, setShowDiscounts] = useState(false);

  const toggleExpanded = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(prev => !prev);
  }, []);

  const toggleDiscounts = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowDiscounts(prev => !prev);
  }, []);

  const isEmpty = cart.length === 0;

  return (
    <View style={styles.container}>
      {/* Cart Header - Always visible */}
      <TouchableOpacity
        style={[styles.header, { backgroundColor: theme.colors.primary }]}
        onPress={toggleExpanded}
        activeOpacity={0.9}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.headerIcon}>{isExpanded ? '▼' : '▲'}</Text>
          <Text style={[styles.headerTitle, { fontSize: fs.body }]}>
            Cart ({totals.itemCount || 0} {(totals.itemCount || 0) === 1 ? 'item' : 'items'})
          </Text>
        </View>
        <Text style={[styles.headerTotal, { fontSize: fs.h3 }]}>₱{formatCurrency(totals.total || 0)}</Text>
      </TouchableOpacity>

      {/* Expandable Content */}
      {isExpanded && (
        <View style={styles.content}>
          {/* Cart Items */}
          {isEmpty ? (
            <View style={styles.emptyCart}>
              <Text style={styles.emptyCartIcon}>🛒</Text>
              <Text style={styles.emptyCartText}>Cart is empty</Text>
              <Text style={styles.emptyCartSubtext}>Tap products to add them</Text>
            </View>
          ) : (
            <>
              <ScrollView
                style={styles.itemsList}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
              >
                {cart.map((item, idx) => (
                  <POSCartItem
                    key={getCartKey(item)}
                    item={item}
                    index={idx + 1}
                    onIncrement={onIncrement}
                    onDecrement={onDecrement}
                    onRemove={onRemove}
                  />
                ))}
              </ScrollView>

              {/* Discount Section */}
              <View style={styles.discountSection}>
                <TouchableOpacity
                  style={styles.discountToggle}
                  onPress={toggleDiscounts}
                  activeOpacity={0.7}
                >
                  <Text style={styles.discountToggleText}>
                    {showDiscounts ? '▼ Hide Discounts' : '▶ Add Discount'}
                  </Text>
                  {(totals.discountAmount || 0) > 0 ? (
                    <Text style={styles.discountApplied}>
                      -₱{formatCurrency(totals.discountAmount || 0)}
                    </Text>
                  ) : null}
                </TouchableOpacity>

                {showDiscounts && (
                  <View style={styles.discountOptions}>
                    {/* Senior Citizen Toggle */}
                    <TouchableOpacity
                      style={[
                        styles.discountButton,
                        discount.isSeniorCitizen && styles.discountButtonActive,
                        isEmpty && styles.discountButtonDisabled,
                      ]}
                      onPress={isEmpty ? undefined : onToggleSeniorCitizen}
                      activeOpacity={isEmpty ? 1 : 0.7}
                      disabled={isEmpty}
                    >
                      <Text
                        style={[
                          styles.discountButtonText,
                          discount.isSeniorCitizen && styles.discountButtonTextActive,
                          isEmpty && styles.discountButtonTextDisabled,
                        ]}
                      >
                        SC/PWD (20% + VAT Exempt)
                      </Text>
                    </TouchableOpacity>

                    {/* Percent/Amount Discount */}
                    {!discount.isSeniorCitizen && (
                      <View style={styles.discountRow}>
                        <TouchableOpacity
                          style={[
                            styles.discountTypeButton,
                            discount.type === 'percent' && styles.discountButtonActive,
                            isEmpty && styles.discountButtonDisabled,
                          ]}
                          onPress={isEmpty ? undefined : () => onSetDiscountType(discount.type === 'percent' ? 'none' : 'percent')}
                          activeOpacity={isEmpty ? 1 : 0.7}
                          disabled={isEmpty}
                        >
                          <Text
                            style={[
                              styles.discountButtonText,
                              discount.type === 'percent' && styles.discountButtonTextActive,
                              isEmpty && styles.discountButtonTextDisabled,
                            ]}
                          >
                            %
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.discountTypeButton,
                            discount.type === 'amount' && styles.discountButtonActive,
                            isEmpty && styles.discountButtonDisabled,
                          ]}
                          onPress={isEmpty ? undefined : () => onSetDiscountType(discount.type === 'amount' ? 'none' : 'amount')}
                          activeOpacity={isEmpty ? 1 : 0.7}
                          disabled={isEmpty}
                        >
                          <Text
                            style={[
                              styles.discountButtonText,
                              discount.type === 'amount' && styles.discountButtonTextActive,
                              isEmpty && styles.discountButtonTextDisabled,
                            ]}
                          >
                            ₱
                          </Text>
                        </TouchableOpacity>

                        {(discount.type === 'percent' || discount.type === 'amount') && (
                          <View style={styles.discountInputContainer}>
                            <Text style={styles.discountInputPrefix}>
                              {discount.type === 'percent' ? '%' : '₱'}
                            </Text>
                            {/* Using a simple view with TouchableOpacity to open keypad */}
                            <TouchableOpacity
                              style={styles.discountInput}
                              onPress={() => {
                                // Will be handled by parent component
                              }}
                            >
                              <Text style={styles.discountInputText}>
                                {discount.value || '0'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                )}
              </View>

              {/* Totals */}
              <View style={styles.totalsSection}>
                {totals.returnItemCount > 0 ? (
                  <>
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>Sales Subtotal</Text>
                      <Text style={styles.totalValue}>₱{formatCurrency(totals.saleSubtotal || 0)}</Text>
                    </View>
                    <View style={styles.totalRow}>
                      <Text style={[styles.totalLabel, styles.returnLabel]}>Returns (BO)</Text>
                      <Text style={[styles.totalValue, styles.returnValue]}>-₱{formatCurrency(totals.returnSubtotal || 0)}</Text>
                    </View>
                  </>
                ) : (totals.discountAmount || 0) > 0 ? (
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Sub-Total</Text>
                    <Text style={styles.totalValue}>₱{formatCurrency(totals.grossTotal || 0)}</Text>
                  </View>
                ) : null}
                {(totals.discountAmount || 0) > 0 ? (
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, styles.discountLabel]}>
                      {discount.isSeniorCitizen ? 'Discount (SC/PWD)' : 'Discount'}
                    </Text>
                    <Text style={[styles.totalValue, styles.discountValue]}>
                      -₱{formatCurrency(totals.discountAmount || 0)}
                    </Text>
                  </View>
                ) : null}
                <View style={[styles.totalRow, (totals.returnItemCount > 0 || (totals.discountAmount || 0) > 0) && styles.grandTotalRow]}>
                  <Text style={[styles.grandTotalLabel, { fontSize: fs.h3 }]}>
                    {totals.returnItemCount > 0 ? 'Net Total' : 'Grand Total'}
                  </Text>
                  <Text style={[styles.grandTotalValue, totals.total < 0 && styles.refundTotal, { fontSize: fs.h2 }]}>
                    {totals.total < 0 ? '-' : ''}₱{formatCurrency(Math.abs(totals.total || 0))}
                  </Text>
                </View>
              </View>
            </>
          )}

          {/* Checkout Button */}
          <View style={styles.checkoutSection}>
            <Button
              mode="contained"
              onPress={onCheckout}
              disabled={isEmpty || loading}
              loading={loading}
              style={styles.checkoutButton}
              contentStyle={styles.checkoutButtonContent}
              labelStyle={[styles.checkoutButtonLabel, { fontSize: fs.button }]}
            >
              {isEmpty ? 'Add Items to Cart' : totals.total < 0 ? `Refund - ₱${formatCurrency(Math.abs(totals.total))}` : `Checkout - ₱${formatCurrency(totals.total || 0)}`}
            </Button>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    color: '#FFFFFF',
    fontSize: 12,
    marginRight: 8,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  headerTotal: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  content: {
    maxHeight: 400,
    paddingBottom: 8,
  },
  emptyCart: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyCartIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  emptyCartText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#616161',
    marginBottom: 4,
  },
  emptyCartSubtext: {
    fontSize: 14,
    color: '#9E9E9E',
  },
  itemsList: {
    maxHeight: 180,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  discountSection: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  discountToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  discountToggleText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2196F3',
  },
  discountApplied: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#F44336',
  },
  discountOptions: {
    paddingTop: 8,
  },
  discountButton: {
    backgroundColor: '#F5F5F5',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  discountButtonActive: {
    backgroundColor: '#4CAF50',
  },
  discountButtonDisabled: {
    backgroundColor: '#E0E0E0',
    opacity: 0.6,
  },
  discountButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#616161',
    textAlign: 'center',
  },
  discountButtonTextActive: {
    color: '#FFFFFF',
  },
  discountButtonTextDisabled: {
    color: '#9E9E9E',
  },
  discountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  discountTypeButton: {
    width: 48,
    height: 40,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  discountInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
  },
  discountInputPrefix: {
    fontSize: 14,
    color: '#616161',
    marginRight: 4,
  },
  discountInput: {
    flex: 1,
  },
  discountInputText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#212121',
  },
  totalsSection: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
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
    color: '#212121',
  },
  discountLabel: {
    color: '#F44336',
  },
  discountValue: {
    color: '#F44336',
    fontWeight: '500',
  },
  grandTotalRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  grandTotalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212121',
  },
  grandTotalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  refundTotal: {
    color: '#D32F2F',
  },
  returnLabel: {
    color: '#D32F2F',
  },
  returnValue: {
    color: '#D32F2F',
    fontWeight: '500',
  },
  checkoutSection: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 48,
  },
  checkoutButton: {
    borderRadius: 12,
  },
  checkoutButtonContent: {
    paddingVertical: 8,
  },
  checkoutButtonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default memo(POSCartPanel);
