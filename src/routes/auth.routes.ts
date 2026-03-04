import { Router } from 'express'
import { login } from '../controllers/auth.controller'
import { requireAuth } from '../middlewares/auth.middleware'

// 👇 AGREGAR ESTA EXTENSIÓN DE TIPO
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

const router = Router()

router.post('/login', login)

router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: req.user,  // ✅ Ahora TypeScript lo reconoce
  })
})

export default router;