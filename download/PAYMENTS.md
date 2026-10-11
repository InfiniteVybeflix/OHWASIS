# OHWASIS — Payments Guide

This document covers payment provider configuration, callback handling, reconciliation, and testing for OHWASIS.

## 1. Supported payment methods

| Provider | Status | Use case |
|----------|--------|----------|
| **M-Pesa Daraja (STK Push)** | Code-complete; needs merchant credentials | Customer enters phone, gets STK prompt, payment confirmed via callback |
| **M-Pesa (Manual verification)** | ✅ Working | Customer pays to merchant's Till/Paybill; merchant verifies from dashboard |
| **Cash on Delivery (COD)** | ✅ Working | Customer pays with cash when order is delivered; merchant verifies |
| **Manual (Bank transfer, etc.)** | ✅ Working | Customer pays externally; merchant verifies with receipt |
| Card processors (Stripe, Flutterwave) | Pattern ready; adapter not built | Future |
| Airtel Money | Pattern ready; adapter not built | Future |

## 2. M-Pesa Daraja (STK Push)

### 2.1 Get Daraja credentials

1. Register at https://developer.safaricom.co.ke
2. Create an app → receive `Consumer Key` and `Consumer Secret`.
3. Sandbox short code: `174379` (Lipa Na M-Pesa Online test shortcode).
4. Sandbox passkey: published in Daraja docs (search "Lipa Na M-Pesa Online passkey sandbox").
5. For production: apply for a Go-Live request in the Daraja portal; receive your own short code + passkey.

### 2.2 Configure in merchant dashboard

1. Sign in as a merchant owner or administrator.
2. Merchant dashboard → **Payments** tab → **Add provider**.
3. Select **M-Pesa Daraja (STK Push)**.
4. Enter:
   - Consumer Key
   - Consumer Secret
   - Short Code
   - Passkey
   - Callback URL: `https://yourdomain.com/api/payments/mpesa/callback` (replace with your production domain)
   - Environment: `sandbox` for testing, `production` for live
5. Toggle **Enabled** on.
6. Save.

Credentials are encrypted at rest (AES-256-GCM) and decrypted only server-side when initiating an STK push. The browser never sees them; the UI shows only a masked hint like `consumer:ab••••••cd shortCode:174379`.

### 2.3 STK Push flow

```
1. Customer checks out, selects "M-Pesa STK Push"
   ↓
2. POST /api/checkout
   - Creates Order with status=PENDING
   - Creates PaymentAttempt with status=PENDING
   - Calls Daraja /stkpush/v1/process/request
   - Stores CheckoutRequestID on PaymentAttempt
   ↓
3. Daraja returns ResponseCode=0 (request accepted)
   - Customer sees "STK push sent" message
   - Order is still PENDING
   ↓
4. Customer receives STK prompt on their phone
   - Customer enters M-Pesa PIN
   ↓
5. Daraja calls back to /api/payments/mpesa/callback
   - WebhookEvent persisted with idempotencyKey=CheckoutRequestID
   - PaymentAttempt looked up by providerReference
   - Amount cross-checked against order total
   - On ResultCode=0: PaymentAttempt → SUCCESS, Order → CONFIRMED, OrderEvent recorded
   - On other ResultCode: PaymentAttempt → FAILED, Order stays PENDING
   ↓
6. Customer sees order status; merchant sees order in dashboard
```

### 2.4 Critical security rules

- **Never** collect or store an M-Pesa PIN. The STK Push flow never exposes the PIN to the merchant.
- **Never** treat a successful HTTP response from `/stkpush` as payment success. Only the callback's `ResultCode === 0` means paid.
- **Never** treat a customer redirect to a "success" page as payment.
- **Always** verify the callback's `Amount` matches the order's expected total. If mismatched, mark the payment `FAILED` and audit-log it.
- **Always** deduplicate callbacks via `WebhookEvent.idempotencyKey`. Daraja may retry if it doesn't receive a 200.

### 2.5 Reconciliation

Daily reconciliation process:

1. Pull all `PaymentAttempt` records with `status=PENDING` older than 30 minutes.
2. For each, query Daraja's transaction status API (https://developer.safaricom.co.ke/APIs/MpesaExpressQuery) using the stored `CheckoutRequestID`.
3. Update the `PaymentAttempt` status based on the query response.
4. If the query returns success, transition the corresponding Order to CONFIRMED and record an `OrderEvent`.
5. If the query returns failure, mark the `PaymentAttempt` as FAILED and notify the merchant.

