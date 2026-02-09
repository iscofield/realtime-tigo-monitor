import { useState, useEffect, useRef } from 'react';

export interface LogEntry {
  ts: string;
  line: string;
  seq: number;
  level: string;
}

export type LogConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseLogWebSocketResult {
  logsBySystem: Record<string, LogEntry[]>;
  systems: string[];
  status: LogConnectionStatus;
  hasDebug: Record<string, boolean>;
}

function getLogWebSocketUrl(level: string): string {
  let base: string;
  if (import.meta.env.VITE_WS_URL) {
    const wsUrl = import.meta.env.VITE_WS_URL;
    base = wsUrl.replace(/\/ws\/.*$/, '').replace(/\/$/, '');
  } else {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    base = `${protocol}//${window.location.host}`;
  }
  return `${base}/ws/logs?level=${encodeURIComponent(level)}`;
}

export function useLogWebSocket(level: string = 'info'): UseLogWebSocketResult {
  const [logsBySystem, setLogsBySystem] = useState<Record<string, LogEntry[]>>({});
  const [systems, setSystems] = useState<string[]>([]);
  const [status, setStatus] = useState<LogConnectionStatus>('connecting');
  const [hasDebug, setHasDebug] = useState<Record<string, boolean>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(1000);
  const intentionalCloseRef = useRef(false);

  useEffect(() => {
    intentionalCloseRef.current = false;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    function connect() {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      setStatus('connecting');

      try {
        const ws = new WebSocket(getLogWebSocketUrl(level));
        wsRef.current = ws;

        ws.onopen = () => {
          setStatus('connected');
          reconnectDelayRef.current = 1000;
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'initial') {
              setLogsBySystem(data.logs || {});
              setSystems(data.systems || []);
              setHasDebug(data.has_debug || {});
            } else if (data.type === 'log') {
              const { system, entry } = data;
              setLogsBySystem((prev) => ({
                ...prev,
                [system]: [...(prev[system] || []), entry],
              }));
              setSystems((prev) =>
                prev.includes(system) ? prev : [...prev, system]
              );
              if (entry.level === 'debug') {
                setHasDebug((prev) => prev[system] ? prev : { ...prev, [system]: true });
              }
            }
          } catch (e) {
            console.error('Failed to parse log WebSocket message:', e);
          }
        };

        ws.onclose = () => {
          if (intentionalCloseRef.current) return;
          setStatus('disconnected');
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
    }

    connect();

    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [level]);

  return { logsBySystem, systems, status, hasDebug };
}
