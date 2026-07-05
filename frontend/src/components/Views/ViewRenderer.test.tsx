import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ViewRenderer from "./ViewRenderer";
import type { ViewSpec } from "../../lib/types";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("ViewRenderer", () => {
  it("renders a file list with sizes and icons", () => {
    const view: ViewSpec = {
      type: "file_list",
      path: "/Users/me/Downloads",
      total: 2,
      entries: [
        { name: "Projects", kind: "dir", size: null, suffix: "" },
        { name: "report.pdf", kind: "file", size: 2048, suffix: ".pdf" },
      ],
    };
    render(<ViewRenderer view={view} />);
    expect(screen.getByTestId("view-file-list")).toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
    expect(screen.getByText("2 items")).toBeInTheDocument();
  });

  it("renders file contents as a code block", () => {
    const view: ViewSpec = {
      type: "file_content",
      path: "/Users/me/notes.md",
      content: "# hello world",
    };
    render(<ViewRenderer view={view} />);
    expect(screen.getByTestId("view-file-content")).toHaveTextContent("# hello world");
  });

  it("toggles a task and persists it to the graph", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }) as never,
    );
    const onMutate = vi.fn();
    const view: ViewSpec = {
      type: "task_list",
      tasks: [{ id: "t1", name: "Buy groceries", type: "Task", props: {} }],
    };
    render(<ViewRenderer view={view} onMutate={onMutate} />);
    const task = screen.getByRole("button", { name: /Buy groceries/ });
    expect(task).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(task);
    expect(task).toHaveAttribute("aria-pressed", "true");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/graph/nodes/t1",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(onMutate).toHaveBeenCalled();
  });
});
