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

public class MainActivity extends BridgeActivity {

    // Origem das páginas servidas de dentro do APK, como a de erro (errorPath).
    private static final String ORIGEM_LOCAL = "https://localhost/";

    // Hora da última recriação por queda do WebView, para não entrar em laço.
    private static long ultimaRecriacao = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Aparelho sem WebView: o Capacitor já mostra o aviso dele.
        if (getBridge() == null) return;

        final WebView webView = getBridge().getWebView();

        // Voltar anda no histórico do site. Na primeira tela, ou na página de erro
        // (voltar repetiria o endereço que falhou), manda o app para segundo plano,
        // como o botão Home: não fecha e não perde a sessão.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                String url = webView.getUrl();
                boolean naPaginaDeErro = url != null && url.startsWith(ORIGEM_LOCAL);
                if (!naPaginaDeErro && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    moveTaskToBack(true);
                }
            }
        });

        // Sem isto o WebView ignora downloads em silêncio. Link de arquivo (http/https)
        // abre no navegador, que baixa. Arquivo gerado na própria página (blob:/data:,
        // como as exportações em CSV) ainda não tem como ser salvo daqui: avisa.
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url.startsWith("http://") || url.startsWith("https://")) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (ActivityNotFoundException e) {
                    Toast.makeText(this, "Nenhum app para abrir este arquivo", Toast.LENGTH_SHORT).show();
                }
            } else {
                Toast.makeText(this, "Este download ainda só funciona no computador", Toast.LENGTH_LONG).show();
            }
        });

        // Se o Android matar o processo que desenha a página (celular com pouca memória,
        // app em segundo plano), o padrão do Capacitor é derrubar o app inteiro. Aqui o
        // WebView morto é descartado e a tela é recriada: o site abre de novo, já logado.
        // Duas quedas em menos de 10 s indicam erro que se repete: aí segue o padrão.
        getBridge().addWebViewListener(new WebViewListener() {
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
    }
}
