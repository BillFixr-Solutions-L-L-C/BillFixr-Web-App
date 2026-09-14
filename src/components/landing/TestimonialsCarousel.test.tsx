import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestimonialsCarousel from "./TestimonialsCarousel";

const TESTIMONIALS = Array.from({ length: 5 }, (_, i) => ({
  quote: `Quote ${i + 1}`,
  name: `Reviewer ${i + 1}`,
  rating: 5,
}));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TestimonialsCarousel autoplay", () => {
  it("does not show nav buttons (or need to autoplay) with 3 or fewer testimonials", () => {
    render(<TestimonialsCarousel testimonials={TESTIMONIALS.slice(0, 3)} />);
    expect(screen.queryByRole("button", { name: "Next testimonials" })).not.toBeInTheDocument();
  });

  it("advances to the next set automatically after the interval", () => {
    render(<TestimonialsCarousel testimonials={TESTIMONIALS} />);
    expect(screen.getByText("Quote 1")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByText("Quote 2")).toBeInTheDocument();
    expect(screen.queryByText("Quote 1")).not.toBeInTheDocument();
  });

  it("pauses autoplay while the pointer is over the cards", () => {
    render(<TestimonialsCarousel testimonials={TESTIMONIALS} />);

    fireEvent.mouseEnter(screen.getByTestId("testimonials-carousel"));
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(screen.getByText("Quote 1")).toBeInTheDocument();
  });

  it("resumes autoplay after the pointer leaves", () => {
    render(<TestimonialsCarousel testimonials={TESTIMONIALS} />);

    const carousel = screen.getByTestId("testimonials-carousel");
    fireEvent.mouseEnter(carousel);
    fireEvent.mouseLeave(carousel);
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByText("Quote 2")).toBeInTheDocument();
  });

  it("still supports manual navigation via the arrows", () => {
    render(<TestimonialsCarousel testimonials={TESTIMONIALS} />);

    fireEvent.click(screen.getByRole("button", { name: "Next testimonials" }));

    expect(screen.getByText("Quote 2")).toBeInTheDocument();
  });
});
