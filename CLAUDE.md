# focus-tracking

SaaS para rastrear a origem das mensagens de WhatsApp vindas de campanhas Meta Ads e Google Ads, mais as mensagens não rastreadas.

## Estado atual
- `index.html`: protótipo visual em arquivo único, com dados fictícios. Menu direto (sem submenus): Painel, Inspetor de campanha, Conversas, Jornada de compra, Eventos de conversão, Mensagens rastreadas, Informações da empresa.
- Identidade visual: `docs/identidade-visual.md` (padrão Focus Dock).
- Deploy: push na `main` publica em https://focus-tracking.vercel.app. Só publicar com aprovação explícita do Vinicius.
- Ainda não há backend. Destino planejado: GitHub + Supabase + Vercel (mesmo padrão dos outros sistemas).

## Produto
- **Painel:** barras empilhadas por dia (Meta azul, Google laranja, não rastreadas cinza). Filtros de período (7, 14, 28 dias, este mês, mês passado, personalizado) e de origem.
- **Jornada de compra:** etapas personalizáveis (viram o funil e as colunas do kanban); uma etapa marcada como fechamento; cada etapa pode ter um evento Meta e um Google, enviados ao pixel/API de Conversões quando a conversa muda de etapa (fechamento envia valor).
- **Painel extra:** funil, tempo médio de 1ª resposta (opção de contar a partir da 2ª mensagem) e tempo médio de jornada.
- **Inspetor de campanha:** abas Campanhas / Conjuntos / Anúncios com métricas do Meta Ads (`api/meta/insights.js`, Insights API) e colunas do WhatsApp (conversas, qualificados a partir da 3ª etapa da jornada, ou da etapa antes do fechamento, vendas, faturamento, ROAS). Liga conversa ao anúncio por `campId`/`setId`/`adId` da conversa (ou pelo nome). Fora da Vercel mostra dados de exemplo. Botões no topo: "Criar campanha", Meta Ads e Google Ads (aparecem conforme as conexões). Criar campanha (Pesquisa Google, objetivo leads, formato do guia da isca 5678) em 3 páginas: 1) Briefing (conta, nome, orçamento mensal, lance, site, serviços, modo por serviço ou por intenção, pinos com raio e áreas inteiras independentes e opcionais, cidade/estado/Brasil; chamada principal opcional). "Avançar" confere no formato do Google. 2) Plano de ação sem repetir o briefing: horários (opcional), presença ou interesse (padrão presença), grupos com palavras-chave e títulos puxados das palavras-chave (títulos nunca se repetem entre grupos), 4 caixas de descrição de 90 caracteres com Copiar, sempre 6 sitelinks (quem somos, serviços, serviço 1, serviço 2, depoimentos, fale conosco; com serviço único: diferenciais, depoimentos e missão e valores ou como chegar), frases e negativas; detecta repetições; botão "Subir campanha pausada". 3) Resultado: concluída com link direto, Ver plano e Criar outra; ou erro explicando o motivo com "Corrigir" que leva ao campo. `api/google/publish.js` resolve áreas por geoTargetConstants:suggest, valida (validateOnly) e publica em mutate atômico. Confirmações são em diálogo na página (`crAsk`), não `confirm()`. Salvo em `dados.camps`.
- **Criar campanha Meta (prévia, PR em revisão):** Briefing (conta só entre as cadastradas em `co.accs`, página `co.pages`, Instagram, pixel, objetivo Mensagens/Cadastros/Vendas/Tráfego, CBO ou ABO, diário ou total, lance, datas, categoria especial, regiões, idade, gênero, públicos para testar que viram conjuntos, posicionamentos, criativos, oferta, mensagem inicial do WhatsApp, restrições) → Plano (árvore campanha/conjuntos/anúncios, até 5 textos e títulos por anúncio, JSON da Marketing API) → Publicação com tudo PAUSED. Salvo em `dados.mcamps`. Falta `api/meta/publish.js`.
- **Google Ads API:** `lib/google.js` + `api/google/{login,callback,logout,accounts,insights,publish}.js`. OAuth do projeto GCP "Focus Tracking Ads" (id focus-tracking-ads), cliente Web "Focus Tracking Web", redirect `/api/google/callback`, refresh token em cookie criptografado `ft_google`. Variáveis na Vercel: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (opcional GOOGLE_ADS_API_VERSION, padrão v26). Desde 9/9/2026 sem developer token. App OAuth em modo Teste (só usuários de teste; reconectar a cada 7 dias) até publicar em produção, o que exige página inicial e política de privacidade no Branding. Usuários de teste: os dois e-mails do Vinicius. Nível da Google Ads API do projeto: pedido o Exploração em 21/11/2026 (Teste só abre contas de teste; Exploração dá 2.880 operações/dia em contas reais; Basic exige marca verificada e app em produção). Em Informações da empresa o Google Ads tem dois passos: MCC ou conta direta, depois a conta do cliente (`co.glogin` = MCC, `co.gacc` = conta).
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
