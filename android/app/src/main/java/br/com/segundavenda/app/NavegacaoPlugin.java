package br.com.segundavenda.app;

import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * Decide quais endereços de fora do site abrem dentro do app.
 *
 * Por padrão o Capacitor manda para o navegador tudo que não é
 * app.segundavenda.com.br. A exceção é o link de login do Supabase
 * (connect.segundavenda.com.br/auth/v1/verify), usado pelo admin em "Logar como este usuário": ele
 * precisa abrir aqui dentro para a sessão nova ficar no app, já que o
 * Supabase devolve para app.segundavenda.com.br logo em seguida. Os outros
 * links do Supabase (arquivos do Storage) continuam abrindo no navegador.
 */
@CapacitorPlugin(name = "SvNavegacao")
public class NavegacaoPlugin extends Plugin {

    // Supabase de produção: o domínio próprio (é o que o link de login usa) e o
    // endereço original do projeto.
    private static final Set<String> HOSTS_SUPABASE = new HashSet<>(
        Arrays.asList("connect.segundavenda.com.br", "fvyhjrqzklbfkmpajoyj.supabase.co")
    );

    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        String caminho = url.getPath();
        if (HOSTS_SUPABASE.contains(url.getHost()) && caminho != null && caminho.startsWith("/auth/v1/verify")) {
            return false; // carrega dentro do app
        }
        return null; // regra padrão do Capacitor
    }
}
