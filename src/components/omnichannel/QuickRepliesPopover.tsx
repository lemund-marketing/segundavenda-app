import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Zap, Plus, Search, Pencil, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface QuickReply {
  id: string;
  title: string;
  content: string;
  shortcut: string | null;
  category: string | null;
  usage_count: number;
}

interface QuickRepliesPopoverProps {
  onSelect: (content: string) => void;
  clientName?: string;
  disabled?: boolean;
  /** Botão redondo sem borda, para morar dentro do campo de digitar (celular). */
  compacto?: boolean;
}

// Variáveis dinâmicas disponíveis
const dynamicVariables = [
  { tag: "{primeiro_nome}", description: "Primeiro nome do cliente" },
  { tag: "{nome_completo}", description: "Nome completo do cliente" },
  { tag: "{cliente}", description: "Nome do cliente (alias)" },
];

export default function QuickRepliesPopover({ onSelect, clientName, disabled, compacto = false }: QuickRepliesPopoverProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sellerId, setSellerId] = useState<string | null>(null);
  
  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formShortcut, setFormShortcut] = useState("");
  const [formCategory, setFormCategory] = useState("");

  useEffect(() => {
    if (user) {
      loadSellerId();
    }
  }, [user]);

  useEffect(() => {
    if (sellerId && open) {
      loadQuickReplies();
    }
  }, [sellerId, open]);

  const loadSellerId = async () => {
    const { data } = await supabase
      .from("seller_members")
      .select("seller_id")
      .eq("profile_id", user?.id)
      .single();
    
    if (data) {
      setSellerId(data.seller_id);
    }
  };

  const loadQuickReplies = async () => {
    if (!sellerId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("quick_replies")
        .select("*")
        .eq("seller_id", sellerId)
        .order("usage_count", { ascending: false });

      if (error) throw error;
      setQuickReplies(data || []);
    } catch (error) {
      console.error("Error loading quick replies:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (reply: QuickReply) => {
    // Substituir variáveis dinâmicas
    let content = reply.content;
    const firstName = clientName?.split(" ")[0] || "";
    
    content = content
      .replace(/{primeiro_nome}/g, firstName)
      .replace(/{nome_completo}/g, clientName || "")
      .replace(/{cliente}/g, clientName || "");

    onSelect(content);
    setOpen(false);

    // Incrementar contador de uso
    await supabase
      .from("quick_replies")
      .update({ usage_count: reply.usage_count + 1 })
      .eq("id", reply.id);
  };

  const handleSave = async () => {
    if (!sellerId || !formTitle.trim() || !formContent.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha título e conteúdo",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        seller_id: sellerId,
        title: formTitle.trim(),
        content: formContent.trim(),
        shortcut: formShortcut.trim() || null,
        category: formCategory.trim() || null,
      };

      if (editingId) {
        const { error } = await supabase
          .from("quick_replies")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        toast({ title: "Resposta atualizada!" });
      } else {
        const { error } = await supabase
          .from("quick_replies")
          .insert(payload);
        if (error) throw error;
        toast({ title: "Resposta criada!" });
      }

      resetForm();
      setDialogOpen(false);
      loadQuickReplies();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (reply: QuickReply) => {
    setEditingId(reply.id);
    setFormTitle(reply.title);
    setFormContent(reply.content);
    setFormShortcut(reply.shortcut || "");
    setFormCategory(reply.category || "");
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("quick_replies")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast({ title: "Resposta excluída!" });
      loadQuickReplies();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setFormTitle("");
    setFormContent("");
    setFormShortcut("");
    setFormCategory("");
  };

  const openNewDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const insertVariable = (tag: string) => {
    setFormContent((prev) => prev + tag);
  };

  const filteredReplies = quickReplies.filter((reply) => {
    const query = searchQuery.toLowerCase();
    return (
      reply.title.toLowerCase().includes(query) ||
      reply.content.toLowerCase().includes(query) ||
      (reply.shortcut && reply.shortcut.toLowerCase().includes(query)) ||
      (reply.category && reply.category.toLowerCase().includes(query))
    );
  });

  // Agrupar por categoria
  const groupedReplies = filteredReplies.reduce((acc, reply) => {
    const cat = reply.category || "Sem categoria";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(reply);
    return acc;
  }, {} as Record<string, QuickReply[]>);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={compacto ? "ghost" : "outline"}
            size="icon"
            disabled={disabled}
            title="Respostas Rápidas"
            className={compacto ? "h-10 w-10 shrink-0 rounded-full text-muted-foreground" : "shrink-0"}
          >
            <Zap className={compacto ? "h-5 w-5" : "h-4 w-4"} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 max-w-[calc(100vw-1rem)] p-0" align="start" side="top">
          <div className="p-3 border-b">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-sm">Respostas Rápidas</h4>
              <Button size="sm" variant="ghost" onClick={openNewDialog}>
                <Plus className="h-4 w-4 mr-1" />
                Nova
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar ou digitar atalho..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8"
              />
            </div>
          </div>

          <ScrollArea className="h-[300px]">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredReplies.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                <Zap className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">Nenhuma resposta rápida</p>
                <Button
                  size="sm"
                  variant="link"
                  onClick={openNewDialog}
                  className="mt-1"
                >
                  Criar primeira
                </Button>
              </div>
            ) : (
              <div className="p-2 space-y-3">
                {Object.entries(groupedReplies).map(([category, replies]) => (
                  <div key={category}>
                    <p className="text-xs font-medium text-muted-foreground px-2 mb-1">
                      {category}
                    </p>
                    <div className="space-y-1">
                      {replies.map((reply) => (
                        <div
                          key={reply.id}
                          className="group p-2 rounded-md hover:bg-muted cursor-pointer"
                          onClick={() => handleSelect(reply)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm truncate">
                                  {reply.title}
                                </p>
                                {reply.shortcut && (
                                  <Badge variant="secondary" className="text-xs">
                                    /{reply.shortcut}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                {reply.content}
                              </p>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEdit(reply);
                                }}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(reply.id);
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Dialog para criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar Resposta Rápida" : "Nova Resposta Rápida"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Título *
                </label>
                <Input
                  placeholder="Ex: Saudação inicial"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Atalho
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    /
                  </span>
                  <Input
                    placeholder="oi"
                    value={formShortcut}
                    onChange={(e) =>
                      setFormShortcut(e.target.value.replace(/\s/g, ""))
                    }
                    className="pl-6"
                    maxLength={15}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Categoria
              </label>
              <Input
                placeholder="Ex: Saudações, Vendas, Suporte..."
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium">Mensagem *</label>
                <div className="flex gap-1">
                  {dynamicVariables.map((v) => (
                    <Button
                      key={v.tag}
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => insertVariable(v.tag)}
                      title={v.description}
                    >
                      {v.tag}
                    </Button>
                  ))}
                </div>
              </div>
              <Textarea
                placeholder="Digite sua mensagem... Use variáveis como {primeiro_nome}"
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                rows={5}
              />
            </div>

            {formContent && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">
                  Preview (com nome: {clientName || "Cliente Exemplo"})
                </p>
                <p className="text-sm whitespace-pre-wrap">
                  {formContent
                    .replace(/{primeiro_nome}/g, (clientName?.split(" ")[0]) || "Cliente")
                    .replace(/{nome_completo}/g, clientName || "Cliente Exemplo")
                    .replace(/{cliente}/g, clientName || "Cliente Exemplo")}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
