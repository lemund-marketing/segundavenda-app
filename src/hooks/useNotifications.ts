import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  playSound?: boolean;
}

export const useNotifications = () => {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);

  // Espelho em ref do que as funções precisam ler. Sem ele, `showNotification` teria
  // `permission` nas deps do useCallback e trocaria de identidade a cada mudança —
  // e quem a tem nas deps de um efeito (o realtime do Omnichannel) refaz o subscribe
  // e perde as mensagens que chegam entre o removeChannel e o subscribe novo.
  const permissionRef = useRef<NotificationPermission>('default');
  const isSupportedRef = useRef(false);

  useEffect(() => {
    // Check if notifications are supported
    const supported = 'Notification' in window;
    setIsSupported(supported);
    isSupportedRef.current = supported;

    if (supported) {
      setPermission(Notification.permission);
      permissionRef.current = Notification.permission;
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (!isSupportedRef.current) {
      console.warn('Notifications not supported');
      return 'denied';
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      permissionRef.current = result;
      return result;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return 'denied';
    }
  }, []);

  const playNotificationSound = useCallback(() => {
    try {
      const audio = new Audio('/notification-bell.wav');
      audio.volume = 0.8; // Som mais alto
      audio.play().catch(console.error);
    } catch (error) {
      console.error('Error playing notification sound:', error);
    }
  }, []);

  const showNotification = useCallback(async (options: NotificationOptions) => {
    // Request permission if not granted
    if (permissionRef.current !== 'granted') {
      const newPermission = await requestPermission();
      if (newPermission !== 'granted') {
        console.warn('Notification permission not granted');
        return;
      }
    }

    try {
      // Play sound if requested
      if (options.playSound !== false) {
        playNotificationSound();
      }

      // Show notification
      const notification = new Notification(options.title, {
        body: options.body,
        icon: options.icon || '/favicon-32x32.png',
        badge: '/favicon-16x16.png',
        requireInteraction: false,
        silent: false,
      });

      // Auto close after 5 seconds
      setTimeout(() => {
        notification.close();
      }, 5000);

      // Focus window when clicked
      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      return notification;
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }, [requestPermission, playNotificationSound]);

  return useMemo(
    () => ({
      permission,
      isSupported,
      requestPermission,
      showNotification,
      playNotificationSound,
    }),
    [permission, isSupported, requestPermission, showNotification, playNotificationSound],
  );
};
