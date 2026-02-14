import { Router } from 'express'
import { prisma } from '../lib/prisma'
import type { CursoInput } from '../types/curso'

const router = Router()

// HOME → solo activos
router.get('/', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error en GET /cursos:', error)
    res.status(500).json({
      error: 'Error al cargar los cursos',
      details: error instanceof Error ? error.message : 'Error desconocido'
    })
  }
})

// ADMIN → todos
router.get('/admin', async (_req, res) => {
  try {
    const cursos = await prisma.course.findMany({
      orderBy: { createdAt: 'desc' },
    })
    res.json(cursos)
  } catch (error) {
    console.error('Error en GET /cursos/admin:', error)
    res.status(500).json({
      error: 'Error al cargar los cursos (admin)',
      details: error instanceof Error ? error.message : 'Error desconocido'
    })
  }
})

// CREAR (CORREGIDO - maneja error de código duplicado)
router.post('/', async (req, res) => {
  try {
    const body = req.body as CursoInput

    // Contar cursos existentes del mismo nivel
    const count = await prisma.course.count({
      where: { nivel: body.nivel },
    })

    // Generar código secuencial (ej: A1-001)
    const code = `${body.nivel}-${String(count + 1).padStart(3, '0')}`

    // Intentar crear el curso
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
  } catch (error: any) {
    console.error('Error en POST /cursos:', error)
    
    // 🔴 MANEJO ESPECÍFICO PARA CÓDIGO DUPLICADO
    if (error.code === 'P2002' && error.meta?.target?.includes('code')) {
      return res.status(400).json({
        error: 'Error al crear el curso',
        details: 'Ya existe un curso con ese código. Intenta de nuevo.'
      })
    }

    res.status(500).json({
      error: 'Error al crear el curso',
      details: error instanceof Error ? error.message : 'Error desconocido'
    })
  }
})

// EDITAR
router.put('/:id', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error en PUT /cursos/:id:', error)
    res.status(500).json({
      error: 'Error al actualizar el curso',
      details: error instanceof Error ? error.message : 'Error desconocido'
    })
  }
})

// 🆕 NUEVA RUTA PARA ELIMINAR (DELETE)
router.delete('/:id', async (req, res) => {
  try {
    // Verificar si el curso existe antes de eliminar
    const cursoExistente = await prisma.course.findUnique({
      where: { id: req.params.id }
    })

    if (!cursoExistente) {
      return res.status(404).json({
        error: 'Curso no encontrado',
        details: `No existe un curso con ID: ${req.params.id}`
      })
    }

    // Eliminar el curso
    await prisma.course.delete({
      where: { id: req.params.id }
    })

    res.json({ 
      success: true, 
      message: 'Curso eliminado correctamente' 
    })
  } catch (error) {
    console.error('Error en DELETE /cursos/:id:', error)
    res.status(500).json({
      error: 'Error al eliminar el curso',
      details: error instanceof Error ? error.message : 'Error desconocido'
    })
  }
})

export default router