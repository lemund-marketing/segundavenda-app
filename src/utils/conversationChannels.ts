/**
 * "Esta conversa tem canal X?" — resposta ÚNICA para a lista, o cabeçalho e o filtro.
 *
 * Aqui a conversa é UMA por cliente (UNIQUE seller_id+client_id) e acumula os três
 * canais na mesma linha, então quem responde são as flags `has_*`. Nem
 * `conversations.channel`, que é só o rótulo da última atividade, nem
 * `whatsapp_contact_id`, que responde outra pergunta: "dá para ENVIAR daqui?".
 * As duas colunas divergem em massa — no sandbox 1564 conversas têm has_whatsapp e
 * nenhuma delas tem whatsapp_contact_id.
 *
 * As flags são mantidas por trigger nas tabelas FILHAS, não em `conversations`:
 * `trg_mark_conversation_has_message` (messages), `trg_mark_conversation_has_sms`
 * (sms_messages) e `trg_mark_conversation_has_email` (email_logs). As três colunas
 * são NOT NULL DEFAULT false, então nunca chegam nulas — não existe conversa
 * "sem flag" para tratar como legado.
 */
export const conversationHasWhatsApp = (conv: any): boolean => !!conv?.has_whatsapp;

export const conversationHasSms = (conv: any): boolean => !!conv?.has_sms;

export const conversationHasEmail = (conv: any): boolean => !!conv?.has_email;
