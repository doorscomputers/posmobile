/**
 * DailyInventoryScreen - Daily accountability sheet for bakery/route sales
 *
 * Workflow: Morning (enter beginning qty) -> Sales auto-tracked ->
 * End of day (enter ending qty) -> Variance calculated -> Print report
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TextInput as RNTextInput,
  Platform,
} from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Button,
  useTheme,
  Divider,
  IconButton,
  Chip,
  Text,
  Dialog,
  Portal,
  TextInput,
} from 'react-native-paper';
import { StackNavigationProp } from '@react-navigation/stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../App';
import { getDatabase } from '../database/getDatabase';
import { useAuth } from '../contexts/AuthContext';
import { toLocalDateString } from '../utils/dateTime';
import { useResponsiveTheme } from '../utils/responsive';
import ReportActionsBar from '../components/ReportActionsBar';
import { ESCPOSBuilder, PRINTER_WIDTH, buildDailyInventoryReport } from '../utils/escpos';

type Props = {
  navigation: StackNavigationProp<RootStackParamList, 'DailyInventory'>;
};

interface SessionItem {
  id: number;
  session_id: string;
  product_id: number;
  product_code: string;
  product_name: string;
  unit_price: number;
  unit_cost: number;
  beginning_qty: number;
  sold_qty: number;
  ending_qty: number | null;
  variance: number;
  variance_value: number;
}

export default function DailyInventoryScreen({ navigation }: Props) {
  const { user } = useAuth();
  const theme = useTheme();
  const { sp, fs, lo } = useResponsiveTheme();

  const [loading, setLoading] = useState(false);
  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [items, setItems] = useState<SessionItem[]>([]);
  const [pastSessions, setPastSessions] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [enteringEnding, setEnteringEnding] = useState(false);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<SessionItem[]>([]);
  const [cancelDialogVisible, setCancelDialogVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Refresh data on screen focus
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const db = getDatabase();

      const session = await db.getActiveDailyInventorySession();
      setActiveSession(session);

      if (session) {
        const sessionItems = await db.getDailyInventoryItems(session.session_id);
        setItems(sessionItems);
      } else {
        setItems([]);
      }

      const history = await db.getDailyInventorySessions();
      // Only show non-active sessions in history
      setPastSessions(history.filter((s: any) => !['beginning', 'in_progress'].includes(s.status)));
    } catch (error) {
      console.error('Error loading daily inventory data:', error);
      Alert.alert('Error', 'Failed to load daily inventory data');
    } finally {
      setLoading(false);
    }
  };

  const handleStartSession = async () => {
    try {
      setLoading(true);
      const db = getDatabase();
      await db.createDailyInventorySession(user!.id);
      await loadData();
      Alert.alert('Success', 'Daily inventory session started. Enter beginning quantities for your products.');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to start session');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateBeginningQty = async (productId: number, qty: string) => {
    if (!activeSession) return;
    const numQty = parseInt(qty) || 0;
    try {
      const db = getDatabase();
      await db.updateDailyInventoryBeginningQty(activeSession.session_id, productId, numQty);
      setItems(prev => prev.map(item =>
        item.product_id === productId ? { ...item, beginning_qty: numQty } : item
      ));
    } catch (error) {
      console.error('Error updating beginning qty:', error);
    }
  };

  const handleLockBeginning = async () => {
    if (!activeSession) return;

    const hasItems = items.some(i => i.beginning_qty > 0);
    if (!hasItems) {
      Alert.alert('No Quantities', 'Please enter beginning quantities for at least one product before locking.');
      return;
    }

    Alert.alert(
      'Lock Beginning Inventory',
      'Once locked, beginning quantities cannot be changed. Sales will be tracked automatically. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Lock & Start',
          onPress: async () => {
            try {
              setLoading(true);
              const db = getDatabase();
              await db.lockBeginningInventory(activeSession.session_id, user!.id);
              await loadData();
            } catch (error: any) {
              Alert.alert('Error', error.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleUpdateEndingQty = async (productId: number, qty: string) => {
    if (!activeSession) return;
    const numQty = parseInt(qty) || 0;
    try {
      const db = getDatabase();
      await db.updateDailyInventoryEndingQty(activeSession.session_id, productId, numQty);
      // Refresh to get calculated variance
      const sessionItems = await db.getDailyInventoryItems(activeSession.session_id);
      setItems(sessionItems);
    } catch (error) {
      console.error('Error updating ending qty:', error);
    }
  };

  const handleComplete = async () => {
    if (!activeSession) return;

    const unenteredCount = items.filter(i => i.beginning_qty > 0 && i.ending_qty === null).length;
    const message = unenteredCount > 0
      ? `${unenteredCount} item(s) have no ending count. They will default to expected remaining (beginning - sold). Complete anyway?`
      : 'Complete this daily inventory session?';

    Alert.alert(
      'Complete Daily Inventory',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            try {
              setLoading(true);
              const db = getDatabase();
              // Default unentered ending qty to expected remaining (beginning - sold)
              for (const item of items) {
                if (item.beginning_qty > 0 && item.ending_qty === null) {
                  const defaultQty = item.beginning_qty - item.sold_qty;
                  await db.updateDailyInventoryEndingQty(activeSession.session_id, item.product_id, defaultQty);
                }
              }
              await db.completeDailyInventory(activeSession.session_id, user!.id);
              setEnteringEnding(false);
              await loadData();
              Alert.alert('Success', 'Daily inventory session completed.');
            } catch (error: any) {
              Alert.alert('Error', error.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleCancel = async () => {
    if (!activeSession || !cancelReason.trim()) return;
    try {
      setLoading(true);
      const db = getDatabase();
      await db.cancelDailyInventory(activeSession.session_id, user!.id, cancelReason.trim());
      setCancelDialogVisible(false);
      setCancelReason('');
      setEnteringEnding(false);
      await loadData();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExpandSession = async (sessionId: string) => {
    if (expandedSessionId === sessionId) {
      setExpandedSessionId(null);
      setExpandedItems([]);
      return;
    }
    try {
      const db = getDatabase();
      const sessionItems = await db.getDailyInventoryItems(sessionId);
      setExpandedItems(sessionItems);
      setExpandedSessionId(sessionId);
    } catch (error) {
      console.error('Error loading session items:', error);
    }
  };

  const formatCurrency = (amount: number) => `\u20B1${amount.toFixed(2)}`;

  const filteredItems = items.filter(item => {
    // In "in_progress" phase, hide items with 0 beginning qty to declutter the list
    if (activeSession?.status === 'in_progress' && item.beginning_qty === 0) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return item.product_name.toLowerCase().includes(q) || item.product_code.toLowerCase().includes(q);
  });

  const totalBeginning = items.reduce((s, i) => s + i.beginning_qty, 0);
  const totalSold = items.reduce((s, i) => s + i.sold_qty, 0);
  const totalEnding = items.reduce((s, i) => s + (i.ending_qty ?? 0), 0);
  const totalVariance = items.reduce((s, i) => s + i.variance, 0);
  const totalVarianceValue = items.reduce((s, i) => s + i.variance_value, 0);

  // Build ESC/POS print data
  const buildPrintData = (printerWidth: number): ESCPOSBuilder => {
    const data = activeSession || (expandedSessionId ? pastSessions.find(s => s.session_id === expandedSessionId) : null);
    const printItems = activeSession ? items : expandedItems;
    if (!data || !printItems.length) return new ESCPOSBuilder(printerWidth);

    return buildDailyInventoryReport({
      sessionId: data.session_id,
      date: data.date,
      status: data.status,
      items: printItems.filter(i => i.beginning_qty > 0).map(i => ({
        name: i.product_name,
        beginning: i.beginning_qty,
        sold: i.sold_qty,
        ending: i.ending_qty ?? 0,
        variance: i.variance,
      })),
      totalBeginning: data.total_beginning_qty || totalBeginning,
      totalSold: data.total_sold_qty || totalSold,
      totalEnding: data.total_ending_qty || totalEnding,
      totalVariance: data.total_variance || totalVariance,
      totalVarianceValue: data.total_variance_value || totalVarianceValue,
    }, printerWidth);
  };

  // Build PDF HTML
  const buildPdfHtml = (): string => {
    const data = activeSession || (expandedSessionId ? pastSessions.find((s: any) => s.session_id === expandedSessionId) : null);
    const printItems = activeSession ? items : expandedItems;
    if (!data) return '<html><body>No data</body></html>';

    const activeItems = printItems.filter(i => i.beginning_qty > 0);
    const rows = activeItems.map(i => `
      <tr>
        <td>${i.product_name}</td>
        <td style="text-align:right">${i.beginning_qty}</td>
        <td style="text-align:right">${i.sold_qty}</td>
        <td style="text-align:right">${i.ending_qty ?? '-'}</td>
        <td style="text-align:right;color:${i.variance > 0 ? 'red' : i.variance < 0 ? 'blue' : 'green'}">${i.variance}</td>
        <td style="text-align:right">\u20B1${i.variance_value.toFixed(2)}</td>
      </tr>
    `).join('');

    return `
      <html><head><style>
        body { font-family: Arial; padding: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; }
        th { background: #f5f5f5; font-weight: bold; }
        .header { text-align: center; margin-bottom: 16px; }
        .totals td { font-weight: bold; background: #f5f5f5; }
      </style></head><body>
        <div class="header">
          <h2>DAILY INVENTORY REPORT</h2>
          <p>Session: ${data.session_id} | Date: ${data.date} | Status: ${data.status.toUpperCase()}</p>
        </div>
        <table>
          <thead>
            <tr><th>Product</th><th>Beginning</th><th>Sold</th><th>Ending</th><th>Variance</th><th>Value</th></tr>
          </thead>
          <tbody>${rows}
            <tr class="totals">
              <td>TOTALS</td>
              <td style="text-align:right">${data.total_beginning_qty || totalBeginning}</td>
              <td style="text-align:right">${data.total_sold_qty || totalSold}</td>
              <td style="text-align:right">${data.total_ending_qty || totalEnding}</td>
              <td style="text-align:right">${data.total_variance || totalVariance}</td>
              <td style="text-align:right">\u20B1${(data.total_variance_value || totalVarianceValue).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </body></html>
    `;
  };

  // Variance color helper
  const getVarianceColor = (v: number) => {
    if (v === 0) return '#4CAF50'; // green - perfect
    if (v > 0) return '#F44336';   // red - missing
    return '#2196F3';               // blue - overage
  };

  // ============ RENDER FUNCTIONS ============

  const renderBeginningItem = ({ item }: { item: SessionItem }) => (
    <View style={[styles.itemRow, { borderBottomColor: theme.colors.backdrop }]}>
      <View style={styles.itemInfo}>
        <Text style={[styles.itemName, { fontSize: fs.body }]} numberOfLines={1}>{item.product_name}</Text>
        <Text style={[styles.itemCode, { fontSize: fs.bodySmall, color: theme.colors.onSurface }]}>{item.product_code}</Text>
      </View>
      <View style={styles.qtyInputContainer}>
        <RNTextInput
          style={[styles.qtyInput, { borderColor: theme.colors.primary, fontSize: fs.body }]}
          keyboardType="numeric"
          value={item.beginning_qty > 0 ? String(item.beginning_qty) : ''}
          placeholder="0"
          onChangeText={(val) => handleUpdateBeginningQty(item.product_id, val)}
          selectTextOnFocus
        />
      </View>
    </View>
  );

  const renderInProgressItem = ({ item }: { item: SessionItem }) => {
    const expectedRemaining = item.beginning_qty - item.sold_qty;
    return (
      <View style={[styles.itemRow, { borderBottomColor: theme.colors.backdrop }]}>
        <View style={[styles.itemInfo, { flex: 2 }]}>
          <Text style={[styles.itemName, { fontSize: fs.bodySmall }]} numberOfLines={1}>{item.product_name}</Text>
        </View>
        <Text style={[styles.colText, { fontSize: fs.bodySmall }]}>{item.beginning_qty}</Text>
        <Text style={[styles.colText, { fontSize: fs.bodySmall, color: theme.colors.primary }]}>{item.sold_qty}</Text>
        <Text style={[styles.colText, { fontSize: fs.bodySmall }]}>{expectedRemaining}</Text>
        {enteringEnding && (
          <>
            <View style={styles.endingInputContainer}>
              <RNTextInput
                style={[styles.qtyInputSmall, { borderColor: theme.colors.primary, fontSize: fs.bodySmall }]}
                keyboardType="numeric"
                value={item.ending_qty !== null ? String(item.ending_qty) : ''}
                placeholder="-"
                onChangeText={(val) => handleUpdateEndingQty(item.product_id, val)}
                selectTextOnFocus
              />
            </View>
            <Text style={[styles.colText, { fontSize: fs.bodySmall, color: getVarianceColor(item.variance), fontWeight: 'bold' }]}>
              {item.ending_qty !== null ? item.variance : '-'}
            </Text>
          </>
        )}
      </View>
    );
  };

  const renderCompletedItem = ({ item }: { item: SessionItem }) => (
    <View style={[styles.itemRow, { borderBottomColor: theme.colors.backdrop }]}>
      <View style={[styles.itemInfo, { flex: 2 }]}>
        <Text style={[styles.itemName, { fontSize: fs.bodySmall }]} numberOfLines={1}>{item.product_name}</Text>
      </View>
      <Text style={[styles.colText, { fontSize: fs.bodySmall }]}>{item.beginning_qty}</Text>
      <Text style={[styles.colText, { fontSize: fs.bodySmall }]}>{item.sold_qty}</Text>
      <Text style={[styles.colText, { fontSize: fs.bodySmall }]}>{item.ending_qty ?? 0}</Text>
      <Text style={[styles.colText, { fontSize: fs.bodySmall, color: getVarianceColor(item.variance), fontWeight: 'bold' }]}>
        {item.variance}
      </Text>
    </View>
  );

  // ============ MAIN RENDER ============

  // No active session - show start button + history
  if (!activeSession) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <ScrollView contentContainerStyle={{ padding: lo.screenPadding }}>
          <Card style={[styles.card, { marginBottom: sp.lg }]}>
            <Card.Content style={{ alignItems: 'center', paddingVertical: sp.xl }}>
              <IconButton icon="clipboard-check-outline" size={48} iconColor={theme.colors.primary} />
              <Title style={{ textAlign: 'center', marginBottom: sp.sm }}>Daily Inventory</Title>
              <Paragraph style={{ textAlign: 'center', marginBottom: sp.md, color: theme.colors.onSurface }}>
                Track daily product movement. Enter beginning counts in the morning,
                sales are tracked automatically, then enter ending counts at close.
              </Paragraph>
              <Button
                mode="contained"
                icon="plus"
                onPress={handleStartSession}
                loading={loading}
                style={{ minWidth: 200 }}
              >
                Start Daily Inventory
              </Button>
            </Card.Content>
          </Card>

          {pastSessions.length > 0 && (
            <View>
              <Title style={{ marginBottom: sp.sm, fontSize: fs.cardTitle }}>History</Title>
              {pastSessions.map((session) => (
                <Card
                  key={session.session_id}
                  style={[styles.card, { marginBottom: sp.sm }]}
                  onPress={() => handleExpandSession(session.session_id)}
                >
                  <Card.Content>
                    <View style={styles.sessionRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: 'bold', fontSize: fs.body }}>{session.session_id}</Text>
                        <Text style={{ color: theme.colors.onSurface, fontSize: fs.bodySmall }}>
                          {session.date} | {session.total_items} items
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Chip
                          compact
                          style={{
                            backgroundColor: session.status === 'completed' ? '#E8F5E9' : '#FFF3E0',
                          }}
                          textStyle={{ fontSize: fs.bodySmall - 2 }}
                        >
                          {session.status.toUpperCase()}
                        </Chip>
                        {session.total_variance !== 0 && (
                          <Text style={{
                            color: getVarianceColor(session.total_variance),
                            fontWeight: 'bold',
                            fontSize: fs.bodySmall,
                            marginTop: 2,
                          }}>
                            Variance: {session.total_variance} ({formatCurrency(session.total_variance_value)})
                          </Text>
                        )}
                      </View>
                    </View>

                    {expandedSessionId === session.session_id && expandedItems.length > 0 && (
                      <View style={{ marginTop: sp.sm }}>
                        <Divider style={{ marginBottom: sp.xs }} />
                        <View style={styles.tableHeader}>
                          <Text style={[styles.headerText, { flex: 2 }]}>Product</Text>
                          <Text style={styles.headerText}>Beg</Text>
                          <Text style={styles.headerText}>Sold</Text>
                          <Text style={styles.headerText}>End</Text>
                          <Text style={styles.headerText}>Var</Text>
                        </View>
                        {expandedItems.filter(i => i.beginning_qty > 0).map(item => (
                          <View key={item.product_id} style={[styles.itemRow, { borderBottomColor: '#eee', paddingVertical: 3 }]}>
                            <Text style={[styles.itemName, { flex: 2, fontSize: fs.bodySmall - 1 }]} numberOfLines={1}>
                              {item.product_name}
                            </Text>
                            <Text style={[styles.colText, { fontSize: fs.bodySmall - 1 }]}>{item.beginning_qty}</Text>
                            <Text style={[styles.colText, { fontSize: fs.bodySmall - 1 }]}>{item.sold_qty}</Text>
                            <Text style={[styles.colText, { fontSize: fs.bodySmall - 1 }]}>{item.ending_qty ?? 0}</Text>
                            <Text style={[styles.colText, { fontSize: fs.bodySmall - 1, color: getVarianceColor(item.variance), fontWeight: 'bold' }]}>
                              {item.variance}
                            </Text>
                          </View>
                        ))}

                        <View style={{ marginTop: sp.sm }}>
                          <ReportActionsBar
                            onBuildPrintData={buildPrintData}
                            onBuildPdfHtml={buildPdfHtml}
                            reportTitle="Daily Inventory Report"
                            reportFileName={`daily_inventory_${session.session_id}`}
                            compact
                          />
                        </View>
                      </View>
                    )}
                  </Card.Content>
                </Card>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // ============ ACTIVE SESSION ============

  const isBeginning = activeSession.status === 'beginning';
  const isInProgress = activeSession.status === 'in_progress';

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Session Header */}
      <View style={[styles.sessionHeader, { backgroundColor: theme.colors.surface, padding: sp.sm }]}>
        <View style={styles.sessionRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: 'bold', fontSize: fs.body }}>{activeSession.session_id}</Text>
            <Text style={{ color: theme.colors.onSurface, fontSize: fs.bodySmall }}>
              {activeSession.date} | {items.length} products
            </Text>
          </View>
          <Chip
            compact
            style={{
              backgroundColor: isBeginning ? '#E3F2FD' : '#FFF8E1',
            }}
          >
            {isBeginning ? 'ENTERING BEGINNING' : enteringEnding ? 'ENTERING ENDING' : 'IN PROGRESS'}
          </Chip>
        </View>

        {/* Summary row for in_progress */}
        {isInProgress && (
          <View style={[styles.summaryRow, { marginTop: sp.xs }]}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Beginning</Text>
              <Text style={[styles.summaryValue, { color: theme.colors.primary }]}>{totalBeginning}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Sold</Text>
              <Text style={[styles.summaryValue, { color: '#F44336' }]}>{totalSold}</Text>
            </View>
            {enteringEnding && (
              <>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Ending</Text>
                  <Text style={styles.summaryValue}>{totalEnding}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Variance</Text>
                  <Text style={[styles.summaryValue, { color: getVarianceColor(totalVariance) }]}>{totalVariance}</Text>
                </View>
              </>
            )}
          </View>
        )}
      </View>

      {/* Search Bar */}
      <View style={[styles.searchBar, { paddingHorizontal: sp.sm, paddingVertical: sp.xs }]}>
        <IconButton icon="magnify" size={20} />
        <RNTextInput
          style={[styles.searchInput, { fontSize: fs.body }]}
          placeholder="Search products..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <IconButton icon="close-circle" size={18} onPress={() => setSearchQuery('')} />
        )}
      </View>

      {/* Table Header */}
      {isBeginning && (
        <View style={[styles.tableHeader, { paddingHorizontal: sp.sm }]}>
          <Text style={[styles.headerText, { flex: 3 }]}>Product</Text>
          <Text style={[styles.headerText, { flex: 1, textAlign: 'center' }]}>Beginning Qty</Text>
        </View>
      )}

      {isInProgress && (
        <View style={[styles.tableHeader, { paddingHorizontal: sp.sm }]}>
          <Text style={[styles.headerText, { flex: 2 }]}>Product</Text>
          <Text style={styles.headerText}>Beg</Text>
          <Text style={styles.headerText}>Sold</Text>
          <Text style={styles.headerText}>Exp</Text>
          {enteringEnding && (
            <>
              <Text style={styles.headerText}>End</Text>
              <Text style={styles.headerText}>Var</Text>
            </>
          )}
        </View>
      )}

      {/* Item List */}
      <FlatList
        data={filteredItems}
        renderItem={isBeginning ? renderBeginningItem : renderInProgressItem}
        keyExtractor={(item) => String(item.product_id)}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: sp.sm }}
        keyboardShouldPersistTaps="handled"
      />

      {/* Action Buttons */}
      <View style={[styles.footer, { padding: sp.sm, backgroundColor: theme.colors.surface }]}>
        {isBeginning && (
          <View>
            <View style={styles.footerButtons}>
              <Button
                mode="outlined"
                icon="cancel"
                onPress={() => setCancelDialogVisible(true)}
                style={{ flex: 1, marginRight: sp.xs }}
                textColor={theme.colors.error}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                icon="lock"
                onPress={handleLockBeginning}
                loading={loading}
                style={{ flex: 2 }}
              >
                Lock Beginning & Start
              </Button>
            </View>
            <View style={{ marginTop: sp.xs }}>
              <ReportActionsBar
                onBuildPrintData={buildPrintData}
                onBuildPdfHtml={buildPdfHtml}
                reportTitle="Beginning Inventory"
                reportFileName={`beginning_inventory_${activeSession.session_id}`}
                compact
              />
            </View>
          </View>
        )}

        {isInProgress && !enteringEnding && (
          <View>
            <View style={styles.footerButtons}>
              <Button
                mode="outlined"
                icon="cancel"
                onPress={() => setCancelDialogVisible(true)}
                style={{ flex: 1, marginRight: sp.xs }}
                textColor={theme.colors.error}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                icon="clipboard-edit-outline"
                onPress={async () => {
                  // Pre-fill ending qty for all items with expected remaining (beginning - sold)
                  if (activeSession) {
                    const db = getDatabase();
                    for (const item of items) {
                      if (item.ending_qty === null && item.beginning_qty > 0) {
                        await db.updateDailyInventoryEndingQty(activeSession.session_id, item.product_id, item.beginning_qty - item.sold_qty);
                      }
                    }
                    await loadData();
                  }
                  setEnteringEnding(true);
                }}
                style={{ flex: 2 }}
              >
                Enter Ending Count
              </Button>
            </View>
            <View style={{ marginTop: sp.xs }}>
              <ReportActionsBar
                onBuildPrintData={buildPrintData}
                onBuildPdfHtml={buildPdfHtml}
                reportTitle="Daily Inventory Status"
                reportFileName={`daily_inventory_${activeSession.session_id}`}
                compact
              />
            </View>
          </View>
        )}

        {isInProgress && enteringEnding && (
          <View>
            <View style={styles.footerButtons}>
              <Button
                mode="outlined"
                onPress={() => setEnteringEnding(false)}
                style={{ flex: 1, marginRight: sp.xs }}
              >
                Back
              </Button>
              <Button
                mode="contained"
                icon="check-all"
                onPress={handleComplete}
                loading={loading}
                style={{ flex: 2 }}
                buttonColor="#4CAF50"
              >
                Complete & Save
              </Button>
            </View>
            <View style={{ marginTop: sp.xs }}>
              <ReportActionsBar
                onBuildPrintData={buildPrintData}
                onBuildPdfHtml={buildPdfHtml}
                reportTitle="Daily Inventory Report"
                reportFileName={`daily_inventory_${activeSession.session_id}`}
                compact
              />
            </View>
          </View>
        )}
      </View>

      {/* Cancel Dialog */}
      <Portal>
        <Dialog visible={cancelDialogVisible} onDismiss={() => setCancelDialogVisible(false)}>
          <Dialog.Title>Cancel Session</Dialog.Title>
          <Dialog.Content>
            <Paragraph>Are you sure you want to cancel this daily inventory session?</Paragraph>
            <TextInput
              label="Reason"
              value={cancelReason}
              onChangeText={setCancelReason}
              mode="outlined"
              style={{ marginTop: 8 }}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCancelDialogVisible(false)}>No</Button>
            <Button
              onPress={handleCancel}
              disabled={!cancelReason.trim()}
              textColor={theme.colors.error}
            >
              Yes, Cancel
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    elevation: 2,
    borderRadius: 8,
  },
  sessionHeader: {
    elevation: 1,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#666',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 6,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 2,
    borderBottomColor: '#ddd',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
    fontSize: 11,
    fontWeight: 'bold',
    color: '#666',
    textAlign: 'center',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  itemInfo: {
    flex: 3,
    paddingRight: 8,
  },
  itemName: {
    fontWeight: '500',
  },
  itemCode: {
    marginTop: 1,
  },
  colText: {
    flex: 1,
    textAlign: 'center',
  },
  qtyInputContainer: {
    flex: 1,
    alignItems: 'center',
  },
  qtyInput: {
    width: 70,
    textAlign: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  endingInputContainer: {
    flex: 1,
    alignItems: 'center',
  },
  qtyInputSmall: {
    width: 50,
    textAlign: 'center',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  footer: {
    elevation: 4,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingBottom: 16,
  },
  footerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
