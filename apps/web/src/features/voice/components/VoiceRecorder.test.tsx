import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VoiceRecorder } from "./VoiceRecorder";

class FakeMediaRecorder {
  static isTypeSupported(mimeType: string) {
    return mimeType === "audio/webm";
  }

  readonly mimeType = "audio/webm";
  state: RecordingState = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(private readonly stream: { getTracks: () => Array<{ stop: () => void }> }) {}

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["voice"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

describe("VoiceRecorder", () => {
  const track = { stop: vi.fn() };
  const getUserMedia = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    getUserMedia.mockResolvedValue({ getTracks: () => [track] });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("requests the microphone, emits the blob and releases tracks", async () => {
    const onAudioReady = vi.fn();
    render(<VoiceRecorder onAudioReady={onAudioReady} />);

    fireEvent.click(screen.getByRole("button", { name: "Grabar" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Grabando"));
    fireEvent.click(screen.getByRole("button", { name: "Detener" }));

    await waitFor(() => expect(onAudioReady).toHaveBeenCalledOnce());
    expect(onAudioReady).toHaveBeenCalledWith(expect.any(Blob), "taskflow-recording.webm");
    expect(track.stop).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("Lista");
  });

  it("surfaces denied microphone permissions without retaining a stream", async () => {
    getUserMedia.mockRejectedValueOnce(new Error("Permiso denegado"));
    render(<VoiceRecorder onAudioReady={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Grabar" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Permiso denegado"));
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});