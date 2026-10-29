export const generateWhatsAppMessage = (
  template: string,
  clientName: string,
  product: string,
  orderValue: number,
  extraData?: {
    firstName?: string;
    currentStage?: string;
    daysInStage?: number;
    totalOrders?: number;
    totalValue?: number;
  }
): string => {
  const formattedValue = new Intl.NumberFormat('pt-BR', { 
    style: 'currency', 
    currency: 'BRL' 
  }).format(orderValue);

  const firstName = extraData?.firstName || clientName.split(' ')[0];
  const formattedTotalValue = extraData?.totalValue 
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(extraData.totalValue)
    : formattedValue;

  const firstProduct = (() => {
    const first = String(product || '').split(' | ')[0] || '';
    return first.replace(/^\s*\d+\s*x\s*/i, '').trim() || product;
  })();

  return template
    .replace(/{cliente}/g, clientName)
    .replace(/{nome_completo}/g, clientName)
    .replace(/{primeiro_nome}/g, firstName)
    .replace(/{produto}/g, product)
    .replace(/{todos_produtos}/g, product)
    .replace(/{primeiro_produto}/g, firstProduct)
    .replace(/{valor_pedido}/g, formattedValue)
    .replace(/{fase_atual}/g, extraData?.currentStage || '')
    .replace(/{dias_na_fase}/g, String(extraData?.daysInStage || 0))
    .replace(/{total_pedidos}/g, String(extraData?.totalOrders || 1))
    .replace(/{valor_total}/g, formattedTotalValue);
};

export const openWhatsApp = (phoneNumber: string, message: string) => {
  // Remove todos os caracteres não numéricos
  let cleanPhone = phoneNumber.replace(/\D/g, '');
  
  // Se não começar com 55 (código do Brasil), adiciona
  if (!cleanPhone.startsWith('55')) {
    cleanPhone = '55' + cleanPhone;
  }
  
  // Cria o URL exatamente como o que funciona manualmente
  const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  
  console.log('WhatsApp URL:', url);
  
  // Cria um elemento âncora temporário para evitar bloqueio
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  
  // Adiciona temporariamente ao DOM
  document.body.appendChild(link);
  
  // Clica no link
  link.click();
  
  // Remove o link do DOM
  document.body.removeChild(link);
};