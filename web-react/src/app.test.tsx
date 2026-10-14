import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import App from "./App";

test("应用壳可渲染", () => {
  render(<App />);
  expect(screen.getByText("WebSpeak")).toBeInTheDocument();
});
