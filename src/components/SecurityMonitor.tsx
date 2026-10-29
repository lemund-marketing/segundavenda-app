import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { Shield, AlertTriangle, Clock, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SecurityLog {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  status: string;
  details: any;
  created_at: string;
}

interface SecurityStats {
  totalEvents: number;
  failedAttempts: number;
  successfulActions: number;
  uniqueUsers: number;
}

export function SecurityMonitor() {
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [stats, setStats] = useState<SecurityStats>({
    totalEvents: 0,
    failedAttempts: 0,
    successfulActions: 0,
    uniqueUsers: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSecurityData();
    // DESABILITADO: Polling muito agressivo estava sobrecarregando o Supabase
    // Apenas carrega uma vez quando monta o componente
    // const interval = setInterval(fetchSecurityData, 30000); 
    // return () => clearInterval(interval);
  }, []);

  const fetchSecurityData = async () => {
    try {
      // LIMIT 20 para reduzir carga no banco
      const { data: logsData } = await supabase
        .from('security_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20); // Reduzido de 50 para 20

      if (logsData) {
        setLogs(logsData);
        
        // Calculate stats
        const uniqueUsers = new Set(logsData.filter(log => log.user_id).map(log => log.user_id)).size;
        const failedAttempts = logsData.filter(log => log.status === 'failed' || log.status === 'blocked').length;
        const successfulActions = logsData.filter(log => log.status === 'success').length;
        
        setStats({
          totalEvents: logsData.length,
          failedAttempts,
          successfulActions,
          uniqueUsers
        });
      }
    } catch (error) {
      console.error('Error fetching security data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge variant="default" className="bg-primary/10 text-primary">Success</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'blocked':
        return <Badge variant="destructive" className="bg-destructive/10 text-destructive">Blocked</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getActionIcon = (action: string) => {
    if (action.includes('login') || action.includes('auth')) {
      return <User className="w-4 h-4" />;
    }
    if (action.includes('access') || action.includes('view')) {
      return <Shield className="w-4 h-4" />;
    }
    return <AlertTriangle className="w-4 h-4" />;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Security Monitor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Security Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.totalEvents}</div>
            <p className="text-xs text-muted-foreground">Total Events</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-destructive">{stats.failedAttempts}</div>
            <p className="text-xs text-muted-foreground">Failed Attempts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-primary">{stats.successfulActions}</div>
            <p className="text-xs text-muted-foreground">Successful Actions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.uniqueUsers}</div>
            <p className="text-xs text-muted-foreground">Unique Users</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Failed Attempts Alert */}
      {stats.failedAttempts > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {stats.failedAttempts} failed security attempts detected in recent activity. Review the logs below for details.
          </AlertDescription>
        </Alert>
      )}

      {/* Security Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Recent Security Events
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {logs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No security events recorded</p>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {getActionIcon(log.action)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{log.action}</span>
                        {getStatusBadge(log.status)}
                      </div>
                      <p className="text-sm text-muted-foreground mb-1">
                        Resource: {log.resource_type}
                        {log.resource_id && ` (${log.resource_id.slice(0, 8)}...)`}
                      </p>
                      {log.details && (
                        <p className="text-xs text-muted-foreground">
                          {typeof log.details === 'object' 
                            ? JSON.stringify(log.details).slice(0, 100) + '...'
                            : log.details
                          }
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Utility function to log security events
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
) {
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