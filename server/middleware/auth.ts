import type { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/database.ts';
import {
  verifyAccessToken,
  verifySignedCsrfToken,
  type JwtUserPayload,
  type UserRole,
} from '../utils/security.ts';

export interface AuthenticatedRequest extends Request {
  user?: JwtUserPayload;
}

export function isHttpsRequest(req: Request): boolean {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

export function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  try {
    const decoded = verifyAccessToken(token);
    const db = getDb();
    const userRow = db
      .prepare('SELECT id, email, role, full_name, is_active FROM users WHERE id = ?')
      .get(decoded.id) as
      | { id: number; email: string; role: UserRole; full_name: string; is_active: number }
      | undefined;

    if (!userRow || !userRow.is_active) {
      res.status(403).json({ error: 'Account is inactive or no longer exists.' });
      return;
    }

    req.user = {
      id: userRow.id,
      email: userRow.email,
      role: userRow.role,
      fullName: userRow.full_name,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired access token.' });
  }
}

export function authorize(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}.`,
      });
      return;
    }
    next();
  };
}

export function verifyCsrf(req: Request, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  const headerToken = req.headers['x-csrf-token'];
  const tokenStr = Array.isArray(headerToken) ? headerToken[0] : headerToken;

  if (!tokenStr || !verifySignedCsrfToken(tokenStr)) {
    res.status(403).json({
      error: 'Invalid or missing CSRF security token. Please refresh and try again.',
    });
    return;
  }

  const cookieToken = req.cookies?.smartcred_csrf as string | undefined;
  if (cookieToken && cookieToken !== tokenStr && !verifySignedCsrfToken(cookieToken)) {
    res.status(403).json({
      error: 'CSRF token mismatch.',
    });
    return;
  }

  next();
}

