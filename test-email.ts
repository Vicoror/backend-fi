import { config } from 'dotenv';
import { Resend } from 'resend';

// ✅ FORZAR CARGA DE .env
config({ path: '.env.local' });

const RESEND_API_KEY = process.env.RESEND_API_KEY;

console.log('🔑 API Key:', RESEND_API_KEY ? '✅ Cargada' : '❌ NO Cargada');
console.log('- Primeros 10:', RESEND_API_KEY?.substring(0, 10) + '...');

if (!RESEND_API_KEY) {
  console.error('❌ Error: RESEND_API_KEY no está definida en .env.local');
  process.exit(1);
}

const resend = new Resend(RESEND_API_KEY);

async function testEmail() {
  try {
    console.log('📧 Enviando email de prueba...');
    
    const { data, error } = await resend.emails.send({
      from: 'Français Intelligent <onboarding@resend.dev>',
      to: ['TU_EMAIL@ejemplo.com'], // ← CAMBIA ESTO POR TU CORREO
      subject: '✅ Test desde backend',
      html: `
        <h1>¡Funciona!</h1>
        <p>El envío de emails está configurado correctamente.</p>
        <p>Timestamp: ${new Date().toLocaleString()}</p>
      `
    });

    if (error) {
      console.error('❌ Error de Resend:', error);
    } else {
      console.log('✅ Email enviado exitosamente!');
      console.log('📬 ID:', data?.id);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testEmail();