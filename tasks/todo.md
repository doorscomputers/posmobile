# Production-Ready New Install

## Steps
- [x] Step 1: Update default user passwords in schema.ts (manager→1111, cashier→1234)
- [x] Step 2: Update fallback createDefaultUsers() in DatabaseService.ts with correct hashes
- [x] Step 3: Gut sample data in utils/SampleData.ts (keep clearAllData, make init a no-op)
- [x] Step 4: Remove sample data initialization from App.tsx
- [x] Step 5: Update WebMockDatabaseService.ts (empty products/suppliers, update hashes, update settings)
- [x] Step 6: Change default receipt footer to "Thank you for your Purchase!"

## Review

### Summary of Changes
1. **database/schema.ts** — Updated manager hash to `$simple$ManagerSalt12345$5d2db5b7` (password: 1111) and cashier hash to `$simple$CashierSalt12345$26740ee1` (password: 1234) in both INSERT and migration UPDATE statements. Changed default receipt_footer to "Thank you for your Purchase!".

2. **database/DatabaseService.ts** — Replaced old `$2b$10$demo_hash_*` fallback hashes in `createDefaultUsers()` with correct `$simple$` hashes matching the new per-role passwords.

3. **utils/SampleData.ts** — Removed 10-product sample array, insertion loop, and company settings overrides. `initializeSampleData()` is now a no-op with a log message. `clearAllData()` kept unchanged.

4. **App.tsx** — Removed `initializeSampleData` variable declaration/require, and removed the entire block that checked for products and called `initializeSampleData()`. App startup goes straight to `setIsDbInitialized(true)`.

5. **database/WebMockDatabaseService.ts** — Emptied products array and suppliers array. Updated user password hashes to match new per-role passwords. Changed settings to placeholder values ("Your Company Name", etc.) and new receipt footer.

6. **screens/SettingsScreen.tsx** — Changed receipt_footer fallback string to "Thank you for your Purchase!".

### Default Credentials
| Role    | Username | Password |
|---------|----------|----------|
| Admin   | admin    | 1122     |
| Manager | manager  | 1111     |
| Cashier | cashier  | 1234     |
