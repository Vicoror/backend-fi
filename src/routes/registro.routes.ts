import { Router } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import { transporter } from '../lib/nodemailer'; // ✅ CAMBIADO A NODEMAILER

const router = Router();

// Generar folio único para estudiante
async function generarFolio(): Promise<string> {
  const ultimo = await prisma.user.findFirst({
    where: { role: 'STUDENT' },
    orderBy: { folio: 'desc' },
    select: { folio: true }
  });

  let numero = 1;
  if (ultimo?.folio) {
    const match = ultimo.folio.match(/EST(\d+)/);
    numero = match ? parseInt(match[1]) + 1 : 1;
  }

  return `EST${String(numero).padStart(3, '0')}`;
}

// POST /registro
router.post('/', async (req, res) => {
  try {
    const { 
      email, 
      nombre, 
      apellidoPaterno, 
      apellidoMaterno, 
      telefono, 
      cursoId,
      password
    } = req.body;

    // Validaciones básicas
    if (!email || !nombre || !apellidoPaterno || !telefono || !cursoId || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Todos los campos obligatorios deben completarse' 
      });
    }

    // Validación password backend
    if (
      password.length < 8 ||
      !/[A-Z]/.test(password) ||
      !/\d/.test(password) ||
      !/[^A-Za-z0-9]/.test(password)
    ) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña no cumple requisitos de seguridad'
      });
    }

    const curso = await prisma.course.findUnique({
      where: { id: cursoId }
    });

    if (!curso) {
      return res.status(404).json({ success: false, message: 'Curso no encontrado' });
    }

    if (curso.alumnosInscritos >= curso.cupoMaximo) {
      return res.status(400).json({ success: false, message: 'Sin cupo disponible' });
    }

    const usuarioExistente = await prisma.user.findUnique({
      where: { email },
      include: { profile: true }
    });

    let userId: string;
    let folio: string;
    let esNuevoUsuario: boolean;

    if (usuarioExistente) {
      await prisma.profile.update({
        where: { userId: usuarioExistente.id },
        data: {
          nombre,
          apellidoPaterno,
          apellidoMaterno: apellidoMaterno || null,
          telefono
        }
      });

      userId = usuarioExistente.id;
      folio = usuarioExistente.folio;
      esNuevoUsuario = false;

    } else {
      folio = await generarFolio();
      const hashedPassword = await bcrypt.hash(password, 10);

      const nuevoUsuario = await prisma.user.create({
        data: {
          folio,
          email,
          password: hashedPassword,
          role: 'STUDENT',
          status: 'INACTIVE'
        }
      });

      userId = nuevoUsuario.id;

      await prisma.profile.create({
        data: {
          userId: nuevoUsuario.id,
          nombre,
          apellidoPaterno,
          apellidoMaterno: apellidoMaterno || null,
          telefono
        }
      });

      esNuevoUsuario = true;

      // ✅ EMAIL CON NODEMAILER
      try {
        if (process.env.SMTP_HOST) {
          await transporter.sendMail({
            from: `"Français Intelligent" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
            to: email,
            subject: '🎓 Bienvenido a Français Intelligent',
            html: `<p>Hola ${nombre}, tu cuenta fue creada exitosamente.</p>
                   <p>Tu folio es: <strong>${folio}</strong></p>
                   <p>Ya puedes completar tu inscripción.</p>`
          });
          console.log('✅ Email de bienvenida enviado');
        }
      } catch (error) {
        console.error('❌ Error enviando email:', error);
      }
    }

    res.status(201).json({
      success: true,
      data: {
        userId,
        folio,
        email,
        cursoId: curso.id,
        cursoNombre: `${curso.nivel} ${curso.subnivel || ''}`.trim(),
        precio: curso.precio,
        esNuevoUsuario
      }
    });

  } catch (error) {
    console.error('❌ Error en registro:', error);
    res.status(500).json({ success: false, message: 'Error al procesar el registro' });
  }
});

export default router;