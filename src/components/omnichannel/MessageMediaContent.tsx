import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Image, FileAudio, FileVideo, File, Download, Play, Pause, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MessageMediaContentProps {
  mediaUrl: string | null;
  mediaMimeType: string | null;
  contentType: string;
  sellerId: string;
  direction: "inbound" | "outbound";
}

const MAX_RETRIES = 0; // ❌ Retry desabilitado — estava queimando quota Meta em loop
const RETRY_DELAY_MS = 2000;

// Detecta se um media_url é uma URL HTTP direta (Storage Supabase / outbound)
// vs um Meta media ID numérico (inbound, precisa baixar via API Meta).
/**
 * URL que dá para usar direto no <img>/<video>, sem passar pela edge function.
 *
 * URL ASSINADA do nosso Storage NÃO entra aqui (21/08/2026): ela vale 1 hora e
 * depois devolve 403 — foi assim que as 2.540 mídias com "URL própria" pararam
 * de abrir. Para essas, a function assina de novo na hora.
 */
const isDirectUrl = (url: string | null): boolean => {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  const assinadaDoNossoStorage = /\/storage\/v1\/object\/sign\//i.test(url);
  return !assinadaDoNossoStorage;
};

export function MessageMediaContent({
  mediaUrl,
  mediaMimeType,
  contentType,
  sellerId,
  direction,
}: MessageMediaContentProps) {
  const [mediaDataUrl, setMediaDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mountedRef = useRef(true);

  // Determinar tipo de mídia
  const isImage = contentType === 'image' || contentType === 'sticker' || mediaMimeType?.startsWith('image/');
  const isAudio = contentType === 'audio' || mediaMimeType?.startsWith('audio/');
  const isVideo = contentType === 'video' || mediaMimeType?.startsWith('video/');
  const isDocument = contentType === 'document';

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  const loadMedia = useCallback(async (isRetry = false) => {
    if (!mediaUrl || !sellerId) return;

    // 🛡️ CURTO-CIRCUITO FRONTEND: Se já é URL direta (outbound do Storage),
    // usar como-está sem chamar edge function (evita 100% das chamadas Meta para outbound).
    if (isDirectUrl(mediaUrl)) {
      setMediaDataUrl(mediaUrl);
      return;
    }

    setLoading(true);
    setError(null);
    setErrorCode(null);

    try {
      const { data, error: fetchError } = await supabase.functions.invoke('get-whatsapp-media', {
        body: { media_id: mediaUrl, seller_id: sellerId },
      });

      if (!mountedRef.current) return;

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      if (data?.error) {
        setErrorCode(data.code || 'UNKNOWN');
        throw new Error(data.error);
      }

      if (data?.data_url) {
        setMediaDataUrl(data.data_url);
        setRetryCount(0);
      } else {
        throw new Error('Resposta sem conteúdo de mídia');
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      console.error('Error loading media:', err);

      const currentRetry = isRetry ? retryCount : 0;

      // Auto-retry desabilitado (MAX_RETRIES=0). Mantido por compatibilidade com botão manual.
      if (currentRetry < MAX_RETRIES && !['TOKEN_EXPIRED', 'MEDIA_EXPIRED', 'INVALID_TOKEN', 'INSTANCE_NOT_FOUND', 'INVALID_MEDIA_ID'].includes(errorCode || '')) {
        setRetryCount(currentRetry + 1);
        setTimeout(() => {
          if (mountedRef.current) loadMedia(true);
        }, RETRY_DELAY_MS * (currentRetry + 1));
        return;
      }

      setError(err.message || 'Erro ao carregar mídia');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [mediaUrl, sellerId]); // ⚠️ Removido retryCount/errorCode das deps — causavam loop infinito de re-criação

  // Auto-load on mount — apenas UMA vez por mediaUrl
  useEffect(() => {
    if (mediaUrl && !mediaDataUrl && !loading && !error) {
      loadMedia();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaUrl]);

  const toggleAudio = () => {
    if (!mediaDataUrl) return;

    if (!audioRef.current) {
      const audio = new Audio(mediaDataUrl);
      audio.onended = () => setIsPlaying(false);
      audio.onpause = () => setIsPlaying(false);
      audio.onplay = () => setIsPlaying(true);
      audioRef.current = audio;
      audio.play();
    } else {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
    }
  };

  const handleDownload = () => {
    if (!mediaDataUrl) return;
    const link = document.createElement('a');
    link.href = mediaDataUrl;
    link.download = `media-${Date.now()}`;
    link.click();
  };

  const getMediaIcon = () => {
    if (isImage) return <Image className="h-4 w-4" />;
    if (isAudio) return <FileAudio className="h-4 w-4" />;
    if (isVideo) return <FileVideo className="h-4 w-4" />;
    if (isDocument) return <File className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  const getMediaLabel = () => {
    if (isImage) return '📷 Imagem';
    if (isAudio) return '🎵 Áudio';
    if (isVideo) return '🎥 Vídeo';
    if (isDocument) return '📄 Documento';
    return 'Mídia';
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm opacity-70">
          {retryCount > 0 ? `Tentando novamente (${retryCount}/${MAX_RETRIES})...` : 'Carregando mídia...'}
        </span>
      </div>
    );
  }

  // Error state
  if (error) {
    const isPermanentError = ['TOKEN_EXPIRED', 'MEDIA_EXPIRED', 'INVALID_TOKEN', 'INSTANCE_NOT_FOUND'].includes(errorCode || '');
    
    return (
      <div className="flex flex-col gap-1.5 py-2">
        <div className="flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <span className="opacity-80">{getMediaLabel()}</span>
        </div>
        <p className="text-xs text-muted-foreground pl-6">{error}</p>
        {!isPermanentError && (
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => { setRetryCount(0); loadMedia(); }} 
            className="text-xs w-fit pl-6"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Tentar novamente
          </Button>
        )}
      </div>
    );
  }

  // Image
  if (isImage && mediaDataUrl) {
    return (
      <div className="relative">
        <img
          src={mediaDataUrl}
          alt="Imagem enviada"
          className="max-w-full max-h-[300px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
          // app: sem o window.open da imagem. No WebView ele não abre outra janela: o data: toma o lugar do app e o Voltar não volta.
        />
        <Button
          size="icon"
          variant="ghost"
          className="absolute bottom-2 right-2 h-8 w-8 bg-black/50 hover:bg-black/70 text-white"
          onClick={handleDownload}
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // Audio
  if (isAudio && mediaDataUrl) {
    return (
      <div className="flex items-center gap-3 py-2">
        <Button
          size="icon"
          variant={direction === 'outbound' ? 'secondary' : 'default'}
          className="h-10 w-10 rounded-full"
          onClick={toggleAudio}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <FileAudio className="h-4 w-4" />
            <span className="text-sm">Áudio</span>
          </div>
          <audio
            ref={(el) => {
              if (el && !audioRef.current) {
                el.onended = () => setIsPlaying(false);
                el.onpause = () => setIsPlaying(false);
                el.onplay = () => setIsPlaying(true);
                audioRef.current = el;
              }
            }}
            src={mediaDataUrl}
            className="hidden"
          />
        </div>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleDownload}>
          <Download className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // Video
  if (isVideo && mediaDataUrl) {
    return (
      <div className="relative">
        <video
          src={mediaDataUrl}
          controls
          className="max-w-full max-h-[300px] rounded-lg"
        />
        <Button
          size="icon"
          variant="ghost"
          className="absolute top-2 right-2 h-8 w-8 bg-black/50 hover:bg-black/70 text-white"
          onClick={handleDownload}
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // Document
  if (isDocument && mediaDataUrl) {
    return (
      <div className="flex items-center gap-3 py-2">
        <File className="h-8 w-8" />
        <div className="flex-1">
          <span className="text-sm">Documento</span>
          <p className="text-xs opacity-70">{mediaMimeType}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={handleDownload}>
          <Download className="h-4 w-4 mr-2" />
          Baixar
        </Button>
      </div>
    );
  }

  // Placeholder - still loading initial
  if (mediaUrl && !mediaDataUrl) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm opacity-70">Carregando {getMediaLabel().toLowerCase()}...</span>
      </div>
    );
  }

  return null;
}
