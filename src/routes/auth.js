import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { supabase } from '../lib/supabaseClient.js';

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { name, phone, password } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'name, phone and password are required' });
    }

    const { data: existing, error: existingError } = await supabase
      .from('riders')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();

    if (existingError) {
      console.error('Supabase error on register (check existing)', existingError);
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (existing) {
      return res.status(409).json({ error: 'Rider with this phone already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { data: rider, error: insertError } = await supabase
      .from('riders')
      .insert({
        name,
        phone,
        password_hash: passwordHash
      })
      .select('id, name, phone')
      .maybeSingle();

    if (insertError || !rider) {
      console.error('Supabase error on register (insert)', insertError);
      return res.status(500).json({ error: 'Failed to create rider' });
    }

    return res.status(201).json({
      rider: {
        id: rider.id,
        name: rider.name,
        phone: rider.phone
      }
    });
  } catch (err) {
    console.error('Unexpected error on register', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: 'phone and password are required' });
    }

    const { data: rider, error } = await supabase
      .from('riders')
      .select('id, phone, name, password_hash')
      .eq('phone', phone)
      .maybeSingle();

    if (error) {
      console.error('Supabase error on login', error);
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (!rider) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const passwordMatch = await bcrypt.compare(password, rider.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      console.error('JWT_SECRET is not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const token = jwt.sign(
      {
        sub: rider.id,
        riderId: rider.id,
        name: rider.name,
        phone: rider.phone
      },
      jwtSecret,
      { expiresIn: '12h' }
    );

    return res.json({
      token,
      rider: {
        id: rider.id,
        name: rider.name,
        phone: rider.phone
      }
    });
  } catch (err) {
    console.error('Unexpected error on login', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
});

export default router;
