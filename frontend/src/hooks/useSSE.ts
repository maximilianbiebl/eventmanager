import { useEffect, useRef, useCallback } from 'react';
import { getToken } from '../utils/authStorage';

interface SSEMessage {
  type: string;
  data?: any;
  timestamp: string;
}

interface UseSSEOptions {
  onMessage?: (message: SSEMessage) => void;
  onTaskUpdate?: (data: any) => void;
  onAssignmentUpdate?: (data: any) => void;
  onEventUpdate?: (data: any) => void;
  onConnected?: () => void;
  onError?: (error: Event) => void;
  enabled?: boolean;
}

export function useSSE(options: UseSSEOptions = {}) {
  const { enabled = true } = options;

  /*
   * Die Rueckrufe liegen in einer Referenz, nicht in den Abhaengigkeiten.
   *
   * Aufrufer uebergeben sie als Pfeilfunktionen direkt im Aufruf - die sind
   * bei jedem Rendern neu. Standen sie in den Abhaengigkeiten, wurde bei
   * JEDEM Rendern die Verbindung geschlossen und neu aufgebaut. Im Protokoll
   * sah man endloses "Disconnecting / Connecting", und der Server legte
   * dabei jedes Mal einen neuen Client an.
   *
   * Die Referenz zeigt immer auf die zuletzt uebergebenen Funktionen, die
   * Verbindung bleibt trotzdem stehen.
   */
  const optionenRef = useRef(options);
  optionenRef.current = options;

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectDelay = 30000; // Max 30 seconds
  const baseReconnectDelay = 1000; // Start with 1 second

  const connect = useCallback(() => {
    if (!enabled) return;

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const token = getToken();
    if (!token) {
      console.log('SSE: No token found, skipping connection');
      return;
    }

    // Use same logic as client.ts - VITE_API_URL already includes /api if needed
    const apiUrl = import.meta.env.VITE_API_URL || '/api';
    const url = `${apiUrl}/sse/stream?token=${encodeURIComponent(token)}`;

    console.log('SSE: Connecting to', url);

    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      console.log('SSE: Connected');
      reconnectAttempts.current = 0;
      optionenRef.current.onConnected?.();
    };

    eventSource.onmessage = (event) => {
      try {
        const message: SSEMessage = JSON.parse(event.data);
        const o = optionenRef.current;
        o.onMessage?.(message);

        // Route to specific handlers
        if (message.type === 'task') {
          o.onTaskUpdate?.(message.data);
        } else if (message.type === 'assignment') {
          o.onAssignmentUpdate?.(message.data);
        } else if (message.type === 'event') {
          o.onEventUpdate?.(message.data);
        }
      } catch (error) {
        console.error('SSE: Error parsing message', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE: Connection error', error);
      eventSource.close();

      optionenRef.current.onError?.(error);

      // Exponential backoff reconnection
      reconnectAttempts.current++;
      const delay = Math.min(
        baseReconnectDelay * Math.pow(2, reconnectAttempts.current - 1),
        maxReconnectDelay
      );

      console.log(`SSE: Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`);

      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, delay);
    };

    eventSourceRef.current = eventSource;
  }, [enabled]);

  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      if (eventSourceRef.current) {
        console.log('SSE: Disconnecting');
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect, enabled]);

  return {
    isConnected: eventSourceRef.current?.readyState === EventSource.OPEN,
    reconnect: connect,
  };
}
