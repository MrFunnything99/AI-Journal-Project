import { useCallback, useEffect, useRef, useState } from "react";

const CAPTURE_SAMPLE_RATE = 16000;
const CAPTURE_BUFFER_SIZE = 2048;

/**
 * Downsamples Float32 audio from sourceRate to targetRate.
 * Uses linear interpolation for fractional ratios.
 */
function downsample(
  input: Float32Array,
  sourceRate: number,
  targetRate: number
): Float32Array {
  const ratio = sourceRate / targetRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, input.length - 1);
    const frac = srcIndex - srcIndexFloor;
    output[i] =
      input[srcIndexFloor] * (1 - frac) + input[srcIndexCeil] * frac;
  }

  return output;
}

export type UsePersonaplexAudioOptions = {
  sendAudio: (data: ArrayBuffer) => boolean;
  isConnected: boolean;
  onUserSpeakingChange?: (isSpeaking: boolean) => void;
  onAiSpeakingChange?: (isSpeaking: boolean) => void;
};

export const usePersonaplexAudio = ({
  sendAudio,
  isConnected,
  onUserSpeakingChange,
  onAiSpeakingChange,
}: UsePersonaplexAudioOptions) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const playbackQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const nextPlayTimeRef = useRef(0);

  const [micPermission, setMicPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);

  const lastSpeakTimeRef = useRef(0);
  const isUserSpeakingRef = useRef(false);
  const volumeThreshold = 0.01;
  const silenceTimeoutMs = 300;

  const setUserSpeaking = useCallback(
    (v: boolean) => {
      isUserSpeakingRef.current = v;
      setIsUserSpeaking(v);
      onUserSpeakingChange?.(v);
    },
    [onUserSpeakingChange]
  );

  const playNextInQueue = useCallback(
    (ctx: AudioContext) => {
      if (playbackQueueRef.current.length === 0) {
        isPlayingRef.current = false;
        setIsAiSpeaking(false);
        onAiSpeakingChange?.(false);
        return;
      }

      const buffer = playbackQueueRef.current.shift()!;
      const source = ctx.createBufferSource();
      source.buffer = buffer;

      source.onended = () => {
        playNextInQueue(ctx);
      };

      source.connect(ctx.destination);

      const now = ctx.currentTime;
      const startTime = Math.max(now, nextPlayTimeRef.current);
      source.start(startTime);
      nextPlayTimeRef.current = startTime + buffer.duration;
      isPlayingRef.current = true;
      setIsAiSpeaking(true);
      onAiSpeakingChange?.(true);
    },
    [onAiSpeakingChange]
  );

  const playbackContextRef = useRef<AudioContext | null>(null);

  const playAudioChunk = useCallback(
    (data: ArrayBuffer, sampleRate: number = CAPTURE_SAMPLE_RATE) => {
      let ctx = audioContextRef.current ?? playbackContextRef.current;
      if (!ctx) {
        ctx = new AudioContext();
        playbackContextRef.current = ctx;
      }

      let samples: Float32Array;

      if (data.byteLength % 4 === 0) {
        samples = new Float32Array(data);
      } else if (data.byteLength % 2 === 0) {
        const int16 = new Int16Array(data);
        samples = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
          samples[i] = int16[i] / 32768;
        }
      } else {
        console.warn("Unknown audio format, skipping chunk");
        return;
      }

      const buffer = ctx.createBuffer(
        1,
        samples.length,
        sampleRate
      );
      buffer.getChannelData(0).set(samples);

      playbackQueueRef.current.push(buffer);

      if (!isPlayingRef.current) {
        setIsAiSpeaking(true);
        onAiSpeakingChange?.(true);
        playNextInQueue(ctx);
      }
    },
    [playNextInQueue, onAiSpeakingChange]
  );

  const startCapture = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermission("granted");
      streamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 48000 });
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const processor = ctx.createScriptProcessor(
        CAPTURE_BUFFER_SIZE,
        1,
        1
      );
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);

        const rms = Math.sqrt(
          input.reduce((sum, s) => sum + s * s, 0) / input.length
        );
        if (rms > volumeThreshold) {
          lastSpeakTimeRef.current = Date.now();
          if (!isUserSpeakingRef.current) {
            setUserSpeaking(true);
          }
        }

        if (isConnected && sendAudio) {
          const downsampled = downsample(
            input,
            ctx.sampleRate,
            CAPTURE_SAMPLE_RATE
          );
          sendAudio(downsampled.buffer.slice(0) as ArrayBuffer);
        }
      };

      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(ctx.destination);

      return true;
    } catch (err) {
      console.error("Failed to start audio capture:", err);
      setMicPermission("denied");
      return false;
    }
  }, [isConnected, sendAudio, setUserSpeaking]);

  const stopCapture = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    playbackQueueRef.current = [];
    if (playbackContextRef.current) {
      playbackContextRef.current.close();
      playbackContextRef.current = null;
    }
    setUserSpeaking(false);
  }, [setUserSpeaking]);

  useEffect(() => {
    const checkSilence = setInterval(() => {
      if (Date.now() - lastSpeakTimeRef.current > silenceTimeoutMs) {
        if (isUserSpeakingRef.current) {
          setUserSpeaking(false);
        }
      }
    }, 100);
    return () => clearInterval(checkSilence);
  }, [setUserSpeaking]);

  return {
    startCapture,
    stopCapture,
    playAudioChunk,
    micPermission,
    isUserSpeaking,
    isAiSpeaking,
    audioContextRef,
  };
};
