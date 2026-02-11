import { Router } from 'express'
import { login } from '../controllers/auth.controller'
import { requireAuth } from '../middlewares/auth.middleware'

const router = Router()

router.post('/login', login)

router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: req.user,
  })
})

export default router
