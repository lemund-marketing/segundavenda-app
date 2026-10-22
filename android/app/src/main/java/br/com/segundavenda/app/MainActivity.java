package br.com.segundavenda.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
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

    // Telas do site onde voltar sai do app: o início e o login. O site manda
    // para o login com navegação comum, então voltar dali levaria a uma página
    // protegida que redireciona de novo para o login, sem nunca sair.
    private static final String CAMINHO_INICIO = "/";
    private static final String CAMINHO_LOGIN = "/auth";

    // Hora da última recriação por queda do WebView, para não entrar em laço.
    private static long ultimaRecriacao = 0;

    // A última página carregada foi a de erro: ao voltar para o site, limpa o histórico.
    private boolean vinhaDaPaginaLocal = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Tem que ser registrado antes do super.onCreate, que monta o Capacitor.
        registerPlugin(NavegacaoPlugin.class);
        super.onCreate(savedInstanceState);
        // Aparelho sem WebView: o Capacitor já mostra o aviso dele.
        if (getBridge() == null) return;

        final WebView webView = getBridge().getWebView();

        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView view) {
                String url = view.getUrl();
                if (url == null) return;
                if (url.startsWith(ORIGEM_LOCAL)) {
                    vinhaDaPaginaLocal = true;
                } else if (vinhaDaPaginaLocal) {
                    // Saiu da página de erro para o site: o endereço que falhou ficou
                    // para trás no histórico, e voltar o recarregaria. Começa do zero.
                    vinhaDaPaginaLocal = false;
                    view.clearHistory();
                }
            }

            // Se o Android matar o processo que desenha a página (celular com pouca
            // memória, app em segundo plano), o padrão do Capacitor é derrubar o app
            // inteiro. Aqui o WebView morto é descartado e a tela é recriada: o site
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

        // Sem internet ao abrir: vai direto para a página de erro. Sem isto o site
        // abriria da cópia guardada no celular (service worker), sem dados, e o site
        // desloga quem abre assim por não conseguir renovar a sessão.
        if (!temInternet()) {
            webView.loadUrl(getBridge().getErrorUrl());
        }

        // Voltar anda no histórico do site. No início, no login ou na página de
        // erro, manda o app para segundo plano, como o botão Home: não fecha e
        // não perde a sessão.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack() && !voltarSaiDoApp(webView.getUrl())) {
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
    }

    private static boolean voltarSaiDoApp(String url) {
        if (url == null) return false;
        if (url.startsWith(ORIGEM_LOCAL)) return true;
        String caminho = Uri.parse(url).getPath();
        if (caminho == null || caminho.isEmpty()) caminho = CAMINHO_INICIO;
        return CAMINHO_INICIO.equals(caminho) || CAMINHO_LOGIN.equals(caminho);
    }

    // Na dúvida (sem acesso ao serviço), responde que tem: melhor tentar abrir o site.
    private boolean temInternet() {
        try {
            ConnectivityManager cm = getSystemService(ConnectivityManager.class);
            if (cm == null) return true;
            Network rede = cm.getActiveNetwork();
            if (rede == null) return false;
            NetworkCapabilities recursos = cm.getNetworkCapabilities(rede);
            return recursos != null && recursos.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (SecurityException e) {
            return true;
        }
    }
}
