import { useState, useEffect } from 'react';
import { notificationsApi } from '../api/notifications';

export const useNotifications = () => {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  useEffect(() => {
    // Prüfe ob Push Notifications unterstützt werden
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);
      checkSubscription();
    }
  }, []);

  const checkSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();

      setSubscription(sub);
      setIsSubscribed(!!sub);
    } catch (error) {
      console.error('Check subscription error:', error);
    }
  };

  const subscribe = async () => {
    try {
      // Zuerst Berechtigung anfordern
      const permission = await Notification.requestPermission();

      if (permission !== 'granted') {
        console.log('Notification permission denied');
        return false;
      }

      // Service Worker registrieren
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // VAPID Public Key holen
      const vapidPublicKey = await notificationsApi.getVapidPublicKey();

      // Push Subscription erstellen
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      // An Backend senden
      await notificationsApi.subscribe(sub);

      setSubscription(sub);
      setIsSubscribed(true);

      return true;
    } catch (error) {
      console.error('Subscribe error:', error);
      return false;
    }
  };

  const unsubscribe = async () => {
    try {
      if (subscription) {
        await notificationsApi.unsubscribe(subscription.endpoint);
        await subscription.unsubscribe();

        setSubscription(null);
        setIsSubscribed(false);
      }

      return true;
    } catch (error) {
      console.error('Unsubscribe error:', error);
      return false;
    }
  };

  const sendTestNotification = async () => {
    try {
      await notificationsApi.sendTest();
      return true;
    } catch (error) {
      console.error('Test notification error:', error);
      return false;
    }
  };

  const requestPermission = async () => {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  };

  return {
    isSupported,
    isSubscribed,
    subscribe,
    unsubscribe,
    sendTestNotification,
    requestPermission,
  };
};

// Helper Funktion
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}
