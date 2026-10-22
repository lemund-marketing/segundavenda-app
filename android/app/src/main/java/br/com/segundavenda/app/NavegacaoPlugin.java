package br.com.segundavenda.app;

import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Decide quais endereços de fora do site abrem dentro do app.
 *
 * Por padrão o Capacitor manda para o navegador tudo que não é
 * app.segundavenda.com.br. A exceção é o link de login do Supabase
 * (/auth/v1/verify), usado pelo admin em "Logar como este usuário": ele
 * precisa abrir aqui dentro para a sessão nova ficar no app, já que o
 * Supabase devolve para app.segundavenda.com.br logo em seguida. Os outros
 * links do Supabase (arquivos do Storage) continuam abrindo no navegador.
 */
@CapacitorPlugin(name = "SvNavegacao")
public class NavegacaoPlugin extends Plugin {

    // Projeto Supabase de produção (o mesmo do site).
    private static final String HOST_SUPABASE = "fvyhjrqzklbfkmpajoyj.supabase.co";

    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        String caminho = url.getPath();
        if (HOST_SUPABASE.equals(url.getHost()) && caminho != null && caminho.startsWith("/auth/v1/verify")) {
            return false; // carrega dentro do app
        }
        return null; // regra padrão do Capacitor
    }
}
