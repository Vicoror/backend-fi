import { Request, Response } from 'express'
import Stripe from 'stripe'
import { prisma } from '../lib/prisma'
import { stripe } from '../lib/stripe'

export async function stripeWebhook(req: Request, res: Response) {
  const sig = req.headers['stripe-signature'] as string

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    return res.status(400).send(`Webhook Error`)
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    await prisma.payment.update({
      where: { stripeSessionId: session.id },
      data: {
        status: 'PAID',
        stripePaymentId: session.payment_intent as string,
      },
    })
  }

  res.json({ received: true })
}
