# focus-tracking

SaaS para rastrear a origem das mensagens de WhatsApp vindas de campanhas Meta Ads e Google Ads, mais as mensagens não rastreadas.

## Estado atual
- `index.html`: protótipo visual em arquivo único, com dados fictícios. Abas: Painel, Conversas, Como funciona.
- Ainda não há backend. Destino planejado: GitHub + Supabase + Vercel (mesmo padrão dos outros sistemas).

## Produto
- **Painel:** barras empilhadas por dia (Meta azul, Google laranja, não rastreadas cinza). Filtros de período (7, 14, 28 dias, este mês, mês passado, personalizado) e de origem.
- **Conversas:** kanban (Novo, Em atendimento, Proposta enviada, Fechado) com número e nome. "Ver detalhes" abre gaveta com data de entrada, canal, campanha, conjunto, anúncio, UTMs, gclid/ctwa_clid e primeira mensagem.
- **Conexão:** WhatsApp via QR code (biblioteca não oficial: Evolution API ou WAHA). Risco de banimento do número; alternativa oficial é a Cloud API.

## Atribuição
- **Meta:** primeira mensagem de anúncio Click to WhatsApp traz ID do anúncio e ctwa_clid. Nomes de campanha/conjunto/anúncio via Marketing API. Validar com anúncio real.
- **Google:** script no site captura gclid e UTMs e coloca código curto (ex.: #A7K2) na mensagem pré-preenchida. Nomes via parâmetros de rastreio no link ({campaignid}, {adgroupid}, {creative}, {keyword}) ou Google Ads API.
- **Não rastreada:** sem dados de anúncio nem código.

## Modelo de dados planejado (Supabase, multi-empresa com RLS)
`empresas`, `canais`, `sessoes_rastreio`, `mensagens` (origem enum meta|google|nao_rastreada, campanha, conjunto, anúncio, utms, data), `campanhas`.

## Próximos passos
1. Validar o visual (o usuário vai enviar imagens de referência).
2. Prova de conceito: um número por QR, um anúncio CTWA e uma campanha de pesquisa com script; conferir a origem no Supabase.
3. Criar repositório, projeto Supabase e deploy na Vercel.

## Stack sugerida
Next.js + Tailwind + Recharts, Supabase (Postgres, Auth, RLS), Vercel Functions para o webhook.
