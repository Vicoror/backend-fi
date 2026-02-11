import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { stripe } from '../lib/stripe'

const router = Router()

console.log('📦 checkout routes cargadas')


router.post('/', /* requireAuth, */ async (req, res) => {
  console.log('🔥 POST /checkout hit')
  const user = req.user!   // ya está garantizado por requireAuth
  const { courseId } = req.body

  if (!courseId) {
    return res.status(400).json({ message: 'courseId requerido' })
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
  })

  if (!course) {
    return res.status(404).json({ message: 'Curso no encontrado' })
  }

  if (course.alumnosInscritos >= course.cupoMaximo) {
    return res.status(400).json({ message: 'Cupo lleno' })
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card', 'oxxo'],
    customer_email: user.email,
    line_items: [
      {
        price_data: {
          currency: 'mxn',
          product_data: {
            name: `${course.nivel} ${course.subnivel}`,
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
    success_url: `${process.env.FRONTEND_URL}/pago-exitoso`,
    cancel_url: `${process.env.FRONTEND_URL}/pago-cancelado`,
  })

  return res.json({ url: session.url })
})

export default router
