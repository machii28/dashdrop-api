import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      console.error('JWT_SECRET is not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const payload = jwt.verify(token, jwtSecret);

    req.user = {
      riderId: payload.riderId,
      name: payload.name,
      phone: payload.phone
    };

    next();
  } catch (err) {
    console.error('JWT verification failed', err);
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function riderAuth(req, res, next) {
  // Reuse requireAuth to validate the JWT and populate req.user
  requireAuth(req, res, (err) => {
    if (err) {
      // requireAuth already handled the response
      return;
    }

    if (!req.user || !req.user.riderId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.riderId = req.user.riderId;
    next();
  });
}
