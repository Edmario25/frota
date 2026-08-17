import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import AppCampo from "@/pages/app/campo/AppCampo"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppCampo />
  </StrictMode>
)
