import { Request, Response } from 'express';
import Stripe from 'stripe';
import { prisma } from '../lib/prisma';
import { stripe } from '../lib/stripe';
import { resend } from '../lib/resend';

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

  // ✅ SOLO EVENTO DE PAGO EXITOSO
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    
    console.log('🎯 Pago completado:', session.id);
    
    const { userId, courseId } = session.metadata || {};

    if (!userId || !courseId) {
      console.error('❌ Metadata faltante');
      return res.status(400).json({ error: 'Metadata faltante' });
    }

    try {
      // 1. 🔵 CREAR PAYMENT (registro del pago)
      const payment = await prisma.payment.create({
        data: {
          userId,
          stripeSessionId: session.id,
          stripePaymentId: session.payment_intent as string,
          amount: session.amount_total!,
          currency: session.currency!,
          status: 'PAID',
        },
      });
      console.log('✅ Payment creado:', payment.id);

      // 2. 🟢 CREAR PURCHASE (compra del curso)
      const purchase = await prisma.purchase.create({
        data: {
          userId,
          courseId,
          paymentType: session.payment_method_types.includes('oxxo') ? 'OXXO' : 'CARD',
          refunded: false,
          stripeSessionId: session.id,
        },
      });
      console.log('✅ Purchase creado:', purchase.id);

      // 3. 📈 INCREMENTAR alumnosInscritos (SOLO AQUÍ)
      const course = await prisma.course.update({
        where: { id: courseId },
        data: {
          alumnosInscritos: { increment: 1 },
        },
      });
      console.log(`✅ Curso actualizado: ahora ${course.alumnosInscritos} inscritos`);

      // 4. 🟢 ACTIVAR ESTUDIANTE (cambiar status a ACTIVE)
      const user = await prisma.user.update({
        where: { id: userId },
        data: { status: 'ACTIVE' },
      });
      console.log(`✅ Usuario ${user.folio} activado`);

      // 5. 📧 ENVIAR EMAIL DE CONFIRMACIÓN
      await enviarEmailConfirmacion(userId, courseId, session);

      console.log('🎉 Proceso completado exitosamente');

    } catch (error) {
      console.error('❌ Error procesando webhook:', error);
      return res.status(500).json({ error: 'Error procesando el pago' });
    }
  }

  res.json({ received: true });
}

// 📧 FUNCIÓN PARA ENVIAR EMAIL
async function enviarEmailConfirmacion(userId: string, courseId: string, session: Stripe.Checkout.Session) {
  try {
    // Obtener datos del usuario y curso
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true }
    });

    const course = await prisma.course.findUnique({
      where: { id: courseId }
    });

    if (!user || !course || !user.profile) return;

    // Enviar email con Resend
    await resend.emails.send({
      from: 'Français Intelligent <inscripciones@tudominio.com>',
      to: [user.email],
      subject: '🎉 ¡Pago exitoso! Confirmación de inscripción',
      html: `
        <h1>¡Hola ${user.profile.nombre}!</h1>
        <p>Tu pago ha sido procesado exitosamente.</p>
        <h3>Detalles del curso:</h3>
        <ul>
          <li><strong>Curso:</strong> ${course.nivel} ${course.subnivel || ''}</li>
          <li><strong>Horario:</strong> ${course.dias} - ${course.horario}</li>
          <li><strong>Folio:</strong> ${user.folio}</li>
        </ul>
        <p>Tu acceso a la plataforma ya está activo.</p>
      `
    });

    console.log(`✅ Email enviado a ${user.email}`);
  } catch (error) {
    console.error('❌ Error enviando email:', error);
  }
}