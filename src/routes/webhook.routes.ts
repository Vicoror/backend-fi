import { Router } from 'express';
import { stripeWebhook } from '../controllers/webhook.controller';

const router = Router();

// ✅ SOLO POST - Stripe siempre envía POST
router.post('/', stripeWebhook);

// ❌ ELIMINA CUALQUIER GET - No necesitamos ver el webhook en navegador
// router.get('/', (req, res) => res.send('Webhook endpoint')); ← NO HAGAS ESTO

export default router;