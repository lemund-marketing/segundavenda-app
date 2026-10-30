/**
 * Security utilities for monitoring and logging
 */

import { supabase } from "@/integrations/supabase/client";
import { clienteAdmin } from '@/utils/sessaoAdmin';

/**
 * Log a security event to the database
 * @param action - The action being performed
 * @param resourceType - The type of resource being accessed
 * @param resourceId - Optional resource ID
 * @param status - Status of the action (success, failed, blocked)
 * @param details - Additional details about the event
 */
export async function logSecurityEvent(
  action: string,
  resourceType: string,
  resourceId?: string,
  status: string = 'success',
  details?: any
): Promise<void> {
  try {
    await supabase.rpc('log_security_event', {
      p_action: action,
      p_resource_type: resourceType,
      p_resource_id: resourceId || null,
      p_status: status,
      p_details: details || null
    });
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
}

/**
 * Check if the current user has admin privileges
 * @returns Promise<boolean> indicating if user is admin
 */
export async function checkAdminAccess(): Promise<boolean> {
  try {
    // clienteAdmin(): sob impersonação a sessão ativa é a do cliente e a RLS de
    // admin_users devolve zero linhas sem erro — o admin "deixava de ser admin"
    // e recursos de admin sumiam da tela como se não existissem.
    const { data, error } = await clienteAdmin()
      .from('admin_users')
      .select('id')
      .maybeSingle();
    if (error) console.warn('[checkAdminAccess]', error.message);
    return !!data;
  } catch {
    return false;
  }
}

/**
 * Validate session and log access attempt
 * @param resourceType - Type of resource being accessed
 * @param resourceId - Optional resource ID
 */
export async function validateAndLogAccess(
  resourceType: string,
  resourceId?: string
): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    await logSecurityEvent(
      'unauthorized_access_attempt',
      resourceType,
      resourceId,
      'blocked',
      { reason: 'No valid session' }
    );
    return false;
  }

  await logSecurityEvent(
    'authorized_access',
    resourceType,
    resourceId,
    'success'
  );
  
  return true;
}

/**
 * Enhanced rate limiting with security logging
 */
const rateLimitMap = new Map<string, { count: number; lastReset: number }>();

export function checkRateLimit(
  identifier: string,
  maxRequests: number = 100,
  windowMs: number = 15 * 60 * 1000 // 15 minutes
): boolean {
  const now = Date.now();
  const key = `rate_limit_${identifier}`;
  
  const current = rateLimitMap.get(key) || { count: 0, lastReset: now };
  
  // Reset counter if window has passed
  if (now - current.lastReset > windowMs) {
    current.count = 0;
    current.lastReset = now;
  }
  
  current.count++;
  rateLimitMap.set(key, current);
  
  const isBlocked = current.count > maxRequests;
  
  if (isBlocked) {
    logSecurityEvent(
      'rate_limit_exceeded',
      'api_request',
      identifier,
      'blocked',
      { requests: current.count, limit: maxRequests }
    );
  }
  
  return !isBlocked;
}

/**
 * Secure redirect validation to prevent open redirects
 * @param url - URL to validate
 * @param allowedDomains - List of allowed domains
 */
export function validateRedirectUrl(
  url: string,
  allowedDomains: string[] = ['localhost', window.location.hostname]
): boolean {
  try {
    const urlObj = new URL(url, window.location.origin);
    
    // Only allow HTTP/HTTPS protocols
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return false;
    }
    
    // Check if domain is in allowed list
    return allowedDomains.some(domain => 
      urlObj.hostname === domain || 
      urlObj.hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}