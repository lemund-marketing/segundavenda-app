import { createRoot } from "react-dom/client";
import "@/app/fonte.css";
import "@/index.css";
// Registra o window.svVoltar logo na abertura: o Voltar do Android pergunta a
// ele, e sem gaveta nem janela em uso ninguém mais importaria o módulo.
import "@/app/nativo/useVoltarFecha";
import { ligarSalvarArquivos } from "@/app/nativo/salvarArquivos";
import App from "@/app/App";

// No app instalado, o CSV e a mídia gerados na página vão para Downloads.
ligarSalvarArquivos();

createRoot(document.getElementById("root")!).render(<App />);
