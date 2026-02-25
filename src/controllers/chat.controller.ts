import { Request, Response } from 'express';
import { ChatEmailService } from '../service/chat-email.service';
import { ChatEmailData, ChatApiResponse } from '../types/chat.types';

export class ChatController {
  private chatEmailService: ChatEmailService;

  constructor() {
    this.chatEmailService = new ChatEmailService();
  }

  sendMessage = async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, email, message } = req.body as ChatEmailData;

      // Validaciones exhaustivas
      const validationError = this.validateInput({ name, email, message });
      if (validationError) {
        const response: ChatApiResponse = {
          success: false,
          error: 'VALIDATION_ERROR',
          message: validationError,
          timestamp: new Date().toISOString()
        };
        res.status(400).json(response);
        return;
      }

      // Sanitizar inputs
      const sanitizedData: ChatEmailData = {
        name: this.sanitizeText(name, 100),
        email: email.toLowerCase().trim(),
        message: this.sanitizeText(message, 1000)
      };

      const result = await this.chatEmailService.sendChatEmail(sanitizedData);

      if (result.success) {
        const response: ChatApiResponse = {
          success: true,
          message: 'Mensaje enviado correctamente',
          data: {
            messageId: result.messageId,
            timestamp: new Date().toISOString()
          },
          timestamp: new Date().toISOString()
        };
        res.status(200).json(response);
      } else {
        const response: ChatApiResponse = {
          success: false,
          error: 'EMAIL_SENDING_ERROR',
          message: 'No se pudo enviar el mensaje. Intenta de nuevo.',
          timestamp: new Date().toISOString()
        };
        res.status(500).json(response);
      }
    } catch (error) {
      console.error('Error en ChatController:', error);
      
      const response: ChatApiResponse = {
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Error interno del servidor',
        timestamp: new Date().toISOString()
      };
      res.status(500).json(response);
    }
  };

  private validateInput(data: ChatEmailData): string | null {
    const { name, email, message } = data;

    if (!name || !email || !message) {
      return 'Todos los campos son obligatorios';
    }

    if (name.length < 2 || name.length > 100) {
      return 'El nombre debe tener entre 2 y 100 caracteres';
    }

    if (!this.isValidEmail(email)) {
      return 'El formato del email no es válido';
    }

    if (message.length < 5 || message.length > 1000) {
      return 'El mensaje debe tener entre 5 y 1000 caracteres';
    }

    // Prevenir SQL injection y XSS básico
    const hasInvalidChars = /[<>{}[\]$`\\]/.test(name + message);
    if (hasInvalidChars) {
      return 'El mensaje contiene caracteres no permitidos';
    }

    return null;
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  }

  private sanitizeText(text: string, maxLength: number): string {
    return text
      .replace(/[<>]/g, '')
      .trim()
      .substring(0, maxLength);
  }
}