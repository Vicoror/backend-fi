import { Router } from 'express'
import { login } from '../controllers/auth.controller'
import { requireAuth } from '../middlewares/auth.middleware'

const router = Router()

router.get('/test', (req, res) => {
  res.json({ 
    message: '✅ Ruta auth funcionando',
    timestamp: new Date().toISOString()
  });
});

export default router;
