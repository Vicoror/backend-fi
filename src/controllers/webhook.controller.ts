import Stripe from 'stripe'
import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
})

export async function stripeWebhook(req: Request, res: Response) {
  const sig = req.headers['stripe-signature']

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig!,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    return res.status(400).send(`Webhook Error`)
  }

  // ✅ EVENTO IMPORTANTE
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    if (!session.metadata?.userId || !session.metadata?.courseId) {
      return res.status(400).json({ error: 'Metadata faltante' })
    }

    // 🧠 1. Guardar pago
    await prisma.payment.create({
      data: {
        userId: session.metadata.userId,
        stripeSessionId: session.id,
        stripePaymentId: session.payment_intent as string,
        amount: session.amount_total!,
        currency: session.currency!,
        status: 'PAID',
      },
    })

    // 🧠 2. Crear inscripción
    await prisma.enrollment.create({
      data: {
        userId: session.metadata.userId,
        courseId: session.metadata.courseId,
      },
    })
  }

  res.json({ received: true })
}
