import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import GraphView from "./GraphView";
import type { Graph } from "../../lib/types";

const graph: Graph = {
  nodes: [
    { id: "u", name: "User", type: "Person", props: { root: true } },
    { id: "s", name: "Spanish", type: "Skill", props: { source_turn: "t1", source_text: "I'm learning Spanish" } },
  ],
  edges: [{ id: "e1", source: "u", target: "s", type: "LEARNING" }],
};

describe("GraphView", () => {
  it("renders a node and edge for each graph element", () => {
    render(<GraphView graph={graph} />);
    const svg = screen.getByTestId("memory-graph");
    expect(svg.querySelectorAll("[data-node-name]")).toHaveLength(2);
    expect(svg.querySelectorAll("line")).toHaveLength(1);
    expect(screen.getByText("learning")).toBeInTheDocument();
  });

  it("clicking a memory node reports it for chat navigation", async () => {
    const onClick = vi.fn();
    render(<GraphView graph={graph} onNodeClick={onClick} />);
    await userEvent.click(screen.getByLabelText("Memory: Spanish"));
    expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ id: "s", name: "Spanish" }));
  });

  it("root node is not clickable", async () => {
    const onClick = vi.fn();
    render(<GraphView graph={graph} onNodeClick={onClick} />);
    await userEvent.click(screen.getByLabelText("Memory: User"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows an empty state without nodes", () => {
    render(<GraphView graph={{ nodes: [], edges: [] }} />);
    expect(screen.getByText(/Nothing here yet/)).toBeInTheDocument();
  });

  it("dims non-matching nodes when searching", () => {
    render(<GraphView graph={graph} search="span" />);
    const spanish = screen.getByLabelText("Memory: Spanish").closest("g");
    const user = screen.getByLabelText("Memory: User").closest("g");
    expect(spanish).toHaveAttribute("opacity", "1");
    expect(user).toHaveAttribute("opacity", "0.18");
  });

  it("filters by category", () => {
    render(<GraphView graph={graph} typeFilter="Person" />);
    // Skill node dimmed; root (Person, but root always visible) full opacity
    expect(screen.getByLabelText("Memory: Spanish").closest("g")).toHaveAttribute("opacity", "0.18");
    expect(screen.getByLabelText("Memory: User").closest("g")).toHaveAttribute("opacity", "1");
  });
});
