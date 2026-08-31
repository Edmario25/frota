import React from "react";
import { createRoot } from "react-dom/client";
import { AdmissaoPanel } from "../src/components/sms/AdmissaoPanel";
import "../src/index.css";
createRoot(document.getElementById("root")!).render(
  <AdmissaoPanel obras={[{ id: "obra-1", nome: "Obra teste" }]} />,
);
