// @vitest-environment jsdom
import "../test/setup";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Directory } from "../components/directory";
import { PlaceCard } from "../components/place-card";
import type { PlaceSummary } from "../lib/types";

const mocks = vi.hoisted(() => ({ query: "", replace: vi.fn(), resource: vi.fn(), reload: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.query),
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("../hooks/use-api-resource", () => ({ useApiResource: mocks.resource }));
vi.mock("../components/traveller-provider", () => ({ useTraveller: () => ({ userId: 1 }) }));

const places: PlaceSummary[] = [
  { id: 2, name: "New Corner Café", category: "Food", description: "Coffee and fresh pastries.", openingHours: "Daily, 07:00–20:00", imageRef: null, reviewCount: 1, averageRating: 5, rankingScore: 3.75 },
  { id: 1, name: "National Museum of Ethiopia", category: "History", description: "Archaeology, history, and art.", openingHours: "Daily, 09:00–17:30", imageRef: null, reviewCount: 3, averageRating: 14 / 3, rankingScore: 3.9375 },
];

beforeEach(() => {
  mocks.query = "";
  window.history.replaceState(null, "", "/");
  mocks.replace.mockReset();
  mocks.reload.mockReset();
  mocks.resource.mockReset().mockReturnValue({ data: places, loading: false, error: null, reload: mocks.reload });
});
afterEach(cleanup);

describe("live place directory", () => {
  it("renders actual statistics and links in the order supplied by the backend", () => {
    render(<Directory />);
    const results = within(screen.getByRole("region", { name: "Places" }));
    expect(results.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/places/2", "/places/1"]);
    expect(screen.getByRole("img", { name: "5.0 out of 5 stars from 1 review" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "4.7 out of 5 stars from 3 reviews" })).toBeInTheDocument();
    expect(screen.getByText("2 places to explore")).toBeInTheDocument();
    expect(mocks.resource).toHaveBeenCalledWith("/api/places?sort=top-rated", 1);
    expect(screen.getByText("How we rank")).toBeInTheDocument();
  });

  it("restores filters from the URL and requests changed categories and sorts through navigation", () => {
    mocks.query = "category=History&sort=name";
    mocks.replace.mockImplementation((url: string) => { mocks.query = url.split("?")[1] ?? ""; });
    const view = render(<Directory />);
    expect(screen.getByRole("button", { name: "History" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Sort by")).toHaveValue("name");
    expect(mocks.resource).toHaveBeenLastCalledWith("/api/places?category=History&sort=name", 1);

    fireEvent.click(screen.getByRole("button", { name: "Food" }));
    expect(mocks.replace).toHaveBeenLastCalledWith("/?category=Food&sort=name", { scroll: false });
    view.rerender(<Directory />);
    expect(mocks.resource).toHaveBeenLastCalledWith("/api/places?category=Food&sort=name", 1);
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "top-rated" } });
    expect(mocks.replace).toHaveBeenLastCalledWith("/?category=Food", { scroll: false });
    view.rerender(<Directory />);
    expect(mocks.resource).toHaveBeenLastCalledWith("/api/places?category=Food&sort=top-rated", 1);
  });

  it("keeps rapid category and sort choices together while navigation is still pending", () => {
    const view = render(<Directory />);
    fireEvent.click(screen.getByRole("button", { name: "Food" }));
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "name" } });

    // The router has not published either URL yet.
    expect(mocks.query).toBe("");
    expect(mocks.replace).toHaveBeenLastCalledWith("/?category=Food&sort=name", { scroll: false });
    expect(screen.getByRole("button", { name: "Food" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Sort by")).toHaveValue("name");
    expect(mocks.resource).toHaveBeenLastCalledWith("/api/places?category=Food&sort=name", 1);

    // Publishing the first navigation must not undo the newer sort selection.
    mocks.query = "category=Food";
    view.rerender(<Directory />);
    expect(screen.getByLabelText("Sort by")).toHaveValue("name");
    expect(mocks.resource).toHaveBeenLastCalledWith("/api/places?category=Food&sort=name", 1);

    mocks.query = "category=Food&sort=name";
    view.rerender(<Directory />);
    // A subsequent URL change (including browser back) remains authoritative.
    mocks.query = "";
    view.rerender(<Directory />);
    expect(screen.getByRole("button", { name: "All places" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Sort by")).toHaveValue("top-rated");
    expect(mocks.resource).toHaveBeenLastCalledWith("/api/places?sort=top-rated", 1);
  });

  it("restores browser history even when newer control changes have not finished navigating", () => {
    const view = render(<Directory />);
    fireEvent.click(screen.getByRole("button", { name: "Food" }));
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "name" } });

    window.history.replaceState(null, "", "/?category=History");
    mocks.query = "category=History";
    fireEvent(window, new PopStateEvent("popstate"));
    view.rerender(<Directory />);
    expect(screen.getByRole("button", { name: "History" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Sort by")).toHaveValue("top-rated");
    expect(mocks.resource).toHaveBeenLastCalledWith("/api/places?category=History&sort=top-rated", 1);
  });

  it("announces loading and offers an explicit retry after a failed request", () => {
    mocks.resource.mockReturnValue({ data: null, loading: true, error: null, reload: mocks.reload });
    const view = render(<Directory />);
    expect(screen.getByRole("status", { name: "Loading places" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();

    mocks.resource.mockReturnValue({ data: null, loading: false, error: new Error("Please check your connection."), reload: mocks.reload });
    view.rerender(<Directory />);
    expect(screen.getByRole("alert")).toHaveTextContent("Please check your connection.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });

  it("offers a category reset for empty results while preserving the selected sort", () => {
    mocks.query = "category=Nature&sort=name";
    mocks.resource.mockReturnValue({ data: [], loading: false, error: null, reload: mocks.reload });
    render(<Directory />);
    expect(screen.getByText("0 places to explore")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No places here yet");
    fireEvent.click(screen.getByRole("button", { name: "Explore all places" }));
    expect(mocks.replace).toHaveBeenCalledWith("/?sort=name", { scroll: false });
  });

  it("replaces a failed photograph with the local placeholder", () => {
    render(<PlaceCard place={places[0]} />);
    const image = screen.getByAltText("");
    expect(new URL(image.getAttribute("src") ?? "", window.location.href).pathname).toBe("/images/food.jpg");
    fireEvent.error(image);
    expect(new URL(image.getAttribute("src") ?? "", window.location.href).pathname).toBe("/images/placeholder.svg");
    expect(screen.getByRole("link")).toHaveAttribute("href", "/places/2");
  });
});
