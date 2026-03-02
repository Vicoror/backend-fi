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
  const startTime = Date.now();
  console.log('\n========== 🔵 PUT /api/carrusel/:id ==========');
  console.log(`🆔 ID recibido: ${req.params.id}`);
  console.log(`📦 Body recibido:`, JSON.stringify(req.body, null, 2));
  console.log(`🌐 URL completa: ${req.protocol}://${req.get('host')}${req.originalUrl}`);

  try {
    const { id } = req.params;
    const updateData = req.body;

    // PASO 1: Verificar formato del ID
    console.log(`\n📋 PASO 1 - Validando ID: ${id}`);
    if (!id || id.length < 10) {
      console.log('❌ ID inválido o demasiado corto');
      return res.status(400).json({ error: 'ID inválido' });
    }

    // PASO 2: Verificar conexión a la base de datos
    console.log(`\n📋 PASO 2 - Verificando conexión a DB...`);
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log('✅ Conexión a DB exitosa');
    } catch (dbError) {
      console.error('❌ Error de conexión a DB:', dbError);
      return res.status(500).json({ 
        error: 'Error de conexión a base de datos',
        details: dbError instanceof Error ? dbError.message : String(dbError)
      });
    }

    // PASO 3: Buscar el item por ID
    console.log(`\n📋 PASO 3 - Buscando item con ID: ${id}`);
    let existingItem;
    try {
      existingItem = await prisma.carruselItem.findUnique({
        where: { id }
      });
      
      if (!existingItem) {
        console.log(`❌ Item NO encontrado para ID: ${id}`);
        // Listar todos los IDs disponibles para debugging
        const allItems = await prisma.carruselItem.findMany({
          select: { id: true, titulo: true, orden: true }
        });
        console.log('📋 IDs disponibles en DB:', allItems.map(i => ({ id: i.id, titulo: i.titulo })));
        
        return res.status(404).json({ 
          error: 'Item no encontrado',
          message: `No existe item con ID: ${id}`
        });
      }
      console.log('✅ Item encontrado:', {
        id: existingItem.id,
        titulo: existingItem.titulo,
        orden: existingItem.orden,
        tipo: existingItem.tipo
      });
    } catch (findError) {
      console.error('❌ Error al buscar item:', findError);
      return res.status(500).json({ 
        error: 'Error al buscar item',
        details: findError instanceof Error ? findError.message : String(findError)
      });
    }

    // PASO 4: Validar datos de actualización
    console.log(`\n📋 PASO 4 - Validando datos de actualización...`);
    const dataToUpdate: any = {};

    // Validar título
    if (updateData.titulo !== undefined) {
      if (typeof updateData.titulo !== 'string' || updateData.titulo.trim() === '') {
        return res.status(400).json({ error: 'Título inválido' });
      }
      dataToUpdate.titulo = updateData.titulo;
      console.log(`  - Título: "${existingItem.titulo}" -> "${updateData.titulo}"`);
    }

    // Validar tipo
    if (updateData.tipo !== undefined) {
      if (!['IMAGEN', 'VIDEO'].includes(updateData.tipo)) {
        return res.status(400).json({ error: 'Tipo inválido' });
      }
      dataToUpdate.tipo = updateData.tipo;
      console.log(`  - Tipo: ${existingItem.tipo} -> ${updateData.tipo}`);
    }

    // Validar URL
    if (updateData.url !== undefined) {
      if (typeof updateData.url !== 'string' || !updateData.url.startsWith('http')) {
        return res.status(400).json({ error: 'URL inválida' });
      }
      dataToUpdate.url = updateData.url;
      console.log(`  - URL: actualizada (${updateData.url.substring(0, 50)}...)`);
    }

    // Validar link
    if (updateData.link !== undefined) {
      dataToUpdate.link = updateData.link || null;
      console.log(`  - Link: ${updateData.link || 'ninguno'}`);
    }

    // Validar fechas
    if (updateData.fechaInicio !== undefined) {
      const fecha = new Date(updateData.fechaInicio);
      if (isNaN(fecha.getTime())) {
        return res.status(400).json({ error: 'Fecha de inicio inválida' });
      }
      dataToUpdate.fechaInicio = fecha;
      console.log(`  - Fecha Inicio: ${updateData.fechaInicio}`);
    }

    if (updateData.fechaFin !== undefined) {
      const fecha = new Date(updateData.fechaFin);
      if (isNaN(fecha.getTime())) {
        return res.status(400).json({ error: 'Fecha de fin inválida' });
      }
      dataToUpdate.fechaFin = fecha;
      console.log(`  - Fecha Fin: ${updateData.fechaFin}`);
    }

    // Validar activo
    if (updateData.activo !== undefined) {
      dataToUpdate.activo = updateData.activo === true || updateData.activo === 'true';
      console.log(`  - Activo: ${dataToUpdate.activo}`);
    }

    // PASO 5: Procesar cambio de orden (si existe)
    if (updateData.orden !== undefined) {
      console.log(`\n📋 PASO 5 - Procesando cambio de orden...`);
      const newOrden = parseInt(updateData.orden);
      
      if (isNaN(newOrden) || newOrden < 1 || newOrden > 5) {
        return res.status(400).json({ error: 'Orden debe ser número entre 1 y 5' });
      }

      console.log(`  - Orden actual: ${existingItem.orden}, Nuevo orden: ${newOrden}`);

      if (newOrden !== existingItem.orden) {
        try {
          await prisma.$transaction(async (tx) => {
            if (existingItem.orden < newOrden) {
              // Mover hacia adelante
              console.log(`  ➡️ Moviendo hacia adelante: items entre ${existingItem.orden + 1} y ${newOrden} retroceden -1`);
              await tx.carruselItem.updateMany({
                where: { 
                  orden: { 
                    gt: existingItem.orden, 
                    lte: newOrden 
                  } 
                },
                data: { orden: { decrement: 1 } }
              });
            } else if (existingItem.orden > newOrden) {
              // Mover hacia atrás
              console.log(`  ⬅️ Moviendo hacia atrás: items entre ${newOrden} y ${existingItem.orden - 1} avanzan +1`);
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
          console.log('✅ Reordenamiento completado');
          dataToUpdate.orden = newOrden;
        } catch (orderError) {
          console.error('❌ Error en reordenamiento:', orderError);
          return res.status(500).json({ 
            error: 'Error al reordenar items',
            details: orderError instanceof Error ? orderError.message : String(orderError)
          });
        }
      } else {
        console.log('  ℹ️ El orden no cambió');
      }
    }

    // PASO 6: Actualizar el item
    console.log(`\n📋 PASO 6 - Actualizando item con datos:`, dataToUpdate);
    
    let updatedItem;
    try {
      updatedItem = await prisma.carruselItem.update({
        where: { id },
        data: dataToUpdate,
      });
      console.log('✅ Item actualizado exitosamente:', {
        id: updatedItem.id,
        titulo: updatedItem.titulo,
        orden: updatedItem.orden
      });
    } catch (updateError) {
      console.error('❌ Error en update:', updateError);
      
      // Verificar si es error de clave única (orden duplicado)
      if (updateError instanceof Error && updateError.message.includes('Unique constraint')) {
        return res.status(409).json({ 
          error: 'Conflicto de orden',
          message: 'El orden especificado ya está ocupado'
        });
      }
      
      return res.status(500).json({ 
        error: 'Error al actualizar item',
        details: updateError instanceof Error ? updateError.message : String(updateError)
      });
    }

    const elapsedTime = Date.now() - startTime;
    console.log(`\n✅✅✅ PUT completado en ${elapsedTime}ms`);

    // PASO 7: Opcional - obtener todos los items para refrescar
    const allItems = await prisma.carruselItem.findMany({
      orderBy: { orden: 'asc' }
    });

    res.json({
      message: 'Item actualizado correctamente',
      updatedItem,
      allItems // Opcional: enviar todos los items actualizados
    });

  } catch (error) {
    console.error('\n❌❌❌ Error CRÍTICO no manejado:', error);
    const elapsedTime = Date.now() - startTime;
    console.log(`⏱️ Tiempo hasta error: ${elapsedTime}ms`);
    
    res.status(500).json({ 
      error: 'Error interno del servidor',
      message: error instanceof Error ? error.message : 'Error desconocido',
      time: elapsedTime
    });
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