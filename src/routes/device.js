import express from 'express';

import { supabase } from '../lib/supabaseClient.js';
import { riderAuth } from '../middleware/auth.js';

const router = express.Router();

// POST /api/rider/devices/register
router.post('/register', riderAuth, async (req, res) => {
  try {
    const { deviceToken, platform } = req.body || {};

    if (!deviceToken) {
      return res.status(400).json({ error: 'deviceToken is required' });
    }

    const { error } = await supabase
      .from('rider_devices')
      .upsert(
        {
          rider_id: req.riderId,
          device_token: deviceToken,
          platform: platform || null
        },
        { onConflict: ['rider_id', 'device_token'] }
      );

    if (error) {
      console.error('Error registering rider device', error);
      return res.status(500).json({ error: 'Failed to register device' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Unexpected error registering rider device', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
});

export default router;

