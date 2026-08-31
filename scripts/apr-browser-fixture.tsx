// Entrada exclusiva de teste servida pelo Vite; não integra as rotas do produto.
import React from "react";
import { createRoot } from "react-dom/client";
import { AprPanel } from "../src/components/sms/AprPanel";
import "../src/index.css";
createRoot(document.getElementById("root")!).render(
  <AprPanel
    obras={[{ id: "00000000-0000-0000-0000-000000000002", nome: "Obra teste" }]}
  />,
);
