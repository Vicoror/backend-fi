export interface JwtPayload {
  id: string
  role: 'ADMIN' | 'TEACHER' | 'STUDENT'
  folio: string
  email: string
}
