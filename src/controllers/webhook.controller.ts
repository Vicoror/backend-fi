import { Request, Response } from 'express';
import Stripe from 'stripe';
import { prisma } from '../lib/prisma';
import { stripe } from '../lib/stripe';
import { transporter } from '../lib/nodemailer';
import { PaymentType } from '@prisma/client';

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

  // CASO 1: Pago con tarjeta (inmediato)
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    console.log('🎯 checkout.session.completed:', session.id);
    
    // Si es tarjeta, procesar inmediatamente
    if (session.payment_method_types.includes('card')) {
      await procesarPagoExitoso(session, PaymentType.CARD);
    } 
    // Si es OXXO, solo guardar referencia
    else {
      await guardarReferenciaOxxo(session);
    }
  }

  // CASO 2: Pago OXXO confirmado
  if (event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as Stripe.Checkout.Session;
    console.log('💰 Pago OXXO confirmado:', session.id);
    await procesarPagoExitoso(session, PaymentType.OXXO);
  }

  // CASO 3: Pago OXXO falló
  if (event.type === 'checkout.session.async_payment_failed') {
    const session = event.data.object as Stripe.Checkout.Session;
    console.log('❌ Pago OXXO falló:', session.id);
    await manejarPagoFallido(session);
  }

  res.json({ received: true });
}

// Función para procesar pago exitoso (tanto tarjeta como OXXO confirmado)
async function procesarPagoExitoso(session: Stripe.Checkout.Session, tipoPago: PaymentType) {
  console.log('🎯 Procesando pago exitoso:', session.id);
  
  const { userId, courseId } = session.metadata || {};

  if (!userId || !courseId) {
    console.error('❌ Metadata faltante');
    return;
  }

  try {
    // 1. Buscar si ya existe un payment (para OXXO puede que ya exista en PENDING)
    const existingPayment = await prisma.payment.findUnique({
      where: { stripeSessionId: session.id }
    });

    let payment;
    if (existingPayment) {
      // Actualizar el existente
      payment = await prisma.payment.update({
        where: { stripeSessionId: session.id },
        data: { status: 'PAID' }
      });
      console.log('💰 Payment actualizado a PAID:', payment.id);
    } else {
      // Crear nuevo
      payment = await prisma.payment.create({
        data: {
          userId,
          stripeSessionId: session.id,
          stripePaymentId: session.payment_intent as string,
          amount: session.amount_total!,
          currency: session.currency!,
          status: 'PAID',
        },
      });
      console.log('💰 Payment creado:', payment.id);
    }

    // 2. Buscar si ya existe un purchase
    const existingPurchase = await prisma.purchase.findFirst({
      where: { stripeSessionId: session.id }
    });

    let purchase;
    if (existingPurchase) {
      // Actualizar el existente
      purchase = await prisma.purchase.update({
        where: { id: existingPurchase.id },
        data: { 
          status: 'COMPLETED',
          paymentType: tipoPago
        }
      });
      console.log('💰 Purchase actualizado a COMPLETED:', purchase.id);
    } else {
      // Crear nuevo
      purchase = await prisma.purchase.create({
        data: {
          userId,
          courseId,
          paymentType: tipoPago,
          refunded: false,
          stripeSessionId: session.id,
          status: 'COMPLETED',
        },
      });
      console.log('💰 Purchase creado:', purchase.id);
    }

    // 3. Verificar si ya existe enrollment
    const existingEnrollment = await prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId
        }
      }
    });

    if (!existingEnrollment) {
      await prisma.enrollment.create({
        data: {
          userId,
          courseId
        }
      });
      console.log('✅ Enrollment creado');

      // 4. Incrementar alumnos inscritos
      await prisma.course.update({
        where: { id: courseId },
        data: {
          alumnosInscritos: { increment: 1 }
        }
      });
      console.log('✅ Alumnos inscritos incrementados');
    }

    // 5. Activar usuario
    const user = await prisma.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE' },
    });
    console.log(`✅ Usuario ${user.folio} activado`);

    // 6. Obtener datos para el email
    const userWithProfile = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true }
    });

    const courseData = await prisma.course.findUnique({
      where: { id: courseId }
    });

    // 7. Enviar email de confirmación
    if (userWithProfile?.email && courseData) {
      await enviarEmailConfirmacion(userWithProfile, courseData, tipoPago);
    }

    console.log('🎉 Proceso completado exitosamente');

  } catch (error) {
    console.error('❌ Error procesando pago:', error);
  }
}

// Función para guardar referencia inicial de OXXO
async function guardarReferenciaOxxo(session: Stripe.Checkout.Session) {
  console.log('⏳ Guardando referencia OXXO:', session.id);
  
  const { userId, courseId } = session.metadata || {};

  if (!userId || !courseId) {
    console.error('❌ Metadata faltante');
    return;
  }

  try {
    // Crear payment en PENDING
    await prisma.payment.create({
      data: {
        userId,
        stripeSessionId: session.id,
        stripePaymentId: session.payment_intent as string,
        amount: session.amount_total!,
        currency: session.currency!,
        status: 'PENDING',
      },
    });
    console.log('⏳ Payment pendiente creado');

    // Crear purchase en PENDING
    await prisma.purchase.create({
      data: {
        userId,
        courseId,
        paymentType: PaymentType.OXXO,
        refunded: false,
        stripeSessionId: session.id,
        status: 'PENDING',
      },
    });
    console.log('⏳ Purchase pendiente creado');

    // Enviar email de instrucciones
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true }
    });

    if (user?.email) {
      await enviarEmailInstruccionesOxxo(user, session);
    }

  } catch (error) {
    console.error('❌ Error guardando referencia OXXO:', error);
  }
}

// Función para manejar pago fallido
async function manejarPagoFallido(session: Stripe.Checkout.Session) {
  console.log('❌ Procesando pago fallido:', session.id);
  
  try {
    await prisma.payment.update({
      where: { stripeSessionId: session.id },
      data: { status: 'FAILED' }
    });

    await prisma.purchase.update({
      where: { stripeSessionId: session.id },
      data: { status: 'FAILED' }
    });

    console.log('✅ Pago marcado como fallido');
  } catch (error) {
    console.error('Error manejando pago fallido:', error);
  }
}

// Email de confirmación (para tarjeta y OXXO confirmado)
async function enviarEmailConfirmacion(user: any, course: any, tipoPago: PaymentType) {
  console.log('📧 Enviando email de confirmación...');

  if (!user?.email) {
    console.error('❌ Usuario sin email');
    return;
  }

  const esOxxo = tipoPago === PaymentType.OXXO;

  try {
    const info = await transporter.sendMail({
      from: `"Français Intelligent" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: user.email,
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
              <h2>¡Hola ${user.profile?.nombre || 'estudiante'}!</h2>
              
              <p><strong>✅ ${esOxxo ? 'Tu pago en OXXO ha sido confirmado' : 'Tu pago ha sido procesado exitosamente'}.</strong></p>
              
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

    console.log('✅ Email enviado:', info.messageId);
  } catch (error) {
    console.error('❌ Error enviando email:', error);
  }
}

// Email de instrucciones para OXXO
async function enviarEmailInstruccionesOxxo(user: any, session: Stripe.Checkout.Session) {
  console.log('📧 Enviando email instrucciones OXXO...');

  if (!user?.email) return;

  try {
    const info = await transporter.sendMail({
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

    console.log('✅ Email instrucciones OXXO enviado:', info.messageId);
  } catch (error) {
    console.error('❌ Error enviando email instrucciones OXXO:', error);
  }
}