import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FileManager } from "@/components/file-manager";
import "./app.css";

const root = document.getElementById("root");
if (!root) throw new Error("Data Finder could not start");

createRoot(root).render(
  <StrictMode>
    <FileManager />
  </StrictMode>,
);
