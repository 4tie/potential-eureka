import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SmartPairSelector from "./SmartPairSelector";

describe("SmartPairSelector", () => {
  beforeEach(() => {
    globalThis.fetch = jest.fn(async (url) => {
      const text = String(url);
      if (text.startsWith("/api/pairs/search")) {
        return { ok: true, json: async () => ({ matches: ["ETH/USDT"] }) };
      }
      return {
        ok: true,
        json: async () => ({
          available_pairs: ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
          favorite_pairs: [],
          locked_pairs: [],
          max_open_trades: 1,
        }),
      };
    });
  });

  test("enforces max selection limit and reports changes", async () => {
    const onChange = jest.fn();
    render(<SmartPairSelector value={[]} onChange={onChange} />);

    fireEvent.click(await screen.findByRole("button", { name: /select trading pairs/i }));
    fireEvent.click(await screen.findByText("BTC/USDT"));
    fireEvent.click(screen.getByText("ETH/USDT"));

    expect(onChange).toHaveBeenCalledWith(["BTC/USDT"]);
    expect(onChange).not.toHaveBeenCalledWith(["BTC/USDT", "ETH/USDT"]);
  });

  test("searches and displays empty results", async () => {
    render(<SmartPairSelector value={[]} />);

    fireEvent.click(await screen.findByRole("button", { name: /select trading pairs/i }));
    const input = screen.getByPlaceholderText(/filter pairs/i);
    fireEvent.change(input, { target: { value: "ETH" } });

    expect(await screen.findByText("ETH/USDT")).toBeInTheDocument();

    fetch.mockImplementation(async (url) => {
      if (String(url).startsWith("/api/pairs/search")) {
        return { ok: true, json: async () => ({ matches: [] }) };
      }
      return { ok: true, json: async () => ({ available_pairs: [] }) };
    });
    fireEvent.change(input, { target: { value: "NOPE" } });
    await waitFor(() => expect(screen.getByText("No matches found.")).toBeInTheDocument());
  });

  test("does not open when disabled", async () => {
    render(<SmartPairSelector value={[]} disabled />);

    const trigger = await screen.findByRole("button", { name: /select trading pairs/i });
    fireEvent.click(trigger);

    expect(screen.queryByPlaceholderText(/filter pairs/i)).not.toBeInTheDocument();
  });
});
