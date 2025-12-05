import express from 'express';

import { supabase } from '../lib/supabaseClient.js';
import { riderAuth } from '../middleware/auth.js';

const router = express.Router();

// GET /api/rider/orders?status=EN_ROUTE
router.get('/orders', riderAuth, async (req, res) => {
  try {
    const { status } = req.query;

    let query = supabase
      .from('orders')
      .select('*')
      .eq('rider_id', req.riderId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data: orders, error } = await query;

    if (error) {
      console.error('Error fetching rider orders', error);
      return res.status(500).json({ error: 'Failed to fetch orders' });
    }

    return res.json(orders || []);
  } catch (err) {
    console.error('Unexpected error fetching rider orders', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
});

// GET /api/rider/orders/:orderId
router.get('/orders/:orderId', riderAuth, async (req, res) => {
  try {
    const { orderId } = req.params;

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('rider_id', req.riderId)
      .maybeSingle();

    if (orderError) {
      console.error('Error fetching order', orderError);
      return res.status(500).json({ error: 'Failed to fetch order' });
    }

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const [{ data: payment, error: paymentError }, { data: proof, error: proofError }] = await Promise.all([
      supabase.from('payments').select('*').eq('order_id', order.id).maybeSingle(),
      supabase.from('proofs').select('*').eq('order_id', order.id).maybeSingle()
    ]);

    if (paymentError) {
      console.error('Error fetching payment for order', paymentError);
    }
    if (proofError) {
      console.error('Error fetching proof for order', proofError);
    }

    return res.json({
      order,
      payment: payment || null,
      proofOfDelivery: proof || null
    });
  } catch (err) {
    console.error('Unexpected error fetching order', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
});

// POST /api/rider/orders/:orderId/verify
router.post('/orders/:orderId/verify', riderAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { scannedCode } = req.body;

    if (!scannedCode) {
      return res.status(400).json({ error: 'scannedCode is required' });
    }

    const { data: order, error } = await supabase
      .from('orders')
      .select('id, rider_id, barcode')
      .eq('id', orderId)
      .eq('rider_id', req.riderId)
      .maybeSingle();

    if (error) {
      console.error('Error verifying order', error);
      return res.status(500).json({ error: 'Failed to verify order' });
    }

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const verified = order.barcode === scannedCode;

    return res.json({ verified });
  } catch (err) {
    console.error('Unexpected error verifying order', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
});

// PATCH /api/rider/orders/:orderId/status
router.patch('/orders/:orderId/status', riderAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    const validNext = {
      PENDING: ['EN_ROUTE'],
      EN_ROUTE: ['ARRIVED'],
      ARRIVED: ['PAYMENT_PENDING'],
      PAYMENT_PENDING: ['COMPLETED'],
      COMPLETED: [],
      CANCELLED: []
    };

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status')
      .eq('id', orderId)
      .eq('rider_id', req.riderId)
      .maybeSingle();

    if (orderError) {
      console.error('Error fetching order for status update', orderError);
      return res.status(500).json({ error: 'Failed to update order status' });
    }

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const allowed = validNext[order.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Invalid status transition from ${order.status} to ${status}` });
    }

    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId)
      .eq('rider_id', req.riderId)
      .select('*')
      .maybeSingle();

    if (updateError) {
      console.error('Error updating order status', updateError);
      return res.status(500).json({ error: 'Failed to update order status' });
    }

    return res.json(updatedOrder);
  } catch (err) {
    console.error('Unexpected error updating order status', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
});

// POST /api/rider/orders/:orderId/payment-method
router.post('/orders/:orderId/payment-method', riderAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { method } = req.body;

    if (!['CASH', 'QRPH'].includes(method)) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id')
      .eq('id', orderId)
      .eq('rider_id', req.riderId)
      .maybeSingle();

    if (orderError) {
      console.error('Error fetching order for payment method', orderError);
      return res.status(500).json({ error: 'Failed to set payment method' });
    }

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({ payment_method: method })
      .eq('id', orderId)
      .eq('rider_id', req.riderId)
      .select('*')
      .maybeSingle();

    if (updateError) {
      console.error('Error updating payment method', updateError);
      return res.status(500).json({ error: 'Failed to set payment method' });
    }

    return res.json(updatedOrder);
  } catch (err) {
    console.error('Unexpected error setting payment method', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
});

// POST /api/rider/orders/:orderId/payment/qrph
router.post('/orders/:orderId/payment/qrph', riderAuth, async (req, res) => {
  try {
    const { orderId } = req.params;

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, cod_amount, payment_method')
      .eq('id', orderId)
      .eq('rider_id', req.riderId)
      .maybeSingle();

    if (orderError) {
      console.error('Error fetching order for QRPH payment', orderError);
      return res.status(500).json({ error: 'Failed to initiate QRPH payment' });
    }

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.payment_method !== 'QRPH') {
      return res.status(400).json({ error: 'Payment method must be QRPH' });
    }

    const reference = `ORDER-${order.order_number}`;
    const qrString = '0002010102...';

    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        order_id: order.id,
        method: 'QRPH',
        status: 'QR_GENERATED',
        qrph_reference: reference,
        qrph_qr_string: qrString,
        amount: order.cod_amount
      })
      .select('*')
      .maybeSingle();

    if (paymentError || !payment) {
      console.error('Error creating payment record', paymentError);
      return res.status(500).json({ error: 'Failed to create payment' });
    }

    const { error: orderUpdateError } = await supabase
      .from('orders')
      .update({ payment_id: payment.id, status: 'PAYMENT_PENDING' })
      .eq('id', order.id);

    if (orderUpdateError) {
      console.error('Error updating order with payment id', orderUpdateError);
    }

    return res.json({
      paymentId: payment.id,
      qrphPayload: {
        qrString,
        amount: order.cod_amount,
        currency: 'PHP',
        reference
      }
    });
  } catch (err) {
    console.error('Unexpected error generating QRPH payment', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
});

// POST /api/rider/orders/:orderId/proof
router.post('/orders/:orderId/proof', riderAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { photoUrl, customerName, signatureUrl } = req.body;

    if (!photoUrl) {
      return res.status(400).json({ error: 'photoUrl is required' });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id')
      .eq('id', orderId)
      .eq('rider_id', req.riderId)
      .maybeSingle();

    if (orderError) {
      console.error('Error fetching order for proof of delivery', orderError);
      return res.status(500).json({ error: 'Failed to attach proof of delivery' });
    }

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const { data: proof, error: proofError } = await supabase
      .from('proofs')
      .insert({
        order_id: order.id,
        photo_url: photoUrl,
        customer_name: customerName,
        signature_url: signatureUrl
      })
      .select('*')
      .maybeSingle();

    if (proofError || !proof) {
      console.error('Error creating proof of delivery', proofError);
      return res.status(500).json({ error: 'Failed to attach proof of delivery' });
    }

    return res.status(201).json(proof);
  } catch (err) {
    console.error('Unexpected error attaching proof of delivery', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
});

export default router;

