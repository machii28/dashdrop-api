import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

import riderOrdersRoutes from './routes/riderOrders.js';
import webhooksRoutes from './routes/webhooks.js';
import deviceRoutes from './routes/device.js';

import authRoutes from './routes/auth.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/rider', riderOrdersRoutes);
app.use('/api/rider/devices', deviceRoutes);
app.use('/api/webhooks', webhooksRoutes);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
