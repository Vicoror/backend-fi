import { Router } from 'express';
import { prisma} from '../lib/prisma';
import bcrypt from 'bcryptjs';
import { transporter } from '../lib/nodemailer';

const router = Router();

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

router.post('/', async (req, res) => {
  try {
    const { 
      email, 
      nombre, 
      apellidoPaterno, 
      apellidoMaterno, 
      telefono, 
      estado, 
      cursoId,
      password
    } = req.body;

    // Validaciones básicas
    if (!email || !nombre || !apellidoPaterno || !telefono || !estado || !cursoId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Todos los campos obligatorios deben completarse' 
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
    let mensaje: string;

    if (usuarioExistente) {
      // ✅ CASO 1: CORREO EXISTENTE - NO VALIDAR PASSWORD
      // Solo actualizamos datos del perfil, NUNCA la contraseña
      await prisma.profile.update({
        where: { userId: usuarioExistente.id },
        data: {
          nombre,
          apellidoPaterno,
          apellidoMaterno: apellidoMaterno || null,
          telefono,
          estado,   
        }
      });

      userId = usuarioExistente.id;
      folio = usuarioExistente.folio;
      esNuevoUsuario = false;
      mensaje = 'CORREO_EXISTENTE';

      console.log(`📧 Usuario existente: ${email} - Actualizando perfil`);

      // Responder sin validar password
      return res.status(200).json({
        success: true,
        message: mensaje,
        data: {
          userId,
          folio,
          email: usuarioExistente.email,
          nombre: usuarioExistente.profile?.nombre || nombre,
          apellidoPaterno: usuarioExistente.profile?.apellidoPaterno || apellidoPaterno,
          apellidoMaterno: usuarioExistente.profile?.apellidoMaterno || apellidoMaterno,
          telefono: usuarioExistente.profile?.telefono || telefono,
          estado: usuarioExistente.profile?.estado || estado,
          cursoId: curso.id,
          cursoNombre: `${curso.nivel} ${curso.subnivel || ''}`.trim(),
          precio: curso.precio,
          esNuevoUsuario: false
        }
      });

    } else {
      // ✅ CASO 2: NUEVO USUARIO - Validar password
      if (!password) {
        return res.status(400).json({ 
          success: false, 
          message: 'La contraseña es obligatoria para nuevos usuarios' 
        });
      }

      // Validación password solo para nuevos usuarios
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
          telefono,
          estado,   
        }
      });

      esNuevoUsuario = true;
      mensaje = 'NUEVO_USUARIO';

      // Email de bienvenida solo para nuevos usuarios
      try {
        if (process.env.SMTP_HOST) {
          await transporter.sendMail({
            from: `"Français Intelligent" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
            to: email,
            subject: '🎓 Bienvenid@ a Français Intelligent',
            html: `<p>Bonjour ${nombre}, tu cuenta fue creada exitosamente.</p>
                   <p>Ya puedes completar tu inscripción realizando el pago.</p>`
          });
        }
      } catch (error) {
        console.error('❌ Error enviando email:', error);
      }

      res.status(201).json({
        success: true,
        message: mensaje,
        data: {
          userId,
          folio,
          email,
          nombre,
          apellidoPaterno,
          apellidoMaterno,
          telefono,
          estado,
          cursoId: curso.id,
          cursoNombre: `${curso.nivel} ${curso.subnivel || ''}`.trim(),
          precio: curso.precio,
          esNuevoUsuario: true
        }
      });
    }

  } catch (error) {
    console.error('❌ Error en registro:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al procesar el registro'
    });
  }
});

export default router;