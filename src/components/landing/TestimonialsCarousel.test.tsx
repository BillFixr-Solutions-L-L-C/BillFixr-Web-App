import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TestimonialsCarousel from "./TestimonialsCarousel";

const makeTestimonials = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ quote: `Quote ${i + 1}`, name: `Reviewer ${i + 1}`, rating: 5 }));

describe("TestimonialsCarousel", () => {
  it("shows the empty state with no testimonials", () => {
    render(<TestimonialsCarousel testimonials={[]} />);
    expect(screen.getByText(/No reviews yet/)).toBeInTheDocument();
    expect(screen.queryByTestId("testimonials-carousel")).not.toBeInTheDocument();
  });

  it("lays out 3 or fewer testimonials statically, without the scrolling track", () => {
    render(<TestimonialsCarousel testimonials={makeTestimonials(3)} />);
    expect(screen.queryByTestId("testimonials-carousel")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Quote \d/)).toHaveLength(3);
  });

  it("switches to the scrolling track once there are more than 3 testimonials", () => {
    render(<TestimonialsCarousel testimonials={makeTestimonials(5)} />);
    expect(screen.getByTestId("testimonials-carousel")).toBeInTheDocument();
  });

  it("duplicates the set once for a seamless loop, hiding the duplicate from assistive tech", () => {
    const { container } = render(<TestimonialsCarousel testimonials={makeTestimonials(5)} />);
    // 5 real + 5 duplicated = 10 cards in the DOM.
    expect(screen.getAllByText(/Quote \d/)).toHaveLength(10);
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(5);
  });

  it("scales the animation duration with how much content there is", () => {
    const { container: fewer } = render(<TestimonialsCarousel testimonials={makeTestimonials(4)} />);
    const { container: more } = render(<TestimonialsCarousel testimonials={makeTestimonials(20)} />);

    const fewerTrack = fewer.querySelector(".animate-marquee") as HTMLElement;
    const moreTrack = more.querySelector(".animate-marquee") as HTMLElement;

    const fewerDuration = fewerTrack.style.getPropertyValue("--marquee-duration");
    const moreDuration = moreTrack.style.getPropertyValue("--marquee-duration");

    expect(parseInt(moreDuration)).toBeGreaterThan(parseInt(fewerDuration));
  });
});
