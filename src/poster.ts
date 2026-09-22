import { MARK_PATH } from "./knot/mark";
import { MARK } from "./knot/strands";
import type { Layout } from "./layout";

const SVG = "http://www.w3.org/2000/svg";

export function createPoster(layout: Layout): {
  readonly element: SVGSVGElement;
  fit(width: number, height: number): void;
} {
  const element = document.createElementNS(SVG, "svg");
  const path = document.createElementNS(SVG, "path");
  const [x, y] = MARK.centre.map((c) => c - MARK.unit);
  element.setAttribute("viewBox", `${x} ${y} ${2 * MARK.unit} ${2 * MARK.unit}`);
  element.setAttribute("aria-hidden", "true");
  element.classList.add("poster");
  path.setAttribute("d", MARK_PATH);
  element.append(path);
  return {
    element,
    fit(width, height) {
      const size = `${layout(width, height)}px`;
      element.style.width = size;
      element.style.height = size;
    },
  };
}
