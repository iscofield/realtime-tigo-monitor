import { useState, useEffect, useRef, useCallback } from 'react';

export interface LogEntry {
  ts: string;
  line: string;
  seq: number;
}

export type LogConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseLogWebSocketResult {
  logsBySystem: Record<string, LogEntry[]>;
  systems: string[];
  status: LogConnectionStatus;
}

function getLogWebSocketUrl(): string {
  if (import.meta.env.VITE_WS_URL) {
    const wsUrl = import.meta.env.VITE_WS_URL;
    const base = wsUrl.replace(/\/ws\/.*$/, '').replace(/\/$/, '');
    return `${base}/ws/logs`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/logs`;
}

export function useLogWebSocket(): UseLogWebSocketResult {
  const [logsBySystem, setLogsBySystem] = useState<Record<string, LogEntry[]>>({});
  const [systems, setSystems] = useState<string[]>([]);
  const [status, setStatus] = useState<LogConnectionStatus>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(1000);

  const connect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
    }

    setStatus('connecting');

    try {
      const ws = new WebSocket(getLogWebSocketUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        reconnectDelayRef.current = 1000; // Reset backoff
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'initial') {
            // Replace all state with initial payload
            setLogsBySystem(data.logs || {});
            setSystems(data.systems || []);
          } else if (data.type === 'log') {
            const { system, entry } = data;
            setLogsBySystem((prev) => ({
              ...prev,
              [system]: [...(prev[system] || []), entry],
            }));
            // Add new system if not already tracked
            setSystems((prev) =>
              prev.includes(system) ? prev : [...prev, system]
            );
          }
        } catch (e) {
          console.error('Failed to parse log WebSocket message:', e);
        }
      };

      ws.onclose = () => {
        setStatus('disconnected');
        // Exponential backoff: 1s, 2s, 4s, ... up to 30s
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30000);
          connect();
        }, reconnectDelayRef.current);
      };

      ws.onerror = () => {
        setStatus('error');
      };
    } catch (e) {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { logsBySystem, systems, status };
}
