import { Request } from 'express'

export interface AuthUser {
  id: string
  email: string
  role: string
  folio: string
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}
