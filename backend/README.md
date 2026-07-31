# Backend — Claranet GCC Service Dashboard

Backend em FastAPI que substitui o Power BI (`CLN-GCC-MSS-EDP-SLA.pbix`),
replicando em Python/pandas a mesma lógica de transformação (Power Query +
colunas/medidas DAX) que estava no arquivo original.

## Como cheguei nessa lógica

Abri o `.pbix` (é um zip) e extraí com a lib `pbixray`:
- as tabelas e o schema do modelo de dados
- as queries M (Power Query) de cada tabela → revelou as URLs de origem e
  quais colunas do CSV bruto eram mantidas/renomeadas
- as medidas e colunas calculadas DAX → revelou a fórmula exata de SLA,
  prioridade, keywords de ferramentas, turnos, região, etc.

Isso é o que está portado em `services/transform.py` e nos `*_service.py`.

## Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # ou venv\Scripts\activate no Windows
pip install -r requirements.txt
cp .env.example .env
# preenche SN_USER e SN_PASS no .env com uma conta de serviço do ServiceNow
uvicorn main:app --reload --port 8000
```

## ⚠️ Ponto crítico: autenticação no ServiceNow

As URLs `sys_report_template.do?CSV&jvar_report_id=...` são exports de
relatório que **normalmente exigem sessão de browser autenticada**. Um
`GET` anônimo costuma devolver a página de login em HTML em vez do CSV —
o `servicenow_client.py` já detecta isso e levanta um erro claro
(`ServiceNowFetchError`) em vez de silenciosamente devolver lixo.

Configurei com **Basic Auth** (`SN_USER`/`SN_PASS` no `.env`), que só
funciona se a tua instância permitir Basic Auth nessas rotas. Se não
permitir (SSO/SAML obrigatório), a alternativa robusta é migrar essas
chamadas para a **ServiceNow Table REST API**
(`/api/now/table/incident?sysparm_query=...`), que aceita Basic Auth /
OAuth nativamente. Validem isso com o time de administração do
ServiceNow antes de ir pra produção.

## Mapeamento .env → tabela do Power BI → endpoint

| .env | Tabela no .pbix | Endpoint | Usado em |
|---|---|---|---|
| `PRINCIPAL_URL` | `sys_report_template` | `/api/dashboard/kpis`, `/api/dashboard/priority`, `/api/dashboard/tools`, `/api/incidents` | Dashboard, Incidentes |
| `SLA3_URL` | `SLA3(Incidentes)` | `/api/sla` | SLA |
| `SLA4_URL` | `SLA4` | `/api/sla` | SLA |
| `USERS_URL` | `Users` | *(ainda não usado — ver Operadores abaixo)* | Operadores |

`SLA3_GROUPS_URL`, `OK_URL`, `AUDITKEYS_URL`, `DESPROMOVIDOS_URL`,
`BACKLOG_INC_URL`, `BACKLOG_RITM_URL` existem no `.env` e correspondem a
tabelas reais do `.pbix`, mas ainda não têm endpoint/página consumindo —
segui a lógica de dar prioridade às views que já existem no front
(`Tools.jsx`, `SLA.jsx`, `Incidents.jsx`, `Operators.jsx`,
`DashboardServices.jsx`). Se quiseres, faço os serviços dessas também
(são o mesmo padrão de `sla_service.py`).

`CALLS_URL` e `JUSTIFICACOES_URL` apontam pro **SharePoint**, não são
export CSV do ServiceNow — exigem outro tipo de autenticação (Graph API
ou SharePoint REST). Ficaram fora do escopo deste backend por ora.

## O que é fidelidade exata vs. aproximação

**Portado fielmente da lógica DAX original:**
- `SLA 3.0` (segundos entre evento e abertura), `Coluna` (OK/NOK, limite
  900s)
- `Column Measure` (região Ibéria/Brasil)
- `Grupo` (Monitorização/Operação)
- `Turno`
- `Keyword Found` / `Source` (detecção de ferramenta — a tabela
  `Keywords` embutida no DAX é a mesma lista do teu `Tools.jsx`)
- `SLA3%`, `SLA4 Count` (medidas de SLA)

**Assunções que precisam validação tua** (marcadas com comentário
`ASSUNÇÃO` no código):
- `P1 Ativos` (KPICard): não achei uma medida DAX equivalente — implementei
  como "prioridade contém '1' E estado ainda aberto". Confirma os valores
  reais de `priority`/`incident_state` da tua instância.
- `Escalados` (KPICard): não achei medida DAX direta. Fiz um placeholder.
  Precisa de uma definição de negócio (ex: baseado no `AuditKeys` quando
  `fieldname = "assignment_group"`).
- `PTS` em Operators.jsx: não existe em nenhuma tabela do `.pbix` — está
  zerado no backend até identificares a fonte real desse número.

## Cache

Os CSVs do ServiceNow **não** são buscados a cada requisição do frontend
(seria lento e arriscaria rate limit). Um job em `cache.py` roda a cada
`CACHE_REFRESH_MINUTES` (padrão 10min) e os endpoints só leem esse cache
em memória. `/api/dashboard/status` mostra quando foi a última
atualização e se algum fetch falhou.

## Rodando junto com o front

No `frontend/src/service/dashboardApi.js`, adiciona as novas funções (veja
`frontend_updates/dashboardApi.js` neste pacote) e troca os dados
hardcoded de `DashboardServices.jsx`, `SLA.jsx`, `Incidents.jsx` e
`Operators.jsx` por `useQuery` do `@tanstack/react-query` (que o teu
`main.jsx` já está configurado pra usar). Incluí um exemplo completo em
`frontend_updates/DashboardServices.jsx`.
