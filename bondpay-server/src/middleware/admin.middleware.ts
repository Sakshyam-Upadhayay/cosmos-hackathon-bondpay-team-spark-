import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { config } from '../config';

export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized. Admin token missing.' });
      return;
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      res.status(401).json({ error: 'Unauthorized. Admin token missing.' });
      return;
    }
    const decoded = jwt.verify(token, config.jwtSecret) as any;

    if (!decoded.isAdmin) {
      res.status(403).json({ error: 'Forbidden. Admin privileges required.' });
      return;
    }

    (req as any).admin = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized or invalid admin token' });
  }
};
