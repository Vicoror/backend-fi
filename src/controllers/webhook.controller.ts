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

  // ============================================
  // CASO 1: Pago con TARJETA (inmediato)
  // ============================================
  if (event.type === 'checkout.session.completed' && 
      event.data.object.payment_method_types.includes('card')) {
    const session = event.data.object as Stripe.Checkout.Session;
    console.log('💳 Procesando pago con TARJETA:', session.id);
    await procesarPagoTarjeta(session);
  }

  // ============================================
  // CASO 2: Referencia OXXO (cuando se genera el voucher)
  // ============================================
  if (event.type === 'checkout.session.completed' && 
      event.data.object.payment_method_types.includes('oxxo')) {
    const session = event.data.object as Stripe.Checkout.Session;
    console.log('🧾 Generando referencia OXXO:', session.id);
    await guardarReferenciaOxxo(session);
  }

  // ============================================
  // CASO 3: Pago OXXO confirmado (24-48h después)
  // ============================================
  if (event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as Stripe.Checkout.Session;
    console.log('💰 Pago OXXO CONFIRMADO:', session.id);
    await procesarPagoOxxoConfirmado(session);
  }

  res.json({ received: true });
}

// 🟢 Función exclusiva para TARJETA
async function procesarPagoTarjeta(session: Stripe.Checkout.Session) {
  const { userId, courseId } = session.metadata || {};
  if (!userId || !courseId) return;

  try {
    // 1. Payment
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
    console.log('✅ Payment TARJETA creado:', payment.id);

    // 2. Purchase con CARD
    const purchase = await prisma.purchase.create({
      data: {
        userId,
        courseId,
        paymentType: PaymentType.CARD,
        refunded: false,
        stripeSessionId: session.id,
        status: 'COMPLETED',
      },
    });
    console.log('✅ Purchase TARJETA creado:', purchase.id);

    // 3. Enrollment
    const existingEnrollment = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } }
    });

    if (!existingEnrollment) {
      await prisma.enrollment.create({ 
        data: { userId, courseId } 
      });
      
      await prisma.course.update({
        where: { id: courseId },
        data: { alumnosInscritos: { increment: 1 } }
      });
      console.log('✅ Enrollment creado');
    }

    // 4. Activar usuario
    const user = await prisma.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE' },
    });
    console.log(`✅ Usuario ${user.folio} activado`);

    // 5. Obtener datos para email
    const userWithProfile = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true }
    });

    const course = await prisma.course.findUnique({ 
      where: { id: courseId } 
    });

    // 6. Enviar email de confirmación
    if (userWithProfile?.email && course) {
      await enviarEmailConfirmacion(userWithProfile, course, PaymentType.CARD);
    }

    console.log('🎉 Proceso TARJETA completado');

  } catch (error) {
    console.error('❌ Error en pago tarjeta:', error);
  }
}

// 🟡 Función exclusiva para guardar referencia OXXO
async function guardarReferenciaOxxo(session: Stripe.Checkout.Session) {
  const { userId, courseId } = session.metadata || {};
  if (!userId || !courseId) return;

  try {
    // 1. Payment PENDING
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
    console.log('⏳ Payment OXXO pendiente creado');

    // 2. Purchase PENDING con OXXO explícito
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
    console.log('⏳ Purchase OXXO pendiente creado con tipo OXXO');

    // 3. Email instrucciones
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

// 🟢 Función exclusiva para OXXO confirmado
async function procesarPagoOxxoConfirmado(session: Stripe.Checkout.Session) {
  const { userId, courseId } = session.metadata || {};
  if (!userId || !courseId) return;

  try {
    // 1. Actualizar payment a PAID
    await prisma.payment.update({
      where: { stripeSessionId: session.id },
      data: { status: 'PAID' }
    });
    console.log('💰 Payment OXXO actualizado a PAID');

    // 2. Buscar el purchase existente (debe tener OXXO)
    const existingPurchase = await prisma.purchase.findFirst({
      where: { stripeSessionId: session.id }
    });

    if (existingPurchase) {
      await prisma.purchase.update({
        where: { id: existingPurchase.id },
        data: { status: 'COMPLETED' }
      });
      console.log('💰 Purchase OXXO actualizado a COMPLETED, tipo mantenido:', existingPurchase.paymentType);
    }

    // 3. Enrollment
    const existingEnrollment = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } }
    });

    if (!existingEnrollment) {
      await prisma.enrollment.create({ 
        data: { userId, courseId } 
      });
      
      await prisma.course.update({
        where: { id: courseId },
        data: { alumnosInscritos: { increment: 1 } }
      });
      console.log('✅ Enrollment creado para OXXO');
    }

    // 4. Activar usuario
    const user = await prisma.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE' },
    });
    console.log(`✅ Usuario ${user.folio} activado por OXXO`);

    // 5. Obtener datos para email
    const userWithProfile = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true }
    });

    const course = await prisma.course.findUnique({ 
      where: { id: courseId } 
    });

    // 6. Enviar email de confirmación con OXXO
    if (userWithProfile?.email && course) {
      await enviarEmailConfirmacion(userWithProfile, course, PaymentType.OXXO);
    }

    console.log('🎉 Proceso OXXO completado');

  } catch (error) {
    console.error('❌ Error confirmando pago OXXO:', error);
  }
}

// 📧 EMAIL DE CONFIRMACIÓN (COMPLETO)
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

// 📧 EMAIL DE INSTRUCCIONES OXXO (COMPLETO)
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