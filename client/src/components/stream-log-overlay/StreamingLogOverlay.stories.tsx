import { expect, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { LogEntry } from "~/services/StreamingLogger.js";

import { StreamingLogPanel } from "./StreamingLogOverlay.js";

/**
 * StreamingLogPanel is the inner presentational component of the streaming
 * debug overlay. Stories target it directly with fixture entries so there is no
 * dependency on DevToolsContext or the StreamingLogger singleton.
 */

const meta: Meta<typeof StreamingLogPanel> = {
  title: "Components/StreamingLogOverlay",
  component: StreamingLogPanel,
  parameters: { layout: "padded" },
};

export default meta;

type Story = StoryObj<typeof StreamingLogPanel>;

const noop = (): void => {};

const makEntry = (
  id: number,
  category: LogEntry["category"],
  message: string,
  isError = false,
  offsetMs = 0
): LogEntry => ({
  id,
  timestamp: 1_700_000_000_000 + offsetMs,
  category,
  message,
  isError,
});

export const Empty: Story = {
  args: { entries: [], onClear: noop },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("No log entries yet. Start playback to see events.")
    ).toBeInTheDocument();
  },
};

const MIXED_ENTRIES: ReadonlyArray<LogEntry> = [
  makEntry(0, "PLAYBACK", "startPlayback — resolution: 1080p", false, 0),
  makEntry(1, "PLAYBACK", "startTranscode mutation → videoId: VmlkZW86MQ==", false, 12),
  makEntry(2, "PLAYBACK", "Job created — rawJobId: abc123", false, 250),
  makEntry(3, "STREAM", "Fetching /stream/abc123?from=0", false, 260),
  makEntry(4, "STREAM", "HTTP 200 — stream open", false, 310),
  makEntry(
    5,
    "PLAYBACK",
    "MSE init OK — mimeType: video/mp4; codecs=avc1.640028,mp4a.40.2",
    false,
    315
  ),
  makEntry(6, "BUFFER", "MSE open — sourceBuffer added (mode=sequence)", false, 320),
  makEntry(7, "STREAM", "Segment parsed — 32768B (init)", false, 400),
  makEntry(8, "BUFFER", "Appended 32768B — buffered to 0.00s", false, 410),
  makEntry(9, "PLAYBACK", "video.play() — status: playing", false, 420),
  makEntry(10, "STREAM", "Segment parsed — 65536B", false, 500),
  makEntry(11, "BUFFER", "Appended 65536B — buffered to 2.04s", false, 510),
  makEntry(12, "STREAM", "Paused (buffer full)", false, 20_500),
  makEntry(13, "BUFFER", "Forward buffer 20.1s — pausing", false, 20_510),
  makEntry(14, "STREAM", "Stream error: net::ERR_CONNECTION_RESET", true, 25_000),
];

export const WithMixedEntries: Story = {
  args: { entries: MIXED_ENTRIES, onClear: noop },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText("STREAM").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText("BUFFER").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText("PLAYBACK").length).toBeGreaterThan(0);
  },
};

const ERROR_ENTRIES: ReadonlyArray<LogEntry> = [
  makEntry(0, "PLAYBACK", "Mutation error: Network request failed", true, 0),
  makEntry(1, "STREAM", "HTTP 503 — Service Unavailable", true, 100),
  makEntry(2, "BUFFER", "addSourceBuffer failed: NotSupportedError", true, 200),
  makEntry(3, "BUFFER", "appendBuffer error: InvalidStateError: SourceBuffer updating", true, 300),
  makEntry(4, "PLAYBACK", "Stream error: net::ERR_ABORTED", true, 400),
];

export const ErrorHeavy: Story = {
  args: { entries: ERROR_ENTRIES, onClear: noop },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // All entries should have error styling — spot check a few messages exist
    await expect(canvas.getByText("Mutation error: Network request failed")).toBeInTheDocument();
    await expect(canvas.getByText("HTTP 503 — Service Unavailable")).toBeInTheDocument();
  },
};

const HIGH_VOLUME_ENTRIES: ReadonlyArray<LogEntry> = Array.from({ length: 300 }, (_, i) => {
  const categories: LogEntry["category"][] = ["STREAM", "BUFFER", "PLAYBACK"];
  return makEntry(
    i,
    categories[i % 3] ?? "STREAM",
    `Segment parsed — ${(i + 1) * 1024}B`,
    false,
    i * 33
  );
});

export const HighVolume: Story = {
  args: { entries: HIGH_VOLUME_ENTRIES, onClear: noop },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Entry count badge should show 300
    await expect(canvas.getByText("300")).toBeInTheDocument();
  },
};
