import React, { useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, TextInput } from 'react-native';
import { Card, Title, Paragraph, useTheme, List, Divider, IconButton, Text } from 'react-native-paper';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../App';
import { useResponsiveTheme } from '../utils/responsive';

type Props = {
  navigation: StackNavigationProp<RootStackParamList, 'ReportsHub'>;
};

interface ReportCategory {
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  reports: ReportItem[];
}

interface ReportItem {
  title: string;
  description: string;
  icon: string;
  screen?: keyof RootStackParamList;
  params?: any;
  action?: string;
}

export default function ReportsHubScreen({ navigation }: Props) {
  const theme = useTheme();
  const { sp, fs, lo } = useResponsiveTheme();
  const [searchQuery, setSearchQuery] = useState('');

  const reportCategories: ReportCategory[] = [
    {
      title: 'Sales Reports',
      subtitle: 'Transaction and revenue reports',
      icon: 'cash-register',
      color: '#4CAF50',
      reports: [
        { title: 'Sales Report', description: 'Complete sales with filters & analysis', icon: 'file-chart', screen: 'SalesReport' },
        { title: 'Void/Refund/Exchange', description: 'View all voided, refunded & exchanged invoices', icon: 'cash-refund', screen: 'VoidRefundExchangeReport' },
        { title: 'Returns & Refunds Analytics', description: 'Unified returns analysis - BO, refunds, exchanges with product breakdown', icon: 'chart-timeline-variant-shimmer', screen: 'ReturnsAnalyticsReport' },
        { title: 'Sales by Product', description: 'Top selling products report', icon: 'chart-bar', screen: 'SalesReport', params: { initialView: 'products' } },
        { title: 'Sales by Category', description: 'Sales breakdown by category', icon: 'chart-pie', screen: 'SalesReport', params: { initialView: 'categories' } },
      ]
    },
    {
      title: 'Inventory Reports',
      subtitle: 'Stock levels and movements',
      icon: 'package-variant',
      color: '#2196F3',
      reports: [
        { title: 'Current Stock Levels', description: 'View all product quantities', icon: 'clipboard-list', screen: 'CurrentStockLevels' },
        { title: 'Top Selling Products', description: 'Best sellers by quantity & revenue (all time)', icon: 'trophy', screen: 'TopSellingReport' },
        { title: 'Low Stock Alert', description: 'Products below reorder level', icon: 'alert', screen: 'CurrentStockLevels', params: { lowStock: true } },
        { title: 'Zero Inventory', description: 'Products with no stock available', icon: 'alert-circle-outline', screen: 'ZeroInventoryReport' },
        { title: 'Item Ledger', description: 'All inventory movements by product', icon: 'history', screen: 'InventoryMovements' },
        { title: 'Stock Valuation', description: 'Total inventory value report', icon: 'currency-php', screen: 'StockValuationReport' },
        { title: 'Physical Count History', description: 'Past physical count sessions', icon: 'counter', screen: 'PhysicalCountReport' },
        { title: 'Damaged Items Report', description: 'History of damaged inventory', icon: 'package-variant-closed-remove', screen: 'DamagedItemsHistory' },
        { title: 'Product Transaction History', description: 'All transactions for a product (sold, purchased, damaged, returned)', icon: 'file-document-outline', screen: 'ProductTransactionReport' },
      ]
    },
    {
      title: 'Purchase Reports',
      subtitle: 'Supplier purchases and receiving',
      icon: 'truck-delivery',
      color: '#FF9800',
      reports: [
        { title: 'Purchase Report', description: 'All purchases with filtering & summary', icon: 'receipt', screen: 'PurchaseReport' },
        { title: 'Delivered Items Report', description: 'Items received from suppliers', icon: 'package-variant-closed-check', screen: 'DeliveredItemsReport' },
        { title: 'Purchase Returns Report', description: 'Returns to suppliers', icon: 'truck-delivery-outline', screen: 'PurchaseReturnsReport' },
        { title: 'Purchases by Supplier', description: 'Purchase summary per supplier', icon: 'account-group', screen: 'PurchaseReport', params: { view: 'by_supplier' } },
      ]
    },
    {
      title: 'Accounts Receivable',
      subtitle: 'Customer balances and collections',
      icon: 'account-cash',
      color: '#9C27B0',
      reports: [
        { title: 'Top Customers', description: 'Best customers by purchases & revenue (all time)', icon: 'podium-gold', screen: 'TopCustomersReport' },
        { title: 'AR Report & Aging', description: 'Customer balances with aging analysis', icon: 'account-alert', screen: 'AccountsReceivableReport' },
        { title: 'Sales Returns Report', description: 'Customer returns and refunds', icon: 'cash-refund', screen: 'SalesReturnsReport' },
        { title: 'Customer Payments', description: 'Collect payments from customers', icon: 'cash-plus', screen: 'CustomerPayments' },
        { title: 'Customer Ledger', description: 'Transaction history per customer with print/email', icon: 'book-account', screen: 'CustomerAccountStatement' },
      ]
    },
    {
      title: 'Accounts Payable',
      subtitle: 'Supplier balances and payments',
      icon: 'credit-card-outline',
      color: '#E91E63',
      reports: [
        { title: 'AP Report & Aging', description: 'Supplier balances with aging analysis', icon: 'account-alert-outline', screen: 'AccountsPayableReport' },
        { title: 'Purchase Returns Report', description: 'Returns to suppliers', icon: 'truck-delivery-outline', screen: 'PurchaseReturnsReport' },
        { title: 'Supplier Payments', description: 'Make payments to suppliers', icon: 'cash-minus', screen: 'SupplierPayments' },
        { title: 'Supplier Ledger', description: 'Purchases, payments & cheques per supplier', icon: 'book-account-outline', screen: 'SupplierAccountStatement' },
        { title: 'PDC Tracking', description: 'Track post-dated cheque lifecycle', icon: 'checkbook', screen: 'PDCTracking' },
        { title: 'Upcoming PDC Report', description: 'Cheques due for funding soon', icon: 'calendar-alert', screen: 'UpcomingPDCReport' },
      ]
    },
    {
      title: 'BIR Compliance',
      subtitle: 'Audit trails and regulatory reports',
      icon: 'file-document-check-outline',
      color: '#607D8B',
      reports: [
        { title: 'eSales Journal', description: 'Electronic sales journal of all receipts', icon: 'book-open-page-variant', screen: 'EJournalReport' },
        { title: 'Z-Reading History', description: 'End of day report history', icon: 'calculator', screen: 'ZReadingHistory' },
        { title: 'X-Reading History', description: 'Mid-day inquiry report history', icon: 'poll', screen: 'XReadingHistory' },
      ]
    },
  ];

  const handleReportPress = (report: ReportItem) => {
    if (report.screen) {
      navigation.navigate(report.screen as any, report.params);
    }
  };

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return reportCategories;
    const query = searchQuery.toLowerCase().trim();
    return reportCategories
      .map(cat => ({
        ...cat,
        reports: cat.reports.filter(r =>
          r.title.toLowerCase().includes(query) ||
          r.description.toLowerCase().includes(query) ||
          cat.title.toLowerCase().includes(query)
        ),
      }))
      .filter(cat => cat.reports.length > 0);
  }, [searchQuery]);

  const totalMatchCount = useMemo(() => {
    return filteredCategories.reduce((sum, cat) => sum + cat.reports.length, 0);
  }, [filteredCategories]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { padding: lo.screenPadding }]}
        showsVerticalScrollIndicator={true}
      >
        <View style={[styles.header, { marginBottom: sp.md }]}>
          <Title style={[styles.pageTitle, { fontSize: fs.h2 }]}>Reports Hub</Title>
          <Paragraph style={[styles.pageSubtitle, { fontSize: fs.bodySmall }]}>
            Access all business reports in one place
          </Paragraph>
        </View>

        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <IconButton icon="magnify" size={24} iconColor="#1976D2" style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { fontSize: fs.body }]}
              placeholder="Search reports..."
              placeholderTextColor="#888"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <IconButton icon="close-circle" size={20} iconColor="#666" onPress={() => setSearchQuery('')} />
            )}
          </View>
          {searchQuery.trim().length > 0 && (
            <Text style={styles.matchCount}>
              Found {totalMatchCount} report{totalMatchCount !== 1 ? 's' : ''}
            </Text>
          )}
        </View>

        {filteredCategories.length === 0 && searchQuery.trim().length > 0 && (
          <View style={styles.emptyState}>
            <IconButton icon="file-search-outline" size={48} />
            <Text style={styles.emptyStateText}>No reports found for "{searchQuery.trim()}"</Text>
          </View>
        )}

        {filteredCategories.map((category, categoryIndex) => (
          <Card key={categoryIndex} style={[styles.categoryCard, { marginBottom: sp.md }]}>
            <Card.Content style={{ padding: sp.md }}>
              <View style={styles.categoryHeader}>
                <List.Icon icon={category.icon} color={category.color} />
                <View style={styles.categoryTitleContainer}>
                  <Title style={[styles.categoryTitle, { color: category.color, fontSize: fs.cardTitle }]}>
                    {category.title}
                  </Title>
                  <Paragraph style={[styles.categorySubtitle, { fontSize: fs.bodySmall }]}>
                    {category.subtitle}
                  </Paragraph>
                </View>
              </View>

              <Divider style={styles.divider} />

              {category.reports.map((report, reportIndex) => (
                <React.Fragment key={reportIndex}>
                  <List.Item
                    title={report.title}
                    description={report.description}
                    left={props => <List.Icon {...props} icon={report.icon} color={category.color} />}
                    right={props => <List.Icon {...props} icon="chevron-right" />}
                    onPress={() => handleReportPress(report)}
                    style={styles.reportItem}
                    titleStyle={styles.reportTitle}
                    descriptionStyle={styles.reportDescription}
                  />
                  {reportIndex < category.reports.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </Card.Content>
          </Card>
        ))}

        <View style={styles.footer}>
          <Paragraph style={styles.footerText}>
            Tip: Most reports can be exported to PDF for printing or sharing
          </Paragraph>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  header: {
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  pageSubtitle: {
    fontSize: 14,
    opacity: 0.7,
  },
  categoryCard: {
    marginBottom: 16,
    elevation: 3,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryTitleContainer: {
    flex: 1,
    marginLeft: 8,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 0,
  },
  categorySubtitle: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: -4,
  },
  divider: {
    marginVertical: 8,
  },
  reportItem: {
    paddingVertical: 4,
  },
  reportTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  reportDescription: {
    fontSize: 12,
  },
  searchContainer: {
    marginBottom: 14,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#1976D2',
    paddingHorizontal: 4,
    height: 52,
    elevation: 4,
    shadowColor: '#1976D2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  searchIcon: {
    margin: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#222',
    paddingVertical: 0,
    fontWeight: '500',
  },
  matchCount: {
    fontSize: 12,
    color: '#666',
    marginTop: 6,
    marginLeft: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyStateText: {
    fontSize: 15,
    color: '#666',
    marginTop: 4,
  },
  footer: {
    marginTop: 16,
    padding: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    opacity: 0.6,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
