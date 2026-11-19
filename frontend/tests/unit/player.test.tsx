import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const hlsMock = vi.hoisted(() => ({
  isSupported: vi.fn(() => true),
  loadSource: vi.fn(),
  attachMedia: vi.fn(),
  on: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("hls.js", () => {
  class FakeHls {
    static isSupported = hlsMock.isSupported;
    static Events = { ERROR: "error", MANIFEST_PARSED: "manifestParsed" };
    static ErrorTypes = { NETWORK_ERROR: "networkError", MEDIA_ERROR: "mediaError" };
    loadSource = hlsMock.loadSource;
    attachMedia = hlsMock.attachMedia;
    on = hlsMock.on;
    destroy = hlsMock.destroy;
  }
  return { default: FakeHls };
});

import {
  VideoPlayer,
  forwardableHeaders,
} from "@/components/player/video-player";

describe("forwardableHeaders", () => {
  it("keeps only the headers a browser may send", () => {
    const headers = forwardableHeaders({
      Referer: "https://example.org",
      Origin: "https://example.org",
      "User-Agent": "Mozilla/5.0",
      Cookie: "session=secret",
      Authorization: "Bearer secret",
    });

    expect(headers).toEqual({
      Referer: "https://example.org",
      Origin: "https://example.org",
    });
  });

  it("returns an empty object without headers", () => {
    expect(forwardableHeaders(undefined)).toEqual({});
    expect(forwardableHeaders({})).toEqual({});
  });
});

describe("VideoPlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hlsMock.isSupported.mockReturnValue(true);
  });

  it("renders a video element", () => {
    render(<VideoPlayer src="https://example.org/video.mp4" />);

    expect(screen.getByTestId("video-player")).toBeInTheDocument();
  });

  it("loads an HLS stream through hls.js", async () => {
    render(<VideoPlayer src="https://example.org/master.m3u8" />);

    await waitFor(() => {
      expect(hlsMock.loadSource).toHaveBeenCalledWith(
        "https://example.org/master.m3u8",
      );
    });
    expect(hlsMock.attachMedia).toHaveBeenCalled();
  });

  it("reports a fatal network error", async () => {
    render(<VideoPlayer src="https://example.org/master.m3u8" />);

    await waitFor(() => expect(hlsMock.on).toHaveBeenCalled());

    const errorHandler = hlsMock.on.mock.calls.find(
      (call) => call[0] === "error",
    )?.[1] as ((event: unknown, data: unknown) => void) | undefined;

    errorHandler?.({}, { fatal: true, type: "networkError" });

    await waitFor(() => {
      expect(screen.getByText(/Ошибка воспроизведения/)).toBeInTheDocument();
    });
  });

  it("ignores a non fatal error", async () => {
    render(<VideoPlayer src="https://example.org/master.m3u8" />);

    await waitFor(() => expect(hlsMock.on).toHaveBeenCalled());

    const errorHandler = hlsMock.on.mock.calls.find(
      (call) => call[0] === "error",
    )?.[1] as ((event: unknown, data: unknown) => void) | undefined;

    errorHandler?.({}, { fatal: false, type: "networkError" });

    expect(screen.queryByText(/Ошибка воспроизведения/)).not.toBeInTheDocument();
  });

  it("reports that the browser does not support HLS", async () => {
    hlsMock.isSupported.mockReturnValue(false);
    const playType = vi
      .spyOn(window.HTMLMediaElement.prototype, "canPlayType")
      .mockReturnValue("");

    render(<VideoPlayer src="https://example.org/master.m3u8" />);

    await waitFor(() => {
      expect(screen.getByText(/Браузер не поддерживает формат HLS/)).toBeInTheDocument();
    });

    playType.mockRestore();
  });

  it("shows the title of the source", () => {
    render(
      <VideoPlayer src="https://example.org/v.mp4" title="Озвучка AniLibria" />,
    );

    expect(screen.getByText("Озвучка AniLibria")).toBeInTheDocument();
  });

  it("keeps the player usable with a keyboard", async () => {
    const user = userEvent.setup();
    render(<VideoPlayer src="https://example.org/v.mp4" />);

    const video = screen.getByTestId("video-player");
    await user.tab();

    expect(video).toBeInTheDocument();
  });

  it("opens fullscreen in landscape and switches the orientation", async () => {
    const user = userEvent.setup();
    render(<VideoPlayer src="https://example.org/v.mp4" />);

    const stage = screen.getByTestId("video-stage");
    expect(stage).toHaveAttribute("data-fullscreen", "false");
    expect(
      screen.queryByRole("button", { name: "Повернуть вертикально" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "На весь экран" }));

    expect(stage).toHaveAttribute("data-fullscreen", "true");
    expect(stage).toHaveAttribute("data-orientation", "landscape");
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(
      screen.getByRole("button", { name: "Повернуть вертикально" }),
    );
    expect(stage).toHaveAttribute("data-orientation", "portrait");

    await user.click(
      screen.getByRole("button", { name: "Повернуть горизонтально" }),
    );
    expect(stage).toHaveAttribute("data-orientation", "landscape");

    await user.click(
      screen.getByRole("button", { name: "Выйти из полноэкранного режима" }),
    );

    expect(stage).toHaveAttribute("data-fullscreen", "false");
    expect(stage).toHaveAttribute("data-orientation", "portrait");
    expect(document.body.style.overflow).toBe("");
  });

  it("rotates the stage on a portrait screen", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });

    render(<VideoPlayer src="https://example.org/v.mp4" />);

    await user.click(screen.getByRole("button", { name: "На весь экран" }));

    const frame = screen.getByTestId("video-frame");
    expect(frame).toHaveAttribute("data-rotated", "true");
    expect(frame.style.transform).toContain("rotate(90deg)");

    await user.click(
      screen.getByRole("button", { name: "Повернуть вертикально" }),
    );
    expect(screen.getByTestId("video-frame")).toHaveAttribute(
      "data-rotated",
      "false",
    );

    Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 768, configurable: true });
  });

  it("leaves the fullscreen mode on Escape", async () => {
    const user = userEvent.setup();
    render(<VideoPlayer src="https://example.org/v.mp4" />);

    await user.click(screen.getByRole("button", { name: "На весь экран" }));
    expect(screen.getByTestId("video-stage")).toHaveAttribute(
      "data-fullscreen",
      "true",
    );

    await user.keyboard("{Escape}");

    expect(screen.getByTestId("video-stage")).toHaveAttribute(
      "data-fullscreen",
      "false",
    );
  });
});
