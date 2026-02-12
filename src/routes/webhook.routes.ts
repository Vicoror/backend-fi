import { Router } from 'express';
import express from 'express';  // ← IMPORTANTE: importar express
import { stripeWebhook } from '../controllers/webhook.controller';

const router = Router();

// ⚠️ IMPORTANTE: Usar express.raw para webhooks (body crudo)
router.post('/', express.raw({ type: 'application/json' }), stripeWebhook);

export default router;