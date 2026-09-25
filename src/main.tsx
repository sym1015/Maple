import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import CharacterDesigner from "./components/CharacterDesigner/CharacterDesigner";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CharacterDesigner />
  </StrictMode>,
);
