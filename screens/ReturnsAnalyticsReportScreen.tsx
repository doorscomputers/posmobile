import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  useTheme,
  DataTable,
  Chip,
  ActivityIndicator,
} from 'react-native-paper';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../App';
import { DatabaseService } from '../database/DatabaseService';
import DateRangeFilter, { getDateRange } from '../components/DateRangeFilter';
import ReportActionsBar from '../components/ReportActionsBar';
import { ESCPOSBuilder } from '../utils/escpos';
import { toLocalDateString, formatPrinterDate, formatPrinterDateTime } from '../utils/dateTime';
import { useResponsiveTheme } from '../utils/responsive';

type Props = {
  navigation: StackNavigationProp<RootStackParamList, 'ReturnsAnalyticsReport'>;
};

type TabType = 'ALL' | 'BO' | 'REFUND' | 'EXCHANGE';

interface ReturnItem {
  id: number;
  product_id: number;
  product_code: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  created_at: string;
  // BO fields
  transaction_id?: number;
  transaction_number?: string;
  invoice_number?: string;
  transaction_date?: string;
  // Standalone fields
  sales_return_id?: number;
  return_number?: string;
  original_invoice_number?: string;
  return_date?: string;
  refund_method?: string;
  reason?: string;
  return_status?: string;
  processed_by_name?: string;
  customer_name?: string;
  // Computed
  source: 'BO' | 'REFUND' | 'EXCHANGE';
  reference: string;
  date: string;
}

interface TopProduct {
  product_id: number;
  product_code: string;
  product_name: string;
  total_quantity: number;
  times_returned: number;
  total_amount: number;
}

interface ReasonEntry {
  reason: string;
  return_count: number;
  total_quantity: number;
  total_amount: number;
}

interface MethodEntry {
  refund_method: string;
  transaction_count: number;
  total_quantity: number;
  total_amount: number;
}

interface Summary {
  boCount: number;
  boTotal: number;
  refundCount: number;
  refundTotal: number;
  exchangeCount: number;
  exchangeTotal: number;
}

