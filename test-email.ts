import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

async function testEmail() {
  try {
    const { data, error } = await resend.emails.send({
      from: 'Français Intelligent <onboarding@resend.dev>', // ← DOMINIO GRATIS DE RESEND
      to: ['vicoror@gmail.com'], // ← TU CORREO
      subject: 'Test desde backend',
      html: '<p>Funciona ✅</p>'
    });

    if (error) {
      console.error('❌ Error:', error);
    } else {
      console.log('✅ Email enviado:', data);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testEmail();