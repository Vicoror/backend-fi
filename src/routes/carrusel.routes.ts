import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();
const prisma = new PrismaClient();

// ============================================
// RUTAS PÚBLICAS
// ============================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const items = await prisma.carruselItem.findMany({
      where: {
        activo: true,
        fechaInicio: { lte: now },
        fechaFin: { gte: now },
      },
      orderBy: { orden: 'asc' },
    });
    res.json(items);
  } catch (error) {
    console.error('Error al obtener carrusel:', error);
    res.status(500).json({ error: 'Error al obtener carrusel' });
  }
});

// ============================================
// RUTAS DE ADMINISTRACIÓN
// ============================================
router.get('/admin', async (req: Request, res: Response) => {
  try {
    const items = await prisma.carruselItem.findMany({
      orderBy: { orden: 'asc' },
    });
    res.json(items);
  } catch (error) {
    console.error('Error al obtener items:', error);
    res.status(500).json({ error: 'Error al obtener items' });
  }
});

// POST - Crear nuevo item
router.post('/', async (req: Request, res: Response) => {
  try {
    const { titulo, tipo, url, link, orden, fechaInicio, fechaFin, activo } = req.body;

    // Validaciones básicas
    if (!titulo || !tipo || !url || !orden || !fechaInicio || !fechaFin) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    const ordenNum = parseInt(orden);
    if (isNaN(ordenNum) || ordenNum < 1 || ordenNum > 5) {
      return res.status(400).json({ error: 'Orden debe ser un número entre 1 y 5' });
    }

    // Validar que no haya más de 5 items
    const totalItems = await prisma.carruselItem.count();
    if (totalItems >= 5) {
      return res.status(400).json({ error: 'Máximo 5 items permitidos' });
    }

    // Verificar si el orden ya está ocupado
    const existingOrder = await prisma.carruselItem.findUnique({
      where: { orden: ordenNum }
    });

    if (existingOrder) {
      // Reordenar items existentes (correr hacia adelante)
      await prisma.$transaction(async (tx) => {
        const itemsToUpdate = await tx.carruselItem.findMany({
          where: { orden: { gte: ordenNum } },
          orderBy: { orden: 'desc' }
        });

        for (const item of itemsToUpdate) {
          await tx.carruselItem.update({
            where: { id: item.id },
            data: { orden: item.orden + 1 }
          });
        }
      });
    }

    // Crear el item
    const newItem = await prisma.carruselItem.create({
      data: {
        titulo,
        tipo,
        url,
        link: link || null,
        orden: ordenNum,
        fechaInicio: new Date(fechaInicio),
        fechaFin: new Date(fechaFin),
        activo: activo === true || activo === 'true',
      },
    });

    res.status(201).json(newItem);
  } catch (error) {
    console.error('Error al crear item:', error);
    res.status(500).json({ error: 'Error al crear item' });
  }
});

// PATCH - Actualizar orden específicamente
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { orden } = req.body;

    if (orden === undefined) {
      return res.status(400).json({ error: 'Orden requerido' });
    }

    const newOrden = parseInt(orden);
    if (isNaN(newOrden) || newOrden < 1 || newOrden > 5) {
      return res.status(400).json({ error: 'Orden debe ser un número entre 1 y 5' });
    }

    // Obtener el item actual
    const currentItem = await prisma.carruselItem.findUnique({
      where: { id }
    });

    if (!currentItem) {
      return res.status(404).json({ error: 'Item no encontrado' });
    }

    // Si el orden es el mismo, no hacer nada
    if (currentItem.orden === newOrden) {
      return res.json(currentItem);
    }

    // Usar transacción para reordenar
    await prisma.$transaction(async (tx) => {
      if (currentItem.orden < newOrden) {
        // Mover hacia adelante: los items entre medias retroceden
        await tx.carruselItem.updateMany({
          where: {
            orden: {
              gt: currentItem.orden,
              lte: newOrden
            }
          },
          data: { orden: { decrement: 1 } }
        });
      } else {
        // Mover hacia atrás: los items entre medias avanzan
        await tx.carruselItem.updateMany({
          where: {
            orden: {
              gte: newOrden,
              lt: currentItem.orden
            }
          },
          data: { orden: { increment: 1 } }
        });
      }

      // Actualizar el item
      await tx.carruselItem.update({
        where: { id },
        data: { orden: newOrden }
      });
    });

    // Obtener todos los items actualizados
    const updatedItems = await prisma.carruselItem.findMany({
      orderBy: { orden: 'asc' }
    });

    res.json(updatedItems);
  } catch (error) {
    console.error('Error al actualizar orden:', error);
    res.status(500).json({ error: 'Error al actualizar orden' });
  }
});

// PUT - Actualizar item completo
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Validar que el item existe
    const existingItem = await prisma.carruselItem.findUnique({
      where: { id }
    });

    if (!existingItem) {
      return res.status(404).json({ error: 'Item no encontrado' });
    }

    // Si se está actualizando el orden, usar la misma lógica que PATCH
    if (updateData.orden !== undefined && updateData.orden !== existingItem.orden) {
      const newOrden = parseInt(updateData.orden);
      
      await prisma.$transaction(async (tx) => {
        if (existingItem.orden < newOrden) {
          await tx.carruselItem.updateMany({
            where: {
              orden: {
                gt: existingItem.orden,
                lte: newOrden
              }
            },
            data: { orden: { decrement: 1 } }
          });
        } else {
          await tx.carruselItem.updateMany({
            where: {
              orden: {
                gte: newOrden,
                lt: existingItem.orden
              }
            },
            data: { orden: { increment: 1 } }
          });
        }
      });
    }

    // Actualizar el item
    const updatedItem = await prisma.carruselItem.update({
      where: { id },
      data: {
        titulo: updateData.titulo,
        tipo: updateData.tipo,
        url: updateData.url,
        link: updateData.link,
        orden: updateData.orden ? parseInt(updateData.orden) : undefined,
        fechaInicio: updateData.fechaInicio ? new Date(updateData.fechaInicio) : undefined,
        fechaFin: updateData.fechaFin ? new Date(updateData.fechaFin) : undefined,
        activo: updateData.activo !== undefined ? updateData.activo : undefined,
      },
    });

    res.json(updatedItem);
  } catch (error) {
    console.error('Error al actualizar item:', error);
    res.status(500).json({ error: 'Error al actualizar item' });
  }
});

// DELETE - Eliminar item
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const item = await prisma.carruselItem.findUnique({
      where: { id }
    });

    if (!item) {
      return res.status(404).json({ error: 'Item no encontrado' });
    }

    await prisma.$transaction(async (tx) => {
      // Eliminar el item
      await tx.carruselItem.delete({
        where: { id }
      });

      // Reordenar los items restantes
      await tx.carruselItem.updateMany({
        where: { orden: { gt: item.orden } },
        data: { orden: { decrement: 1 } }
      });
    });

    res.json({ message: 'Item eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar item:', error);
    res.status(500).json({ error: 'Error al eliminar item' });
  }
});

export default router;