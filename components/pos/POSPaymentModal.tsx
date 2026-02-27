import React, { memo, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Alert,
} from 'react-native';
import { Button, TextInput, IconButton, useTheme } from 'react-native-paper';
import POSNumericKeypad from './POSNumericKeypad';
import { useResponsiveTheme } from '../../utils/responsive';
import { CartTotals, DiscountState } from '../../hooks/usePOSCart';

// Format currency with commas
const formatCurrency = (amount: number): string => {
  return amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

type PaymentMethod = 'CASH' | 'CARD' | 'CHECK' | 'ONLINE' | 'CHARGE_INVOICE';

interface Customer {
  id: number;
  name: string;
  phone?: string;
  code?: string;
  credit_limit?: number;
  outstanding_balance?: number;
}

interface POSPaymentModalProps {
  visible: boolean;
  totals: CartTotals;
  discount: DiscountState;
  customers: Customer[];
  onClose: () => void;
  onComplete: (data: {
    paymentMethod: PaymentMethod;
    amountTendered: number;
    customerId?: number;
    customerName?: string;
    checkNumber?: string;
    checkPayee?: string;
    referenceNumber?: string;
    changeAmount?: number;
  }) => void;
  onQuickAddCustomer?: () => void;
  onOpenSeniorDiscount?: () => void;
  onOpenDiscount?: () => void;
  loading?: boolean;
  initialPaymentMethod?: PaymentMethod;
  initialCustomer?: Customer | null;
  requireCustomerName?: boolean;
}

const PAYMENT_METHODS: { key: PaymentMethod; label: string; icon: string }[] = [
  { key: 'CASH', label: 'Cash', icon: '💵' },
  { key: 'CARD', label: 'Card', icon: '💳' },
  { key: 'ONLINE', label: 'GCash/Maya', icon: '📱' },
  { key: 'CHECK', label: 'Check', icon: '📄' },
  { key: 'CHARGE_INVOICE', label: 'Charge', icon: '📋' },
];

function POSPaymentModal({
  visible,
  totals,
  discount,
  customers,
  onClose,
  onComplete,
  onQuickAddCustomer,
  onOpenSeniorDiscount,
  onOpenDiscount,
  loading = false,
  initialPaymentMethod,
  initialCustomer,
  requireCustomerName = false,
}: POSPaymentModalProps) {
  const theme = useTheme();
  const { sp, fs, lo } = useResponsiveTheme();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [amountTendered, setAmountTendered] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  // CHECK payment fields
  const [checkNumber, setCheckNumber] = useState('');
  const [checkPayee, setCheckPayee] = useState('');
  const [checkAmount, setCheckAmount] = useState('');

  // CARD/ONLINE reference number
  const [referenceNumber, setReferenceNumber] = useState('');

  // Reset state when modal opens, using initial values if provided
  useEffect(() => {
    if (visible) {
      const method = initialPaymentMethod || 'CASH';
      setPaymentMethod(method);
      setSelectedCustomer(initialCustomer || null);
      setShowCustomerList(false);
      setCustomerSearch('');
      // Reset all payment fields
      setCheckNumber('');
      setCheckPayee('');
      setCheckAmount('');
      setReferenceNumber('');
      // Set amount based on payment method
      if (method === 'CARD' || method === 'ONLINE') {
        setAmountTendered(totals.total.toFixed(2));
      } else {
        setAmountTendered('');
      }
    }
  }, [visible, initialPaymentMethod, initialCustomer, totals.total]);

  // Handle payment method change - reset amount and set appropriately
  const handlePaymentMethodChange = useCallback((method: PaymentMethod) => {
    setPaymentMethod(method);
    // Reset all fields when switching
    setCheckNumber('');
    setCheckPayee('');
    setCheckAmount('');
    setReferenceNumber('');
    // Set amount based on method
    if (method === 'CARD' || method === 'ONLINE') {
      setAmountTendered(totals.total.toFixed(2));
    } else {
      setAmountTendered('');
    }
  }, [totals.total]);

  // Calculate change
  const tenderedAmount = parseFloat(amountTendered) || 0;
  const checkAmountValue = parseFloat(checkAmount) || 0;
  // For CHECK: change is check amount - total (cash given back)
  // For others: change is amount tendered - total
  const changeAmount = paymentMethod === 'CHECK'
    ? checkAmountValue - totals.total
    : tenderedAmount - totals.total;

  // Quick amount buttons - fixed tender amounts
  const quickAmounts = [
    { label: 'Exact', value: totals.total },
    { label: '₱100', value: 100 },
    { label: '₱200', value: 200 },
    { label: '₱500', value: 500 },
    { label: '₱1000', value: 1000 },
  ];

  // Filter customers
  const filteredCustomers = customers.filter(c => {
    if (!customerSearch.trim()) return true;
    const search = customerSearch.toLowerCase();
    return (
      c.name?.toLowerCase().includes(search) ||
      c.phone?.toLowerCase().includes(search) ||
      c.code?.toLowerCase().includes(search)
    );
  });

  const handleSelectQuickAmount = useCallback((value: number) => {
    setAmountTendered(value.toFixed(2));
  }, []);

  const handleSelectCustomer = useCallback((customer: Customer) => {
    setSelectedCustomer(customer);
    setShowCustomerList(false);
    setCustomerSearch('');
  }, []);

  const handleClearCustomer = useCallback(() => {
    setSelectedCustomer(null);
  }, []);

  const handleComplete = useCallback(() => {
    // Require customer name validation
    if (requireCustomerName && !selectedCustomer) {
      Alert.alert('Customer Required', 'Please select a customer before completing the sale.');
      return;
    }

    // Validation based on payment method
    if (paymentMethod === 'CHARGE_INVOICE' && !selectedCustomer) {
      Alert.alert('Customer Required', 'Please select a customer for charge invoice.');
      return;
    }

    // Credit limit validation for charge invoices
    if (paymentMethod === 'CHARGE_INVOICE' && selectedCustomer) {
      // Check if customer has zero credit limit
      if (!selectedCustomer.credit_limit || selectedCustomer.credit_limit === 0) {
        Alert.alert(
          'No Credit Limit',
          'This customer has zero credit limit and cannot make credit purchases. Please use a different payment method.'
        );
        return;
      }

      // Check if transaction would exceed credit limit
      const currentBalance = selectedCustomer.outstanding_balance || 0;
      const newBalance = currentBalance + totals.total;
      const availableCredit = selectedCustomer.credit_limit - currentBalance;

      if (newBalance > selectedCustomer.credit_limit) {
        Alert.alert(
          'Credit Limit Exceeded',
          `This transaction would exceed the customer's credit limit.\n\n` +
          `Credit Limit: ₱${formatCurrency(selectedCustomer.credit_limit)}\n` +
          `Current Balance: ₱${formatCurrency(currentBalance)}\n` +
          `Available Credit: ₱${formatCurrency(availableCredit)}\n` +
          `Transaction Amount: ₱${formatCurrency(totals.total)}\n\n` +
          `Please collect a payment first or use a different payment method.`
        );
        return;
      }
    }

    // For refund/zero totals (returns >= sales), auto-complete as cash refund
    const isRefundOrZero = totals.total <= 0;

    if (!isRefundOrZero) {
      if (paymentMethod === 'CHECK') {
        if (!checkNumber.trim()) {
          Alert.alert('Check Number Required', 'Please enter the check number.');
          return;
        }
        if (!checkPayee.trim()) {
          Alert.alert('Payee Required', 'Please enter the payee name.');
          return;
        }
        if (checkAmountValue < totals.total) {
          Alert.alert('Insufficient Check Amount', 'Check amount must be at least the total amount.');
          return;
        }
      }

      if (paymentMethod === 'CASH' && tenderedAmount < totals.total) {
        Alert.alert('Insufficient Payment', 'Amount tendered must be at least the total amount.');
        return;
      }
    }

    if (isRefundOrZero) {
      // Refund/zero: no payment needed, customer gets money back
      onComplete({
        paymentMethod: 'CASH',
        amountTendered: 0,
        customerId: selectedCustomer?.id,
        customerName: selectedCustomer?.name,
        changeAmount: Math.abs(totals.total),
      });
      return;
    }

    // For CARD/ONLINE, amount is always exact (already set)
    // No validation needed for amount

    // Determine the amount tendered based on payment method
    let finalAmountTendered = 0;
    if (paymentMethod === 'CHARGE_INVOICE') {
      finalAmountTendered = 0;
    } else if (paymentMethod === 'CHECK') {
      finalAmountTendered = checkAmountValue; // Check amount (can be > total)
    } else if (paymentMethod === 'CARD' || paymentMethod === 'ONLINE') {
      finalAmountTendered = totals.total; // Always exact
    } else {
      finalAmountTendered = tenderedAmount; // CASH
    }

    onComplete({
      paymentMethod,
      amountTendered: finalAmountTendered,
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer?.name,
      // Additional fields for specific payment methods
      checkNumber: paymentMethod === 'CHECK' ? checkNumber : undefined,
      checkPayee: paymentMethod === 'CHECK' ? checkPayee : undefined,
      referenceNumber: (paymentMethod === 'CARD' || paymentMethod === 'ONLINE') ? referenceNumber : undefined,
      changeAmount: changeAmount > 0 ? changeAmount : 0,
    });
  }, [paymentMethod, tenderedAmount, totals.total, selectedCustomer, onComplete, checkNumber, checkPayee, checkAmountValue, referenceNumber, changeAmount, requireCustomerName]);

  // Validation based on payment method
  const isValid = (() => {
    // When require_customer_name is on, customer must be selected for all payment methods
    if (requireCustomerName && !selectedCustomer) {
      return false;
    }
    if (paymentMethod === 'CHARGE_INVOICE') {
      return selectedCustomer !== null;
    }
    if (paymentMethod === 'CHECK') {
      return checkNumber.trim() !== '' && checkPayee.trim() !== '' && checkAmountValue >= totals.total;
    }
    if (paymentMethod === 'CARD' || paymentMethod === 'ONLINE') {
      return true; // Always valid - amount is exact
    }
    // CASH
    return tenderedAmount >= totals.total;
  })();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
        >
          <View style={[styles.container, { padding: sp.md }]}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={[styles.headerTitle, { fontSize: fs.h2 }]}>Payment</Text>
              <IconButton
                icon="close"
                size={24}
                onPress={onClose}
                style={styles.closeButton}
              />
            </View>

            {/* Customer Selection Modal */}
            {showCustomerList ? (
              <View style={styles.customerListContainer}>
                <View style={styles.customerSearchRow}>
                  <TextInput
                    placeholder="Search customers..."
                    value={customerSearch}
                    onChangeText={setCustomerSearch}
                    mode="outlined"
                    style={styles.customerSearchInput}
                    dense
                    left={<TextInput.Icon icon="magnify" />}
                    right={customerSearch ? (
                      <TextInput.Icon
                        icon="close"
                        onPress={() => setCustomerSearch('')}
                      />
                    ) : null}
                  />
                  <Button
                    mode="text"
                    onPress={() => setShowCustomerList(false)}
                  >
                    Cancel
                  </Button>
                </View>
                {/* Quick Add Customer Button */}
                {onQuickAddCustomer && (
                  <TouchableOpacity
                    style={styles.quickAddCustomerButton}
                    onPress={() => {
                      setShowCustomerList(false);
                      onQuickAddCustomer();
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.quickAddCustomerIcon}>👤</Text>
                    <Text style={styles.quickAddCustomerText}>+ Quick Add New Customer</Text>
                  </TouchableOpacity>
                )}
                <FlatList
                  data={filteredCustomers}
                  keyExtractor={item => item.id.toString()}
                  style={styles.customerList}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.customerItem}
                      onPress={() => handleSelectCustomer(item)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.customerItemLeft}>
                        <Text style={styles.customerName}>{item.name}</Text>
                        {item.phone && (
                          <Text style={styles.customerPhone}>{item.phone}</Text>
                        )}
                      </View>
                      {(item.credit_limit !== undefined || item.outstanding_balance !== undefined) && (
                        <View style={styles.customerItemRight}>
                          {item.outstanding_balance !== undefined && item.outstanding_balance > 0 && (
                            <Text style={styles.customerBalance}>
                              Bal: ₱{formatCurrency(item.outstanding_balance)}
                            </Text>
                          )}
                          {item.credit_limit !== undefined && item.credit_limit > 0 && (
                            <Text style={styles.customerCreditLimit}>
                              Limit: ₱{formatCurrency(item.credit_limit)}
                            </Text>
                          )}
                        </View>
                      )}
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    <Text style={styles.emptyCustomers}>No customers found</Text>
                  }
                />
              </View>
            ) : (
              <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Total Display */}
                <View style={styles.totalDisplay}>
                  <Text style={styles.totalLabel}>Total Amount</Text>
                  <Text style={[styles.totalAmount, { color: theme.colors.primary, fontSize: fs.hero }]}>
                    ₱{formatCurrency(totals.total)}
                  </Text>
                  {discount.isSeniorCitizen && (
                    <Text style={styles.discountNote}>SC/PWD discount applied</Text>
                  )}
                  {(discount.type === 'percent' || discount.type === 'amount') && !discount.isSeniorCitizen && (
                    <Text style={styles.discountNote}>
                      Discount: {discount.type === 'percent' ? `${discount.value}%` : `₱${discount.value}`}
                    </Text>
                  )}
                </View>

                {/* Compact Discount Buttons */}
                {(onOpenSeniorDiscount || onOpenDiscount) && (
                  <View style={styles.compactDiscountRow}>
                    {onOpenSeniorDiscount && (
                      <TouchableOpacity
                        style={[
                          styles.compactDiscountButton,
                          discount.isSeniorCitizen && styles.compactDiscountButtonActive,
                        ]}
                        onPress={onOpenSeniorDiscount}
                        activeOpacity={0.7}
                      >
                        <Text style={[
                          styles.compactDiscountText,
                          discount.isSeniorCitizen && styles.compactDiscountTextActive,
                        ]}>
                          {discount.isSeniorCitizen ? '👴 SC/PWD ✓' : '👴 SC/PWD'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {onOpenDiscount && (
                      <TouchableOpacity
                        style={[
                          styles.compactDiscountButton,
                          (discount.type === 'percent' || discount.type === 'amount') && !discount.isSeniorCitizen && styles.compactDiscountButtonActive,
                        ]}
                        onPress={onOpenDiscount}
                        activeOpacity={0.7}
                      >
                        <Text style={[
                          styles.compactDiscountText,
                          (discount.type === 'percent' || discount.type === 'amount') && !discount.isSeniorCitizen && styles.compactDiscountTextActive,
                        ]}>
                          {(discount.type === 'percent' || discount.type === 'amount') && !discount.isSeniorCitizen
                            ? `💰 ${discount.type === 'percent' ? discount.value + '%' : '₱' + discount.value}`
                            : '💰 Discount'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Payment Methods */}
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { fontSize: fs.bodySmall }]}>Payment Method</Text>
                  <View style={styles.paymentMethods}>
                    {PAYMENT_METHODS.map(method => (
                      <TouchableOpacity
                        key={method.key}
                        style={[
                          styles.paymentMethodButton,
                          paymentMethod === method.key && {
                            backgroundColor: '#E3F2FD',
                            borderColor: theme.colors.primary,
                          },
                        ]}
                        onPress={() => handlePaymentMethodChange(method.key)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.paymentMethodIcon}>{method.icon}</Text>
                        <Text
                          style={[
                            styles.paymentMethodLabel,
                            paymentMethod === method.key && { color: theme.colors.primary },
                          ]}
                        >
                          {method.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Customer Selection (for Charge Invoice) */}
                {paymentMethod === 'CHARGE_INVOICE' && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Customer (Required)</Text>
                    {selectedCustomer ? (
                      <View style={styles.selectedCustomerContainer}>
                        <View style={styles.selectedCustomer}>
                          <View style={styles.selectedCustomerInfo}>
                            <Text style={styles.selectedCustomerName}>
                              {selectedCustomer.name}
                            </Text>
                            {selectedCustomer.phone && (
                              <Text style={styles.selectedCustomerPhone}>
                                {selectedCustomer.phone}
                              </Text>
                            )}
                          </View>
                          <TouchableOpacity
                            style={styles.changeCustomerButton}
                            onPress={handleClearCustomer}
                          >
                            <Text style={styles.changeCustomerText}>Change</Text>
                          </TouchableOpacity>
                        </View>
                        {/* Show credit info for charge invoice */}
                        {(selectedCustomer.outstanding_balance !== undefined || selectedCustomer.credit_limit !== undefined) && (
                          <View style={styles.creditInfoBox}>
                            {selectedCustomer.outstanding_balance !== undefined && selectedCustomer.outstanding_balance > 0 && (
                              <View style={styles.creditInfoRow}>
                                <Text style={styles.creditInfoLabel}>Current Balance:</Text>
                                <Text style={styles.creditInfoValueRed}>₱{formatCurrency(selectedCustomer.outstanding_balance)}</Text>
                              </View>
                            )}
                            {selectedCustomer.credit_limit !== undefined && selectedCustomer.credit_limit > 0 && (
                              <View style={styles.creditInfoRow}>
                                <Text style={styles.creditInfoLabel}>Credit Limit:</Text>
                                <Text style={styles.creditInfoValue}>₱{formatCurrency(selectedCustomer.credit_limit)}</Text>
                              </View>
                            )}
                            <View style={styles.creditInfoRow}>
                              <Text style={styles.creditInfoLabel}>After This Sale:</Text>
                              <Text style={styles.creditInfoValueBold}>
                                ₱{formatCurrency((selectedCustomer.outstanding_balance || 0) + totals.total)}
                              </Text>
                            </View>
                          </View>
                        )}
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.selectCustomerButton}
                        onPress={() => setShowCustomerList(true)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.selectCustomerText}>
                          Select Customer...
                        </Text>
                      </TouchableOpacity>
                    )}
                    <Text style={styles.chargeNote}>
                      This amount will be added to the customer's balance.
                    </Text>
                  </View>
                )}

                {/* CASH Payment - Amount Entry with Keypad */}
                {paymentMethod === 'CASH' && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Amount Tendered</Text>

                    {/* Quick Amount Buttons */}
                    <View style={styles.quickAmounts}>
                      {quickAmounts.map((qa, index) => (
                        <TouchableOpacity
                          key={index}
                          style={[
                            styles.quickAmountButton,
                            tenderedAmount.toString() === qa.value.toFixed(2) && {
                              backgroundColor: theme.colors.primary,
                            },
                          ]}
                          onPress={() => handleSelectQuickAmount(qa.value)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.quickAmountText,
                              tenderedAmount.toString() === qa.value.toFixed(2) && {
                                color: '#FFFFFF',
                              },
                            ]}
                          >
                            {qa.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* Amount Display */}
                    <View style={styles.amountDisplay}>
                      <Text style={styles.amountPrefix}>₱</Text>
                      <Text style={styles.amountValue}>
                        {amountTendered || '0.00'}
                      </Text>
                    </View>

                    {/* Numeric Keypad */}
                    <POSNumericKeypad
                      value={amountTendered}
                      onChange={setAmountTendered}
                      maxLength={10}
                      showDecimal={true}
                    />

                    {/* Change Display */}
                    {tenderedAmount >= totals.total && (
                      <View style={styles.changeDisplay}>
                        <Text style={styles.changeLabel}>Change</Text>
                        <Text style={styles.changeAmount}>
                          ₱{formatCurrency(changeAmount)}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* CHECK Payment - Check Details Entry */}
                {paymentMethod === 'CHECK' && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Check Details</Text>

                    {/* Check Number */}
                    <TextInput
                      label="Check Number *"
                      value={checkNumber}
                      onChangeText={setCheckNumber}
                      mode="outlined"
                      style={styles.checkInput}
                      dense
                      placeholder="Enter check number"
                    />

                    {/* Payee Name */}
                    <TextInput
                      label="Payee Name *"
                      value={checkPayee}
                      onChangeText={setCheckPayee}
                      mode="outlined"
                      style={styles.checkInput}
                      dense
                      placeholder="Enter payee name"
                    />

                    {/* Check Amount */}
                    <TextInput
                      label="Check Amount *"
                      value={checkAmount}
                      onChangeText={setCheckAmount}
                      mode="outlined"
                      style={styles.checkInput}
                      dense
                      keyboardType="decimal-pad"
                      placeholder="Enter check amount"
                      left={<TextInput.Affix text="₱" />}
                    />

                    {/* Check Amount Summary */}
                    <View style={styles.checkSummary}>
                      <View style={styles.checkSummaryRow}>
                        <Text style={styles.checkSummaryLabel}>Total Amount:</Text>
                        <Text style={styles.checkSummaryValue}>₱{formatCurrency(totals.total)}</Text>
                      </View>
                      <View style={styles.checkSummaryRow}>
                        <Text style={styles.checkSummaryLabel}>Check Amount:</Text>
                        <Text style={styles.checkSummaryValue}>₱{formatCurrency(checkAmountValue)}</Text>
                      </View>
                      {checkAmountValue >= totals.total && (
                        <View style={[styles.checkSummaryRow, styles.checkChangeRow]}>
                          <Text style={styles.checkChangeLabel}>Cash Change:</Text>
                          <Text style={styles.checkChangeValue}>₱{formatCurrency(changeAmount)}</Text>
                        </View>
                      )}
                      {checkAmountValue > 0 && checkAmountValue < totals.total && (
                        <Text style={styles.checkWarning}>
                          Check amount must be at least ₱{formatCurrency(totals.total)}
                        </Text>
                      )}
                    </View>
                  </View>
                )}

                {/* CARD/ONLINE Payment - Exact Amount with Reference */}
                {(paymentMethod === 'CARD' || paymentMethod === 'ONLINE') && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                      {paymentMethod === 'CARD' ? 'Card Payment' : 'GCash/Maya Payment'}
                    </Text>

                    {/* Exact Amount Display */}
                    <View style={styles.exactAmountDisplay}>
                      <Text style={styles.exactAmountLabel}>Amount (Exact)</Text>
                      <Text style={styles.exactAmountValue}>₱{formatCurrency(totals.total)}</Text>
                      <Text style={styles.exactAmountNote}>No change for {paymentMethod === 'CARD' ? 'card' : 'e-wallet'} payments</Text>
                    </View>

                    {/* Reference Number */}
                    <TextInput
                      label="Reference Number / Notes"
                      value={referenceNumber}
                      onChangeText={setReferenceNumber}
                      mode="outlined"
                      style={styles.referenceInput}
                      dense
                      placeholder={paymentMethod === 'CARD' ? 'Card approval code or last 4 digits' : 'GCash/Maya reference number'}
                    />
                  </View>
                )}

                {/* Customer Selection (for non-charge) */}
                {paymentMethod !== 'CHARGE_INVOICE' && (
                  <View style={styles.section}>
                    <Text style={[styles.sectionTitle, requireCustomerName && !selectedCustomer && { color: '#D32F2F' }]}>
                      {requireCustomerName ? 'Customer (Required)' : 'Customer (Optional)'}
                    </Text>
                    {selectedCustomer ? (
                      <View style={styles.selectedCustomer}>
                        <View style={styles.selectedCustomerInfo}>
                          <Text style={styles.selectedCustomerName}>
                            {selectedCustomer.name}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.changeCustomerButton}
                          onPress={handleClearCustomer}
                        >
                          <Text style={styles.changeCustomerText}>Clear</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[
                          styles.selectCustomerButton,
                          requireCustomerName ? styles.selectCustomerButtonRequired : styles.selectCustomerButtonOptional,
                        ]}
                        onPress={() => setShowCustomerList(true)}
                        activeOpacity={0.7}
                      >
                        <Text style={requireCustomerName ? styles.selectCustomerTextRequired : styles.selectCustomerTextOptional}>
                          {requireCustomerName ? '⚠ Select Customer' : '+ Add Customer'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </ScrollView>
            )}

            {/* Footer */}
            {!showCustomerList && (
              <View style={styles.footer}>
                <Button
                  mode="outlined"
                  onPress={onClose}
                  style={styles.cancelButton}
                >
                  Cancel
                </Button>
                <Button
                  mode="contained"
                  onPress={handleComplete}
                  disabled={!isValid || loading}
                  loading={loading}
                  style={styles.completeButton}
                  contentStyle={styles.completeButtonContent}
                >
                  {paymentMethod === 'CHARGE_INVOICE'
                    ? 'Create Invoice'
                    : 'Complete Sale'}
                </Button>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '95%',
    minHeight: 400,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212121',
  },
  closeButton: {
    margin: 0,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    maxHeight: 500,
  },
  totalDisplay: {
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 14,
    color: '#616161',
    marginBottom: 4,
  },
  totalAmount: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  discountNote: {
    fontSize: 12,
    color: '#4CAF50',
    marginTop: 4,
  },
  compactDiscountRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  compactDiscountButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  compactDiscountButtonActive: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  compactDiscountText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#616161',
  },
  compactDiscountTextActive: {
    color: '#2E7D32',
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#616161',
    marginBottom: 6,
  },
  paymentMethods: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  paymentMethodButton: {
    flex: 1,
    minWidth: 60,
    paddingVertical: 8,
    paddingHorizontal: 6,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  paymentMethodIcon: {
    fontSize: 22,
    marginBottom: 2,
  },
  paymentMethodLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#616161',
    textAlign: 'center',
  },
  quickAmounts: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  quickAmountButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    alignItems: 'center',
  },
  quickAmountText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#616161',
  },
  amountDisplay: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'baseline',
    paddingVertical: 10,
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    marginBottom: 10,
  },
  amountPrefix: {
    fontSize: 24,
    fontWeight: '600',
    color: '#616161',
    marginRight: 4,
  },
  amountValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#212121',
  },
  changeDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    marginTop: 10,
  },
  changeLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2E7D32',
  },
  changeAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  selectCustomerButton: {
    padding: 16,
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF9800',
    borderStyle: 'dashed',
  },
  selectCustomerButtonOptional: {
    backgroundColor: '#F5F5F5',
    borderColor: '#BDBDBD',
  },
  selectCustomerText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#E65100',
    textAlign: 'center',
  },
  selectCustomerTextOptional: {
    fontSize: 14,
    fontWeight: '500',
    color: '#616161',
    textAlign: 'center',
  },
  selectCustomerButtonRequired: {
    backgroundColor: '#FFF3E0',
    borderColor: '#E65100',
  },
  selectCustomerTextRequired: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E65100',
    textAlign: 'center',
  },
  selectedCustomer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
  },
  selectedCustomerInfo: {
    flex: 1,
  },
  selectedCustomerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2E7D32',
  },
  selectedCustomerPhone: {
    fontSize: 13,
    color: '#616161',
    marginTop: 2,
  },
  changeCustomerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  changeCustomerText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#F44336',
  },
  chargeNote: {
    fontSize: 12,
    color: '#FF9800',
    fontStyle: 'italic',
    marginTop: 8,
  },
  customerListContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    minHeight: 300,
  },
  customerSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  customerSearchInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  customerList: {
    flex: 1,
    minHeight: 200,
    maxHeight: 350,
  },
  customerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  customerItemLeft: {
    flex: 1,
  },
  customerItemRight: {
    alignItems: 'flex-end',
  },
  customerName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#212121',
  },
  customerPhone: {
    fontSize: 13,
    color: '#616161',
    marginTop: 2,
  },
  customerBalance: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F44336',
  },
  customerCreditLimit: {
    fontSize: 11,
    color: '#9E9E9E',
    marginTop: 2,
  },
  quickAddCustomerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    marginBottom: 12,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2196F3',
    borderStyle: 'dashed',
  },
  quickAddCustomerIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  quickAddCustomerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976D2',
  },
  selectedCustomerContainer: {
    marginBottom: 8,
  },
  creditInfoBox: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
  },
  creditInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  creditInfoLabel: {
    fontSize: 13,
    color: '#616161',
  },
  creditInfoValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#212121',
  },
  creditInfoValueRed: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F44336',
  },
  creditInfoValueBold: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E65100',
  },
  emptyCustomers: {
    textAlign: 'center',
    padding: 24,
    color: '#9E9E9E',
  },
  // CHECK Payment styles
  checkInput: {
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  checkSummary: {
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
    marginTop: 4,
  },
  checkSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  checkSummaryLabel: {
    fontSize: 14,
    color: '#616161',
  },
  checkSummaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
  },
  checkChangeRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  checkChangeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2E7D32',
  },
  checkChangeValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  checkWarning: {
    marginTop: 8,
    fontSize: 12,
    color: '#F44336',
    fontStyle: 'italic',
  },
  // CARD/ONLINE Payment styles
  exactAmountDisplay: {
    backgroundColor: '#E3F2FD',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  exactAmountLabel: {
    fontSize: 14,
    color: '#1976D2',
    marginBottom: 4,
  },
  exactAmountValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1565C0',
  },
  exactAmountNote: {
    fontSize: 12,
    color: '#64B5F6',
    marginTop: 4,
  },
  referenceInput: {
    backgroundColor: '#FFFFFF',
  },
  footer: {
    flexDirection: 'row',
    padding: 12,
    paddingBottom: 48,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
  },
  completeButton: {
    flex: 2,
  },
  completeButtonContent: {
    paddingVertical: 4,
  },
});

export default memo(POSPaymentModal);
