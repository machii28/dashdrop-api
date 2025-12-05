# Dashdrop Rider QRPH COD API

Backend API for a cashless COD rider app that uses **QRPH via PayRex** so riders never touch cash. At the doorstep, customers pay by scanning a QRPH code with their bank/e-wallet. The API coordinates:

- Order verification
- Payment method selection (Cash or QRPH)
- PayRex payment intent creation
- Webhook-based payment confirmation
- Proof of delivery
- Automatic order status updates

---

## Table of Contents

1. [Architecture](#architecture)
2. [Setup](#setup)
   - [Environment Variables](#environment-variables)
   - [Install & Run](#install--run)
3. [Database Schema (Supabase)](#database-schema-supabase)
4. [Authentication](#authentication)
5. [Rider Order API](#rider-order-api)
6. [Rider Device API](#rider-device-api)
7. [PayRex Webhooks](#payrex-webhooks)
8. [Supabase & PayRex Services](#supabase--payrex-services)
9. [End-to-End Rider Flow](#end-to-end-rider-flow)

---

## Architecture

- **Node.js** + **Express** (ES modules)
- **Supabase** for persistence (Postgres)
- **PayRex** for QRPH payment intents
- **JWT** for rider authentication

Main folders:

- [src/server.js](cci:7://file:///d:/Projects/dashdrop-api/src/server.js:0:0-0:0) – Express bootstrapping
- [src/routes/auth.js](cci:7://file:///d:/Projects/dashdrop-api/src/routes/auth.js:0:0-0:0) – rider login & registration
- [src/routes/riderOrders.js](cci:7://file:///d:/Projects/dashdrop-api/src/routes/riderOrders.js:0:0-0:0) – rider-facing delivery & payment routes
- [src/routes/device.js](cci:7://file:///d:/Projects/dashdrop-api/src/routes/device.js:0:0-0:0) – rider device registration for push
- [src/routes/webhooks.js](cci:7://file:///d:/Projects/dashdrop-api/src/routes/webhooks.js:0:0-0:0) – PayRex webhook
- [src/middleware/auth.js](cci:7://file:///d:/Projects/dashdrop-api/src/middleware/auth.js:0:0-0:0) – JWT auth middleware
- [src/lib/supabaseClient.js](cci:7://file:///d:/Projects/dashdrop-api/src/lib/supabaseClient.js:0:0-0:0) – Supabase client
- [src/services/payrexService.js](cci:7://file:///d:/Projects/dashdrop-api/src/services/payrexService.js:0:0-0:0) – PayRex integration

---

## Setup

### Environment Variables

Create [.env](cci:7://file:///d:/Projects/dashdrop-api/.env:0:0-0:0) in project root:

```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key

JWT_SECRET=your_jwt_secret

PAYREX_SECRET_API_KEY=your_payrex_secret_key
PAYREX_PUBLIC_API_KEY=your_payrex_public_key

PORT=4000
Install & Run
bash
npm install
npm start
Server will start at:

text
http://localhost:4000
Health check:

http
GET /health
json
{ "status": "ok" }
Database Schema (Supabase)
Run these in Supabase SQL editor (adjust as needed):

sql
create table if not exists riders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text unique not null,
  password_hash text not null
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null,
  customer_name text not null,
  customer_address text not null,
  cod_amount numeric(10,2) not null,
  status text not null check (status in (
    'PENDING','EN_ROUTE','ARRIVED','PAYMENT_PENDING','COMPLETED','CANCELLED'
  )),
  payment_method text check (payment_method in ('CASH','QRPH')),
  payment_id uuid,
  rider_id uuid references riders(id) on delete set null,
  barcode text,
  created_at timestamptz default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  method text not null check (method in ('CASH','QRPH')),
  status text not null check (status in ('PENDING','QR_GENERATED','PAID','FAILED')),
  qrph_reference text,
  qrph_qr_string text,
  amount numeric(10,2),
  paid_at timestamptz
);

create table if not exists proofs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  photo_url text,
  customer_name text,
  signature_url text,
  captured_at timestamptz default now()
);

create table if not exists rider_devices (
  rider_id uuid references riders(id) on delete cascade,
  device_token text,
  platform text,
  primary key (rider_id, device_token)
);
Authentication
JWT Auth Middleware (
src/middleware/auth.js
)
requireAuth
:
Reads Authorization: Bearer <token>.
Verifies with JWT_SECRET.
Sets req.user = { riderId, name, phone }.
riderAuth
:
Wraps 
requireAuth
.
Sets req.riderId = req.user.riderId.
Used by all /api/rider/... routes.
Auth Routes (
src/routes/auth.js
)
Base path: /api/auth

POST /api/auth/register
Registers a new rider.

Body:

json
{
  "name": "Test Rider",
  "phone": "+639171234567",
  "password": "password123"
}
Responses:

201 Created with rider info.
409 if phone already exists.
POST /api/auth/login
Authenticates rider and returns JWT.

Body:

json
{
  "phone": "+639171234567",
  "password": "password123"
}
Response:

json
{
  "token": "JWT_TOKEN",
  "rider": {
    "id": "uuid",
    "name": "Test Rider",
    "phone": "+639171234567"
  }
}
Use in requests:

http
Authorization: Bearer JWT_TOKEN
Rider Order API
File: 
src/routes/riderOrders.js

Base path: /api/rider
All endpoints require 
riderAuth
.

1. List Orders
GET /api/rider/orders

Query params:

status (optional): PENDING, EN_ROUTE, ARRIVED, PAYMENT_PENDING, COMPLETED, CANCELLED.
Behavior:

Returns orders where rider_id = req.riderId, optionally filtered by status.
2. Get Order Details
GET /api/rider/orders/:orderId

Behavior:

Fetch order for this rider.
Fetch payment record (payments) for the order.
Fetch proof-of-delivery (proofs) for the order.
Response:

json
{
  "order": { ... },
  "payment": { ... } | null,
  "proofOfDelivery": { ... } | null
}
3. Verify Order (Scan)
POST /api/rider/orders/:orderId/verify

Body:

json
{ "scannedCode": "PKG-1001" }
Behavior:

Compares scannedCode to orders.barcode for this order/rider.
Response:

json
{ "verified": true }
(or false).

4. Update Order Status (State Machine)
PATCH /api/rider/orders/:orderId/status

Body:

json
{ "status": "EN_ROUTE" }
Allowed state transitions:

PENDING → EN_ROUTE
EN_ROUTE → ARRIVED
ARRIVED → PAYMENT_PENDING
PAYMENT_PENDING → COMPLETED
COMPLETED and CANCELLED are terminal.
Behavior:

Validates transition using validNext map.
Updates orders.status.
5. Set Payment Method
POST /api/rider/orders/:orderId/payment-method

Intended body:

json
{ "method": "CASH" }
or

json
{ "method": "QRPH" }
Behavior:

Verifies order belongs to rider.
Updates orders.payment_method.
Returns updated order.
6. Create QRPH Payment Intent (PayRex)
POST /api/rider/orders/:orderId/payment/qrph

Flow:

Fetch order (id, order_number, cod_amount, payment_method) for this rider.
Require payment_method === 'QRPH'.
Build reference:
text
ORDER-<order_number>
Call PayRex via 
createQrphPaymentIntent({ amount, currency: 'PHP', reference })
.
Insert payments row:
order_id, method: 'QRPH', status: 'QR_GENERATED'.
qrph_reference (PayRex reference or intent id).
qrph_qr_string (placeholder until QR field from PayRex is known).
amount.
Update orders:
payment_id = payment.id.
status = 'PAYMENT_PENDING'.
Response:

json
{
  "paymentId": "uuid",
  "qrphPayload": {
    "qrString": "PLACEHOLDER_OR_REAL_QRPH_STRING",
    "amount": 750,
    "currency": "PHP",
    "reference": "ORDER-DD-1003"
  }
}
Note: once PayRex’s QRPH QR field is known, qrString will contain a real EMV QR string the client can render.

7. Proof of Delivery
POST /api/rider/orders/:orderId/proof

Body:

json
{
  "photoUrl": "https://example.com/pod-1.jpg",
  "customerName": "Juan Dela Cruz",
  "signatureUrl": "https://example.com/sign-1.png"
}
Behavior:

Ensures order belongs to rider.
Inserts into proofs.
Response:

json
{
  "id": "uuid",
  "order_id": "uuid",
  "photo_url": "...",
  "customer_name": "Juan Dela Cruz",
  "signature_url": "...",
  "captured_at": "..."
}
Rider Device API
File: 
src/routes/device.js

Base path: /api/rider/devices
Requires 
riderAuth
.

Register Device
POST /api/rider/devices/register

Body:

json
{
  "deviceToken": "test-device-token-123",
  "platform": "android"
}
Behavior:

Upserts into rider_devices:
rider_id = req.riderId
device_token
platform
Primary key: (rider_id, device_token).
Response:

json
{ "success": true }
This supports push notifications for new orders, payment confirmations, etc.

PayRex Webhooks
File: 
src/routes/webhooks.js

Base path: /api/webhooks

Payment Webhook
POST /api/webhooks/payrex/payment

Expected conceptual payload:

json
{
  "reference": "ORDER-DD-1003",
  "status": "PAID",
  "amount": 750,
  "paidAt": "2025-12-05T13:00:00Z"
}
Behavior:

Look up payments by qrph_reference = reference.
If not found: log and return { "received": true }.
Determine nextStatus:
'PAID' or 'SUCCEEDED' → PAID
else → FAILED
Update payments:
status = nextStatus
paid_at = paidAt || now()
amount if sent.
If successful:
Update orders.status = 'COMPLETED'.
Response:

json
{ "received": true }
You should later add signature verification with PayRex’s webhook secret.

Supabase & PayRex Services
Supabase Client (
src/lib/supabaseClient.js
)
Reads SUPABASE_URL, SUPABASE_SERVICE_KEY.
Creates and exports a singleton supabase client for DB operations.
PayRex Service (
src/services/payrexService.js
)
Reads PAYREX_SECRET_API_KEY.
Creates payrexClient using payrex-node.
Function:

js
export async function createQrphPaymentIntent({ amount, currency = 'PHP', reference })
Converts amount (PHP) to cents.
Calls:
js
payrexClient.paymentIntents.create({
  amount: amountInCents,
  currency,
  payment_methods: ['qrph'],
  metadata: reference ? { reference } : undefined
});
Returns core fields (id, clientSecret, status, etc.), and will be extended to extract the real QRPH QR string once available in PayRex’s API.
End-to-End Rider Flow (Happy Path)
Login
POST /api/auth/login → get JWT.
See assigned orders
GET /api/rider/orders.
Open order
GET /api/rider/orders/:orderId.
Scan package
POST /api/rider/orders/:orderId/verify with scannedCode.
Update status
PATCH /api/rider/orders/:orderId/status:
PENDING → EN_ROUTE → ARRIVED.
Choose payment method
POST /api/rider/orders/:orderId/payment-method with { "method": "QRPH" }.
Create QRPH payment
POST /api/rider/orders/:orderId/payment/qrph.
Client renders qrphPayload.qrString as QR (once wired).
Customer pays
Bank/e-wallet processes QRPH payment via PayRex.
Webhook confirms
PayRex → POST /api/webhooks/payrex/payment.
Backend updates payments and orders.status = COMPLETED.
Proof of delivery
POST /api/rider/orders/:orderId/proof.
Order complete
Rider sees status COMPLETED in GET /api/rider/orders.