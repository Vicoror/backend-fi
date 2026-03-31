// backend/src/routes/tareas.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { upload, uploadToCloudinary } from '../middlewares/upload';
import cloudinary from '../lib/cloudinary';

const router = Router();
const prisma = new PrismaClient();

// Obtener todas las tareas (Admin) - agrupadas por nivel
router.get('/', async (req, res) => {
  try {
    const { nivel, activo } = req.query;
    const where: any = {};
    if (nivel) where.nivel = nivel;
    if (activo !== undefined) where.activo = activo === 'true';
    
    const tareas = await prisma.tarea.findMany({
      where,
      include: {
        entregas: {
          include: {
            user: {
              include: { profile: true }
            }
          }
        }
      },
      orderBy: { fechaLimite: 'asc' }
    });
    res.json(tareas);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener tareas' });
  }
});

// Obtener tareas para un alumno específico (incluye si ya las realizó)
router.get('/alumno/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { nivel } = req.query;
    
    // Obtener todas las tareas del nivel del alumno
    const tareas = await prisma.tarea.findMany({
      where: {
        nivel: nivel as string,
        activo: true
      },
      include: {
        entregas: {
          where: { userId },
          select: {
            id: true,
            realizada: true,
            calificacion: true,
            fechaEntrega: true
          }
        }
      },
      orderBy: { fechaLimite: 'asc' }
    });
    
    // Formatear respuesta con información de entrega
    const tareasConEstado = tareas.map(tarea => ({
      ...tarea,
      realizada: tarea.entregas[0]?.realizada || false,
      entregaId: tarea.entregas[0]?.id,
      calificacion: tarea.entregas[0]?.calificacion
    }));
    
    res.json(tareasConEstado);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener tareas del alumno' });
  }
});

// Crear tarea por nivel (Admin)
router.post('/', upload.single('archivo'), async (req, res) => {
  try {
    const { nivel, tipo, titulo, descripcion, fechaLimite, courseId, linkExterno } = req.body;
    
    let tareaUrl = '';
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, 'tareas');
      tareaUrl = result;
    } else if (linkExterno) {
      tareaUrl = linkExterno;
    } else {
      return res.status(400).json({ error: 'Debes subir un archivo o proporcionar un link' });
    }
    
    const nuevaTarea = await prisma.tarea.create({
      data: {
        nivel,
        tipo,
        titulo,
        descripcion,
        tarea: tareaUrl,
        fechaLimite: new Date(fechaLimite),
        activo: true,
        courseId
      }
    });
    
    // Crear entregas para todos los alumnos de ese nivel
    const alumnosDelNivel = await prisma.user.findMany({
      where: {
        enrollments: {
          some: {
            course: {
              nivel: nivel
            }
          }
        }
      }
    });
    
    // Crear registros de entrega para cada alumno
    await prisma.entregaTarea.createMany({
      data: alumnosDelNivel.map(alumno => ({
        tareaId: nuevaTarea.id,
        userId: alumno.id,
        realizada: false
      }))
    });
    
    res.status(201).json(nuevaTarea);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear tarea' });
  }
});

// Marcar tarea como realizada (Alumno)
router.patch('/entregar/:tareaId', async (req, res) => {
  try {
    const { tareaId } = req.params;
    const { userId, realizada } = req.body;
    
    const entrega = await prisma.entregaTarea.update({
      where: {
        tareaId_userId: {
          tareaId,
          userId
        }
      },
      data: {
        realizada,
        fechaEntrega: realizada ? new Date() : null
      }
    });
    
    // Actualizar estadísticas del alumno
    const tarea = await prisma.tarea.findUnique({
      where: { id: tareaId }
    });
    
    if (tarea) {
      await actualizarEstadisticas(userId, tarea.nivel);
    }
    
    res.json(entrega);
  } catch (error) {
    res.status(500).json({ error: 'Error al entregar tarea' });
  }
});

// Eliminar tarea (Admin)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tarea = await prisma.tarea.findUnique({ where: { id } });
    
    if (tarea && tarea.tarea.includes('cloudinary')) {
      const publicId = tarea.tarea.split('/').slice(-2).join('/').split('.')[0];
      await cloudinary.uploader.destroy(publicId);
    }
    
    // Eliminar también las entregas asociadas
    await prisma.entregaTarea.deleteMany({
      where: { tareaId: id }
    });
    
    await prisma.tarea.delete({ where: { id } });
    
    res.json({ message: 'Tarea eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar tarea' });
  }
});

// Obtener estadísticas por alumno
router.get('/estadisticas/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { nivel } = req.query;
    
    const estadisticas = await prisma.estadisticasTareas.findUnique({
      where: {
        userId_nivel: {
          userId,
          nivel: nivel as string
        }
      }
    });
    res.json(estadisticas);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

async function actualizarEstadisticas(userId: string, nivel: string) {
  const totalTareas = await prisma.entregaTarea.count({
    where: {
      userId,
      tarea: { nivel, activo: true }
    }
  });
  
  const tareasRealizadas = await prisma.entregaTarea.count({
    where: {
      userId,
      realizada: true,
      tarea: { nivel, activo: true }
    }
  });
  
  await prisma.estadisticasTareas.upsert({
    where: { userId_nivel: { userId, nivel } },
    update: { totalTareas, tareasRealizadas, ultimaActualizacion: new Date() },
    create: { userId, nivel, totalTareas, tareasRealizadas }
  });
}

export default router;