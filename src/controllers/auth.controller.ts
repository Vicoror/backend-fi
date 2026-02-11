import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { signToken } from '../src/utils/jwt'
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

  if (!user || user.status !== 'ACTIVE') {
    return res.status(401).json({ message: 'Credenciales inválidas' })
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

  // 🍪 COOKIE SEGURA
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
  })

  res.json({
    message: 'Login exitoso',
    user: {
      folio: user.folio,
      role: user.role,
    },
  })
}
