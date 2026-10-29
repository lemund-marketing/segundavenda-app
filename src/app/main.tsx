import { createRoot } from "react-dom/client";
import "@/app/fonte.css";
import "@/index.css";
// Registra o window.svVoltar logo na abertura: o Voltar do Android pergunta a
// ele, e sem gaveta nem janela em uso ninguém mais importaria o módulo.
import "@/app/nativo/useVoltarFecha";
import App from "@/app/App";

createRoot(document.getElementById("root")!).render(<App />);
