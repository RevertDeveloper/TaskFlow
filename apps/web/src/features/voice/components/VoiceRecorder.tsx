"use client";

import { Mic, RotateCcw, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";

import {
  AudioValidationError,
  DEFAULT_MAX_AUDIO_BYTES,
  DEFAULT_MAX_AUDIO_SECONDS,
  audioFileName,
  selectRecordingMimeType,
  validateAudioBlob,
} from "../audio";

type RecorderState = "idle" | "recording" | "ready" | "error";

type VoiceRecorderProps = {
  onAudioReady: (audio: Blob, fileName: string) => void;
  onCancel?: () => void;
  maxDurationSeconds?: number;
  maxBytes?: number;
  disabled?: boolean;
};

export function VoiceRecorder({
  onAudioReady,
  onCancel,
  maxDurationSeconds = DEFAULT_MAX_AUDIO_SECONDS,
  maxBytes = DEFAULT_MAX_AUDIO_BYTES,
  disabled = false,
}: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const cancelRequestedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }
      recorderRef.current?.stop();
      releaseStream(streamRef.current);
    };
  }, []);

  async function startRecording() {
    setError(null);
    setElapsedSeconds(0);
    cancelRequestedRef.current = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new AudioValidationError("Este navegador no permite acceder al micrófono.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = selectRecordingMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      startedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        setError("La grabación no se pudo completar.");
        setState("error");
        releaseStream(streamRef.current);
      };
      recorder.onstop = () => finishRecording(recorder.mimeType || mimeType || "audio/webm");
      recorder.start(250);
      setState("recording");
      timerRef.current = window.setInterval(() => {
        const startedAt = startedAtRef.current;
        if (startedAt === null) {
          return;
        }
        const nextElapsed = Math.floor((Date.now() - startedAt) / 1000);
        setElapsedSeconds(nextElapsed);
        if (nextElapsed >= maxDurationSeconds) {
          stopRecording();
        }
      }, 250);
    } catch (startError) {
      releaseStream(streamRef.current);
      setError(startError instanceof Error ? startError.message : "No se pudo iniciar la grabación.");
      setState("error");
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }

  function cancelRecording() {
    cancelRequestedRef.current = true;
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    } else {
      resetRecorder();
    }
    onCancel?.();
  }

  function resetRecorder() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    releaseStream(streamRef.current);
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    startedAtRef.current = null;
    setElapsedSeconds(0);
    setError(null);
    setState("idle");
  }

  function finishRecording(mimeType: string) {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    releaseStream(streamRef.current);
    streamRef.current = null;
    recorderRef.current = null;
    startedAtRef.current = null;
    if (cancelRequestedRef.current) {
      chunksRef.current = [];
      setState("idle");
      setElapsedSeconds(0);
      return;
    }
    try {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      validateAudioBlob(blob, maxBytes);
      onAudioReady(blob, audioFileName(mimeType));
      setState("ready");
    } catch (recordingError) {
      setError(recordingError instanceof Error ? recordingError.message : "La grabación no es válida.");
      setState("error");
    } finally {
      chunksRef.current = [];
    }
  }

  return (
    <section className="voice-recorder" aria-label="Grabadora de voz">
      <div className="voice-recorder__status" role="status" aria-live="polite">
        <span className={`voice-recorder__dot voice-recorder__dot--${state}`} aria-hidden="true" />
        <span>{state === "recording" ? "Grabando" : state === "ready" ? "Lista" : "Preparada"}</span>
        <time dateTime={`PT${elapsedSeconds}S`}>{formatElapsed(elapsedSeconds)}</time>
      </div>
      <div className="voice-recorder__actions">
        {state === "recording" ? (
          <Button type="button" variant="danger" onClick={stopRecording}>
            <Square size={16} aria-hidden="true" />
            Detener
          </Button>
        ) : (
          <Button type="button" onClick={startRecording} disabled={disabled}>
            <Mic size={16} aria-hidden="true" />
            Grabar
          </Button>
        )}
        {state === "recording" || state === "ready" ? (
          <Button type="button" variant="ghost" onClick={cancelRecording}>
            <X size={16} aria-hidden="true" />
            Cancelar
          </Button>
        ) : null}
        {state === "error" ? (
          <Button type="button" variant="ghost" onClick={resetRecorder}>
            <RotateCcw size={16} aria-hidden="true" />
            Reintentar
          </Button>
        ) : null}
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </section>
  );
}

function releaseStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}