import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Button,
  TextInput,
  List,
  Switch,
  useTheme,
  Dialog,
  Portal,
  Divider,
  Text,
  IconButton,
} from 'react-native-paper';
import { ScreenGuard } from '../components/RoleGuard';
import { StableTextInput } from '../components/StableTextInput';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, refreshTrialStatus } from '../App';
import * as Clipboard from 'expo-clipboard';
import { getDatabase } from '../database/getDatabase';
import { useAuth } from '../contexts/AuthContext';
import { useAppTheme } from '../contexts/ThemeContext';
import { ThemeName, themeDisplayNames } from '../utils/theme';
import BarcodeLabelTemplateSettings from '../components/BarcodeLabelTemplateSettings';
import { DeviceBindingService, TrialStatus } from '../utils/DeviceBindingService';
import { useResponsiveTheme } from '../utils/responsive';
import { DatabaseBackupService } from '../utils/DatabaseBackupService';
import * as Sharing from 'expo-sharing';

type SettingsScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'Settings'
>;

type Props = {
  navigation: SettingsScreenNavigationProp;
};

interface Settings {
  company_name: string;
  company_address: string;
  company_tin: string;
  pos_serial: string;
  vat_rate: string;
  receipt_footer: string;
}

export default function SettingsScreen({ navigation }: Props) {
  const [settings, setSettings] = useState<Settings>({
    company_name: '',
    company_address: '',
    company_tin: '',
    pos_serial: '',
    vat_rate: '12.00',
    receipt_footer: '',
  });
  const [requireCustomerName, setRequireCustomerName] = useState(false);
  const [askDamageOnReturn, setAskDamageOnReturn] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [currentSetting, setCurrentSetting] = useState<{
    key: keyof Settings;
    label: string;
    value: string;
  } | null>(null);
  const [tempValue, setTempValue] = useState('');
  const [licensePasswordDialogVisible, setLicensePasswordDialogVisible] = useState(false);
  const [licensePassword, setLicensePassword] = useState('');
  const [labelTemplateVisible, setLabelTemplateVisible] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState<TrialStatus | null>(null);
  const [deviceId, setDeviceId] = useState('');
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [activating, setActivating] = useState(false);
  const [deviceIdCopied, setDeviceIdCopied] = useState(false);
  const theme = useTheme();
  const { sp, fs, lo } = useResponsiveTheme();
  const { user } = useAuth();
  const { themeName, setTheme, availableThemes, colors } = useAppTheme();

  useEffect(() => {
    loadSettings();
    loadLicenseStatus();
    loadDeviceId();
  }, []);

  const loadLicenseStatus = async () => {
    try {
      const status = await DeviceBindingService.getTrialStatus();
      setLicenseStatus(status);
    } catch (error) {
      console.error('Error loading license status:', error);
    }
  };

  const loadDeviceId = async () => {
    try {
      const id = await DeviceBindingService.getCurrentDeviceId();
      setDeviceId(id);
    } catch (error) {
      console.error('Error loading device ID:', error);
    }
  };

  const copyDeviceId = async () => {
    try {
      await Clipboard.setStringAsync(deviceId);
      setDeviceIdCopied(true);
      setTimeout(() => setDeviceIdCopied(false), 2000);
    } catch (err) {
      Alert.alert('Error', 'Failed to copy Device ID');
    }
  };

  const formatLicenseKeyInput = (text: string) => {
    const cleaned = text.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const parts = cleaned.match(/.{1,4}/g) || [];
    return parts.slice(0, 4).join('-');
  };

  const handleActivateLicense = async () => {
    if (!licenseKeyInput.trim()) {
      Alert.alert('Error', 'Please enter a license key');
      return;
    }
    setActivating(true);
    try {
      const result = await DeviceBindingService.activateDevice(licenseKeyInput);
      if (result.success) {
        Alert.alert('Success', result.message);
        setLicenseKeyInput('');
        await loadLicenseStatus();
        if (refreshTrialStatus) refreshTrialStatus();
      } else {
        Alert.alert('Activation Failed', result.message);
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred during activation');
    } finally {
      setActivating(false);
    }
  };

  const SELLER_PHONE = '+639623108957';
  const SELLER_EMAIL = 'igorotekit@gmail.com';
  const APP_NAME = 'IgoroTech POS';

  const getActivationMessage = () => {
    return `Hello, I would like to request a license key for ${APP_NAME}.\n\nMy Device ID is:\n${deviceId}\n\nThank you!`;
  };

  const sendDeviceIdViaWhatsApp = async () => {
    if (!deviceId) return;
    try {
      const message = encodeURIComponent(getActivationMessage());
      const url = `whatsapp://send?phone=${SELLER_PHONE}&text=${message}`;
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert('Error', 'Could not open WhatsApp');
    }
  };

  const sendDeviceIdViaSMS = async () => {
    if (!deviceId) return;
    try {
      const message = encodeURIComponent(getActivationMessage());
      const url = `sms:${SELLER_PHONE}?body=${message}`;
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert('Error', 'Could not open SMS');
    }
  };

  const sendDeviceIdViaEmail = async () => {
    if (!deviceId) return;
    try {
      const subject = encodeURIComponent(`License Key Request - ${APP_NAME}`);
      const body = encodeURIComponent(getActivationMessage());
      const url = `mailto:${SELLER_EMAIL}?subject=${subject}&body=${body}`;
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert('Error', 'Could not open email app');
    }
  };

  const loadSettings = async () => {
    try {
      const dbService = getDatabase();
      const settingsData: Settings = {
        company_name: await dbService.getSetting('company_name') || 'Your Company Name',
        company_address: await dbService.getSetting('company_address') || 'Your Company Address',
        company_tin: await dbService.getSetting('company_tin') || '000-000-000-000',
        pos_serial: await dbService.getSetting('pos_serial') || 'POS000000',
        vat_rate: await dbService.getSetting('vat_rate') || '12.00',
        receipt_footer: await dbService.getSetting('receipt_footer') || 'Thank you for your Purchase!',
      };
      setSettings(settingsData);
      const reqCust = await dbService.getSetting('require_customer_name');
      setRequireCustomerName(reqCust === 'true');
      const askDmg = await dbService.getSetting('ask_damage_on_return');
      setAskDamageOnReturn(askDmg === 'true');
    } catch (error) {
      console.error('Error loading settings:', error);
      Alert.alert('Error', 'Failed to load settings');
    }
  };

  const handleToggleRequireCustomer = async (value: boolean) => {
    try {
      const dbService = getDatabase();
      await dbService.updateSetting('require_customer_name', value ? 'true' : 'false');
      setRequireCustomerName(value);
    } catch (error) {
      console.error('Error saving setting:', error);
      Alert.alert('Error', 'Failed to save setting');
    }
  };

  const handleToggleAskDamageOnReturn = async (value: boolean) => {
    try {
      const dbService = getDatabase();
      await dbService.updateSetting('ask_damage_on_return', value ? 'true' : 'false');
      setAskDamageOnReturn(value);
    } catch (error) {
      console.error('Error saving setting:', error);
      Alert.alert('Error', 'Failed to save setting');
    }
  };

  const handleBackupNow = async () => {
    try {
      setBackingUp(true);
      const backupService = DatabaseBackupService.getInstance();
      const backupPath = await backupService.createBackup();

      if (Platform.OS === 'web') {
        Alert.alert('Success', 'Backup downloaded successfully!');
      } else {
        Alert.alert(
          'Backup Created',
          'Your database backup has been saved successfully.',
          [
            { text: 'OK' },
            {
              text: 'Share Copy',
              onPress: async () => {
                try {
                  if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(backupPath, {
                      mimeType: 'application/x-sqlite3',
                      dialogTitle: 'Share Database Backup',
                    });
                  }
                } catch (e) {
                  console.error('Share failed:', e);
                }
              },
            },
          ]
        );
      }
    } catch (error) {
      console.error('Backup failed:', error);
      Alert.alert('Backup Failed', `${error}`);
    } finally {
      setBackingUp(false);
    }
  };

  const handleEditSetting = (key: keyof Settings, label: string, value: string) => {
    setCurrentSetting({ key, label, value });
    setTempValue(value);
    setDialogVisible(true);
  };

  const handleSaveSetting = async () => {
    if (!currentSetting) return;

    if (!tempValue.trim()) {
      Alert.alert('Error', 'Value cannot be empty');
      return;
    }

    // Validate VAT rate
    if (currentSetting.key === 'vat_rate') {
      const vatRate = parseFloat(tempValue);
      if (isNaN(vatRate) || vatRate < 0 || vatRate > 100) {
        Alert.alert('Error', 'VAT rate must be a number between 0 and 100');
        return;
      }
      // Warn if not standard Philippine VAT rate
      if (vatRate !== 12) {
        Alert.alert(
          'Non-Standard VAT Rate',
          `You entered ${vatRate}%. The standard Philippine VAT rate is 12%. Are you sure you want to continue?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Continue', onPress: () => saveSetting(vatRate.toFixed(2)) }
          ]
        );
        return;
      }
    }

    // Validate TIN format (Philippine format: XXX-XXX-XXX-XXX)
    if (currentSetting.key === 'company_tin') {
      const tinRegex = /^\d{3}-\d{3}-\d{3}-\d{3}$/;
      if (!tinRegex.test(tempValue.trim())) {
        Alert.alert('Error', 'TIN must be in format: 000-000-000-000');
        return;
      }
    }

    // Validate POS Serial format (e.g., POS000000)
    if (currentSetting.key === 'pos_serial') {
      const posSerialRegex = /^[A-Za-z]{2,5}\d{4,8}$/;
      if (!posSerialRegex.test(tempValue.trim())) {
        Alert.alert('Error', 'POS Serial must be in format: POS000000 (letters followed by numbers)');
        return;
      }
    }

    await saveSetting(tempValue);
  };

  const saveSetting = async (value: string) => {
    if (!currentSetting) return;

    setLoading(true);
    try {
      const dbService = getDatabase();
      await dbService.updateSetting(currentSetting.key, value);

      setSettings(prev => ({
        ...prev,
        [currentSetting.key]: value
      }));

      setDialogVisible(false);
      setCurrentSetting(null);
      setTempValue('');

      Alert.alert('Success', 'Setting updated successfully');
    } catch (error) {
      console.error('Error saving setting:', error);
      Alert.alert('Error', 'Failed to save setting');
    } finally {
      setLoading(false);
    }
  };


  const handleOpenLicenseGenerator = () => {
    setLicensePassword('');
    setLicensePasswordDialogVisible(true);
  };

  const handleLicensePasswordSubmit = () => {
    if (licensePassword === '1018') {
      setLicensePasswordDialogVisible(false);
      setLicensePassword('');
      navigation.navigate('LicenseGenerator');
    } else {
      Alert.alert('Access Denied', 'Incorrect password');
      setLicensePassword('');
    }
  };

  const settingsList = [
    { key: 'company_name' as keyof Settings, label: 'Company Name', value: settings.company_name },
    { key: 'company_address' as keyof Settings, label: 'Company Address', value: settings.company_address },
    { key: 'company_tin' as keyof Settings, label: 'TIN Number', value: settings.company_tin },
    { key: 'pos_serial' as keyof Settings, label: 'POS Serial Number', value: settings.pos_serial },
    { key: 'vat_rate' as keyof Settings, label: 'VAT Rate (%)', value: settings.vat_rate },
    { key: 'receipt_footer' as keyof Settings, label: 'Receipt Footer', value: settings.receipt_footer },
  ];

  return (
    <ScreenGuard screenName="Settings">
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <ScrollView style={styles.scrollView}>
        <View style={[styles.content, { padding: lo.screenPadding }]}>
          {/* Profile Section */}
          <Card style={styles.card}>
            <Card.Content>
              <Title style={[styles.cardTitle, { fontSize: fs.h3 }]}>My Profile</Title>
              <Paragraph style={[styles.cardSubtitle, { fontSize: fs.bodySmall }]}>
                Manage your account settings
              </Paragraph>

              <List.Item
                title={user?.full_name || user?.username || 'User'}
                description={`${user?.role === 'ADMIN' ? 'Administrator' : user?.role === 'MANAGER' ? 'Manager' : 'Cashier'} - Tap to view profile`}
                left={props => <List.Icon {...props} icon="account-circle" />}
                right={props => <List.Icon {...props} icon="chevron-right" />}
                onPress={() => navigation.navigate('Profile')}
                style={styles.listItem}
              />
            </Card.Content>
          </Card>

          {/* Appearance / Theme Selection */}
          <Card style={styles.card}>
            <Card.Content>
              <Title style={styles.cardTitle}>Appearance</Title>
              <Paragraph style={styles.cardSubtitle}>
                Customize the look and feel of your POS
              </Paragraph>

              <Paragraph style={styles.themeLabel}>Color Theme</Paragraph>
              <View style={styles.themeOptions}>
                {availableThemes.map((themeOption) => {
                  const isSelected = themeName === themeOption.name;
                  const themeColors = {
                    teal: '#00796B',
                    blue: '#1565C0',
                    green: '#2E7D32',
                  };
                  const previewColor = themeColors[themeOption.name as keyof typeof themeColors];

                  return (
                    <Button
                      key={themeOption.name}
                      mode={isSelected ? 'contained' : 'outlined'}
                      onPress={() => setTheme(themeOption.name)}
                      style={[
                        styles.themeButton,
                        isSelected && { backgroundColor: previewColor },
                      ]}
                      labelStyle={[
                        styles.themeButtonLabel,
                        isSelected && { color: '#FFFFFF' },
                      ]}
                      contentStyle={styles.themeButtonContent}
                    >
                      {themeOption.displayName}
                    </Button>
                  );
                })}
              </View>

              <View style={[styles.themePreview, { borderColor: colors.primary }]}>
                <View style={[styles.themePreviewBar, { backgroundColor: colors.primary }]}>
                  <Paragraph style={styles.themePreviewText}>Preview</Paragraph>
                </View>
                <View style={styles.themePreviewContent}>
                  <View style={[styles.themePreviewDot, { backgroundColor: colors.primary }]} />
                  <View style={[styles.themePreviewDot, { backgroundColor: colors.accent }]} />
                  <View style={[styles.themePreviewDot, { backgroundColor: colors.success }]} />
                  <View style={[styles.themePreviewDot, { backgroundColor: colors.error }]} />
                </View>
              </View>
            </Card.Content>
          </Card>

          {/* Company Information */}
          <Card style={styles.card}>
            <Card.Content>
              <Title style={styles.cardTitle}>Company Information</Title>
              <Paragraph style={styles.cardSubtitle}>
                Basic company details for receipts and Business compliance
              </Paragraph>

              {settingsList.slice(0, 3).map((setting) => (
                <List.Item
                  key={setting.key}
                  title={setting.label}
                  description={setting.value || 'Not set'}
                  left={props => <List.Icon {...props} icon="office-building" />}
                  right={props => <List.Icon {...props} icon="chevron-right" />}
                  onPress={() => handleEditSetting(setting.key, setting.label, setting.value)}
                  style={styles.listItem}
                />
              ))}
            </Card.Content>
          </Card>

          {/* Business Configuration */}
          <Card style={styles.card}>
            <Card.Content>
              <Title style={styles.cardTitle}>Business Configuration</Title>
              <Paragraph style={styles.cardSubtitle}>
                Business-required information for compliance
              </Paragraph>

              {settingsList.slice(3, 6).map((setting) => (
                <List.Item
                  key={setting.key}
                  title={setting.label}
                  description={setting.value || 'Not set'}
                  left={props => <List.Icon {...props} icon="file-certificate" />}
                  right={props => <List.Icon {...props} icon="chevron-right" />}
                  onPress={() => handleEditSetting(setting.key, setting.label, setting.value)}
                  style={styles.listItem}
                />
              ))}
            </Card.Content>
          </Card>

          {/* System Settings */}
          <Card style={styles.card}>
            <Card.Content>
              <Title style={styles.cardTitle}>System Settings</Title>
              <Paragraph style={styles.cardSubtitle}>
                General system configuration
              </Paragraph>

              {settingsList.slice(6).map((setting) => (
                <List.Item
                  key={setting.key}
                  title={setting.label}
                  description={setting.key === 'vat_rate' ? `${setting.value}%` : setting.value || 'Not set'}
                  left={props => <List.Icon {...props} icon="cog" />}
                  right={props => <List.Icon {...props} icon="chevron-right" />}
                  onPress={() => handleEditSetting(setting.key, setting.label, setting.value)}
                  style={styles.listItem}
                />
              ))}

              <Divider />

              <List.Item
                title="Require Customer Name"
                description={requireCustomerName ? 'Customer name is required during sales' : 'Customer name is optional during sales'}
                left={props => <List.Icon {...props} icon="account-check" />}
                right={() => (
                  <Switch
                    value={requireCustomerName}
                    onValueChange={handleToggleRequireCustomer}
                  />
                )}
                onPress={() => handleToggleRequireCustomer(!requireCustomerName)}
                style={styles.listItem}
              />

              {user?.role === 'ADMIN' && (
                <>
                  <Divider />
                  <List.Item
                    title="Ask Damage on Return (BO)"
                    description={askDamageOnReturn ? 'Cashier will be asked if returned items should be recorded as damaged' : 'Returned items go back to inventory without prompt'}
                    left={props => <List.Icon {...props} icon="package-variant-closed-remove" />}
                    right={() => (
                      <Switch
                        value={askDamageOnReturn}
                        onValueChange={handleToggleAskDamageOnReturn}
                      />
                    )}
                    onPress={() => handleToggleAskDamageOnReturn(!askDamageOnReturn)}
                    style={styles.listItem}
                  />
                </>
              )}

            </Card.Content>
          </Card>

          {/* Master Data Management */}
          <Card style={styles.card}>
            <Card.Content>
              <Title style={styles.cardTitle}>Master Data</Title>
              <Paragraph style={styles.cardSubtitle}>
                Manage product categories, brands, units, and sizes
              </Paragraph>

              <List.Item
                title="Categories"
                description="Manage product categories"
                left={props => <List.Icon {...props} icon="folder" />}
                right={props => <List.Icon {...props} icon="chevron-right" />}
                onPress={() => navigation.navigate('Categories')}
                style={styles.listItem}
              />

              <Divider />

              <List.Item
                title="Brands"
                description="Manage product brands"
                left={props => <List.Icon {...props} icon="tag" />}
                right={props => <List.Icon {...props} icon="chevron-right" />}
                onPress={() => navigation.navigate('Brands')}
                style={styles.listItem}
              />

              <Divider />

              <List.Item
                title="Units of Measure"
                description="Manage units (pcs, kg, L, box, etc.)"
                left={props => <List.Icon {...props} icon="scale" />}
                right={props => <List.Icon {...props} icon="chevron-right" />}
                onPress={() => navigation.navigate('Units')}
                style={styles.listItem}
              />

              <Divider />

              <List.Item
                title="Sizes"
                description="Manage product sizes (S, M, L, 500ml, etc.)"
                left={props => <List.Icon {...props} icon="resize" />}
                right={props => <List.Icon {...props} icon="chevron-right" />}
                onPress={() => navigation.navigate('Sizes')}
                style={styles.listItem}
              />
            </Card.Content>
          </Card>

          {/* Cheque Management */}
          <Card style={styles.card}>
            <Card.Content>
              <Title style={styles.cardTitle}>Cheque Management</Title>
              <Paragraph style={styles.cardSubtitle}>
                Track post-dated cheques and manage cheque status
              </Paragraph>

              <List.Item
                title="PDC Tracking"
                description="Manage post-dated cheques (pending, deposited, cleared, bounced)"
                left={props => <List.Icon {...props} icon="checkbook" />}
                right={props => <List.Icon {...props} icon="chevron-right" />}
                onPress={() => navigation.navigate('PDCTracking')}
                style={styles.listItem}
              />
            </Card.Content>
          </Card>

          {/* License Status - Show for all users */}
          <Card style={styles.card}>
            <Card.Content>
              <Title style={styles.cardTitle}>License Status</Title>
              {licenseStatus && (
                <View style={styles.licenseStatusContainer}>
                  <View style={[
                    styles.licenseStatusBadge,
                    { backgroundColor: licenseStatus.isFullLicense ? '#4CAF50' : licenseStatus.isTrialActive ? '#FF9800' : '#F44336' }
                  ]}>
                    <Paragraph style={styles.licenseStatusText}>
                      {licenseStatus.isFullLicense
                        ? 'Full License (Activated)'
                        : licenseStatus.isTrialActive
                          ? `Trial: ${licenseStatus.daysRemaining} days remaining`
                          : 'Trial Expired'}
                    </Paragraph>
                  </View>

                  {/* Show activation UI when not fully licensed */}
                  {!licenseStatus.isFullLicense && (
                    <View style={styles.activationSection}>
                      <Divider style={{ marginVertical: 16 }} />

                      {/* Device ID */}
                      <Text style={styles.activationLabel}>Your Device ID:</Text>
                      <View style={styles.deviceIdRow}>
                        <Text
                          style={styles.deviceIdText}
                          numberOfLines={1}
                          ellipsizeMode="middle"
                        >
                          {deviceId || 'Loading...'}
                        </Text>
                        <IconButton
                          icon={deviceIdCopied ? 'check' : 'content-copy'}
                          size={20}
                          onPress={copyDeviceId}
                        />
                      </View>

                      {/* Send Device ID Buttons */}
                      <Text style={styles.activationLabel}>Send Device ID to get your license:</Text>
                      <View style={styles.sendButtonsRow}>
                        <Button
                          mode="contained"
                          onPress={sendDeviceIdViaWhatsApp}
                          icon="whatsapp"
                          style={[styles.sendButton, { backgroundColor: '#25D366' }]}
                          labelStyle={styles.sendButtonLabel}
                          disabled={!deviceId}
                          compact
                        >
                          WhatsApp
                        </Button>
                        <Button
                          mode="contained"
                          onPress={sendDeviceIdViaSMS}
                          icon="message-text"
                          style={[styles.sendButton, { backgroundColor: '#2196F3' }]}
                          labelStyle={styles.sendButtonLabel}
                          disabled={!deviceId}
                          compact
                        >
                          SMS
                        </Button>
                        <Button
                          mode="contained"
                          onPress={sendDeviceIdViaEmail}
                          icon="email"
                          style={[styles.sendButton, { backgroundColor: '#EA4335' }]}
                          labelStyle={styles.sendButtonLabel}
                          disabled={!deviceId}
                          compact
                        >
                          Email
                        </Button>
                      </View>

                      {/* License Key Input */}
                      <Divider style={{ marginVertical: 16 }} />
                      <Text style={styles.activationLabel}>Enter License Key:</Text>
                      <TextInput
                        mode="outlined"
                        placeholder="XXXX-XXXX-XXXX-XXXX"
                        value={licenseKeyInput}
                        onChangeText={(text) => setLicenseKeyInput(formatLicenseKeyInput(text))}
                        autoCapitalize="characters"
                        maxLength={19}
                        style={{ marginBottom: 12 }}
                      />
                      <Button
                        mode="contained"
                        onPress={handleActivateLicense}
                        loading={activating}
                        disabled={activating || !licenseKeyInput.trim()}
                        icon="key-variant"
                      >
                        Activate License
                      </Button>
                    </View>
                  )}
                </View>
              )}
            </Card.Content>
          </Card>

          {/* License Management - Admin Only */}
          {user?.role === 'ADMIN' && (
            <Card style={styles.card}>
              <Card.Content>
                <Title style={styles.cardTitle}>License Management</Title>
                <Paragraph style={styles.cardSubtitle}>
                  Generate license keys for customer devices
                </Paragraph>

                <List.Item
                  title="License Key Generator"
                  description="Generate license keys for new device activations"
                  left={props => <List.Icon {...props} icon="key-variant" />}
                  right={props => <List.Icon {...props} icon="chevron-right" />}
                  onPress={handleOpenLicenseGenerator}
                  style={styles.listItem}
                />
              </Card.Content>
            </Card>
          )}

          {/* Hardware Settings */}
          <Card style={styles.card}>
            <Card.Content>
              <Title style={styles.cardTitle}>Hardware Settings</Title>
              <Paragraph style={styles.cardSubtitle}>
                Configure printers, scanners, and other devices
              </Paragraph>

              <List.Item
                title="Printer Settings"
                description="Connect and configure thermal receipt printer"
                left={props => <List.Icon {...props} icon="printer" />}
                right={props => <List.Icon {...props} icon="chevron-right" />}
                onPress={() => navigation.navigate('PrinterSettings')}
                style={styles.listItem}
              />

              <Divider />

              <List.Item
                title="Barcode Scanner"
                description="Use camera to scan product barcodes"
                left={props => <List.Icon {...props} icon="barcode-scan" />}
                right={props => <List.Icon {...props} icon="chevron-right" />}
                onPress={() => navigation.navigate('BarcodeScanner')}
                style={styles.listItem}
              />

              <Divider />

              <List.Item
                title="Label Printing Template"
                description="Configure barcode label content and layout"
                left={props => <List.Icon {...props} icon="label" />}
                right={props => <List.Icon {...props} icon="chevron-right" />}
                onPress={() => setLabelTemplateVisible(true)}
                style={styles.listItem}
              />
            </Card.Content>
          </Card>

          {/* Database Tools */}
          <Card style={styles.card}>
            <Card.Content>
              <List.Item
                title="Backup Database"
                description="Create a backup of your database now"
                left={props => <List.Icon {...props} icon="database-export" />}
                right={() => (
                  <Button
                    mode="contained"
                    compact
                    icon="backup-restore"
                    onPress={handleBackupNow}
                    loading={backingUp}
                    disabled={backingUp}
                    buttonColor="#4CAF50"
                  >
                    {backingUp ? 'Backing up...' : 'Backup Now'}
                  </Button>
                )}
                style={styles.listItem}
              />

              <Divider />

              <List.Item
                title="Database & Data Management"
                description="View tables, backup, restore, and monitor health"
                left={props => <List.Icon {...props} icon="database-cog" />}
                right={props => <List.Icon {...props} icon="chevron-right" />}
                onPress={() => navigation.navigate('DatabaseViewer')}
                style={styles.listItem}
              />
            </Card.Content>
          </Card>

          {/* Help & Support */}
          <Card style={styles.card}>
            <Card.Content>
              <Title style={styles.cardTitle}>Help & Support</Title>
              <Paragraph style={styles.cardSubtitle}>
                User manual, tutorials, and support resources
              </Paragraph>

              <List.Item
                title="User Manual"
                description="View, print, or download the complete user guide"
                left={props => <List.Icon {...props} icon="book-open-page-variant" />}
                right={props => <List.Icon {...props} icon="chevron-right" />}
                onPress={() => navigation.navigate('UserManual')}
                style={styles.listItem}
              />
            </Card.Content>
          </Card>

          {/* App Information */}
          <Card style={styles.card}>
            <Card.Content>
              <Title style={styles.cardTitle}>App Information</Title>

              <View style={styles.infoGrid}>
                <View style={styles.infoItem}>
                  <Paragraph style={styles.infoLabel}>Version</Paragraph>
                  <Paragraph style={styles.infoValue}>1.0.0</Paragraph>
                </View>
                <View style={styles.infoItem}>
                  <Paragraph style={styles.infoLabel}>Build</Paragraph>
                  <Paragraph style={styles.infoValue}>2024.1</Paragraph>
                </View>
                <View style={styles.infoItem}>
                  <Paragraph style={styles.infoLabel}>Business Compliance</Paragraph>
                  <Paragraph style={[styles.infoValue, { color: '#4CAF50' }]}>Active</Paragraph>
                </View>
                <View style={styles.infoItem}>
                  <Paragraph style={styles.infoLabel}>Database</Paragraph>
                  <Paragraph style={styles.infoValue}>SQLite</Paragraph>
                </View>
              </View>

              <View style={styles.appFooter}>
                <Paragraph style={styles.footerText}>
                  Business-Compliant Mobile POS System
                </Paragraph>
                <Paragraph style={styles.footerSubtext}>
                  Developed for Philippine businesses
                </Paragraph>
              </View>
            </Card.Content>
          </Card>
        </View>
      </ScrollView>

      {/* Edit Setting Dialog */}
      <Portal>
        <Dialog visible={dialogVisible} onDismiss={() => setDialogVisible(false)}>
          <Dialog.Title>
            Edit {currentSetting?.label}
          </Dialog.Title>
          <Dialog.Content>
            <StableTextInput
              key={`${currentSetting?.key}-${dialogVisible}`}
              label={currentSetting?.label || ''}
              value={tempValue}
              onChangeText={setTempValue}
              mode="outlined"
              multiline={currentSetting?.key === 'company_address' || currentSetting?.key === 'receipt_footer'}
              numberOfLines={currentSetting?.key === 'company_address' || currentSetting?.key === 'receipt_footer' ? 3 : 1}
              keyboardType={currentSetting?.key === 'vat_rate' ? 'numeric' : 'default'}
              style={styles.dialogInput}
              autoCapitalize="sentences"
              autoCorrect={false}
            />

            {currentSetting?.key === 'company_tin' && (
              <Paragraph style={styles.helperText}>
                Format: 000-000-000-000
              </Paragraph>
            )}
            {currentSetting?.key === 'pos_serial' && (
              <Paragraph style={styles.helperText}>
                Format: POS000000
              </Paragraph>
            )}
            {currentSetting?.key === 'vat_rate' && (
              <Paragraph style={styles.helperText}>
                Enter rate as number (e.g., 12.00 for 12%)
              </Paragraph>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialogVisible(false)}>Cancel</Button>
            <Button
              onPress={handleSaveSetting}
              loading={loading}
              disabled={loading}
            >
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* License Generator Password Dialog */}
        <Dialog
          visible={licensePasswordDialogVisible}
          onDismiss={() => {
            setLicensePasswordDialogVisible(false);
            setLicensePassword('');
          }}
        >
          <Dialog.Title>Enter Password</Dialog.Title>
          <Dialog.Content>
            <Paragraph style={{ marginBottom: 16 }}>
              Enter the admin password to access the License Key Generator
            </Paragraph>
            <TextInput
              label="Password"
              value={licensePassword}
              onChangeText={setLicensePassword}
              mode="outlined"
              secureTextEntry={true}
              autoFocus={true}
              style={styles.dialogInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => {
              setLicensePasswordDialogVisible(false);
              setLicensePassword('');
            }}>Cancel</Button>
            <Button onPress={handleLicensePasswordSubmit}>OK</Button>
          </Dialog.Actions>
        </Dialog>

      </Portal>

      {/* Label Template Settings Dialog */}
      <Portal>
        <Dialog
          visible={labelTemplateVisible}
          onDismiss={() => setLabelTemplateVisible(false)}
          style={{ maxWidth: 600, alignSelf: 'center' }}
        >
          <Dialog.Title>Label Template Settings</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView>
              <BarcodeLabelTemplateSettings />
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setLabelTemplateVisible(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
    </ScreenGuard>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: '4%',
    paddingBottom: '8%',
  },
  card: {
    marginBottom: '4%',
    elevation: 4,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  cardSubtitle: {
    opacity: 0.7,
    marginBottom: 16,
    fontSize: 12,
  },
  licenseStatusContainer: {
    marginTop: 8,
  },
  licenseStatusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  licenseStatusText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    margin: 0,
  },
  licenseHelpText: {
    marginTop: 12,
    fontSize: 13,
    opacity: 0.7,
    textAlign: 'center',
  },
  activationSection: {
    marginTop: 4,
  },
  activationLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    opacity: 0.8,
  },
  deviceIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingLeft: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 16,
  },
  deviceIdText: {
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: '#333',
  },
  sendButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  sendButton: {
    flex: 1,
    borderRadius: 8,
  },
  sendButtonLabel: {
    fontSize: 11,
    color: '#FFFFFF',
  },
  listItem: {
    paddingVertical: 4,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  infoItem: {
    width: '48%',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 12,
    opacity: 0.7,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  appFooter: {
    alignItems: 'center',
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  footerText: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  footerSubtext: {
    fontSize: 12,
    opacity: 0.7,
    textAlign: 'center',
    marginTop: 4,
  },
  dialogInput: {
    marginBottom: 8,
    textAlign: 'left',
  },
  helperText: {
    fontSize: 12,
    opacity: 0.7,
    fontStyle: 'italic',
  },
  // Theme selector styles
  themeLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    opacity: 0.8,
  },
  themeOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  themeButton: {
    flex: 1,
    minWidth: 100,
  },
  themeButtonLabel: {
    fontSize: 12,
  },
  themeButtonContent: {
    paddingVertical: 4,
  },
  themePreview: {
    borderWidth: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  themePreviewBar: {
    padding: 8,
    alignItems: 'center',
  },
  themePreviewText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
  },
  themePreviewContent: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 12,
    backgroundColor: '#F5F5F5',
  },
  themePreviewDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
});