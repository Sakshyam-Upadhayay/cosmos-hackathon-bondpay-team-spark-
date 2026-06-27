# IMPORTANT: Production URL Configuration

The application's backend API URL has been updated to connect to the live production server hosted on cPanel:

**Production URL:** `https://zenithkandel.com.np/bondpay`

This allows the standalone Android APK to communicate with the database over the internet during presentations and tests.

---

## Running Locally for Development

If you want to run the application locally on your machine again, you **must** revert the `API_URL` configuration inside the following files:

1. **`BondPay/src/screens/ReceiveScreen.tsx`**
2. **`BondPay/src/screens/SendScreen.tsx`**
3. **`BondPay/src/navigation/AuthNavigator.tsx`**
4. **`BondPay/src/services/sync.service.ts`**
5. **`BondPay/src/screens/HomeScreen.tsx`**

Change the `API_URL` line from:
```typescript
const API_URL = 'https://zenithkandel.com.np/bondpay';
```
To your local machine's IP address:
```typescript
const API_URL = 'http://192.168.1.65:3000'; // Replace with your current local network IP
```
