// backend/src/routes/temarios.routes.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { uploadToCloudinary } from '../lib/cloudinary';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';

const router = Router();
const prisma = new PrismaClient();

// Configurar multer con tipos correctos
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Obtener todos los temarios
router.get('/temarios', async (req, res) => {
  try {
    const temarios = await prisma.temario.findMany({
      include: {
        temas: {
          include: {
            subtemas: {
              orderBy: {
                orden: 'asc'
              }
            }
          },
          orderBy: {
            orden: 'asc'
          }
        }
      },
      orderBy: {
        nivel: 'asc'
      }
    });
    res.json(temarios);
  } catch (error) {
    console.error('Error al obtener temarios:', error);
    res.status(500).json({ error: 'Error al obtener temarios' });
  }
});

// Obtener temario por nivel
router.get('/temarios/nivel/:nivel', async (req, res) => {
  try {
    const { nivel } = req.params;
    const temario = await prisma.temario.findFirst({
      where: { nivel },
      include: {
        temas: {
          include: {
            subtemas: {
              orderBy: {
                orden: 'asc'
              }
            }
          },
          orderBy: {
            orden: 'asc'
          }
        }
      }
    });
    
    if (!temario) {
      return res.status(404).json({ error: 'Temario no encontrado para este nivel' });
    }
    
    res.json(temario);
  } catch (error) {
    console.error('Error al obtener temario:', error);
    res.status(500).json({ error: 'Error al obtener temario' });
  }
});

// Obtener temario por ID
router.get('/temarios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const temario = await prisma.temario.findUnique({
      where: { id },
      include: {
        temas: {
          include: {
            subtemas: {
              orderBy: {
                orden: 'asc'
              }
            }
          },
          orderBy: {
            orden: 'asc'
          }
        }
      }
    });
    
    if (!temario) {
      return res.status(404).json({ error: 'Temario no encontrado' });
    }
    
    res.json(temario);
  } catch (error) {
    console.error('Error al obtener temario:', error);
    res.status(500).json({ error: 'Error al obtener temario' });
  }
});

