import { Router } from 'express';
import express from 'express';
import { stripeWebhook } from '../controllers/webhook.controller';

const router = Router();

// ⭐ CLAVE: Stripe necesita RAW BODY
router.post(
  '/',
  express.raw({ type: 'application/json' }),
  stripeWebhook
);

export default router;