export default function ReturnsAnalyticsReportScreen({ navigation }: Props) {
  const theme = useTheme();
  const { sp, fs, lo } = useResponsiveTheme();
  const [activeTab, setActiveTab] = useState<TabType>('ALL');
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState(() => {
    const range = getDateRange('this_month');
    return { startDate: range.startDate, endDate: range.endDate };
  });
  const [companySettings, setCompanySettings] = useState({ name: '', address: '', tin: '' });

  // Data states
  const [allItems, setAllItems] = useState<ReturnItem[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [summary, setSummary] = useState<Summary>({
    boCount: 0, boTotal: 0,
    refundCount: 0, refundTotal: 0,
    exchangeCount: 0, exchangeTotal: 0,
  });
  const [reasons, setReasons] = useState<ReasonEntry[]>([]);
  const [methods, setMethods] = useState<MethodEntry[]>([]);

  useEffect(() => {
    initAndLoad();
  }, [dateRange]);

  const initAndLoad = async () => {
    try {
      const dbService = DatabaseService.getInstance();
      await dbService.initialize();
      await Promise.all([loadData(), loadCompanySettings()]);
    } catch (error) {
      console.error('Error initializing:', error);
      setLoading(false);
    }
  };

  const loadCompanySettings = async () => {
    try {
      const dbService = DatabaseService.getInstance();
      const name = await dbService.getSetting('company_name') || 'IgoroTech POS';
      const address = await dbService.getSetting('company_address') || '';
      const tin = await dbService.getSetting('company_tin') || '';
      setCompanySettings({ name, address, tin });
    } catch (error) {
      console.error('Error loading company settings:', error);
    }
  };

  const handleDateChange = useCallback((startDate: Date | null, endDate: Date | null) => {
    if (startDate && endDate) {
      setDateRange({ startDate, endDate });
    }
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const dbService = DatabaseService.getInstance();
      const startStr = toLocalDateString(dateRange.startDate);
      const endStr = toLocalDateString(dateRange.endDate);

      const [boItems, standaloneItems, topProds, summaryData, reasonData, methodData] = await Promise.all([
        dbService.getBOReturnItems(startStr, endStr),
        dbService.getStandaloneReturnItems(startStr, endStr),
        dbService.getTopReturnedProducts(startStr, endStr, 20),
        dbService.getReturnsSummary(startStr, endStr),
        dbService.getReturnReasonAnalysis(startStr, endStr),
        dbService.getRefundMethodBreakdown(startStr, endStr),
      ]);

      // Merge BO items
      const boMapped: ReturnItem[] = (boItems || []).map((item: any) => ({
        ...item,
        total_amount: Math.abs(item.total_amount),
        source: 'BO' as const,
        reference: item.invoice_number || item.transaction_number,
        date: item.transaction_date,
      }));

      // Merge standalone items
      const standaloneMapped: ReturnItem[] = (standaloneItems || []).map((item: any) => ({
        ...item,
        source: (item.refund_method === 'EXCHANGE' ? 'EXCHANGE' : 'REFUND') as 'REFUND' | 'EXCHANGE',
        reference: item.return_number,
        date: item.return_date,
      }));

      // Combine and sort by date desc
      const combined = [...boMapped, ...standaloneMapped].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      setAllItems(combined);
      setTopProducts(topProds || []);
      setSummary(summaryData);
      setReasons(reasonData || []);
      setMethods(methodData || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-PH', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
    return `₱${(amount || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  };

  const formatPrintCurrency = (amount: number) => {
    return `P${(amount || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'BO': return '#FF9800';
      case 'REFUND': return '#9C27B0';
      case 'EXCHANGE': return '#2196F3';
      default: return '#757575';
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'BO': return 'BO Return';
      case 'REFUND': return 'Refund';
      case 'EXCHANGE': return 'Exchange';
      default: return source;
    }
  };

  const getRefundMethodLabel = (method: string) => {
    switch (method) {
      case 'CASH': return 'Cash';
      case 'CREDIT': return 'Credit (AR)';
      case 'STORE_CREDIT': return 'Store Credit';
      case 'EXCHANGE': return 'Exchange';
      default: return method || 'N/A';
    }
  };

  // Filtered items by tab
  const filteredItems = useMemo(() => {
    if (activeTab === 'ALL') return allItems;
    return allItems.filter(item => item.source === activeTab);
  }, [allItems, activeTab]);

  // Tab-adjusted summary
  const tabSummary = useMemo(() => {
    const totalCount = summary.boCount + summary.refundCount + summary.exchangeCount;
    const totalAmount = summary.boTotal + summary.refundTotal + summary.exchangeTotal;
    return { totalCount, totalAmount };
  }, [summary]);

  const tabs: { key: TabType; label: string; count: number; color: string }[] = [
    { key: 'ALL', label: 'All', count: allItems.length, color: theme.colors.primary },
    { key: 'BO', label: 'BO Returns', count: allItems.filter(i => i.source === 'BO').length, color: '#FF9800' },
    { key: 'REFUND', label: 'Refunds', count: allItems.filter(i => i.source === 'REFUND').length, color: '#9C27B0' },
    { key: 'EXCHANGE', label: 'Exchanges', count: allItems.filter(i => i.source === 'EXCHANGE').length, color: '#2196F3' },
  ];

  const buildPrintReport = (printerWidth: number): ESCPOSBuilder => {
    const builder = new ESCPOSBuilder(printerWidth);

    builder
      .align('center')
      .bold(true)
      .doubleSize()
      .println('RETURNS & REFUNDS')
      .println('ANALYTICS')
      .normalSize()
      .bold(false)
      .feed()
      .doubleSeparator()
      .align('left');

    builder
      .leftRight('From:', formatPrinterDate(dateRange.startDate))
      .leftRight('To:', formatPrinterDate(dateRange.endDate))
      .separator();

    // Summary
    builder
      .bold(true).println('SUMMARY').bold(false)
      .leftRight(`BO Returns (${summary.boCount}):`, formatPrintCurrency(summary.boTotal))
      .leftRight(`Refunds (${summary.refundCount}):`, formatPrintCurrency(summary.refundTotal))
      .leftRight(`Exchanges (${summary.exchangeCount}):`, formatPrintCurrency(summary.exchangeTotal))
      .doubleSeparator()
      .leftRight(`TOTAL (${tabSummary.totalCount}):`, formatPrintCurrency(tabSummary.totalAmount))
      .doubleSeparator();

    // Refund Method Breakdown
    if (methods.length > 0) {
      builder.bold(true).println('REFUND METHOD').bold(false);
      methods.forEach(m => {
        builder.leftRight(
          `${getRefundMethodLabel(m.refund_method)} (${m.transaction_count}):`,
          formatPrintCurrency(m.total_amount)
        );
      });
      builder.separator();
    }

    // Top Returned Products
    if (topProducts.length > 0) {
      builder.bold(true).println('TOP RETURNED PRODUCTS').bold(false);
      topProducts.slice(0, 15).forEach((p, i) => {
        builder.println(`${i + 1}. ${p.product_name}`);
        builder.leftRight(`   ${p.total_quantity} pcs`, formatPrintCurrency(p.total_amount));
      });
      builder.separator();
    }

    // Return Reasons
    if (reasons.length > 0) {
      builder.bold(true).println('RETURN REASONS').bold(false);
      reasons.forEach(r => {
        builder.leftRight(
          `${(r.reason || 'Unknown').substring(0, 20)} (${r.return_count}):`,
          formatPrintCurrency(r.total_amount)
        );
      });
      builder.separator();
    }

    // Detail list (limited to 30)
    const detailItems = filteredItems.slice(0, 30);
    if (detailItems.length > 0) {
      builder.bold(true).println('DETAIL').bold(false);
      detailItems.forEach(item => {
        const tag = item.source === 'BO' ? '[BO]' : item.source === 'EXCHANGE' ? '[EXC]' : '[REF]';
        builder.println(`${tag} ${item.reference} ${formatPrinterDate(new Date(item.date))}`);
        builder.leftRight(
          `  ${item.product_name.substring(0, 18)} ${item.quantity}x`,
          formatPrintCurrency(item.total_amount)
        );
      });
    }

    builder
      .feed()
      .separator()
      .align('center')
      .println('Report Generated:')
      .println(formatPrinterDateTime(new Date()))
      .feed(2)
      .cut();

    return builder;
  };

  const buildPdfHtml = (): string => {
    const startDateStr = dateRange.startDate.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
    const endDateStr = dateRange.endDate.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; color: #333; margin: 0; padding: 20px; }
          .header { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #333; padding-bottom: 16px; }
          .company-name { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
          .header-text { font-size: 11px; color: #666; }
          .report-title { font-size: 20px; font-weight: bold; text-align: center; margin: 16px 0; color: #424242; }
          .date-range { text-align: center; font-size: 12px; color: #666; margin-bottom: 16px; background: #f5f5f5; padding: 8px; border-radius: 4px; }
          .section-title { font-size: 14px; font-weight: bold; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin: 16px 0 12px 0; }
          .summary-grid { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0; }
          .summary-item { flex: 1; min-width: 140px; background: #f5f5f5; border-radius: 8px; padding: 12px; text-align: center; }
          .summary-label { font-size: 11px; color: #666; margin-bottom: 4px; }
          .summary-value { font-size: 18px; font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin: 8px 0; }
          th { background-color: #f5f5f5; padding: 8px; text-align: left; font-weight: 600; border-bottom: 2px solid #ddd; }
          td { padding: 6px 8px; border-bottom: 1px solid #eee; }
          .bo-badge { background: #FFF3E0; color: #E65100; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; }
          .refund-badge { background: #F3E5F5; color: #7B1FA2; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; }
          .exchange-badge { background: #E3F2FD; color: #1565C0; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; }
          .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #ddd; padding-top: 12px; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-name">${companySettings.name || 'IgoroTech POS'}</div>
          ${companySettings.address ? `<div class="header-text">${companySettings.address}</div>` : ''}
          ${companySettings.tin ? `<div class="header-text">TIN: ${companySettings.tin}</div>` : ''}
        </div>

        <div class="report-title">RETURNS & REFUNDS ANALYTICS</div>
        <div class="date-range">Period: ${startDateStr} to ${endDateStr}</div>

        <div class="section-title">Summary</div>
        <div class="summary-grid">
          <div class="summary-item">
            <div class="summary-label">Total Return Items</div>
            <div class="summary-value" style="color: #424242;">${tabSummary.totalCount}</div>
            <div style="font-size: 14px; color: #424242;">${formatCurrency(tabSummary.totalAmount)}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">BO Returns</div>
            <div class="summary-value" style="color: #FF9800;">${summary.boCount}</div>
            <div style="font-size: 14px; color: #FF9800;">${formatCurrency(summary.boTotal)}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Standalone Refunds</div>
            <div class="summary-value" style="color: #9C27B0;">${summary.refundCount}</div>
            <div style="font-size: 14px; color: #9C27B0;">${formatCurrency(summary.refundTotal)}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Exchanges</div>
            <div class="summary-value" style="color: #2196F3;">${summary.exchangeCount}</div>
            <div style="font-size: 14px; color: #2196F3;">${formatCurrency(summary.exchangeTotal)}</div>
          </div>
        </div>

        ${methods.length > 0 ? `
          <div class="section-title">Refund Method Breakdown</div>
          <table>
            <thead>
              <tr><th>Method</th><th class="text-center">Transactions</th><th class="text-center">Qty</th><th class="text-right">Amount</th></tr>
            </thead>
            <tbody>
              ${methods.map(m => `
                <tr>
                  <td>${getRefundMethodLabel(m.refund_method)}</td>
                  <td class="text-center">${m.transaction_count}</td>
                  <td class="text-center">${m.total_quantity}</td>
                  <td class="text-right">${formatCurrency(m.total_amount)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}

        ${topProducts.length > 0 ? `
          <div class="section-title">Top Returned Products</div>
          <table>
            <thead>
              <tr><th>#</th><th>Product</th><th>Code</th><th class="text-center">Times</th><th class="text-center">Qty</th><th class="text-right">Amount</th></tr>
            </thead>
            <tbody>
              ${topProducts.map((p, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${p.product_name}</td>
                  <td>${p.product_code || '-'}</td>
                  <td class="text-center">${p.times_returned}</td>
                  <td class="text-center">${p.total_quantity}</td>
                  <td class="text-right">${formatCurrency(p.total_amount)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}

        ${reasons.length > 0 ? `
          <div class="section-title">Return Reasons Analysis</div>
          <table>
            <thead>
              <tr><th>Reason</th><th class="text-center">Count</th><th class="text-center">Qty</th><th class="text-right">Amount</th></tr>
            </thead>
            <tbody>
              ${reasons.map(r => `
                <tr>
                  <td>${r.reason || 'Unknown'}</td>
                  <td class="text-center">${r.return_count}</td>
                  <td class="text-center">${r.total_quantity}</td>
                  <td class="text-right">${formatCurrency(r.total_amount)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}

        ${allItems.length > 0 ? `
          <div class="section-title">Detail List</div>
          <table>
            <thead>
              <tr><th>Date</th><th>Type</th><th>Reference</th><th>Product</th><th class="text-center">Qty</th><th class="text-right">Amount</th><th>Method</th></tr>
            </thead>
            <tbody>
              ${allItems.map(item => {
                const badgeClass = item.source === 'BO' ? 'bo-badge' : item.source === 'EXCHANGE' ? 'exchange-badge' : 'refund-badge';
                return `
                  <tr>
                    <td>${formatDate(item.date)}</td>
                    <td><span class="${badgeClass}">${getSourceLabel(item.source)}</span></td>
                    <td>${item.reference}</td>
                    <td>${item.product_name}</td>
                    <td class="text-center">${item.quantity}</td>
                    <td class="text-right">${formatCurrency(item.total_amount)}</td>
                    <td>${item.source === 'BO' ? 'N/A' : getRefundMethodLabel(item.refund_method || '')}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        ` : ''}

        <div class="footer">
          <p>Generated: ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p>
          <p>IgoroTech POS - Returns & Refunds Analytics Report</p>
        </div>
      </body>
      </html>
    `;
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ReportActionsBar
        onBuildPrintData={buildPrintReport}
        onBuildPdfHtml={buildPdfHtml}
        reportTitle="Returns & Refunds Analytics"
        reportFileName={`ReturnsAnalytics_${dateRange.startDate.toISOString().split('T')[0]}_to_${dateRange.endDate.toISOString().split('T')[0]}`}
        emailBody={`Please find attached the Returns & Refunds Analytics Report.\n\nPeriod: ${dateRange.startDate.toLocaleDateString('en-PH')} to ${dateRange.endDate.toLocaleDateString('en-PH')}\n\nBO Returns: ${summary.boCount} (${formatCurrency(summary.boTotal)})\nRefunds: ${summary.refundCount} (${formatCurrency(summary.refundTotal)})\nExchanges: ${summary.exchangeCount} (${formatCurrency(summary.exchangeTotal)})\nTotal: ${tabSummary.totalCount} (${formatCurrency(tabSummary.totalAmount)})\n\n---\nGenerated by IgoroTech POS`}
        disabled={loading}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { padding: lo.screenPadding }]}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
      >
        {/* Date Filter */}
        <Card style={styles.filterCard}>
          <Card.Content>
            <DateRangeFilter
              onDateChange={handleDateChange}
              selectedPreset="this_month"
            />
          </Card.Content>
        </Card>

        {/* Tabs */}
        <Card style={styles.tabCard}>
          <View style={styles.tabContainer}>
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.tab,
                  activeTab === tab.key && { borderBottomColor: tab.color, borderBottomWidth: 3 }
                ]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Paragraph style={[
                  styles.tabLabel,
                  activeTab === tab.key && { color: tab.color, fontWeight: '700' }
                ]}>
                  {tab.label}
                </Paragraph>
                <View style={[styles.tabBadge, { backgroundColor: tab.color }]}>
                  <Paragraph style={styles.tabBadgeText}>{tab.count}</Paragraph>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          <Card style={[styles.summaryCard, { borderLeftColor: '#424242', borderLeftWidth: 4 }]}>
            <Card.Content style={styles.summaryContent}>
              <Paragraph style={[styles.summaryLabel, { fontSize: fs.caption }]}>Total Items</Paragraph>
              <Title style={[styles.summaryValue, { color: '#424242' }]}>{tabSummary.totalCount}</Title>
              <Paragraph style={[styles.summaryAmount, { color: '#424242' }]}>{formatCurrency(tabSummary.totalAmount)}</Paragraph>
            </Card.Content>
          </Card>
          <Card style={[styles.summaryCard, { borderLeftColor: '#FF9800', borderLeftWidth: 4 }]}>
            <Card.Content style={styles.summaryContent}>
              <Paragraph style={[styles.summaryLabel, { fontSize: fs.caption }]}>BO Returns</Paragraph>
              <Title style={[styles.summaryValue, { color: '#FF9800' }]}>{summary.boCount}</Title>
              <Paragraph style={[styles.summaryAmount, { color: '#FF9800' }]}>{formatCurrency(summary.boTotal)}</Paragraph>
            </Card.Content>
          </Card>
          <Card style={[styles.summaryCard, { borderLeftColor: '#9C27B0', borderLeftWidth: 4 }]}>
            <Card.Content style={styles.summaryContent}>
              <Paragraph style={[styles.summaryLabel, { fontSize: fs.caption }]}>Refunds</Paragraph>
              <Title style={[styles.summaryValue, { color: '#9C27B0' }]}>{summary.refundCount}</Title>
              <Paragraph style={[styles.summaryAmount, { color: '#9C27B0' }]}>{formatCurrency(summary.refundTotal)}</Paragraph>
            </Card.Content>
          </Card>
        </View>
        <View style={styles.summaryRow}>
          <Card style={[styles.summaryCard, { borderLeftColor: '#2196F3', borderLeftWidth: 4 }]}>
            <Card.Content style={styles.summaryContent}>
              <Paragraph style={[styles.summaryLabel, { fontSize: fs.caption }]}>Exchanges</Paragraph>
              <Title style={[styles.summaryValue, { color: '#2196F3' }]}>{summary.exchangeCount}</Title>
              <Paragraph style={[styles.summaryAmount, { color: '#2196F3' }]}>{formatCurrency(summary.exchangeTotal)}</Paragraph>
            </Card.Content>
          </Card>
          <Card style={[styles.summaryCard, { borderLeftColor: '#4CAF50', borderLeftWidth: 4 }]}>
            <Card.Content style={styles.summaryContent}>
              <Paragraph style={[styles.summaryLabel, { fontSize: fs.caption }]}>Cash Refunds</Paragraph>
              <Title style={[styles.summaryValue, { color: '#4CAF50' }]}>
                {methods.find(m => m.refund_method === 'CASH')?.transaction_count || 0}
              </Title>
              <Paragraph style={[styles.summaryAmount, { color: '#4CAF50' }]}>
                {formatCurrency(methods.find(m => m.refund_method === 'CASH')?.total_amount || 0)}
              </Paragraph>
            </Card.Content>
          </Card>
          <View style={[styles.summaryCard, { opacity: 0 }]} />
        </View>

        {/* Loading */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        )}

        {!loading && (
          <>
            {/* Refund Method Breakdown */}
            {methods.length > 0 && (
              <Card style={styles.tableCard}>
                <Card.Content>
                  <View style={styles.tableTitleRow}>
                    <View style={[styles.colorIndicator, { backgroundColor: '#9C27B0' }]} />
                    <Title style={[styles.tableTitle, { color: '#9C27B0', fontSize: fs.h3 }]}>
                      Refund Method Breakdown
                    </Title>
                  </View>
                  <DataTable>
                    <DataTable.Header>
                      <DataTable.Title style={{ flex: 1.5 }}>Method</DataTable.Title>
                      <DataTable.Title numeric style={{ flex: 0.8 }}>Trans.</DataTable.Title>
                      <DataTable.Title numeric style={{ flex: 0.8 }}>Qty</DataTable.Title>
                      <DataTable.Title numeric style={{ flex: 1.2 }}>Amount</DataTable.Title>
                    </DataTable.Header>
                    {methods.map((m, idx) => (
                      <DataTable.Row key={idx}>
                        <DataTable.Cell style={{ flex: 1.5 }}>{getRefundMethodLabel(m.refund_method)}</DataTable.Cell>
                        <DataTable.Cell numeric style={{ flex: 0.8 }}>{m.transaction_count}</DataTable.Cell>
                        <DataTable.Cell numeric style={{ flex: 0.8 }}>{m.total_quantity}</DataTable.Cell>
                        <DataTable.Cell numeric style={{ flex: 1.2 }}>
                          <Paragraph style={{ color: '#9C27B0', fontWeight: '600' }}>{formatCurrency(m.total_amount)}</Paragraph>
                        </DataTable.Cell>
                      </DataTable.Row>
                    ))}
                  </DataTable>
                </Card.Content>
              </Card>
            )}

            {/* Top Returned Products */}
            {topProducts.length > 0 && (
              <Card style={styles.tableCard}>
                <Card.Content>
                  <View style={styles.tableTitleRow}>
                    <View style={[styles.colorIndicator, { backgroundColor: '#D32F2F' }]} />
                    <Title style={[styles.tableTitle, { color: '#D32F2F', fontSize: fs.h3 }]}>
                      Top Returned Products ({topProducts.length})
                    </Title>
                  </View>
                  <DataTable>
                    <DataTable.Header>
                      <DataTable.Title style={{ flex: 0.4 }}>#</DataTable.Title>
                      <DataTable.Title style={{ flex: 2 }}>Product</DataTable.Title>
                      <DataTable.Title numeric style={{ flex: 0.6 }}>Times</DataTable.Title>
                      <DataTable.Title numeric style={{ flex: 0.6 }}>Qty</DataTable.Title>
                      <DataTable.Title numeric style={{ flex: 1.2 }}>Amount</DataTable.Title>
                    </DataTable.Header>
                    {topProducts.map((p, idx) => (
                      <DataTable.Row key={idx}>
                        <DataTable.Cell style={{ flex: 0.4 }}>{idx + 1}</DataTable.Cell>
                        <DataTable.Cell style={{ flex: 2 }}>
                          <View>
                            <Paragraph style={{ fontSize: 12, fontWeight: '500' }}>{p.product_name}</Paragraph>
                            <Paragraph style={{ fontSize: 10, color: '#757575' }}>{p.product_code || ''}</Paragraph>
                          </View>
                        </DataTable.Cell>
                        <DataTable.Cell numeric style={{ flex: 0.6 }}>{p.times_returned}</DataTable.Cell>
                        <DataTable.Cell numeric style={{ flex: 0.6 }}>{p.total_quantity}</DataTable.Cell>
                        <DataTable.Cell numeric style={{ flex: 1.2 }}>
                          <Paragraph style={{ color: '#D32F2F', fontWeight: '600' }}>{formatCurrency(p.total_amount)}</Paragraph>
                        </DataTable.Cell>
                      </DataTable.Row>
                    ))}
                  </DataTable>
                </Card.Content>
              </Card>
            )}

            {/* Return Reasons Analysis */}
            {reasons.length > 0 && (
              <Card style={styles.tableCard}>
                <Card.Content>
                  <View style={styles.tableTitleRow}>
                    <View style={[styles.colorIndicator, { backgroundColor: '#FF9800' }]} />
                    <Title style={[styles.tableTitle, { color: '#FF9800', fontSize: fs.h3 }]}>
                      Return Reasons Analysis
                    </Title>
                  </View>
                  <DataTable>
                    <DataTable.Header>
                      <DataTable.Title style={{ flex: 2 }}>Reason</DataTable.Title>
                      <DataTable.Title numeric style={{ flex: 0.6 }}>Count</DataTable.Title>
                      <DataTable.Title numeric style={{ flex: 0.6 }}>Qty</DataTable.Title>
                      <DataTable.Title numeric style={{ flex: 1.2 }}>Amount</DataTable.Title>
                    </DataTable.Header>
                    {reasons.map((r, idx) => (
                      <DataTable.Row key={idx}>
                        <DataTable.Cell style={{ flex: 2 }}>{r.reason || 'Unknown'}</DataTable.Cell>
                        <DataTable.Cell numeric style={{ flex: 0.6 }}>{r.return_count}</DataTable.Cell>
                        <DataTable.Cell numeric style={{ flex: 0.6 }}>{r.total_quantity}</DataTable.Cell>
                        <DataTable.Cell numeric style={{ flex: 1.2 }}>
                          <Paragraph style={{ color: '#FF9800', fontWeight: '600' }}>{formatCurrency(r.total_amount)}</Paragraph>
                        </DataTable.Cell>
                      </DataTable.Row>
                    ))}
                  </DataTable>
                </Card.Content>
              </Card>
            )}

            {/* Detail List */}
            {filteredItems.length > 0 && (
              <Card style={styles.tableCard}>
                <Card.Content>
                  <View style={styles.tableTitleRow}>
                    <View style={[styles.colorIndicator, { backgroundColor: theme.colors.primary }]} />
                    <Title style={[styles.tableTitle, { color: theme.colors.primary, fontSize: fs.h3 }]}>
                      Detail List ({filteredItems.length} items)
                    </Title>
                  </View>
                  <DataTable>
                    <DataTable.Header>
                      <DataTable.Title style={{ flex: 1 }}>Date</DataTable.Title>
                      <DataTable.Title style={{ flex: 0.8 }}>Type</DataTable.Title>
                      <DataTable.Title style={{ flex: 1.3 }}>Reference</DataTable.Title>
                      <DataTable.Title style={{ flex: 1.5 }}>Product</DataTable.Title>
                      <DataTable.Title numeric style={{ flex: 0.5 }}>Qty</DataTable.Title>
                      <DataTable.Title numeric style={{ flex: 1 }}>Amount</DataTable.Title>
                    </DataTable.Header>
                    {filteredItems.map((item, idx) => (
                      <DataTable.Row key={`${item.source}-${item.id}-${idx}`}>
                        <DataTable.Cell style={{ flex: 1 }}>{formatDate(item.date)}</DataTable.Cell>
                        <DataTable.Cell style={{ flex: 0.8 }}>
                          <Chip
                            compact
                            textStyle={{ fontSize: 8, color: getSourceColor(item.source) }}
                            style={{ backgroundColor: item.source === 'BO' ? '#FFF3E0' : item.source === 'EXCHANGE' ? '#E3F2FD' : '#F3E5F5' }}
                          >
                            {item.source === 'BO' ? 'BO' : item.source === 'EXCHANGE' ? 'Exc' : 'Ref'}
                          </Chip>
                        </DataTable.Cell>
                        <DataTable.Cell style={{ flex: 1.3 }}>
                          <Paragraph style={{ fontSize: 10 }}>{item.reference}</Paragraph>
                        </DataTable.Cell>
                        <DataTable.Cell style={{ flex: 1.5 }}>
                          <Paragraph style={{ fontSize: 11 }}>{item.product_name}</Paragraph>
                        </DataTable.Cell>
                        <DataTable.Cell numeric style={{ flex: 0.5 }}>{item.quantity}</DataTable.Cell>
                        <DataTable.Cell numeric style={{ flex: 1 }}>
                          <Paragraph style={{ fontWeight: '600', fontSize: 11 }}>{formatCurrency(item.total_amount)}</Paragraph>
                        </DataTable.Cell>
                      </DataTable.Row>
                    ))}
                  </DataTable>
                </Card.Content>
              </Card>
            )}

            {/* Empty state */}
            {filteredItems.length === 0 && (
              <Card style={styles.emptyCard}>
                <Card.Content style={styles.emptyContent}>
                  <Paragraph style={styles.emptyText}>
                    No returns found for the selected period
                  </Paragraph>
                </Card.Content>
              </Card>
            )}
          </>
        )}

        <View style={styles.footer}>
          <Paragraph style={styles.footerText}>
            Report generated on {new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}
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
  filterCard: {
    marginBottom: 12,
    elevation: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  summaryCard: {
    flex: 1,
    elevation: 2,
  },
  summaryContent: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 11,
    opacity: 0.7,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginVertical: 2,
  },
  summaryAmount: {
    fontSize: 12,
    fontWeight: '600',
  },
  tabCard: {
    marginBottom: 12,
    elevation: 2,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  tabLabel: {
    fontSize: 11,
    color: '#757575',
  },
  tabBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tabBadgeText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  tableCard: {
    marginBottom: 16,
    elevation: 2,
  },
  tableTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  colorIndicator: {
    width: 4,
    height: 20,
    borderRadius: 2,
    marginRight: 8,
  },
  tableTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyCard: {
    marginBottom: 16,
  },
  emptyContent: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    opacity: 0.6,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
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
  },
});
