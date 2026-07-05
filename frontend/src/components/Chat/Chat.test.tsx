import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import Chat from "./Chat";
import type { ChatMessage } from "../../lib/types";

describe("Chat", () => {
  it("renders user and assistant messages, marking pending acks", () => {
    const messages: ChatMessage[] = [
      { id: "1", role: "user", text: "I'm learning Spanish" },
      { id: "2", role: "assistant", text: "Got it — noting that down…", pending: true },
    ];
    render(<Chat messages={messages} connected onSend={() => {}} />);
    expect(screen.getByText("I'm learning Spanish")).toBeInTheDocument();
    const ack = screen.getByText("Got it — noting that down…");
    expect(ack).toHaveAttribute("data-pending", "true");
  });

  it("sends the typed message and clears the input", async () => {
    const onSend = vi.fn();
    render(<Chat messages={[]} connected onSend={onSend} />);
    const input = screen.getByLabelText("Message Inai");
    await userEvent.type(input, "what am I learning?");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledWith("what am I learning?");
    expect(input).toHaveValue("");
  });
});
