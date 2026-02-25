import nodemailer from 'nodemailer';
import { ChatEmailData, ChatEmailResponse, ChatConfig } from '../types/chat.types';
import dotenv from 'dotenv';

dotenv.config();

export class ChatEmailService {
  private transporter: nodemailer.Transporter;
  private config: ChatConfig;

  constructor() {
    this.config = {
      rateLimit: {
        windowMs: parseInt(process.env.CHAT_RATE_LIMIT_WINDOW || '15') * 60 * 1000,
        maxRequests: parseInt(process.env.CHAT_RATE_LIMIT_MAX || '5')
      },
      email: {
        user: process.env.EMAIL_USER || 'infofrancaisintelligent@gmail.com',
        to: process.env.EMAIL_TO || 'infofrancaisintelligent@gmail.com',
        from: process.env.EMAIL_FROM || 'infofrancaisintelligent@gmail.com'
      }
    };

    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.config.email.user,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }

  async sendChatEmail(data: ChatEmailData): Promise<ChatEmailResponse> {
    try {
      const { name, email, message } = data;

      // Sanitizar inputs
      const sanitizedName = this.sanitizeInput(name);
      const sanitizedMessage = this.sanitizeInput(message);

      const mailOptions = {
        from: `"${sanitizedName}" <${this.config.email.from}>`,
        to: this.config.email.to,
        replyTo: email,
        subject: `💬 Mensaje del Chat: ${sanitizedName}`,
        text: this.generatePlainText({ name: sanitizedName, email, message: sanitizedMessage }),
        html: this.generateHTML({ name: sanitizedName, email, message: sanitizedMessage })
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      console.log(`✅ Email de chat enviado: ${info.messageId}`);
      
      return {
        success: true,
        message: 'Mensaje enviado exitosamente',
        messageId: info.messageId
      };
    } catch (error) {
      console.error('❌ Error enviando email de chat:', error);
      
      return {
        success: false,
        message: 'Error al enviar el mensaje',
        error: error instanceof Error ? error.message : 'Error desconocido'
      };
    }
  }

  private sanitizeInput(input: string): string {
    return input
      .replace(/[<>]/g, '') // Eliminar etiquetas HTML
      .trim()
      .substring(0, 1000); // Limitar longitud
  }

  private generatePlainText(data: ChatEmailData): string {
    const { name, email, message } = data;
    return `
      MENSAJE DEL CHAT FLOTANTE
      =========================
      
      📋 Remitente:
      • Nombre: ${name}
      • Email: ${email}
      
      💬 Mensaje:
      ${message}
      
      ------------------------
      Enviado: ${new Date().toLocaleString('es-ES', { timeZone: 'America/Mexico_City' })}
      Dispositivo: Chat web
    `;
  }

  private generateHTML(data: ChatEmailData): string {
    const { name, email, message } = data;
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: 'Work Sans', Arial, sans-serif;
            line-height: 1.6;
            background-color: #F2F4F7;
            margin: 0;
            padding: 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .header {
            background: linear-gradient(135deg, #150354 0%, #2a1a6e 100%);
            padding: 30px 20px;
            text-align: center;
          }
          .header h1 {
            font-family: 'Jua', Arial, sans-serif;
            color: white;
            font-size: 28px;
            margin: 0;
            letter-spacing: 1px;
          }
          .header p {
            color: #A8DADC;
            margin-top: 10px;
            font-size: 14px;
          }
          .content {
            padding: 30px;
          }
          .info-card {
            background: #F8F9FA;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            border-left: 4px solid #150354;
          }
          .info-card h3 {
            font-family: 'Jua', Arial, sans-serif;
            color: #150354;
            font-size: 18px;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .info-item {
            margin-bottom: 12px;
          }
          .label {
            font-weight: 600;
            color: #150354;
            font-size: 14px;
            display: block;
            margin-bottom: 4px;
          }
          .value {
            color: #333;
            font-size: 16px;
            background: white;
            padding: 8px 12px;
            border-radius: 8px;
            border: 1px solid #E5E7EB;
          }
          .message-card {
            background: #F8F9FA;
            border-radius: 12px;
            padding: 20px;
            border-left: 4px solid #E63946;
          }
          .message-card h3 {
            font-family: 'Jua', Arial, sans-serif;
            color: #E63946;
            font-size: 18px;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .message-content {
            background: white;
            padding: 15px;
            border-radius: 8px;
            border: 1px solid #E5E7EB;
            white-space: pre-wrap;
            font-style: italic;
          }
          .footer {
            background: #F2F4F7;
            padding: 20px;
            text-align: center;
            border-top: 1px solid #E5E7EB;
          }
          .footer p {
            color: #666;
            font-size: 12px;
            margin: 5px 0;
          }
          .footer small {
            color: #999;
            font-size: 11px;
          }
          .badge {
            display: inline-block;
            background: #A8DADC;
            color: #150354;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            margin-top: 10px;
          }
          @media only screen and (max-width: 480px) {
            .container {
              border-radius: 0;
            }
            .content {
              padding: 20px;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📬 Chat FrancésInteligente</h1>
            <p>Nuevo mensaje recibido</p>
          </div>
          
          <div class="content">
            <div class="info-card">
              <h3>📋 Información del contacto</h3>
              <div class="info-item">
                <span class="label">Nombre:</span>
                <div class="value">${name}</div>
              </div>
              <div class="info-item">
                <span class="label">Email:</span>
                <div class="value">
                  <a href="mailto:${email}" style="color: #150354; text-decoration: none;">
                    ${email}
                  </a>
                </div>
              </div>
            </div>
            
            <div class="message-card">
              <h3>💬 Mensaje</h3>
              <div class="message-content">
                ${message.replace(/\n/g, '<br>')}
              </div>
            </div>
            
            <div style="margin-top: 20px; padding: 15px; background: #FFF3E0; border-radius: 8px; border-left: 4px solid #FF9800;">
              <p style="color: #666; font-size: 13px; margin: 0;">
                ⚡ Este mensaje fue enviado desde el chat flotante de la aplicación.
                Puedes responder directamente a <strong>${email}</strong> para contactar al usuario.
              </p>
            </div>
          </div>
          
          <div class="footer">
            <p>📱 Enviado desde el chat en vivo</p>
            <p>🕐 ${new Date().toLocaleString('es-ES', { 
              timeZone: 'America/Mexico_City',
              dateStyle: 'full',
              timeStyle: 'short'
            })}</p>
            <div class="badge">
              FrancésInteligente
            </div>
            <small style="display: block; margin-top: 15px;">
              Este es un mensaje automático del sistema de chat
            </small>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  getConfig() {
    return this.config;
  }
}