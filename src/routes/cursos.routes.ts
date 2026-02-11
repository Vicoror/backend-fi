import { Router } from 'express'
import { prisma } from '../lib/prisma'
import type { CursoInput } from '../types/curso'


const router = Router()



// HOME → solo activos
router.get('/', async (req, res) => {
  const cursos = await prisma.course.findMany({
    where: { activo: true },
    orderBy: { inicio: 'asc' },
    select: {
      id: true,
      nivel: true,
      dias: true,
      horario: true,
      duracion: true,
      inicio: true,
      fin: true,
      precio: true,
    },
  })

  res.json(cursos)
})


// ADMIN → todos
router.get('/admin', async (_req, res) => {
  const cursos = await prisma.course.findMany({
    orderBy: { createdAt: 'desc' },
  })
  res.json(cursos)
})

// CREAR
router.post('/', async (req, res) => {
  const body = req.body as CursoInput

  const count = await prisma.course.count({
    where: { nivel: body.nivel },
  })

  const code = `${body.nivel}-${String(count + 1).padStart(3, '0')}`

  const curso = await prisma.course.create({
    data: {
      code,
      nivel: body.nivel,
      subnivel: body.subnivel,
      dias: body.dias,
      horario: body.horario,
      duracion: body.duracion,
      cupoMaximo: Number(body.cupoMaximo),
      precio: Number(body.precio),
      inicio: new Date(body.inicio),
      fin: new Date(body.fin),
      activo: body.activo,
    },
  })

  res.json(curso)
})

// EDITAR
router.put('/:id', async (req, res) => {
  const curso = await prisma.course.update({
    where: { id: req.params.id },
    data: {
      ...req.body,
      precio: Number(req.body.precio),
      inicio: new Date(req.body.inicio),
      fin: new Date(req.body.fin),
    },
  })
  res.json(curso)
})

export default router
