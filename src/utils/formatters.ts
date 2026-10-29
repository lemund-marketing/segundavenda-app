// Utility functions for formatting data

/**
 * Formats a CPF string with mask (999.999.999-99)
 */
export const formatCPF = (cpf: string): string => {
  if (!cpf) return '';
  
  // Remove all non-numeric characters
  const numbers = cpf.replace(/\D/g, '');
  
  // Apply CPF mask
  if (numbers.length <= 11) {
    return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  
  return cpf; // Return original if longer than expected
};

/**
 * Formats a CNPJ string with mask (99.999.999/9999-99)
 */
export const formatCNPJ = (cnpj: string): string => {
  if (!cnpj) return '';
  
  // Remove all non-numeric characters
  const numbers = cnpj.replace(/\D/g, '');
  
  // Apply CNPJ mask
  if (numbers.length <= 14) {
    return numbers.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  
  return cnpj; // Return original if longer than expected
};

/**
 * Formats a document (CPF or CNPJ) based on its length
 */
export const formatDocument = (document: string): string => {
  if (!document) return '';

  const numbers = document.replace(/\D/g, '');

  // Só mascara quando o valor É um CPF ou um CNPJ. A maioria dos cadastros desta
  // base guarda um identificador de importação em `document` ("CPF-TESTE-002eb3dc"),
  // e extrair os dígitos dele devolvia um fragmento sem sentido ("0023") exibido
  // sob o rótulo "CPF". Fora dos dois tamanhos canônicos, mostra o valor como está.
  if (numbers.length === 11) return formatCPF(numbers);
  if (numbers.length === 14) return formatCNPJ(numbers);
  return document;
};

/**
 * Formats a number as Brazilian currency (R$ 123,45)
 */
export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', { 
    style: 'currency', 
    currency: 'BRL' 
  }).format(value);
};

/**
 * Custom tooltip formatter for currency values in charts
 */
export const currencyTooltipFormatter = (value: number, name: string) => {
  return [formatCurrency(value), name];
};

/**
 * Format number for chart labels (without R$ symbol)
 */
export const formatChartCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

/**
 * Formats marketplace slug to display name
 */
export const formatMarketplaceName = (marketplace: string): string => {
  if (!marketplace) return 'Outro';
  
  const marketplaceNames: Record<string, string> = {
    'mercado_livre': 'Mercado Livre',
    'melibr': 'Mercado Livre',
    'ml_full': 'ML - Full',
    'shopee': 'Shopee',
    'shopeebr': 'Shopee',
    'shopee_xpress': 'Shopee - Flex',
    'shopee_full': 'Shopee - Full',
    'amazon_full': 'Amazon - Full',
    'amazon_br': 'Amazon',
    'magalu': 'Magazine Luiza',
    'americanas': 'Americanas',
    'shopify': 'Shopify',
    'woocommerce': 'WooCommerce',
    'lojaintegrada': 'Loja Integrada',
    'segundavenda': 'Segunda Venda',
    'shein': 'Shein',
    'aliexpress': 'AliExpress',
    'kwai': 'Kwai',
    'tiktok': 'TikTok Shop',
    'netshoes': 'Netshoes',
    'retroativo': 'Retroativo',
    'kabum': 'KaBuM!',
    'casas_bahia': 'Casas Bahia',
    'bradesco': 'Bradesco',
    'droga_raia': 'Droga Raia',
    'carrefour': 'Carrefour',
    'casa_video': 'Casa&Video',
    'mosaico': 'Mosaico (Buscapé)',
    'mais_correios': 'Mais Correios',
    'inter_shop': 'Inter Shop',
    'ifood': 'iFood',
    'noventa_nove': '99',
    'temu': 'Temu',
    'leroy_merlin': 'Leroy Merlin',
    'madeira_madeira': 'Madeira & Madeira',
    'tray': 'Tray',
    'webcontinental': 'Webcontinental',
    'dafiti': 'Dafiti',
    'other': 'Outro',
  };
  
  const key = marketplace.toLowerCase().trim().replace(/[\s-]+/g, '_');
  return marketplaceNames[key] || marketplace;
};
/**
 * Telefone brasileiro para leitura humana. Cobre os três formatos que chegam do
 * WhatsApp/marketplaces: 13 dígitos com DDI (+55 (11) 91234-5678), 12 com DDI e
 * número de 8, e 11 sem DDI ((11) 91234-5678). O que não encaixa volta cru — é
 * melhor mostrar o número estranho do que esconder o contato.
 *
 * Existe aqui, e não em três telas, porque era exatamente isso: o mesmo contato
 * aparecia como "5511942581027" no card, "+55 (11) 94258-1027" na linha de
 * contato e "Cliente sem nome" no painel da direita — três identidades para a
 * mesma pessoa na mesma tela.
 */
export const formatPhoneDisplay = (phone?: string | null): string => {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone ?? "";
};

/**
 * Como chamar um contato que não tem ficha nomeada: telefone formatado, depois
 * e-mail, e só então o rótulo genérico. Nunca o número cru.
 */
export const contactDisplayName = (
  fullName?: string | null,
  phone?: string | null,
  email?: string | null,
  vazio = "Sem nome",
): string => {
  const nome = (fullName ?? "").trim();
  if (nome) return nome;
  const tel = formatPhoneDisplay(phone);
  if (tel) return tel;
  const mail = (email ?? "").trim();
  return mail || vazio;
};
