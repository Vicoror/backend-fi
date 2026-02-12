import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { stripe } from '../lib/stripe'

const router = Router()

console.log('📦 checkout routes cargadas')

router.post('/', async (req, res) => {
  try {
    console.log('🔥 POST /checkout hit')
    console.log('📥 Body recibido:', req.body) // ← DEBUG
    
    // ✅ RECIBIR userId del body, NO de req.user
    const { courseId, userId } = req.body

    if (!courseId) {
      return res.status(400).json({ message: 'courseId requerido' })
    }

    if (!userId) {
      return res.status(400).json({ message: 'userId requerido' })
    }

    // 1. Obtener curso
    const course = await prisma.course.findUnique({
      where: { id: courseId },
    })

    if (!course) {
      return res.status(404).json({ message: 'Curso no encontrado' })
    }

    // 2. Obtener usuario
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' })
    }

    // 3. Verificar cupo
    if (course.alumnosInscritos >= course.cupoMaximo) {
      return res.status(400).json({ message: 'Cupo lleno' })
    }

    // 4. Crear sesión en Stripe
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card', 'oxxo'],
      customer_email: user.email,  // ✅ Usamos el email del usuario de la DB
      line_items: [
        {
          price_data: {
            currency: 'mxn',
            product_data: {
              name: `${course.nivel} ${course.subnivel || ''}`,
              description: `${course.horario} | ${course.dias}`,
            },
            unit_amount: course.precio * 100,
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: user.id,
        courseId: course.id,
      },
      success_url: `${process.env.FRONTEND_URL}/pago-exitoso?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/pago-cancelado`,
    })

    console.log('✅ Sesión Stripe creada:', session.id)
    console.log('🔗 URL:', session.url)

    // ✅ Devolver URL
    return res.json({ url: session.url })

  } catch (error) {
    console.error('❌ Error en checkout:', error)
    return res.status(500).json({ 
      message: 'Error al procesar el pago',
      error: error instanceof Error ? error.message : 'Error desconocido'
    })
  }
})

export default router