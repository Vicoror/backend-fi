import { Router } from 'express'

const router = Router()

router.post('/enviar-email', async (req, res) => {
  try {
    const { to, subject, data } = req.body

    console.log('📨 Enviando email:', { to, subject, data })

    // 👉 Aquí luego metes nodemailer o resend

    return res.json({ ok: true, message: 'Email enviado (mock)' })
  } catch (error) {
    console.error('❌ Error enviando email:', error)
    return res.status(500).json({ message: 'Error al enviar email' })
  }
})

export default router