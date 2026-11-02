# focus-tracking

SaaS para rastrear a origem das mensagens de WhatsApp vindas de campanhas Meta Ads e Google Ads, mais as mensagens não rastreadas.

## Estado atual
- `index.html`: protótipo visual em arquivo único, com dados fictícios. Menu direto (sem submenus): Painel, Conversas, Jornada de compra, Eventos de conversão, Mensagens rastreadas, Informações da empresa.
- Identidade visual: `docs/identidade-visual.md` (padrão Focus Dock).
- Deploy: push na `main` publica em https://focus-tracking.vercel.app. Só publicar com aprovação explícita do Vinicius.
- Ainda não há backend. Destino planejado: GitHub + Supabase + Vercel (mesmo padrão dos outros sistemas).

## Produto
- **Painel:** barras empilhadas por dia (Meta azul, Google laranja, não rastreadas cinza). Filtros de período (7, 14, 28 dias, este mês, mês passado, personalizado) e de origem.
- **Jornada de compra:** etapas personalizáveis (viram o funil e as colunas do kanban); uma etapa marcada como fechamento; cada etapa pode ter um evento Meta e um Google, enviados ao pixel/API de Conversões quando a conversa muda de etapa (fechamento envia valor).
- **Painel extra:** funil, tempo médio de 1ª resposta (opção de contar a partir da 2ª mensagem) e tempo médio de jornada.
- **Conversas:** kanban (colunas = etapas da jornada) com número e nome. "Ver detalhes" abre gaveta com data de entrada, canal, campanha, conjunto, anúncio, UTMs, gclid/ctwa_clid e primeira mensagem.
- **Conexão:** WhatsApp via QR code (biblioteca não oficial: Evolution API ou WAHA). Risco de banimento do número; alternativa oficial é a Cloud API.

## Atribuição
- **Meta:** primeira mensagem de anúncio Click to WhatsApp traz ID do anúncio e ctwa_clid. Nomes de campanha/conjunto/anúncio via Marketing API. Validar com anúncio real.
- **Mensagens rastreadas:** cada mensagem gera um link de redirecionamento (página de 1 a 3 s, depois wa.me com o número da empresa) e um código de botão flutuante. A mensagem leva um código invisível de tamanho fixo no fim: o ID do clique (24 bits, sequencial por empresa) em base 4 com 12 caracteres de largura zero (U+200B, U+200C, U+200D, U+2060). O servidor guarda, por ID, link, gclid/fbclid, UTMs e horário. O cliente vê só o texto normal. Depois de abrir o WhatsApp a página de redirecionamento fecha a aba. Validar no PoC se o WhatsApp preserva esses caracteres.
- **Pixel do Focus Tracking:** script por conta (accountCode UUID) instalado no site ou via GTM (HTML personalizado, All Pages). Guarda gclid/fbclid/UTMs e repassa aos links rastreados.
- **Google:** script/link captura gclid e UTMs e o código oculto liga a conversa ao clique. Nomes via parâmetros de rastreio no link ({campaignid}, {adgroupid}, {creative}, {keyword}) ou Google Ads API.
- **Não rastreada:** sem dados de anúncio nem código.

## Modelo de dados planejado (Supabase, multi-empresa com RLS)
`empresas`, `canais`, `sessoes_rastreio`, `mensagens` (origem enum meta|google|nao_rastreada, campanha, conjunto, anúncio, utms, data), `campanhas`.

## Próximos passos
1. Validar o visual (o usuário vai enviar imagens de referência).
2. Prova de conceito: um número por QR, um anúncio CTWA e uma campanha de pesquisa com script; conferir a origem no Supabase.
3. Criar repositório, projeto Supabase e deploy na Vercel.

## Stack sugerida
Next.js + Tailwind + Recharts, Supabase (Postgres, Auth, RLS), Vercel Functions para o webhook.
