import { Request, Response } from 'express';
import Stripe from 'stripe';
import { prisma } from '../lib/prisma';
import { stripe } from '../lib/stripe';
import { transporter } from '../lib/nodemailer';

export async function stripeWebhook(req: Request, res: Response) {
  const sig = req.headers['stripe-signature'] as string;
  let event: Stripe.Event;

  // =============================================
  // 1. VERIFICAR FIRMA STRIPE
  // =============================================
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error('❌ Error verificando webhook:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('📩 Evento recibido:', event.type);

  // =============================================
// OXXO — INSTRUCCIONES DE PAGO
// =============================================
if ((event.type as string) === 'checkout.session.async_payment_pending') {
  const session = event.data.object as Stripe.Checkout.Session;

  console.log('🧾 Pago OXXO pendiente:', session.id);

  const userId = session.metadata?.userId;
  const courseId = session.metadata?.courseId;

  if (!userId) return res.json({ received: true });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true }
  });

  if (!user?.email) return res.json({ received: true });

  try {
    await transporter.sendMail({
      from: `"Français Intelligent" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: user.email,
      subject: '🧾 Completa tu pago en OXXO',
      html: `
        <h2>Hola ${user.profile?.nombre || 'estudiante'}</h2>
        <p>Tu orden fue creada correctamente.</p>

        <p><strong>Para completar tu inscripción:</strong></p>

        <ol>
          <li>Descarga tu voucher desde el link de abajo</li>
          <li>Paga en cualquier tienda OXXO</li>
          <li>Tu acceso se activará automáticamente</li>
        </ol>

        <a href="${session.url}">
          Ver instrucciones de pago
        </a>

        <p>Referencia: ${session.id}</p>
      `
    });

    console.log('✅ Email instrucciones OXXO enviado');
  } catch (err) {
    console.error('❌ Error enviando email OXXO:', err);
  }
}

  // =============================================
  // 2. SOLO PROCESAR PAGO COMPLETADO
  // =============================================
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    console.log('🎯 Pago completado:', session.id);
    console.log('📦 Metadata recibida:', session.metadata);

    const userId = session.metadata?.userId;
    const courseId = session.metadata?.courseId;

    if (!userId || !courseId) {
      console.error('❌ Metadata faltante');
      return res.status(400).json({ error: 'Metadata faltante' });
    }

    try {
      // =============================================
      // 3. EVITAR PROCESAR DOS VECES (STRIPE RETRY)
      // =============================================
      const existingPayment = await prisma.payment.findUnique({
        where: { stripeSessionId: session.id }
      });

      if (existingPayment) {
        console.log('⚠️ Evento ya procesado, ignorando');
        return res.json({ received: true });
      }

      // =============================================
      // 4. CREAR PAYMENT
      // =============================================
      const payment = await prisma.payment.create({
        data: {
          userId,
          stripeSessionId: session.id,
          stripePaymentId: session.payment_intent as string,
          amount: session.amount_total || 0,
          currency: session.currency || 'mxn',
          status: 'PAID'
        }
      });

      console.log('✅ Payment creado:', payment.id);

      // =============================================
      // 5. OBTENER TIPO DE PAGO
      // =============================================
      const paymentIntent = await stripe.paymentIntents.retrieve(
        session.payment_intent as string
      );

      const paymentMethodType = paymentIntent.payment_method_types[0];

      // 👇 FIX para tu error "string not assignable to PaymentType"
      const tipoPago: 'OXXO' | 'CARD' =
        paymentMethodType === 'oxxo' ? 'OXXO' : 'CARD';

      // =============================================
      // 6. CREAR PURCHASE
      // =============================================
      const purchase = await prisma.purchase.create({
        data: {
          userId,
          courseId,
          paymentType: tipoPago,
          refunded: false,
          stripeSessionId: session.id
        }
      });

      console.log('✅ Purchase creado:', purchase.id);

      // =============================================
      // 7. CREAR ENROLLMENT (SI NO EXISTE)
      // =============================================
      const existingEnrollment = await prisma.enrollment.findUnique({
        where: {
          userId_courseId: {
            userId,
            courseId
          }
        }
      });

      if (!existingEnrollment) {
        const enrollment = await prisma.enrollment.create({
          data: {
            userId,
            courseId
          }
        });

        console.log('✅ Enrollment creado:', enrollment.id);

        await prisma.course.update({
          where: { id: courseId },
          data: {
            alumnosInscritos: { increment: 1 }
          }
        });
      } else {
        console.log('⚠️ Usuario ya estaba inscrito');
      }

      // =============================================
      // 8. ACTIVAR USUARIO
      // =============================================
      const user = await prisma.user.update({
        where: { id: userId },
        data: { status: 'ACTIVE' }
      });

      console.log(`✅ Usuario ${user.folio} activado`);

      // =============================================
      // 9. OBTENER DATOS PARA EMAIL
      // =============================================
      const userWithProfile = await prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true }
      });

      const courseData = await prisma.course.findUnique({
        where: { id: courseId }
      });

      if (userWithProfile && courseData) {
        await enviarEmailConfirmacion(userWithProfile, courseData, session);
      }

      console.log('🎉 Proceso completado exitosamente');
    } catch (error) {
      console.error('❌ Error procesando webhook:', error);
      return res.status(500).json({ error: 'Error procesando el pago' });
    }
  }

  res.json({ received: true });
}

async function enviarEmailConfirmacion(
  user: any,
  course: any,
  session: Stripe.Checkout.Session
) {
  console.log('📧 Enviando email de confirmación...');

  if (!user?.email) {
    console.error('❌ Usuario sin email');
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: `"Français Intelligent" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: user.email,
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
            .button { background: #150354; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; }
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
                ¿Tienes dudas? Contáctanos por el chat.<br>
                <strong>¡Nos vemos en clase!</strong>
              </p>
            </div>
          </div>
        </body>
        </html>
      `
    });

    console.log('✅ Email enviado:', info.messageId);
  } catch (error) {
    console.error('❌ Error enviando email:', error);
  }
}