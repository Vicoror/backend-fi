export interface ChatEmailData {
  name: string;
  email: string;
  message: string;
}

export interface ChatEmailResponse {
  success: boolean;
  message: string;
  error?: string;
  messageId?: string;
}

export interface ChatApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp?: string;
}

export interface ChatConfig {
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  email: {
    user: string;
    to: string;
    from: string;
  };
}