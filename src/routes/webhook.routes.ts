import { Router } from 'express'
import { stripeWebhook } from '../../controllers/webhook.controller'

const router = Router()

router.post(
  '/stripe',
  // ⚠️ Stripe necesita el body sin parsear
  require('express').raw({ type: 'application/json' }),
  stripeWebhook
)

export default router
