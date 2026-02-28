import jwt from 'jsonwebtoken'
import { Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const token = req.cookies?.token

  if (!token) {
    return res.status(401).json({ message: 'No autenticado' })
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as any

    // ⭐ verificar estado del usuario
    const user = await prisma.user.findUnique({
      where: { id: decoded.id }
    })

    if (!user || user.status !== 'ACTIVE') {
      return res.status(403).json({
        message: 'Usuario inactivo. Inscríbete para tener acceso a nuestros cursos.',
        redirectTo: '/inscription'
      })
    }

    req.user = decoded
    next()
  } catch {
    return res.status(401).json({ message: 'Token inválido o expirado' })
  }
}