import 'dotenv/config';
import payrexFactory from 'payrex-node';

const secretKey = process.env.PAYREX_SECRET_API_KEY;

if (!secretKey) {
  console.error('PAYREX_SECRET_API_KEY is not configured');
  throw new Error('PAYREX_SECRET_API_KEY must be set in environment');
}

// Handle CommonJS default export
const payrexClient = (payrexFactory && payrexFactory.default ? payrexFactory.default : payrexFactory)(secretKey);

export async function createQrphPaymentIntent({ amount, currency = 'PHP', reference }) {
  if (!amount) {
    throw new Error('amount is required for QRPH payment intent');
  }

  const amountInCents = Math.round(Number(amount) * 100);

  const intent = await payrexClient.paymentIntents.create({
    amount: amountInCents,
    currency,
    payment_methods: ['qrph'],
    metadata: reference ? { reference } : undefined
  });

  // The exact QRPH field name depends on PayRex's response shape.
  // Adjust these accessors according to their docs if needed.
  const qrString =
    intent.qrph?.qr_string ||
    intent.qrph_qr_string ||
    intent.qr_string ||
    null;

  return {
    id: intent.id,
    reference: reference || intent.id,
    qrString,
    raw: intent
  };
}
