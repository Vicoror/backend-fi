// backend/src/middlewares/auth.middleware.ts
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Extender el tipo Request para incluir user
interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: 'No autenticado' });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No autenticado' });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as { id: string; email: string; role: string };

    // Verificar estado del usuario
    const user = await prisma.user.findUnique({
      where: { id: decoded.id }
    });

    if (!user || user.status !== 'ACTIVE') {
      return res.status(403).json({
        message: 'Usuario inactivo. Inscríbete para tener acceso a nuestros cursos.',
        redirectTo: '/inscription'
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
}