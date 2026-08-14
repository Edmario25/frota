import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import { TotemApp } from "./TotemApp"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TotemApp />
  </StrictMode>
)
