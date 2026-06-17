# Razorpay App Payment Setup

The code integration is complete. Before testing payments, configure Razorpay credentials in the backend only.

## 1. Add Backend Environment Values

Open:

```text
C:\Users\dell\Desktop\ADMIN-BACKEND\.env
```

Add Test Mode credentials first:

```env
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=choose-a-strong-webhook-secret
```

Never add `RAZORPAY_KEY_SECRET` or `RAZORPAY_WEBHOOK_SECRET` to the app frontend.

Restart the backend after changing `.env`:

```powershell
cd "C:\Users\dell\Desktop\ADMIN-BACKEND"
npm run start:dev
```

## 2. Configure Razorpay Webhook

Create a webhook in the Razorpay Dashboard with this production URL:

```text
https://YOUR_BACKEND_DOMAIN/api/v1/payments/razorpay/webhook
```

Subscribe to:

```text
payment.captured
```

Use the same webhook secret in the Razorpay Dashboard and backend `.env`.

For local webhook testing, expose the backend with an HTTPS tunnel and use its public webhook URL.

## 3. Build The Expo App With Native Modules

Razorpay uses a native React Native SDK and does not run inside Expo Go.

From the app project:

```powershell
cd "C:\Users\dell\Desktop\NEW APP"
npx expo prebuild
npx expo run:android --device
```

For iOS on macOS:

```bash
npx expo prebuild
cd ios && pod install && cd ..
npx expo run:ios --device
```

After native files are generated, future Android runs can use:

```powershell
npm run android
```

## 4. Test Mode Checklist

1. Start PostgreSQL and backend.
2. Run the native Android development build.
3. Log in with any supported role.
4. Open a product and go to Checkout.
5. Select `Pay Online with Razorpay`.
6. Complete a Razorpay Test Mode payment.
7. Confirm the order appears in admin only after payment verification.
8. Confirm product stock decreases once.
9. Confirm cancelled payments do not appear as fulfillable orders.

## 5. Go Live

After Test Mode succeeds:

1. Replace Test Mode backend keys with Live Mode keys.
2. Configure the production HTTPS webhook.
3. Keep automatic capture enabled, or allow the backend capture fallback.
4. Build and sign a fresh production app binary.
5. Perform one small real payment and verify the order, payment, webhook and stock update.
