import express from 'express';

import { supabase } from '../lib/supabaseClient.js';

const router = express.Router();

// POST /api/webhooks/payrex/payment
router.post('/payrex/payment', async (req, res) => {
  try {
    const { reference, status, amount, paidAt } = req.body || {};

    if (!reference) {
      return res.status(400).json({ error: 'reference is required' });
    }

    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('qrph_reference', reference)
      .maybeSingle();

    if (paymentError) {
      console.error('Error looking up payment for webhook', paymentError);
      return res.status(500).json({ error: 'Failed to process webhook' });
    }

    if (!payment) {
      console.warn('Payment not found for webhook reference', reference);
      return res.json({ received: true });
    }

    const nextStatus = status === 'PAID' ? 'PAID' : 'FAILED';

    const { error: updatePaymentError } = await supabase
      .from('payments')
      .update({
        status: nextStatus,
        paid_at: paidAt || new Date().toISOString(),
        amount: amount ?? payment.amount
      })
      .eq('id', payment.id);

    if (updatePaymentError) {
      console.error('Error updating payment from webhook', updatePaymentError);
      return res.status(500).json({ error: 'Failed to update payment' });
    }

    if (status === 'PAID' && payment.order_id) {
      const { error: updateOrderError } = await supabase
        .from('orders')
        .update({ status: 'COMPLETED' })
        .eq('id', payment.order_id);

      if (updateOrderError) {
        console.error('Error updating order status from webhook', updateOrderError);
      }
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('Unexpected error handling PayRex webhook', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
});

export default router;

