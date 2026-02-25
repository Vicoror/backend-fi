import { Request, Response } from 'express';
import Stripe from 'stripe';
import { prisma } from '../lib/prisma';
import { stripe } from '../lib/stripe';
import { transporter } from '../lib/nodemailer';
import { PaymentType } from '@prisma/client';

export async function stripeWebhook(req: Request, res: Response) {
  console.log('📨 Webhook recibido en Vercel. Verificando firma...');
  
  const sig = req.headers['stripe-signature'] as string;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
    console.log(`✅ Firma verificada. Evento tipo: ${event.type}`);
  } catch (err) {
    console.error('❌ Error verificando webhook:', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ✅ CASO 1: Pago con tarjeta (inmediato)
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    console.log('🎯 checkout.session.completed recibido:', session.id);
    
    // Verificar si es un método de pago inmediato (tarjeta)
    if (session.payment_method_types.includes('card')) {
      console.log('💳 Pago con tarjeta detectado, procesando inmediatamente...');
      await procesarPagoExitoso(session, 'CARD');
    } else {
      console.log(`⏳ Pago asíncrono iniciado (${session.payment_method_types[0]}), esperando confirmación...`);
      await guardarReferenciaPago(session, 'OXXO');
    }
  }

  // ✅ CASO 2: Pago asíncrono confirmado (OXXO pagado)
  if (event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as Stripe.Checkout.Session;
    console.log('💰 Pago OXXO confirmado recibido:', session.id);
    console.log('📦 Metadata del evento OXXO:', session.metadata);
    await procesarPagoExitoso(session, 'OXXO');
  }

  // ✅ CASO 3: Pago asíncrono falló/expiro
  if (event.type === 'checkout.session.async_payment_failed') {
    const session = event.data.object as Stripe.Checkout.Session;
    console.log('❌ Pago OXXO falló/expiro:', session.id);
    await manejarPagoFallido(session);
  }

  res.json({ received: true });
}

