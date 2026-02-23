import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// GET /usuarios/verificar?email=correo@ejemplo.com
router.get('/verificar', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ existe: false });
    }

    const usuario = await prisma.user.findUnique({
      where: { email: email as string },
      include: {
        profile: true
      }
    });

    if (usuario) {
      return res.json({
        existe: true,
        usuario: {
          userId: usuario.id,
          folio: usuario.folio,
          email: usuario.email,
          nombre: usuario.profile?.nombre || '',
          apellidoPaterno: usuario.profile?.apellidoPaterno || '',
          apellidoMaterno: usuario.profile?.apellidoMaterno || '',
          telefono: usuario.profile?.telefono || '',
          estado: usuario.profile?.estado || ''
        }
      });
    }

    res.json({ existe: false });

  } catch (error) {
    console.error('Error verificando email:', error);
    res.status(500).json({ existe: false });
  }
});

export default router;