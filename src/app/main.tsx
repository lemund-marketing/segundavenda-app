import { createRoot } from "react-dom/client";
import "@/app/fonte.css";
import "@/index.css";
// Registra o window.svVoltar logo na abertura: o Voltar do Android pergunta a
// ele, e sem gaveta nem janela em uso ninguém mais importaria o módulo.
import "@/app/nativo/useVoltarFecha";
import { ligarSalvarArquivos } from "@/app/nativo/salvarArquivos";
import { ligarPush } from "@/app/nativo/push";
import App from "@/app/App";

// No app instalado, o CSV e a mídia gerados na página vão para Downloads.
ligarSalvarArquivos();
// Notificação de oportunidade: só ouvintes, sem esperar nada antes da tela.
ligarPush();

createRoot(document.getElementById("root")!).render(<App />);
