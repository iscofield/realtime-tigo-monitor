import { useState, useEffect, useRef, useCallback } from 'react';

export interface Position {
  x_percent: number;
  y_percent: number;
}

export interface PanelData {
  display_label: string;
  tigo_label?: string;
  string: string;
  system: string;
  sn: string;
  node_id?: string;
  watts?: number | null;
  voltage_in?: number | null;
  voltage_out?: number | null;
  current_in?: number | null;
  current_out?: number | null;
  temperature?: number | null;
  duty_cycle?: number | null;
  rssi?: number | null;
  energy?: number | null;
  online?: boolean;
  stale?: boolean;
  is_temporary?: boolean;
  actual_system?: string;  // Which CCA actually sent data for this panel
  last_update?: string;  // ISO timestamp of when panel data was last received
  position: Position;
  // Backward compatibility: accept voltage as alias for voltage_in
  voltage?: number | null;
}

export interface WebSocketMessage {
  timestamp: string;
  panels: PanelData[];
  type?: string;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseWebSocketResult {
  panels: PanelData[];
  status: ConnectionStatus;
  error: string | null;
  retry: () => void;
}

function getWebSocketUrl(): string {
  // If explicitly set via environment variable, use that
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  // Derive from current page location (works with any reverse proxy)
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/panels`;
}

const WS_URL = getWebSocketUrl();
const RECONNECT_DELAY = 3000;

export function useWebSocket(): UseWebSocketResult {
  const [panels, setPanels] = useState<PanelData[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    setStatus('connecting');
    setError(null);

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data);

          // Handle ping messages (FR-3.4)
          if (data.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
            return;
          }

          // Handle panel data
          if (data.panels) {
            setPanels(data.panels);
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.onclose = () => {
        setStatus('disconnected');
        // Auto-reconnect after delay
        reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_DELAY);
      };

      ws.onerror = () => {
        setStatus('error');
        setError('WebSocket connection error');
      };
    } catch (e) {
      setStatus('error');
      setError('Failed to create WebSocket connection');
    }
  }, []);

  const retry = useCallback(() => {
    connect();
  }, [connect]);

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

  return { panels, status, error, retry };
}
