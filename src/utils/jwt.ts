import jwt, { SignOptions } from 'jsonwebtoken'

export interface JwtPayload {
  id: string
  email: string
  role: 'ADMIN' | 'TEACHER' | 'STUDENT'
  folio: string
}

const JWT_SECRET = process.env.JWT_SECRET as string

export function signToken(payload: JwtPayload) {
  const options: SignOptions = {
    expiresIn: '1d',
  }

  return jwt.sign(payload, JWT_SECRET, options)
}
