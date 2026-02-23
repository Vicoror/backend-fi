import { Router } from 'express';
import { prisma} from '../lib/prisma';
import bcrypt from 'bcryptjs';
import { transporter } from '../lib/nodemailer';

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
      estado, 
      cursoId,
      password
    } = req.body;

    // Validaciones básicas
    if (!email || !nombre || !apellidoPaterno || !telefono || !estado|| !cursoId || !password) {
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
    let mensaje: string;

    if (usuarioExistente) {
      // ✅ CORREO YA REGISTRADO - Solo actualizamos datos del perfil, NO la contraseña
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
      mensaje = 'El correo ya está registrado. Se actualizaron tus datos y puedes proceder al pago.';

      console.log(`📧 Correo existente: ${email} - Actualizando perfil para compra`);

    } else {
      // ✅ NUEVO USUARIO - Creamos todo
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
      mensaje = 'Registro exitoso. Ahora puedes proceder al pago.';

      // Email de bienvenida SOLO para nuevos usuarios
      try {
        if (process.env.SMTP_HOST) {
          await transporter.sendMail({
            from: `"Français Intelligent" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
            to: email,
            subject: '🎓 Bienvenid@ a Français Intelligent',
            html: `<p>Bonjour ${nombre}, tu cuenta fue creada exitosamente.</p>
                   <p>Ya puedes completar tu inscripción realizando el pago.</p>`
          });
          console.log('✅ Email de bienvenida enviado a nuevo usuario');
        }
      } catch (error) {
        console.error('❌ Error enviando email:', error);
      }
    }

    // ✅ IMPORTANTE: Verificar si el usuario ya tiene una compra para este curso
    const compraExistente = await prisma.purchase.findFirst({
      where: {
        userId,
        courseId: curso.id
      }
    });

    res.status(201).json({
      success: true,
      message: mensaje,
      data: {
        userId,
        folio,
        email,
        cursoId: curso.id,
        cursoNombre: `${curso.nivel} ${curso.subnivel || ''}`.trim(),
        precio: curso.precio,
        esNuevoUsuario,
        yaInscrito: !!compraExistente, // Indica si ya compró este curso antes
        mensajeAdicional: usuarioExistente 
          ? 'ℹ️ Usa tu contraseña existente para iniciar sesión. La contraseña no se modificó.'
          : null
      }
    });

  } catch (error) {
    console.error('❌ Error en registro:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al procesar el registro'
    });
  }
});

export default router;