import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, Loader2, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatMarketplaceName } from "@/utils/formatters";
import { Progress } from "@/components/ui/progress";
import { useSellerContext } from "@/contexts/SellerContext";
import { ExportOrdersDialog } from "./ExportOrdersDialog";
import { mensagemDeErroDeFuncao } from '@/utils/functionError';

interface ExportButtonProps {
  dataType?: 'orders' | 'clients' | 'companies';
  /**
   * Quantos filtros a tela tem ligados agora. A exportação de clientes roda no
   * servidor por intervalo de datas próprio e NÃO conhece o recorte da tela —
   * sem este aviso o CSV sai com gente que a lista não mostra e ninguém nota.
   */
  activeFilterCount?: number;
  /** Classe extra do botão que abre o diálogo (no celular ele vira pílula). */
  className?: string;
}

const BATCH_SIZE = 1000;

export const ExportButton = ({
  dataType: dataTypeProp = 'orders',
  activeFilterCount = 0,
  className,
}: ExportButtonProps) => {
  if (dataTypeProp === 'orders') {
    return <ExportOrdersDialog />;
  }
  const dataType: string = dataTypeProp;



  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState("");
  const [availableMarketplaces, setAvailableMarketplaces] = useState<string[]>([]);
  const [selectedMarketplaces, setSelectedMarketplaces] = useState<string[]>([]);
  const { activeSeller } = useSellerContext();

  useEffect(() => {
    if (dataType !== 'orders' || !exportDialogOpen || !activeSeller?.id) return;
    (async () => {
      const { data } = await supabase
        .from('orders')
        .select('marketplace')
        .eq('seller_id', activeSeller.id)
        .not('marketplace', 'is', null)
        .limit(5000);
      const unique = Array.from(new Set((data || []).map((o: any) => o.marketplace).filter(Boolean))).sort();
      setAvailableMarketplaces(unique);
    })();
  }, [dataType, exportDialogOpen, activeSeller?.id]);

  const exportToCSV = async () => {
    if (!exportStartDate || !exportEndDate) {
      alert("Por favor, selecione as datas de início e fim.");
      return;
    }

    setExportLoading(true);
    setExportProgress(0);
    setExportStatus("Iniciando exportação...");
    
    try {
      let headers: string[];
      let csvData: string;
      let fileName: string;

      switch (dataType) {
        case 'orders': {
          if (!activeSeller?.id) throw new Error('Seller não encontrado');

          // Contar total de registros
          setExportStatus("Contando pedidos...");
          let countQuery = supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('seller_id', activeSeller.id)
            .gte('acquired_at', exportStartDate)
            .lte('acquired_at', exportEndDate + 'T23:59:59');
          if (selectedMarketplaces.length > 0) {
            countQuery = countQuery.in('marketplace', selectedMarketplaces as any);
          }
          const { count } = await countQuery;

          const totalCount = count || 0;
          if (totalCount === 0) {
            alert("Nenhum pedido encontrado no período selecionado.");
            return;
          }

          setExportStatus(`Encontrados ${totalCount.toLocaleString('pt-BR')} pedidos`);

          // Buscar em lotes
          const allOrders: any[] = [];
          let offset = 0;
          let hasMore = true;

          while (hasMore) {
            let q = supabase
              .from('orders')
              .select(`
                id,
                external_order_id,
                total_amount,
                marketplace,
                product,
                acquired_at,
                clients(
                  full_name,
                  document,
                  email,
                  whatsapp,
                  street,
                  city,
                  state_code,
                  zip_code
                )
              `)
              .eq('seller_id', activeSeller.id)
              .gte('acquired_at', exportStartDate)
              .lte('acquired_at', exportEndDate + 'T23:59:59');
            if (selectedMarketplaces.length > 0) {
              q = q.in('marketplace', selectedMarketplaces as any);
            }
            const { data, error } = await q
              .order('acquired_at', { ascending: false })
              .range(offset, offset + BATCH_SIZE - 1);

            if (error) throw error;

            if (data && data.length > 0) {
              allOrders.push(...data);
              offset += BATCH_SIZE;
              
              const progress = Math.min((allOrders.length / totalCount) * 100, 100);
              setExportProgress(progress);
              setExportStatus(`Carregando ${allOrders.length.toLocaleString('pt-BR')} de ${totalCount.toLocaleString('pt-BR')}...`);
              
              hasMore = data.length === BATCH_SIZE;
            } else {
              hasMore = false;
            }
          }

          setExportStatus("Gerando arquivo CSV...");
          setExportProgress(100);

          headers = [
            'Data',
            'ID Pedido',
            'Cliente',
            'Documento',
            'Email',
            'WhatsApp',
            'Endereço',
            'Cidade',
            'Estado',
            'CEP',
            'Produto',
            'Marketplace',
            'Valor'
          ];

          csvData = [
            headers.join(','),
            ...allOrders.map(order => [
              new Date(order.acquired_at).toLocaleDateString('pt-BR'),
              order.external_order_id || order.id,
              `"${(order.clients?.full_name || '').replace(/"/g, '""')}"`,
              order.clients?.document || '',
              order.clients?.email || '',
              order.clients?.whatsapp || '',
              `"${(order.clients?.street || '').replace(/"/g, '""')}"`,
              `"${(order.clients?.city || '').replace(/"/g, '""')}"`,
              order.clients?.state_code || '',
              order.clients?.zip_code || '',
              `"${(order.product || '').replace(/"/g, '""')}"`,
              formatMarketplaceName(order.marketplace || ''),
              order.total_amount
            ].join(','))
          ].join('\n');

          fileName = `pedidos_${exportStartDate}_${exportEndDate}.csv`;
          break;
        }

        case 'clients': {
          if (!activeSeller?.id) throw new Error('Seller não encontrado');

          // Contar total de registros
          setExportStatus("Contando clientes...");
          const { count } = await supabase
            .from('clients_sellers')
            .select('*', { count: 'exact', head: true })
            .eq('seller_id', activeSeller.id)
            .gte('first_seen_at', exportStartDate)
            .lte('first_seen_at', exportEndDate + 'T23:59:59');

          const totalCount = count || 0;
          if (totalCount === 0) {
            alert("Nenhum cliente encontrado no período selecionado.");
            return;
          }

          setExportStatus(`Encontrados ${totalCount.toLocaleString('pt-BR')} clientes`);

          setExportStatus(`Gerando arquivo no servidor (${totalCount.toLocaleString('pt-BR')} clientes)...`);
          setExportProgress(15);

          const { data, error } = await supabase.functions.invoke('export-clients', {
            body: {
              sellerId: activeSeller.id,
              startDate: exportStartDate,
              endDate: exportEndDate,
              totalCount,
            },
          });

          if (error) throw error;
          if ((data as any)?.error) throw new Error((data as any).error);

          const url = (data as any)?.url as string | undefined;
          if (!url) throw new Error('Servidor não retornou URL do arquivo');

          setExportProgress(95);
          setExportStatus('Baixando arquivo...');

          const link = document.createElement('a');
          link.setAttribute('href', url);
          link.setAttribute('download', `clientes_${exportStartDate}_${exportEndDate}.csv`);
          link.style.visibility = 'hidden';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          setExportProgress(100);
          setExportDialogOpen(false);
          setExportStartDate("");
          setExportEndDate("");
          return;
        }

        case 'companies': {
          // Contar total de registros
          setExportStatus("Contando empresas...");
          const { count } = await supabase
            .from('sellers')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', exportStartDate)
            .lte('created_at', exportEndDate + 'T23:59:59');

          const totalCount = count || 0;
          if (totalCount === 0) {
            alert("Nenhuma empresa encontrada no período selecionado.");
            return;
          }

          setExportStatus(`Encontradas ${totalCount.toLocaleString('pt-BR')} empresas`);

          // Buscar em lotes
          const allCompanies: any[] = [];
          let offset = 0;
          let hasMore = true;

          while (hasMore) {
            const { data, error } = await supabase
              .from('sellers')
              .select('*')
              .gte('created_at', exportStartDate)
              .lte('created_at', exportEndDate + 'T23:59:59')
              .order('created_at', { ascending: false })
              .range(offset, offset + BATCH_SIZE - 1);

            if (error) throw error;

            if (data && data.length > 0) {
              allCompanies.push(...data);
              offset += BATCH_SIZE;
              
              const progress = Math.min((allCompanies.length / totalCount) * 100, 100);
              setExportProgress(progress);
              setExportStatus(`Carregando ${allCompanies.length.toLocaleString('pt-BR')} de ${totalCount.toLocaleString('pt-BR')}...`);
              
              hasMore = data.length === BATCH_SIZE;
            } else {
              hasMore = false;
            }
          }

          setExportStatus("Gerando arquivo CSV...");
          setExportProgress(100);

          headers = [
            'Nome',
            'ID/CNPJ',
            'Status',
            'Ativo',
            'Data Criação'
          ];

          csvData = [
            headers.join(','),
            ...allCompanies.map(company => [
              `"${(company.name || '').replace(/"/g, '""')}"`,
              company.tax_id || '',
              company.status || '',
              company.active ? 'Sim' : 'Não',
              new Date(company.created_at).toLocaleDateString('pt-BR')
            ].join(','))
          ].join('\n');

          fileName = `empresas_${exportStartDate}_${exportEndDate}.csv`;
          break;
        }

        default:
          throw new Error('Tipo de dados não suportado');
      }

      // Download do arquivo com BOM para Excel reconhecer UTF-8
      const blob = new Blob(['\ufeff' + csvData], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportDialogOpen(false);
      setExportStartDate("");
      setExportEndDate("");
      setSelectedMarketplaces([]);
      
    } catch (error) {
      console.error('Error exporting data:', error);
      // Antes descartava a mensagem inteira e dizia so "tente novamente" — o
      // motivo real (permissao, sessao, falha do servidor) vem no corpo da
      // resposta da edge function e precisa ser desembrulhado.
      const motivo = await mensagemDeErroDeFuncao(error, 'Erro ao exportar dados. Tente novamente.');
      alert(`Erro ao exportar dados: ${motivo}`);
    } finally {
      setExportLoading(false);
      setExportProgress(0);
      setExportStatus("");
    }
  };

  return (
    <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <Download className="w-4 h-4 mr-2" />
          Exportar Dados
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Exportar Dados</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="start-date">Data de Início</Label>
            <Input
              id="start-date"
              type="date"
              value={exportStartDate}
              onChange={(e) => setExportStartDate(e.target.value)}
              disabled={exportLoading}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="end-date">Data de Fim</Label>
            <Input
              id="end-date"
              type="date"
              value={exportEndDate}
              onChange={(e) => setExportEndDate(e.target.value)}
              disabled={exportLoading}
            />
          </div>

          {dataType === 'orders' && (
            <div className="grid gap-2">
              <Label>Marketplaces</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    disabled={exportLoading || availableMarketplaces.length === 0}
                    className="justify-between font-normal"
                  >
                    <span className="truncate">
                      {selectedMarketplaces.length === 0
                        ? availableMarketplaces.length === 0
                          ? 'Nenhum marketplace disponível'
                          : 'Todos os marketplaces'
                        : `${selectedMarketplaces.length} selecionado(s)`}
                    </span>
                    <ChevronDown className="w-4 h-4 ml-2 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[380px] p-0" align="start">
                  <div className="flex items-center justify-between p-2 border-b">
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => setSelectedMarketplaces(availableMarketplaces)}
                    >
                      Selecionar todos
                    </button>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:underline"
                      onClick={() => setSelectedMarketplaces([])}
                    >
                      Limpar
                    </button>
                  </div>
                  <ScrollArea className="max-h-64">
                    <div className="p-2 space-y-1">
                      {availableMarketplaces.map((mp) => {
                        const checked = selectedMarketplaces.includes(mp);
                        return (
                          <label
                            key={mp}
                            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => {
                                setSelectedMarketplaces((prev) =>
                                  v ? [...prev, mp] : prev.filter((m) => m !== mp)
                                );
                              }}
                            />
                            <span className="text-sm">{formatMarketplaceName(mp)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                Deixe vazio para exportar todos os marketplaces.
              </p>
            </div>
          )}

          {exportLoading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{exportStatus}</span>
                <span className="font-medium">{Math.round(exportProgress)}%</span>
              </div>
              <Progress value={exportProgress} className="h-2" />
            </div>
          )}
          
          {!exportLoading && (
            <p className="text-sm text-muted-foreground">
              Os dados exportados incluirão informações do período selecionado.
            </p>
          )}

          {!exportLoading && activeFilterCount > 0 && (
            <p className="rounded-lg bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-500">
              A tela está com {activeFilterCount}{' '}
              {activeFilterCount === 1 ? 'filtro ativo' : 'filtros ativos'}, mas a exportação usa só
              o intervalo de datas acima — o arquivo vai conter clientes que a lista não mostra.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setExportDialogOpen(false)} disabled={exportLoading}>
            Cancelar
          </Button>
          <Button onClick={exportToCSV} disabled={exportLoading}>
            {exportLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Exportando...
              </>
            ) : (
              "Exportar"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};