// Función para guardar referencia inicial de pago (para OXXO)
async function guardarReferenciaPago(session: Stripe.Checkout.Session, tipo: string) {
  console.log('📦 guardarReferenciaPago - Iniciando para sesión:', session.id);
  
  const { userId, courseId } = session.metadata || {};
  console.log('📦 Metadata extraída:', { userId, courseId });

  if (!userId || !courseId) {
    console.error('❌ Metadata faltante en guardarReferenciaPago');
    return;
  }

  try {
    // Verificar si ya existe un registro para esta sesión
    const existingPayment = await prisma.payment.findUnique({
      where: { stripeSessionId: session.id }
    });

    if (!existingPayment) {
      const payment = await prisma.payment.create({
        data: {
          userId,
          stripeSessionId: session.id,
          stripePaymentId: session.payment_intent as string,
          amount: session.amount_total!,
          currency: session.currency!,
          status: 'PENDING',
        },
      });
      console.log('⏳ Payment pendiente creado:', payment.id);
    } else {
      console.log('⏳ Payment ya existente:', existingPayment.id);
    }

    // Crear purchase en estado pendiente
    const existingPurchase = await prisma.purchase.findFirst({
      where: { stripeSessionId: session.id }
    });

    if (!existingPurchase) {
      const purchase = await prisma.purchase.create({
        data: {
          userId,
          courseId,
          paymentType: tipo === 'OXXO' ? PaymentType.OXXO : PaymentType.CARD,
          refunded: false,
          stripeSessionId: session.id,
          status: 'PENDING'
        },
      });
      console.log('⏳ Purchase pendiente creado:', purchase.id);
    } else {
      console.log('⏳ Purchase ya existente:', existingPurchase.id);
    }

    // Enviar email con instrucciones de pago OXXO
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true }
    });

    if (user?.email) {
      try {
        if (process.env.SMTP_HOST) {
          await transporter.sendMail({
            from: `"Français Intelligent" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
            to: user.email,
            subject: '🧾 Instrucciones para pago en OXXO',
            html: `
              <!DOCTYPE html>
              <html>
              <head>
                <style>
                  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                  .header { background: #150354; color: white; padding: 20px; text-align: center; }
                  .content { background: #f8f9fa; padding: 30px; }
                  .oxxo-info { background: #A8DADC; padding: 20px; border-radius: 8px; margin: 20px 0; }
                  .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <h1>🎓 Français Intelligent</h1>
                  </div>
                  <div class="content">
                    <h2>¡Hola ${user.profile?.nombre || 'estudiante'}!</h2>
                    
                    <p>Has generado un pago por OXXO para inscribirte al curso.</p>
                    
                    <div class="oxxo-info">
                      <h3 style="margin-top: 0;">🧾 Instrucciones:</h3>
                      <ol>
                        <li>Guarda o imprime tu línea de captura</li>
                        <li>Acude a cualquier OXXO</li>
                        <li>Realiza el pago de <strong>$${session.amount_total! / 100} MXN</strong></li>
                        <li>El pago se reflejará en 24-48 horas</li>
                      </ol>
                      <p style="font-size: 1.2em; text-align: center; margin: 20px 0;">
                        <strong>Línea de captura:</strong><br>
                        ${session.payment_intent}
                      </p>
                    </div>

                    <div class="warning">
                      <p><strong>⚠️ Importante:</strong></p>
                      <ul>
                        <li>Tu pago debe realizarse antes de 3 días</li>
                        <li>Recibirás un correo de confirmación cuando el pago sea verificado</li>
                        <li>Tu acceso a la plataforma se activará automáticamente al confirmarse el pago</li>
                      </ul>
                    </div>

                    <p>¿Tienes dudas? Contáctanos por el chat de la plataforma.</p>
                  </div>
                </div>
              </body>
              </html>
            `
          });
          console.log('✅ Email instrucciones OXXO enviado');
        }
      } catch (error) {
        console.error('❌ Error enviando email instrucciones OXXO:', error);
      }
    }

  } catch (error) {
    console.error('❌ Error guardando referencia:', error);
  }
}

// Función para procesar pago exitoso (tanto tarjeta como OXXO confirmado)
async function procesarPagoExitoso(session: Stripe.Checkout.Session, tipo: string) {
  console.log('🔥🔥🔥 PROCESAR PAGO EXITOSO INICIADO 🔥🔥🔥');
  console.log('Session ID:', session.id);
  console.log('Tipo:', tipo);
  console.log('Metadata:', session.metadata);

  const { userId, courseId } = session.metadata || {};

  if (!userId || !courseId) {
    console.error('❌ Metadata faltante en procesarPagoExitoso');
    return;
  }

  try {
    // 1. Actualizar payment a PAID
    console.log('💰 Buscando payment para:', session.id);
    const payment = await prisma.payment.upsert({
      where: { stripeSessionId: session.id },
      update: { status: 'PAID' },
      create: {
        userId,
        stripeSessionId: session.id,
        stripePaymentId: session.payment_intent as string,
        amount: session.amount_total!,
        currency: session.currency!,
        status: 'PAID',
      },
    });
    console.log('💰 Payment actualizado a PAID:', payment.id);

    // 2. Actualizar purchase a COMPLETED
    console.log('💰 Buscando purchase para:', session.id);
    const purchase = await prisma.purchase.upsert({
      where: { stripeSessionId: session.id },
      update: { 
        status: 'COMPLETED',
        paymentType: tipo === 'OXXO' ? PaymentType.OXXO : PaymentType.CARD
      },
      create: {
        userId,
        courseId,
        paymentType: tipo === 'OXXO' ? PaymentType.OXXO : PaymentType.CARD,
        refunded: false,
        stripeSessionId: session.id,
        status: 'COMPLETED'
      },
    });
    console.log('💰 Purchase actualizado a COMPLETED:', purchase.id);

    // 3. Verificar si ya existe enrollment
    console.log('🔍 Verificando enrollment para:', { userId, courseId });
    const existingEnrollment = await prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId
        }
      }
    });

    if (!existingEnrollment) {
      console.log('🔍 Creando nuevo enrollment');
      const enrollment = await prisma.enrollment.create({
        data: {
          userId,
          courseId
        }
      });
      console.log('✅ Enrollment creado:', enrollment.id);

      // 4. Incrementar alumnos inscritos
      console.log('🔍 Incrementando alumnosInscritos para curso:', courseId);
      const course = await prisma.course.update({
        where: { id: courseId },
        data: {
          alumnosInscritos: { increment: 1 }
        }
      });
      console.log('✅ Curso actualizado, nuevos alumnos:', course.alumnosInscritos);
    } else {
      console.log('ℹ️ Enrollment ya existente:', existingEnrollment.id);
    }

    // 5. ACTIVAR USUARIO
    console.log('🔍 Activando usuario:', userId);
    const user = await prisma.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE' },
    });
    console.log(`✅ Usuario ${user.folio} activado`);

    // 6. Enviar email de confirmación
    const userWithProfile = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true }
    });

    const courseData = await prisma.course.findUnique({
      where: { id: courseId }
    });

    if (userWithProfile?.email) {
      try {
        if (process.env.SMTP_HOST) {
          const esOxxo = tipo === 'OXXO';
          
          await transporter.sendMail({
            from: `"Français Intelligent" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
            to: userWithProfile.email,
            subject: esOxxo ? '✅ Pago OXXO confirmado - Inscripción exitosa' : '🎉 ¡Pago exitoso! Confirmación de inscripción',
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
                    <h2>¡Hola ${userWithProfile.profile?.nombre || 'estudiante'}!</h2>
                    
                    <p><strong>✅ ${esOxxo ? 'Tu pago en OXXO ha sido confirmado' : 'Tu pago ha sido procesado exitosamente'}.</strong></p>
                    
                    <div class="credentials">
                      <h3 style="margin-top: 0;">🔐 Tus datos de acceso:</h3>
                      <p><strong>Folio:</strong> ${userWithProfile.folio}</p>
                      <p><strong>Contraseña:</strong> La contraseña que estableciste en tu registro</p>
                      <p style="font-size: 0.9em; color: #666;">
                        ¿No recuerdas tu contraseña? Puedes recuperarla en la página de login.
                      </p>
                    </div>

                    <h3>📚 Detalles del curso:</h3>
                    <ul>
                      <li><strong>Curso:</strong> ${courseData?.nivel} ${courseData?.subnivel || ''}</li>
                      <li><strong>Horario:</strong> ${courseData?.dias} • ${courseData?.horario}</li>
                      <li><strong>Inicio:</strong> ${courseData?.inicio ? new Date(courseData.inicio).toLocaleDateString('es-MX') : ''}</li>
                      <li><strong>Fin:</strong> ${courseData?.fin ? new Date(courseData.fin).toLocaleDateString('es-MX') : ''}</li>
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
          console.log('✅ Email de confirmación enviado');
        }
      } catch (error) {
        console.error('❌ Error enviando email de confirmación:', error);
      }
    }

    console.log('🎉 Proceso completado exitosamente');

  } catch (error) {
    console.error('❌ Error procesando pago exitoso:', error);
    console.error('Detalles del error:', JSON.stringify(error, null, 2));
  }
}

async function manejarPagoFallido(session: Stripe.Checkout.Session) {
  console.log('❌ Manejar pago fallido para sesión:', session.id);
  
  const { userId, courseId } = session.metadata || {};

  try {
    // Actualizar payment a FAILED
    await prisma.payment.update({
      where: { stripeSessionId: session.id },
      data: { status: 'FAILED' }
    });

    // Actualizar purchase a FAILED
    await prisma.purchase.update({
      where: { stripeSessionId: session.id },
      data: { status: 'FAILED' }
    });

    console.log('❌ Pago marcado como fallido');
  } catch (error) {
    console.error('Error manejando pago fallido:', error);
  }
}