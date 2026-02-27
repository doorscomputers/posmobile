import React, { memo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CartItem } from '../../hooks/usePOSCart';
import { useResponsive, useResponsiveTheme } from '../../utils/responsive';

// Format currency with commas
const formatCurrency = (amount: number): string => {
  return amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

interface POSCartItemProps {
  item: CartItem;
  index: number; // Item number (1, 2, 3...)
  onIncrement: (productId: number, itemType?: 'sale' | 'return') => void;
  onDecrement: (productId: number, itemType?: 'sale' | 'return') => void;
  onRemove: (productId: number, itemType?: 'sale' | 'return') => void;
  onQuantityPress?: (item: CartItem) => void; // For manual qty input
}

function POSCartItem({
  item,
  index,
  onIncrement,
  onDecrement,
  onRemove,
  onQuantityPress,
}: POSCartItemProps) {
  const { width } = useResponsive();
  const { sp, fs, lo, isPhone } = useResponsiveTheme();
  const lineTotal = item.price * item.quantity;
  const isSmallScreen = width < 380;
  const isReturn = item.item_type === 'return';

  // Responsive overrides
  const qtyBtnSize = isPhone ? sp.xl : sp.xl + sp.xs;
  const indexSize = isPhone ? sp.lg + 2 : sp.xl - 2;

  const handleIncrement = useCallback(() => {
    onIncrement(item.id, item.item_type);
  }, [item.id, item.item_type, onIncrement]);

  const handleDecrement = useCallback(() => {
    onDecrement(item.id, item.item_type);
  }, [item.id, item.item_type, onDecrement]);

  const handleRemove = useCallback(() => {
    onRemove(item.id, item.item_type);
  }, [item.id, item.item_type, onRemove]);

  const handleQuantityPress = useCallback(() => {
    if (onQuantityPress) {
      onQuantityPress(item);
    }
  }, [item, onQuantityPress]);

  return (
    <View style={[styles.container, isReturn && styles.returnContainer, { paddingVertical: sp.xs, paddingHorizontal: sp.sm + 2 }]}>
      {/* LINE 1: Index + Product Name (Full Width) */}
      <View style={styles.topRow}>
        <View style={[styles.indexContainer, isReturn && styles.returnIndexContainer, { width: indexSize, height: indexSize, borderRadius: indexSize / 2, marginRight: sp.sm }]}>
          <Text style={[styles.indexText, isReturn && styles.returnIndexText, { fontSize: fs.caption }]}>{index}</Text>
        </View>
        <View style={styles.nameContainer}>
          <Text style={[styles.productName, isReturn && styles.returnProductName, { fontSize: fs.body }]} numberOfLines={1}>
            {item.name || 'Unknown Product'}
          </Text>
          <View style={styles.badgeRow}>
            {isReturn && (
              <View style={styles.returnBadge}>
                <Text style={styles.returnBadgeText}>BO</Text>
              </View>
            )}
            {item.price_type === 'wholesale' && (
              <View style={[styles.wholesaleBadge, isReturn && { marginLeft: 4 }]}>
                <Text style={styles.wholesaleBadgeText}>WS</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* LINE 2: Unit Price + Qty Controls + Amount + Delete */}
      <View style={[styles.bottomRow, { paddingLeft: indexSize + sp.sm }]}>
        {/* Unit Price */}
        <Text style={[styles.unitPrice, { fontSize: fs.caption, marginRight: sp.sm + sp.xs }]}>
          ₱{formatCurrency(item.price || 0)} × {item.quantity || 0}
        </Text>

        {/* Quantity Controls */}
        <View style={styles.quantityContainer}>
          <TouchableOpacity
            style={[styles.quantityButton, styles.decrementButton, { width: qtyBtnSize, height: qtyBtnSize }]}
            onPress={handleDecrement}
            activeOpacity={0.7}
          >
            <Text style={[styles.quantityButtonText, { fontSize: fs.cardTitle }]}>−</Text>
          </TouchableOpacity>

          {/* Tappable Quantity Display */}
          <TouchableOpacity
            style={[styles.quantityDisplay, { minWidth: qtyBtnSize + sp.sm, marginHorizontal: sp.xs }]}
            onPress={handleQuantityPress}
            activeOpacity={0.7}
          >
            <Text style={[styles.quantityText, { fontSize: fs.body }]}>{item.quantity || 0}</Text>
            {!isSmallScreen && <Text style={styles.editHint}>tap</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quantityButton, styles.incrementButton, { width: qtyBtnSize, height: qtyBtnSize }]}
            onPress={handleIncrement}
            activeOpacity={0.7}
          >
            <Text style={[styles.quantityButtonText, { fontSize: fs.cardTitle }]}>+</Text>
          </TouchableOpacity>
        </View>

        {/* Spacer */}
        <View style={styles.spacer} />

        {/* Line Total */}
        <Text style={[styles.lineTotal, isReturn && styles.returnLineTotal, { fontSize: fs.body, marginRight: sp.sm }]}>
          {isReturn ? '-' : ''}₱{formatCurrency(lineTotal)}
        </Text>

        {/* Remove Button */}
        <TouchableOpacity
          style={[styles.removeButton, { width: qtyBtnSize, height: qtyBtnSize }]}
          onPress={handleRemove}
          activeOpacity={0.7}
        >
          <Text style={[styles.removeButtonText, { fontSize: fs.bodySmall }]}>🗑</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 3,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  // LINE 1: Product Name Row
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  indexContainer: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    flexShrink: 0,
  },
  indexText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1976D2',
  },
  nameContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  productName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212121',
    flex: 1,
    marginRight: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  wholesaleBadge: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  wholesaleBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Return/BO item styles
  returnContainer: {
    backgroundColor: '#FFF5F5',
    borderColor: '#FFCDD2',
  },
  returnIndexContainer: {
    backgroundColor: '#FFEBEE',
  },
  returnIndexText: {
    color: '#D32F2F',
  },
  returnProductName: {
    color: '#C62828',
  },
  returnBadge: {
    backgroundColor: '#D32F2F',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  returnBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  returnLineTotal: {
    color: '#D32F2F',
  },
  // LINE 2: Controls Row
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 34, // Align with product name (26px index + 8px margin)
  },
  unitPrice: {
    fontSize: 12,
    color: '#757575',
    marginRight: 12,
    flexShrink: 0,
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  quantityButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  decrementButton: {
    backgroundColor: '#FFEBEE',
  },
  incrementButton: {
    backgroundColor: '#E8F5E9',
  },
  quantityButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212121',
    lineHeight: 20,
  },
  quantityDisplay: {
    minWidth: 40,
    paddingHorizontal: 6,
    paddingVertical: 4,
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 6,
    marginHorizontal: 4,
  },
  quantityText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212121',
  },
  editHint: {
    fontSize: 8,
    color: '#9E9E9E',
    marginTop: -2,
  },
  spacer: {
    flex: 1,
    minWidth: 8,
  },
  lineTotal: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginRight: 8,
    flexShrink: 0,
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#FFEBEE',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  removeButtonText: {
    fontSize: 15,
  },
});

export default memo(POSCartItem);
