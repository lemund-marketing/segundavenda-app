package br.com.segundavenda.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

/**
 * As telas do app vêm de dentro do APK (pasta dist/ do projeto, servida em
 * https://localhost). Só os dados vão pela rede, direto para o Supabase. Link
 * para qualquer outro endereço (o site, um arquivo) o Capacitor abre no
 * navegador do celular.
 */
public class MainActivity extends BridgeActivity {

    // Telas onde voltar sai do app: o início e o login. Voltar do login levaria
    // a uma tela que exige conta, que mandaria de novo para o login.
    private static final String CAMINHO_INICIO = "/";
    private static final String CAMINHO_LOGIN = "/entrar";

    // Pergunta à página se há gaveta, janela ou conversa aberta: se houver, ela
    // fecha a do topo e responde true (src/app/nativo/useVoltarFecha.tsx). Com
    // a página ainda carregando, a função não existe e a resposta é false.
    private static final String PERGUNTA_VOLTAR =
        "(function(){try{return !!(window.svVoltar && window.svVoltar());}catch(e){return false;}})()";

    // Hora da última recriação por queda do WebView, para não entrar em laço.
    private static long ultimaRecriacao = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Antes do super: o Capacitor monta a ponte com os plugins registrados até ali.
        registerPlugin(ArquivosPlugin.class);
        super.onCreate(savedInstanceState);
        // Aparelho sem WebView: o Capacitor já mostra o aviso dele.
        if (getBridge() == null) return;

        final WebView webView = getBridge().getWebView();

        getBridge().addWebViewListener(new WebViewListener() {
            // Se o Android matar o processo que desenha a página (celular com pouca
            // memória, app em segundo plano), o padrão do Capacitor é derrubar o app
            // inteiro. Aqui o WebView morto é descartado e a tela é recriada: o app
            // abre de novo, já logado. Duas quedas em menos de 10 s indicam erro que
            // se repete: aí segue o padrão.
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                long agora = SystemClock.elapsedRealtime();
                if (ultimaRecriacao != 0 && agora - ultimaRecriacao < 10_000) return false;
                ultimaRecriacao = agora;
                if (view.getParent() instanceof ViewGroup) {
                    ((ViewGroup) view.getParent()).removeView(view);
                }
                view.destroy();
                recreate();
                return true;
            }
        });

        // Voltar primeiro fecha o que estiver aberto (gaveta, janela, conversa).
        // Sem nada aberto, volta de tela; no início ou no login, manda o app para
        // segundo plano, como o botão Home: não fecha e não perde a sessão.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                webView.evaluateJavascript(PERGUNTA_VOLTAR, resposta -> {
                    if ("true".equals(resposta)) return;
                    if (webView.canGoBack() && !voltarSaiDoApp(webView.getUrl())) {
                        webView.goBack();
                    } else {
                        moveTaskToBack(true);
                    }
                });
            }
        });

        // Sem isto o WebView ignora downloads em silêncio. Link de arquivo (http/https)
        // abre no navegador, que baixa. Arquivo gerado na própria página (blob:/data:,
        // como as exportações em CSV) a página entrega ao ArquivosPlugin antes de
        // chegar aqui; se mesmo assim chegar, não há o que salvar: avisa.
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url.startsWith("http://") || url.startsWith("https://")) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (ActivityNotFoundException e) {
                    Toast.makeText(this, "Nenhum app para abrir este arquivo", Toast.LENGTH_SHORT).show();
                }
            } else {
                Toast.makeText(this, "Não foi possível salvar este arquivo no app", Toast.LENGTH_LONG).show();
            }
        });
    }

    private static boolean voltarSaiDoApp(String url) {
        if (url == null) return false;
        String caminho = Uri.parse(url).getPath();
        if (caminho == null || caminho.isEmpty()) caminho = CAMINHO_INICIO;
        return CAMINHO_INICIO.equals(caminho) || CAMINHO_LOGIN.equals(caminho);
    }
}
