import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    name: string;
    role: string;
  };
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Kein Token gefunden' });
    }

    const decoded = jwt.verify(token, config.jwt.secret) as any;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Ungültiger Token' });
  }
};

export const adminMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Nur für Administratoren' });
  }
  next();
};

export const teamleiterMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'teamleiter' && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Nur für Teamleiter und Administratoren' });
  }
  next();
};

export const teamleiterOrAdminMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'teamleiter') {
    return res.status(403).json({ error: 'Nur für Administratoren und Teamleiter' });
  }
  next();
};
