import { Request, Response } from 'express';
import Stripe from 'stripe';
import { prisma } from '../lib/prisma';
import { stripe } from '../lib/stripe';

export async function stripeWebhook(req: Request, res: Response) {
  const sig = req.headers['stripe-signature'] as string;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('❌ Error verificando webhook:', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Manejar diferentes tipos de eventos
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
      break;
      
    case 'checkout.session.async_payment_succeeded':
      await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
      break;
      
    case 'payment_intent.succeeded':
      console.log('✅ Pago confirmado:', event.data.object.id);
      break;
      
    default:
      console.log(`📦 Evento no manejado: ${event.type}`);
  }

  res.json({ received: true });
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log('🎯 Checkout completado:', session.id);

  const { userId, courseId } = session.metadata || {};

  if (!userId || !courseId) {
    console.error('❌ Metadata faltante en sesión:', session.id);
    return;
  }

  try {
    // 1. Guardar el pago
    await prisma.payment.create({
      data: {
        userId,
        stripeSessionId: session.id,
        stripePaymentId: session.payment_intent as string,
        amount: session.amount_total!,
        currency: session.currency!,
        status: 'PAID',
      },
    });

    // 2. Crear inscripción
    await prisma.enrollment.create({
      data: {
        userId,
        courseId,
      },
    });

    // 3. 🟢 ACTIVAR ESTUDIANTE (Cambiar status de INACTIVE a ACTIVE)
    await prisma.user.update({
      where: { id: userId },
      data: { 
        status: 'ACTIVE'  // ← ESTO ACTIVA AL ESTUDIANTE
      },
    });

    // 4. Incrementar contador de alumnos inscritos
    await prisma.course.update({
      where: { id: courseId },
      data: {
        alumnosInscritos: { increment: 1 },
      },
    });

    console.log(`✅ Estudiante ${userId} activado y inscrito en curso ${courseId}`);

    // TODO: Enviar email de confirmación
    // await enviarEmailConfirmacion(userId, courseId, session);

  } catch (error) {
    console.error('❌ Error procesando checkout completado:', error);
    throw error;
  }
}