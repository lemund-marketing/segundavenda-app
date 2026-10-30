package br.com.segundavenda.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.MimeTypeMap;
import android.widget.Toast;
import androidx.annotation.RequiresApi;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Salva no celular o arquivo que a própria página gera: o CSV do CRM, de
 * Produtos e de Performance, a foto, o áudio ou o PDF de uma conversa. A página
 * entrega o conteúdo em base64 (src/app/nativo/salvarArquivos.ts), porque o
 * WebView não salva link blob: nem data:.
 *
 * No Android 10 ou mais novo o arquivo vai para Downloads, sem pedir permissão.
 * Nos mais antigos isso exigiria a permissão de armazenamento: lá abre o
 * "Compartilhar", e a pessoa escolhe onde guardar (Drive, Arquivos, WhatsApp).
 */
@CapacitorPlugin(name = "Arquivos")
public class ArquivosPlugin extends Plugin {

    // Um arquivo por vez, fora da linha da tela: decodificar e gravar um CSV de
    // alguns MB travaria a rolagem.
    private final ExecutorService fila = Executors.newSingleThreadExecutor();
    private final Handler telaPrincipal = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void salvar(PluginCall call) {
        final String base64 = call.getString("base64");
        if (base64 == null) {
            call.reject("Arquivo vazio");
            return;
        }
        final String tipo = tipoLimpo(call.getString("tipo"));
        final String nome = nomeLimpo(call.getString("nome"), tipo);
        fila.execute(() -> {
            try {
                byte[] conteudo = Base64.decode(base64, Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    salvarEmDownloads(nome, tipo, conteudo);
                    avisar("Salvo em Downloads: " + nome);
                } else {
                    compartilhar(nome, tipo, conteudo);
                }
                call.resolve();
            } catch (Exception e) {
                avisar("Não foi possível salvar o arquivo");
                call.reject("Não foi possível salvar o arquivo", e);
            }
        });
    }

    @RequiresApi(api = Build.VERSION_CODES.Q)
    private void salvarEmDownloads(String nome, String tipo, byte[] conteudo) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues valores = new ContentValues();
        valores.put(MediaStore.MediaColumns.DISPLAY_NAME, nome);
        valores.put(MediaStore.MediaColumns.MIME_TYPE, tipo);
        valores.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
        // Pendente enquanto escreve: outro app não vê o arquivo pela metade.
        valores.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, valores);
        if (uri == null) throw new IOException("O Android recusou o arquivo");
        try (OutputStream saida = resolver.openOutputStream(uri)) {
            if (saida == null) throw new IOException("Sem como escrever o arquivo");
            saida.write(conteudo);
        } catch (IOException e) {
            resolver.delete(uri, null, null);
            throw e;
        }
        valores.clear();
        valores.put(MediaStore.MediaColumns.IS_PENDING, 0);
        resolver.update(uri, valores, null, null);
    }

    private void compartilhar(String nome, String tipo, byte[] conteudo) throws IOException {
        Context contexto = getContext();
        File pasta = new File(contexto.getCacheDir(), "arquivos");
        if (!pasta.isDirectory() && !pasta.mkdirs()) throw new IOException("Sem pasta para o arquivo");
        File arquivo = new File(pasta, nome);
        try (FileOutputStream saida = new FileOutputStream(arquivo)) {
            saida.write(conteudo);
        }
        // A autoridade é a do <provider> do AndroidManifest (${applicationId}.fileprovider).
        Uri uri = FileProvider.getUriForFile(contexto, contexto.getPackageName() + ".fileprovider", arquivo);
        Intent envio = new Intent(Intent.ACTION_SEND)
            .setType(tipo)
            .putExtra(Intent.EXTRA_STREAM, uri)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        telaPrincipal.post(() -> getActivity().startActivity(Intent.createChooser(envio, "Salvar " + nome)));
    }

    private void avisar(String texto) {
        telaPrincipal.post(() -> Toast.makeText(getContext(), texto, Toast.LENGTH_LONG).show());
    }

    /** "text/csv;charset=utf-8;" vira "text/csv": o MediaStore não aceita parâmetros. */
    private static String tipoLimpo(String tipo) {
        String limpo = tipo == null ? "" : tipo.split(";")[0].trim().toLowerCase(Locale.ROOT);
        return limpo.isEmpty() ? "application/octet-stream" : limpo;
    }

    /**
     * Só o nome, sem pasta nem caractere que o sistema de arquivos recusa. Sem
     * extensão (a mídia do WhatsApp vem como "media-<hora>"), ganha a do tipo,
     * para o celular saber com que app abrir.
     */
    private static String nomeLimpo(String nome, String tipo) {
        String limpo = nome == null ? "" : nome.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (limpo.isEmpty() || limpo.startsWith(".")) limpo = "arquivo" + limpo;
        int ponto = limpo.lastIndexOf('.');
        String base = ponto > 0 ? limpo.substring(0, ponto) : limpo;
        String extensao = ponto > 0 && ponto < limpo.length() - 1 ? limpo.substring(ponto) : "";
        if (base.length() > 100) base = base.substring(0, 100);
        if (extensao.isEmpty()) {
            String doTipo = MimeTypeMap.getSingleton().getExtensionFromMimeType(tipo);
            if (doTipo != null) extensao = "." + doTipo;
        }
        return base + extensao;
    }
}
