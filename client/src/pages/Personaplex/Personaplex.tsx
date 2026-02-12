import { useCallback, useEffect, useMemo, useRef } from "react";
import { env } from "../../env";
import { usePersonaplexSocket } from "./hooks/usePersonaplexSocket";
import { usePersonaplexAudio } from "./hooks/usePersonaplexAudio";
import { Orb, OrbState } from "./components/Orb";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { ConnectButton } from "./components/ConnectButton";

const WS_URI = env.VITE_WS_URL;

export const Personaplex = () => {
  const onMessageRef = useRef<((data: ArrayBuffer) => void) | null>(null);

  const handleMessage = useCallback((data: ArrayBuffer) => {
    onMessageRef.current?.(data);
  }, []);

  const {
    status,
    errorMessage,
    connect,
    disconnect,
    send,
    isConnected,
  } = usePersonaplexSocket({
    uri: WS_URI,
    onMessage: handleMessage,
  });

  const handleUserSpeakingChange = useCallback(() => {}, []);
  const handleAiSpeakingChange = useCallback(() => {}, []);

  const { playAudioChunk, startCapture, stopCapture, isUserSpeaking, isAiSpeaking } =
    usePersonaplexAudio({
      sendAudio: useCallback(
        (data: ArrayBuffer) => send(data),
        [send]
      ),
      isConnected,
      onUserSpeakingChange: handleUserSpeakingChange,
      onAiSpeakingChange: handleAiSpeakingChange,
    });

  onMessageRef.current = playAudioChunk;

  const orbState: OrbState = useMemo(() => {
    if (isUserSpeaking) return "userSpeaking";
    if (isAiSpeaking) return "aiSpeaking";
    return "idle";
  }, [isUserSpeaking, isAiSpeaking]);

  const handleConnect = useCallback(() => {
    connect();
  }, [connect]);

  const handleDisconnect = useCallback(() => {
    stopCapture();
    disconnect();
  }, [stopCapture, disconnect]);

  useEffect(() => {
    if (isConnected) {
      startCapture();
    } else {
      stopCapture();
    }
  }, [isConnected, startCapture, stopCapture]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden">
      {/* Background gradient */}
      <div
        className="fixed inset-0 pointer-events-none"
        aria-hidden
      >
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900/50 to-slate-950" />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-violet-500/5 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-cyan-500/5 blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-light tracking-widest text-slate-300 uppercase">
            AI Augmented Journaling
          </h1>
          <ConnectionStatus status={status} />
          {errorMessage && (
            <span className="text-sm text-red-400">{errorMessage}</span>
          )}
        </div>
        <ConnectButton
          status={status}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
        />
      </header>

      {/* Main content - centered orb */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-8">
        <Orb state={orbState} />
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-6 text-center space-y-4">
        <p className="text-sm text-slate-500">
          {isConnected
            ? "Speak naturally. The AI is listening."
            : "Connect to begin your journaling session."}
        </p>
        <div className="border-t border-slate-800/60 pt-4 space-y-2">
          <p className="text-xs text-slate-600">
            By John Stewart, Sherelle McDaniel, Aniyah Tucker, Dominique Sanchez, Andy Coto, Jackeline Garcia Ulloa
          </p>
          <p className="text-xs text-slate-600">
            Framework:{" "}
            <a
              href="https://research.nvidia.com/labs/adlr/personaplex/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-violet-400 transition-colors underline underline-offset-2"
            >
              Personaplex by NVIDIA
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
};
