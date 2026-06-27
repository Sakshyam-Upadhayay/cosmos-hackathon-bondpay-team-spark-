import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { config } from '../config';
import { query } from '../database/db';

export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret!) as any;
    
    // Verify that the user still exists in the database
    const userRes = await query('SELECT user_id FROM users WHERE user_id = $1', [payload.userId]);
    if (userRes.rows.length === 0) {
      res.status(401).json({ error: 'User session invalid. Please log in again.' });
      return;
    }

    (req as any).user = payload;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

