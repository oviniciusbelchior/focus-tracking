# Focus Tracking: identidade visual

Segue a identidade do Focus Dock (referência enviada por Vinicius em 02/11/2026).
Prévia: https://claude.ai/artifact/UV83rXb12NdtuVNty5QqPX · Arquivo: `focus-tracking/index.html`

## Estrutura
- Barra lateral preta fixa (260px) com logo (quadrado laranja dentro de quadrado branco arredondado), grupos com ícone + seta e subitens recuados com linha guia à esquerda.
- Item ativo: fundo cinza escuro e texto/ícone laranja.
- Cartão do usuário no rodapé da barra (avatar laranja com iniciais, nome, "Proprietário", ícone de sair).
- Área principal branca, título grande em negrito, subtítulo cinza com o intervalo de datas, botão principal laranja à direita.

## Cores
| Token | Valor | Uso |
|---|---|---|
| side | #0b0b0c | barra lateral, card de destaque, tooltip |
| side-2 | #1a1a1c | item ativo, cartão do usuário |
| bg / surface | #ffffff | fundo e cards |
| surface-2 | #f4f4f5 | colunas do kanban, hover |
| line | #e6e6e8 | bordas |
| fg | #111113 | texto, filtro ativo |
| muted | #55565c | texto secundário, rótulos |
| brand | #ff5a1f | botão principal, item ativo, links |
| meta | #1f6fe5 | Meta Ads |
| google | #ff8a1f | Google Ads |
| none | #a3a4aa | Não rastreadas |

## Tipografia
Arial / Helvetica. Rótulos dos cards em caixa alta com espaçamento leve; números grandes em negrito (23px).

## Componentes
- Filtros: controle segmentado com borda; opção ativa com fundo preto e texto branco.
- KPIs: cards brancos com borda, raio 10px, sem sombra; o último card em preto como destaque.
- Seções separadas por rótulo em caixa alta (ex.: CAMPANHAS).
- Badges de origem com cantos de 5px e fundo suave da cor do canal.
- Kanban: colunas cinza claro, contador em pílula preta, link "Ver detalhes" em laranja.

## Para o Next.js + Tailwind
Levar os tokens para `tailwind.config` (theme.extend.colors).
