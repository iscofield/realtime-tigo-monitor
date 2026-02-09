import { useState, useEffect, useRef, useCallback } from 'react';

export interface LogEntry {
  ts: string;
  line: string;
  seq: number;
  level: string;
}

export type LogConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

const BUFFER_CAP = 2000;
const LAZY_LOAD_BATCH = 200;

interface UseLogWebSocketResult {
  logsBySystem: Record<string, LogEntry[]>;
  systems: string[];
  status: LogConnectionStatus;
  hasDebug: Record<string, boolean>;
  totalBySystem: Record<string, number>;
  loadingOlder: boolean;
  hasOlderBySystem: Record<string, boolean>;
  fetchOlderLogs: (system: string) => Promise<void>;
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
  const [totalBySystem, setTotalBySystem] = useState<Record<string, number>>({});
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlderBySystem, setHasOlderBySystem] = useState<Record<string, boolean>>({});
  const [olderOffsetBySystem, setOlderOffsetBySystem] = useState<Record<string, number>>({});

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(1000);
  const intentionalCloseRef = useRef(false);
  const loadingOlderRef = useRef(false);

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
              setTotalBySystem(data.total || {});

              const offsets: Record<string, number> = {};
              const hasOlder: Record<string, boolean> = {};
              for (const sys of data.systems || []) {
                const loaded = (data.logs?.[sys] || []).length;
                offsets[sys] = loaded;
                hasOlder[sys] = loaded < (data.total?.[sys] || 0);
              }
              setOlderOffsetBySystem(offsets);
              setHasOlderBySystem(hasOlder);
            } else if (data.type === 'log') {
              const { system, entry } = data;
              setLogsBySystem((prev) => {
                const existing = prev[system] || [];
                const updated = [...existing, entry];
                return {
                  ...prev,
                  [system]: updated.length > BUFFER_CAP
                    ? updated.slice(updated.length - BUFFER_CAP)
                    : updated,
                };
              });
              setTotalBySystem((prev) => ({
                ...prev,
                [system]: (prev[system] || 0) + 1,
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

  const fetchOlderLogs = useCallback(async (system: string) => {
    if (loadingOlderRef.current || !hasOlderBySystem[system]) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const offset = olderOffsetBySystem[system] || 0;
      const API_BASE = import.meta.env.VITE_API_BASE || '';
      const url = `${API_BASE}/api/logs/${encodeURIComponent(system)}?level=${encodeURIComponent(level)}&limit=${LAZY_LOAD_BATCH}&offset=${offset}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      // REST API returns entries sorted ts DESC (newest first) — reverse for chronological buffer
      const olderEntries: LogEntry[] = (data.entries || []).reverse();

      setLogsBySystem((prev) => {
        const existing = prev[system] || [];
        const existingSeqs = new Set(existing.map((e: LogEntry) => e.seq));
        const newEntries = olderEntries.filter((e: LogEntry) => !existingSeqs.has(e.seq));
        return { ...prev, [system]: [...newEntries, ...existing] };
      });

      setOlderOffsetBySystem((prev) => ({
        ...prev, [system]: offset + (data.entries?.length || 0),
      }));
      setHasOlderBySystem((prev) => ({
        ...prev, [system]: data.has_more,
      }));
    } catch (e) {
      console.error('Failed to load older logs:', e);
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [hasOlderBySystem, olderOffsetBySystem, level]);

  return { logsBySystem, systems, status, hasDebug, totalBySystem, loadingOlder, hasOlderBySystem, fetchOlderLogs };
}
