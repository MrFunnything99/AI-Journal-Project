import { useCallback, useRef, useState } from "react";

export type PersonaplexConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export type UsePersonaplexSocketOptions = {
  uri: string;
  onMessage?: (data: ArrayBuffer) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
};

export const usePersonaplexSocket = ({
  uri,
  onMessage,
  onConnect,
  onDisconnect,
}: UsePersonaplexSocketOptions) => {
  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<PersonaplexConnectionStatus>("disconnected");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const connect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus("connecting");
    setErrorMessage(null);

    const ws = new WebSocket(uri);
    ws.binaryType = "arraybuffer";

    ws.addEventListener("open", () => {
      setStatus("connected");
      onConnect?.();
    });

    ws.addEventListener("close", () => {
      socketRef.current = null;
      setStatus("disconnected");
      onDisconnect?.();
    });

    ws.addEventListener("error", () => {
      setStatus("error");
      setErrorMessage("Connection failed");
    });

    ws.addEventListener("message", (event: MessageEvent<ArrayBuffer>) => {
      if (event.data instanceof ArrayBuffer && onMessage) {
        onMessage(event.data);
      }
    });

    socketRef.current = ws;
  }, [uri, onMessage, onConnect, onDisconnect]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setStatus("disconnected");
    setErrorMessage(null);
    onDisconnect?.();
  }, [onDisconnect]);

  const send = useCallback(
    (data: ArrayBuffer | Uint8Array) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      socket.send(data);
      return true;
    },
    []
  );

  const isConnected = status === "connected";

  return {
    status,
    errorMessage,
    connect,
    disconnect,
    send,
    isConnected,
    socketRef,
  };
};
