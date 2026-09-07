# Assets dos Reports (Outlook)

Estes ficheiros não estão no git (contêm endereços de e-mail reais e
branding — ver `.gitignore`). Sem eles, `services/reports_email_service.py`
usa os fallbacks já embutidos no código (endereços fixos, cabeçalho de
e-mail só com texto) — a funcionalidade não quebra, só fica sem os dados
reais até colocares os ficheiros aqui.

## `Contactos.xlsx`

Coloca aqui uma cópia do `Contactos.xlsx` real. Precisa de 4 sheets
(nome exato, case-insensitive):

| Sheet | Usado por | Célula A2 (To) | Célula B2 (CC) |
|---|---|---|---|
| `CAB` | Report CAB (Diário/FDS) | destinatário | cópia |
| `P1 SEMANA` | Report P1 Semanal | destinatário | cópia |
| `CALL MATINAL PT` | Report Ibéria | destinatário | cópia |
| `CALL MATINAL BR` | Report Brasil | destinatário | cópia |

## `imgs/img.png` e `imgs/img2.png`

Cabeçalho (578×96) e rodapé (578×56) do e-mail do CAB — os únicos dos
3 templates que usam imagem. Coloca os `.png` reais aqui com estes
nomes exatos.