// Crear nuevo temario
router.post('/temarios', async (req, res) => {
  try {
    const { nivel, tituloGeneral, temas } = req.body;
    
    // Validaciones
    if (!nivel) {
      return res.status(400).json({ error: 'El nivel es requerido' });
    }
    
    if (!tituloGeneral) {
      return res.status(400).json({ error: 'El título general es requerido' });
    }
    
    if (!temas || !Array.isArray(temas)) {
      return res.status(400).json({ error: 'Los temas deben ser un array' });
    }
    
    // Verificar si ya existe un temario para este nivel
    const existingTemario = await prisma.temario.findFirst({
      where: { nivel }
    });
    
    if (existingTemario) {
      return res.status(400).json({ error: 'Ya existe un temario para este nivel' });
    }
    
    // Preparar datos para creación
    const temasData = temas.map((tema: any, index: number) => {
      // Validar que cada tema tenga título
      if (!tema.titulo) {
        throw new Error(`El tema ${index + 1} no tiene título`);
      }
      
      return {
        titulo: tema.titulo,
        material: tema.material || null,
        orden: index,
        subtemas: {
          create: tema.subtemas && Array.isArray(tema.subtemas) 
            ? tema.subtemas.map((subtema: any, subIndex: number) => ({
                tipo: subtema.tipo || 'EJERCICIO',
                titulo: subtema.titulo || 'Sin título',
                material: subtema.material || '',
                orden: subIndex
              }))
            : []
        }
      };
    });
    
    const temario = await prisma.temario.create({
      data: {
        nivel,
        tituloGeneral,
        temas: {
          create: temasData
        }
      },
      include: {
        temas: {
          include: {
            subtemas: {
              orderBy: {
                orden: 'asc'
              }
            }
          },
          orderBy: {
            orden: 'asc'
          }
        }
      }
    });
    
    res.status(201).json(temario);
  } catch (error) {
    console.error('Error detallado al crear temario:', error);
    res.status(500).json({ 
      error: 'Error al crear temario',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Actualizar temario completo
router.put('/temarios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nivel, tituloGeneral, temas } = req.body;
    
    // Validaciones
    if (!nivel) {
      return res.status(400).json({ error: 'El nivel es requerido' });
    }
    
    if (!tituloGeneral) {
      return res.status(400).json({ error: 'El título general es requerido' });
    }
    
    if (!temas || !Array.isArray(temas)) {
      return res.status(400).json({ error: 'Los temas deben ser un array' });
    }
    
    // Verificar si el temario existe
    const temarioExists = await prisma.temario.findUnique({
      where: { id }
    });
    
    if (!temarioExists) {
      return res.status(404).json({ error: 'Temario no encontrado' });
    }
    
    // Verificar si el nivel ya existe en otro temario
    if (nivel !== temarioExists.nivel) {
      const existingTemario = await prisma.temario.findFirst({
        where: { 
          nivel,
          NOT: { id }
        }
      });
      
      if (existingTemario) {
        return res.status(400).json({ error: 'Ya existe un temario con este nivel' });
      }
    }
    
    // Eliminar temas existentes y sus subtemas (cascada)
    await prisma.tema.deleteMany({
      where: { temarioId: id }
    });
    
    // Preparar nuevos temas
    const temasData = temas.map((tema: any, index: number) => {
      // Validar que cada tema tenga título
      if (!tema.titulo) {
        throw new Error(`El tema ${index + 1} no tiene título`);
      }
      
      return {
        titulo: tema.titulo,
        material: tema.material || null,
        orden: index,
        subtemas: {
          create: tema.subtemas && Array.isArray(tema.subtemas)
            ? tema.subtemas.map((subtema: any, subIndex: number) => ({
                tipo: subtema.tipo || 'EJERCICIO',
                titulo: subtema.titulo || 'Sin título',
                material: subtema.material || '',
                orden: subIndex
              }))
            : []
        }
      };
    });
    
    // Actualizar temario con nuevos temas
    const temario = await prisma.temario.update({
      where: { id },
      data: {
        nivel,
        tituloGeneral,
        temas: {
          create: temasData
        }
      },
      include: {
        temas: {
          include: {
            subtemas: {
              orderBy: {
                orden: 'asc'
              }
            }
          },
          orderBy: {
            orden: 'asc'
          }
        }
      }
    });
    
    res.json(temario);
  } catch (error) {
    console.error('Error detallado al actualizar temario:', error);
    res.status(500).json({ 
      error: 'Error al actualizar temario',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Actualizar parcialmente un temario (PATCH)
router.patch('/temarios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nivel, tituloGeneral } = req.body;
    
    const updateData: any = {};
    
    if (nivel) updateData.nivel = nivel;
    if (tituloGeneral) updateData.tituloGeneral = tituloGeneral;
    
    const temario = await prisma.temario.update({
      where: { id },
      data: updateData,
      include: {
        temas: {
          include: {
            subtemas: true
          }
        }
      }
    });
    
    res.json(temario);
  } catch (error) {
    console.error('Error al actualizar parcialmente temario:', error);
    res.status(500).json({ error: 'Error al actualizar temario' });
  }
});

// Eliminar temario
router.delete('/temarios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar si el temario existe
    const temario = await prisma.temario.findUnique({
      where: { id }
    });
    
    if (!temario) {
      return res.status(404).json({ error: 'Temario no encontrado' });
    }
    
    // Eliminar temario (los temas y subtemas se eliminarán en cascada si configuraste onDelete: Cascade)
    await prisma.temario.delete({
      where: { id }
    });
    
    res.json({ message: 'Temario eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar temario:', error);
    res.status(500).json({ error: 'Error al eliminar temario' });
  }
});

// Subir archivo a Cloudinary
router.post('/temarios/upload', upload.single('file'), async (req: any, res: any) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó ningún archivo' });
    }
    
    // Validar tipo de archivo
    const allowedMimes = [
      'application/pdf',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/jpg'
    ];
    
    if (!allowedMimes.includes(req.file.mimetype)) {
      return res.status(400).json({ 
        error: 'Tipo de archivo no permitido. Permitidos: PDF, PPT, Word, Excel, Imágenes' 
      });
    }
    
    const result = await uploadToCloudinary(req.file.buffer, {
      folder: 'temarios',
      resource_type: 'auto'
    });
    
    res.json({ 
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      size: result.bytes
    });
  } catch (error) {
    console.error('Error al subir archivo:', error);
    res.status(500).json({ error: 'Error al subir archivo' });
  }
});

// Eliminar archivo de Cloudinary
router.delete('/temarios/delete-file/:publicId', async (req, res) => {
  try {
    const { publicId } = req.params;
    
    if (!publicId) {
      return res.status(400).json({ error: 'Public ID es requerido' });
    }
    
    const result = await cloudinary.uploader.destroy(publicId);
    
    if (result.result === 'ok') {
      res.json({ message: 'Archivo eliminado correctamente' });
    } else {
      res.status(400).json({ error: 'Error al eliminar archivo' });
    }
  } catch (error) {
    console.error('Error al eliminar archivo:', error);
    res.status(500).json({ error: 'Error al eliminar archivo' });
  }
});

// Obtener estadísticas de temarios
router.get('/temarios/stats/summary', async (req, res) => {
  try {
    const totalTemarios = await prisma.temario.count();
    const totalTemas = await prisma.tema.count();
    const totalSubtemas = await prisma.subtema.count();
    
    const temariosPorNivel = await prisma.temario.groupBy({
      by: ['nivel'],
      _count: {
        id: true
      }
    });
    
    res.json({
      totalTemarios,
      totalTemas,
      totalSubtemas,
      temariosPorNivel
    });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

export default router;