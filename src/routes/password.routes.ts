import { Router } from 'express'
import {
  solicitarRecuperacion,
  verificarCodigo,
  cambiarPassword
} from '../controllers/password.controller'

const router = Router()

router.post('/recuperar/solicitar', solicitarRecuperacion)
router.post('/recuperar/verificar', verificarCodigo)
router.post('/recuperar/cambiar', cambiarPassword)

export default router