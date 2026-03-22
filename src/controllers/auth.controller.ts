import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { signToken } from '../utils/jwt'
import { Request, Response } from 'express'

const prisma = new PrismaClient()

export async function login(req: Request, res: Response) {
  const { folio, password } = req.body

  if (!folio || !password) {
    return res.status(400).json({ message: 'Datos incompletos' })
  }

  const user = await prisma.user.findUnique({
    where: { folio },
  })

  // Usuario no existe
if (!user) {
  return res.status(401).json({
    message: 'Credenciales inválidas'
  })
}

// ⭐ Usuario existe pero está inactivo
if (user.status !== 'ACTIVE') {
  return res.status(403).json({
    message: 'Tu cuenta está inactiva. Inscríbete a uno de nuestros cursos.',
    redirectTo: '/inscription'
  })
}

  const isValid = await bcrypt.compare(password, user.password)

  if (!isValid) {
    return res.status(401).json({ message: 'Credenciales inválidas' })
  }

  const token = signToken({
    id: user.id,
    role: user.role,
    folio: user.folio,
    email: user.email,
  })

  // 🍪 COOKIE CONFIGURADA PARA PRODUCCIÓN
  res.cookie('token', token, {
    httpOnly: true,
    secure: true, // Siempre true en producción (HTTPS)
    sameSite: 'none', // Permite cross-site en producción
    domain: '.vercel.app',
    maxAge: 24 * 60 * 60 * 1000,
    //domain: '.vercel.app' // Opcional: permite compartir entre subdominios
  })

  res.json({
    message: 'Login exitoso',
    user: {
      folio: user.folio,
      role: user.role,
    },
  })
}