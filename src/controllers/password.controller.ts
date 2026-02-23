import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { transporter } from '../lib/nodemailer'

// Generar código aleatorio de 6 dígitos
function generarCodigo(): string {
  return crypto.randomInt(100000, 999999).toString()
}

// 1. SOLICITAR RECUPERACIÓN
export async function solicitarRecuperacion(req: Request, res: Response) {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ message: 'Email es requerido' })
    }

    // Verificar si el usuario existe
    const user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true }
    })

    if (!user) {
      // Por seguridad, no revelamos si el email existe o no
      return res.json({ 
        message: 'Si el email existe, recibirás un código de recuperación' 
      })
    }

    // Generar código
    const codigo = generarCodigo()
    const expiraEn = new Date(Date.now() + 5 * 60 * 1000) // 5 minutos

    // Guardar o actualizar el código
    await prisma.passwordReset.upsert({
      where: { email_codigo: { email, codigo } },
      update: {
        codigo,
        expiraEn,
        usado: false
      },
      create: {
        email,
        codigo,
        expiraEn
      }
    })

    // Enviar email con el código
    const nombre = user.profile?.nombre || 'estudiante'
    
    await transporter.sendMail({
      from: `"Français Intelligent" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: email,
      subject: '🔐 Código de recuperación de contraseña',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #150354;">¡Hola ${nombre}!</h2>
          
          <p>Has solicitado recuperar tu contraseña. Utiliza el siguiente código:</p>
          
          <div style="background: #f0f0f0; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <h1 style="color: #150354; font-size: 32px; letter-spacing: 5px;">${codigo}</h1>
          </div>
          
          <p><strong>Este código expira en 5 minutos.</strong></p>
          
          <p>Si no solicitaste este cambio, ignora este mensaje.</p>
          
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;" />
          
          <p style="color: #666; font-size: 12px;">
            Français Intelligent - Tu escuela de francés
          </p>
        </div>
      `
    })

    res.json({ 
      message: 'Código enviado correctamente'
    })

  } catch (error) {
    console.error('Error en solicitar recuperación:', error)
    res.status(500).json({ message: 'Error al procesar la solicitud' })
  }
}

// 2. VERIFICAR CÓDIGO
export async function verificarCodigo(req: Request, res: Response) {
  try {
    const { email, codigo } = req.body

    if (!email || !codigo) {
      return res.status(400).json({ message: 'Email y código son requeridos' })
    }

    const reset = await prisma.passwordReset.findUnique({
      where: { email_codigo: { email, codigo } }
    })

    if (!reset) {
      return res.status(400).json({ message: 'Código inválido' })
    }

    if (reset.usado) {
      return res.status(400).json({ message: 'Este código ya fue utilizado' })
    }

    if (reset.expiraEn < new Date()) {
      return res.status(400).json({ message: 'El código ha expirado' })
    }

    // Obtener el folio del usuario para mostrarlo
    const user = await prisma.user.findUnique({
      where: { email },
      select: { folio: true }
    })

    res.json({ 
      message: 'Código válido',
      folio: user?.folio 
    })

  } catch (error) {
    console.error('Error verificando código:', error)
    res.status(500).json({ message: 'Error al verificar el código' })
  }
}

// 3. CAMBIAR CONTRASEÑA
export async function cambiarPassword(req: Request, res: Response) {
  try {
    const { email, codigo, nuevaPassword } = req.body

    if (!email || !codigo || !nuevaPassword) {
      return res.status(400).json({ message: 'Todos los campos son requeridos' })
    }

    // Validar fortaleza de contraseña
    if (
      nuevaPassword.length < 8 ||
      !/[A-Z]/.test(nuevaPassword) ||
      !/\d/.test(nuevaPassword) ||
      !/[^A-Za-z0-9]/.test(nuevaPassword)
    ) {
      return res.status(400).json({ 
        message: 'La contraseña no cumple los requisitos de seguridad' 
      })
    }

    const reset = await prisma.passwordReset.findUnique({
      where: { email_codigo: { email, codigo } }
    })

    if (!reset || reset.usado || reset.expiraEn < new Date()) {
      return res.status(400).json({ message: 'Código inválido o expirado' })
    }

    // Hashear nueva contraseña
    const hashedPassword = await bcrypt.hash(nuevaPassword, 10)

    // Actualizar contraseña del usuario
    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword }
    })

    // Marcar código como usado
    await prisma.passwordReset.update({
      where: { id: reset.id },
      data: { usado: true }
    })

    // Enviar email de confirmación
    await transporter.sendMail({
      from: `"Français Intelligent" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: email,
      subject: '✅ Contraseña actualizada',
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2 style="color: #150354;">¡Contraseña actualizada!</h2>
          <p>Tu contraseña ha sido cambiada exitosamente.</p>
          <p>Si no realizaste este cambio, contacta a soporte inmediatamente.</p>
        </div>
      `
    })

    res.json({ 
      message: 'Contraseña actualizada correctamente' 
    })

  } catch (error) {
    console.error('Error cambiando contraseña:', error)
    res.status(500).json({ message: 'Error al cambiar la contraseña' })
  }
}