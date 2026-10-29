/**
 * O site (app.segundavenda.com.br) é de outra pessoa e o app nunca mexe nele:
 * só abre links para ele, no navegador do celular. Serve para as telas que o
 * app ainda não tem e para o que mora só no site (e-mail de troca de senha).
 */
export const URL_SITE = "https://app.segundavenda.com.br";

export const noSite = (caminho: string) => `${URL_SITE}${caminho}`;
