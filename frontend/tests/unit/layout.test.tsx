import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AppShell } from "@/components/layout/app-shell";
import { BottomNav } from "@/components/layout/bottom-nav";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton, LineSkeleton, PosterSkeleton } from "@/components/ui/skeleton";
import { LibraryControls } from "@/components/library/library-controls";
import { resetNavigationState, setNavigationState } from "../helpers/navigation";

describe("AppShell", () => {
  beforeEach(() => {
    resetNavigationState();
  });

  it("renders the title and the content", () => {
    render(
      <AppShell title="Библиотека" subtitle="Ваш список">
        <p>Контент</p>
      </AppShell>,
    );

    expect(
      screen.getByRole("heading", { name: "Библиотека" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ваш список")).toBeInTheDocument();
    expect(screen.getByText("Контент")).toBeInTheDocument();
  });

  it("navigates back when the back button is used", async () => {
    const user = userEvent.setup();
    render(
      <AppShell title="Аниме" back>
        <p>Контент</p>
      </AppShell>,
    );

    await user.click(screen.getByRole("button", { name: "Назад" }));

    expect(screen.getByText("Контент")).toBeInTheDocument();
  });
});

describe("BottomNav", () => {
  beforeEach(() => {
    resetNavigationState();
  });

  it("links to the main sections", () => {
    render(<BottomNav />);

    expect(screen.getByRole("link", { name: /Главная/ })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: /Библиотека/ })).toHaveAttribute(
      "href",
      "/library",
    );
  });

  it("marks the current section", () => {
    setNavigationState({ pathname: "/library" });
    render(<BottomNav />);

    expect(
      screen.getByRole("link", { name: /Библиотека/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Главная/ })).not.toHaveAttribute(
      "aria-current",
    );
  });
});

describe("SearchInput", () => {
  it("reports every keystroke", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<SearchInput value="" onChange={onChange} />);

    await user.type(screen.getByLabelText("Поиск аниме"), "a");

    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("reports the submission on Enter", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<SearchInput value="bebop" onChange={() => {}} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Поиск аниме"), "{Enter}");

    expect(onSubmit).toHaveBeenCalledWith("bebop");
  });
});

describe("Skeleton", () => {
  it("renders the placeholders", () => {
    const { container } = render(
      <div>
        <Skeleton className="h-4 w-10" />
        <LineSkeleton />
        <PosterSkeleton />
      </div>,
    );

    expect(container.querySelectorAll("[aria-hidden='true']")).toHaveLength(3);
  });
});

describe("LibraryControls", () => {
  it("shows every status and the progress", () => {
    render(
      <LibraryControls
        status="watching"
        progress={3}
        totalEpisodes={26}
        onStatusChange={() => {}}
        onProgressChange={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "Смотрю" })).toBeInTheDocument();
    expect(screen.getByLabelText("Прогресс:")).toHaveValue(3);
    expect(screen.getByText("/ 26")).toBeInTheDocument();
  });

  it("reports a status change", async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();

    render(
      <LibraryControls
        status="watching"
        progress={3}
        onStatusChange={onStatusChange}
        onProgressChange={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Просмотрено" }));

    expect(onStatusChange).toHaveBeenCalledWith("completed");
  });

  it("ignores an invalid progress", async () => {
    const user = userEvent.setup();
    const onProgressChange = vi.fn();

    render(
      <LibraryControls
        status="watching"
        progress={3}
        onStatusChange={() => {}}
        onProgressChange={onProgressChange}
      />,
    );

    const input = screen.getByLabelText("Прогресс:");
    await user.clear(input);
    await user.type(input, "-4");

    expect(onProgressChange).not.toHaveBeenCalledWith(-4);
  });
});