(Automated reconciliation script is a TODO; manual reconciliation can be done via the merchant dashboard's Orders tab.)

## 3. Manual / COD payment flow

### 3.1 Customer places order

1. Customer selects "Cash on Delivery" or "Manual" at checkout.
2. Order is created with `status=PENDING`.
3. A `PaymentAttempt` is created with `status=PENDING`, `provider=manual` (or `cash_on_delivery`).
4. Customer sees the merchant's payment instructions (e.g. "Pay to Till 123456 and reference your order number").

### 3.2 Merchant verifies

1. Merchant owner / order manager opens the Orders tab.
2. Clicks the pending order.
3. In the **Verify manual payment** section, enters the receipt (optional) and a note.
4. Clicks **Verify payment**.
5. Server-side:
   - `PaymentAttempt.status` → `SUCCESS`
   - `PaymentAttempt.verifiedAt` set
   - `PaymentAttempt.callbackPayload` records who verified and when
   - `Order.status` → `CONFIRMED`
   - `OrderEvent` of type `PAYMENT_VERIFIED` recorded with verifier's identity
   - Audit event `payment.manual_verify` logged

### 3.3 What this is NOT

- Not a "fake success" button. The merchant must explicitly take this action.
- Not automatic. The customer's order stays `PENDING` until verified.
- Not un-logged. Every verification is audit-logged with the verifier's identity.

## 4. Refunds (planned)

Refunds are partially implemented in the order state machine (`Order.status = REFUNDED` is a valid state), but the actual refund execution (calling Daraja's B2C API, or marking a manual refund in the ledger) is deferred.

Recommended implementation:

1. Add `POST /api/orders/[id]/refund` endpoint.
2. Requires `OWNER` or `ADMINISTRATOR` role.
3. Records a `Refund` record linked to the original `PaymentAttempt`.
4. For M-Pesa: initiate B2C via Daraja API.
5. For manual / COD: just mark the refund in the ledger.
6. Transition the order to `REFUNDED`.
7. Notify the customer.

## 5. Testing

### 5.1 Sandbox testing (with Daraja sandbox creds)

1. Configure Daraja sandbox creds in merchant dashboard.
2. Use the Safaricom sandbox test phone numbers (e.g. `254708374149`).
3. Place a test order at checkout with M-Pesa STK Push.
4. Enter the test PIN (1234) on the STK prompt.
5. Verify the callback arrives and the order transitions to CONFIRMED.

### 5.2 Without Daraja creds (sandbox)

1. Use Manual / COD payment at checkout.
2. Merchant verifies from dashboard.
3. All other flows (cart, checkout, order lifecycle, audit) work the same.

### 5.3 Idempotency test

```bash
# Send the same callback twice — should be deduplicated
curl -X POST https://yourdomain.com/api/payments/mpesa/callback \
  -H "Content-Type: application/json" \
  -d '{"Body":{"stkCallback":{"MerchantRequestID":"test-1","CheckoutRequestID":"test-crid-1","ResultCode":0,"ResultDesc":"Success","CallbackMetadata":{"Item":[{"Name":"Amount","Value":100},{"Name":"MpesaReceiptNumber","Value":"TEST001"}]}}}}'

# Second call should return "Duplicate callback ignored"
curl -X POST https://yourdomain.com/api/payments/mpesa/callback \
  -H "Content-Type: application/json" \
  -d '{"Body":{"stkCallback":{"MerchantRequestID":"test-1","CheckoutRequestID":"test-crid-1","ResultCode":0,"ResultDesc":"Success","CallbackMetadata":{"Item":[{"Name":"Amount","Value":100},{"Name":"MpesaReceiptNumber","Value":"TEST001"}]}}}}'
```

### 5.4 Amount mismatch test

```bash
# Send a callback with the wrong amount — should mark FAILED
curl -X POST https://yourdomain.com/api/payments/mpesa/callback \
  -H "Content-Type: application/json" \
  -d '{"Body":{"stkCallback":{"CheckoutRequestID":"test-crid-2","ResultCode":0,"ResultDesc":"Success","CallbackMetadata":{"Item":[{"Name":"Amount","Value":1}]}}}}'
```

## 6. Payment provider extensibility

To add a new payment provider (e.g. Stripe):

1. Add the provider name to the zod schema in `src/lib/validation/schemas.ts` → `paymentProviderConfigSchema`.
2. Add an adapter in `src/lib/providers/stripe.ts` (mirroring `mpesa-daraja.ts`).
3. Add a case in `src/app/api/checkout/route.ts` → `initiateMpesaStk` equivalent function for the new provider.
4. Add a callback handler at `src/app/api/payments/stripe/callback/route.ts`.
5. Update the merchant dashboard payments tab UI to expose the new provider.

No DB schema changes needed — `PaymentProviderConfig` already supports arbitrary providers via the `provider` field.
