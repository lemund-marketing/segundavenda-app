/**
 * Validation utilities for enhanced security
 */

/**
 * Validates Brazilian CPF using the proper algorithm with enhanced security
 * @param cpf - CPF string (can include formatting)
 * @returns boolean indicating if CPF is valid
 */
export function validateCPF(cpf: string): boolean {
  if (!cpf || typeof cpf !== 'string') return false;
  
  // Check for dangerous patterns before processing
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /vbscript:/i,
    /onload=/i,
    /onerror=/i,
    /data:/i
  ];
  
  if (dangerousPatterns.some(pattern => pattern.test(cpf))) return false;
  
  // Remove formatting
  const cleanCPF = cpf.replace(/[^\d]/g, '');
  
  // Check basic format
  if (cleanCPF.length !== 11) return false;
  
  // Check for repeated digits (invalid CPFs)
  if (/^(\d)\1{10}$/.test(cleanCPF)) return false;
  
  // Calculate first verification digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanCPF.charAt(i)) * (10 - i);
  }
  let remainder = sum % 11;
  let digit1 = remainder < 2 ? 0 : 11 - remainder;
  
  if (parseInt(cleanCPF.charAt(9)) !== digit1) return false;
  
  // Calculate second verification digit
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleanCPF.charAt(i)) * (11 - i);
  }
  remainder = sum % 11;
  let digit2 = remainder < 2 ? 0 : 11 - remainder;
  
  return parseInt(cleanCPF.charAt(10)) === digit2;
}

/**
 * Validates Brazilian CNPJ using the proper algorithm
 * @param cnpj - CNPJ string (can include formatting)
 * @returns boolean indicating if CNPJ is valid
 */
export function validateCNPJ(cnpj: string): boolean {
  if (!cnpj || typeof cnpj !== 'string') return false;
  
  // Check for dangerous patterns
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /vbscript:/i,
    /onload=/i,
    /onerror=/i
  ];
  
  if (dangerousPatterns.some(pattern => pattern.test(cnpj))) return false;
  
  // Remove formatting
  const cleanCNPJ = cnpj.replace(/[^\d]/g, '');
  
  // Check basic format
  if (cleanCNPJ.length !== 14) return false;
  
  // Check for repeated digits (invalid CNPJs)
  if (/^(\d)\1{13}$/.test(cleanCNPJ)) return false;
  
  // Calculate first verification digit
  let sum = 0;
  let weight = 2;
  for (let i = 11; i >= 0; i--) {
    sum += parseInt(cleanCNPJ.charAt(i)) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  let remainder = sum % 11;
  let digit1 = remainder < 2 ? 0 : 11 - remainder;
  
  if (parseInt(cleanCNPJ.charAt(12)) !== digit1) return false;
  
  // Calculate second verification digit
  sum = 0;
  weight = 2;
  for (let i = 12; i >= 0; i--) {
    sum += parseInt(cleanCNPJ.charAt(i)) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  remainder = sum % 11;
  let digit2 = remainder < 2 ? 0 : 11 - remainder;
  
  return parseInt(cleanCNPJ.charAt(13)) === digit2;
}

/**
 * Enhanced email validation with comprehensive security checks
 * @param email - Email string to validate
 * @returns boolean indicating if email is valid
 */
export function validateEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  
  // Check length limits (RFC 5321)
  if (email.length > 320) return false;
  
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  
  const [localPart, domainPart] = parts;
  
  // Check local part length (RFC 5321)
  if (localPart.length > 64 || localPart.length === 0) return false;
  
  // Check domain part length
  if (domainPart.length > 253 || domainPart.length === 0) return false;
  
  // Enhanced regex with stricter validation
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  // Check for dangerous patterns
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /vbscript:/i,
    /onload=/i,
    /onerror=/i
  ];
  
  if (dangerousPatterns.some(pattern => pattern.test(email))) return false;
  
  return emailRegex.test(email);
}

/**
 * Sanitizes webhook payload to prevent XSS and injection attacks
 * @param payload - Webhook payload object
 * @returns Sanitized payload
 */
export function sanitizeWebhookPayload(payload: any): any {
  if (typeof payload === 'string') {
    return payload.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  }
  
  if (Array.isArray(payload)) {
    return payload.map(sanitizeWebhookPayload);
  }
  
  if (payload && typeof payload === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(payload)) {
      sanitized[key] = sanitizeWebhookPayload(value);
    }
    return sanitized;
  }
  
  return payload;
}

/**
 * Validates webhook secret format
 * @param secret - Webhook secret to validate
 * @returns boolean indicating if secret is valid
 */
export function validateWebhookSecret(secret: string): boolean {
  if (!secret || typeof secret !== 'string') return false;
  
  // Should be UUID format or at least 32 chars
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(secret) || secret.length >= 32;
}

/**
 * Enhanced input sanitization for all text inputs
 * @param input - Text input to sanitize
 * @returns Sanitized text
 */
export function sanitizeTextInput(input: string): string {
  if (!input || typeof input !== 'string') return '';
  
  return input
    .trim()
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .substring(0, 1000); // Limit length to prevent DoS
}

/**
 * Validates and sanitizes phone numbers (Brazilian format)
 * @param phone - Phone number string
 * @returns Sanitized phone number or null if invalid
 */
export function validateAndSanitizePhone(phone: string): string | null {
  if (!phone || typeof phone !== 'string') return null;
  
  // Remove all non-digits
  const cleanPhone = phone.replace(/[^\d]/g, '');
  
  // Brazilian phone number validation (10 or 11 digits)
  if (cleanPhone.length < 10 || cleanPhone.length > 11) return null;
  
  // Check for valid area codes (11-99)
  const areaCode = parseInt(cleanPhone.substring(0, 2));
  if (areaCode < 11 || areaCode > 99) return null;
  
  return cleanPhone;
}