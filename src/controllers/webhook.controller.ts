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

   // Obtener usuario con profile
      const userWithProfile = await prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true }
      });

      // Obtener curso
      const courseData = await prisma.course.findUnique({
        where: { id: courseId }
      });

      await enviarEmailConfirmacion(userWithProfile, courseData, session);


      console.log('🎉 Proceso completado exitosamente');

    } catch (error) {
      console.error('❌ Error procesando webhook:', error);
      return res.status(500).json({ error: 'Error procesando el pago' });
    }
  }

  res.json({ received: true });
}

// 📧 FUNCIÓN PARA ENVIAR EMAIL
async function enviarEmailConfirmacion(user: any, course: any, session: Stripe.Checkout.Session) {
  console.log('📧 Enviando email de confirmación...');

  if (!user?.email) {
    console.error('❌ Usuario sin email');
    return;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: 'Français Intelligent <onboarding@resend.dev>',
      to: [user.email],
      subject: '🎉 ¡Pago exitoso! Confirmación de inscripción',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #150354; color: white; padding: 20px; text-align: center; }
            .content { background: #f8f9fa; padding: 30px; }
            .credentials { background: #A8DADC; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .button { background: #150354; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎓 Français Intelligent</h1>
            </div>
            <div class="content">
              <h2>¡Hola ${user.profile?.nombre || 'estudiante'}!</h2>
              
              <p><strong>✅ Tu pago ha sido procesado exitosamente.</strong></p>
              
              <div class="credentials">
                <h3 style="margin-top: 0;">🔐 Tus datos de acceso:</h3>
                <p><strong>Folio:</strong> ${user.folio}</p>
                <p><strong>Contraseña:</strong> La contraseña que estableciste en tu registro</p>
                <p style="font-size: 0.9em; color: #666;">
                  ¿No recuerdas tu contraseña? Puedes recuperarla en la página de login.
                </p>
              </div>

              <h3>📚 Detalles del curso:</h3>
              <ul>
                <li><strong>Curso:</strong> ${course.nivel} ${course.subnivel || ''}</li>
                <li><strong>Horario:</strong> ${course.dias} • ${course.horario}</li>
                <li><strong>Inicio:</strong> ${new Date(course.inicio).toLocaleDateString('es-MX')}</li>
                <li><strong>Fin:</strong> ${new Date(course.fin).toLocaleDateString('es-MX')}</li>
              </ul>

              <div style="text-align: center; margin-top: 30px;">
                <a href="${process.env.FRONTEND_URL}/login" class="button">
                  Iniciar sesión
                </a>
              </div>

              <p style="margin-top: 30px;">
                ¿Tienes dudas? Contáctanos por el chat de la plataforma.<br>
                <strong>¡Nos vemos en clase!</strong>
              </p>
            </div>
          </div>
        </body>
        </html>
      `
    });

    if (error) {
      console.error('❌ Error de Resend:', error);
    } else {
      console.log('✅ Email enviado:', data?.id);
    }
  } catch (error) {
    console.error('❌ Error enviando email:', error);
  }
}