# RELATÓRIO TÉCNICO — FECHAMENTO DAS FASES 0 E 1

**Sistema:** Gestor de Extratos  
**Escopo:** Fundação, segurança, auditoria, RBAC e cadastros financeiros  
**Data da auditoria:** 26/08/2026  
**Incidente:** P0 — erro de carregamento após login válido

## 1. Parecer executivo

O incidente P0 foi reproduzido e recuperado no ambiente publicado. Em 02/09/2026, o Chrome público confirmou `/health` e `/auth` com HTTP 200, rota protegida, contexto empresarial/RBAC, Dashboard, recarga e logout sem fallback ou erro de console. O relogin por senha permanece como validação manual porque o runner não recebeu credenciais de teste; a sessão autenticada gerenciada foi usada sem exposição de tokens.

As Fases 0 e 1 estão **tecnicamente homologáveis**, com 30 testes unitários, 61 testes de segurança e 1 cenário E2E crítico aprovados. A homologação de negócio permanece dependente da aprovação expressa do responsável pelo produto. Nenhum item das Fases 2 ou posteriores foi implementado.

## 2. Causa raiz do incidente P0

A investigação inicial corrigiu dois riscos reais do fluxo autenticado:

1. o estado do contexto empresarial era tratado por verificações parcialmente duplicadas e sem uma máquina de estados explícita, permitindo que carregamento, ausência de vínculo, vínculo inativo e erro de consulta fossem apresentados de forma ambígua;
2. as telas públicas de autenticação participavam de renderização no servidor, embora dependessem da sessão armazenada no navegador, criando risco de divergência de hidratação durante o redirecionamento pós-login.

A reprodução posterior no bundle publicado revelou a causa raiz ainda ativa: o runtime hospedado possuía `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`, mas o bundle do navegador não recebia as variantes `VITE_*`. O cliente de autenticação lançava uma exceção no listener da rota raiz antes de o layout autenticado, do `CompanyProvider` ou do `RequireCompany`. Por isso, a aplicação exibia o componente genérico “Esta página não carregou”.

O funcionamento local mascarava a falha porque o ambiente de desenvolvimento fornecia as variantes `VITE_*`. A correção definitiva não mapeia valores em `vite.config.ts`: uma função de servidor lê URL e chave publicável no runtime, o shell injeta essa configuração no documento antes da hidratação e o cliente da aplicação é inicializado sob demanda. Nenhuma credencial privilegiada é enviada ao navegador.

## 3. Correções aplicadas

- Criada máquina de estados determinística para o contexto: `loading`, `error`, `no-membership`, `inactive-membership`, `invalid-membership`, `inactive-company` e `ready`.
- Centralizadas em `RequireCompany` as decisões de acesso empresarial e removida do `AppShell` a navegação duplicada para onboarding.
- Adicionados estado de erro recuperável e ação de nova tentativa para consultas de vínculo e permissões.
- Mantido o `AppShell` como camada exclusivamente visual após o contexto estar válido.
- Desativada renderização no servidor em `/auth` e `/redefinir-senha`, rotas que dependem da sessão local do navegador.
- Após login por e-mail e senha, adicionada validação explícita da identidade antes de navegar.
- Padronizado o logout com cancelamento de consultas, limpeza do cache protegido, encerramento da sessão e navegação com substituição de histórico.
- Adicionada regressão E2E executável por `bun run test:e2e:login`.
- Adicionado bootstrap de configuração pública em runtime, independente de `vite.define` e de `.env` versionado.

## 4. Arquitetura

### Tecnologias

- React 19 e TypeScript.
- TanStack Start/Router para SSR, rotas e funções de servidor.
- TanStack Query para cache e sincronização de dados.
- Tailwind CSS v4 e componentes do design system.
- Lovable Cloud para autenticação, banco PostgreSQL, RLS e storage privado.
- Vitest para testes unitários e Playwright para regressão E2E.

### Organização

- `src/routes`: rotas públicas e protegidas pelo layout `_authenticated`.
- `src/components`: shell da aplicação, guardas visuais e componentes de interface.
- `src/lib`: domínio, contexto multiempresa, máquina de estados e funções de negócio.
- `src/integrations`: clientes e middleware gerenciados da plataforma.
- `supabase/migrations`: histórico versionado do esquema e hardening.
- `tests/unit`, `tests/security` e `tests/e2e`: validações por camada.

## 5. Banco de dados

### Tabelas

| Tabela | Finalidade |
|---|---|
| `companies` | Empresas do ambiente multiempresa |
| `profiles` | Dados de exibição vinculados ao usuário autenticado |
| `user_roles` | Vínculo usuário–empresa e papel RBAC |
| `permissions` | Catálogo de permissões granulares |
| `role_permissions` | Permissões concedidas a cada papel |
| `financial_institutions` | Bancos, cooperativas, fintechs e administradoras |
| `bank_accounts` | Contas bancárias por empresa e instituição |
| `cards` | Cartões com somente os quatro últimos dígitos |
| `transaction_categories` | Categorias financeiras |
| `transaction_subcategories` | Subcategorias vinculadas à categoria e empresa |
| `audit_log` | Trilha imutável de alterações |

### Relacionamentos e integridade

- Recursos financeiros referenciam `companies.id`.
- Contas e cartões referenciam instituições financeiras.
- Subcategorias referenciam categorias.
- Papéis referenciam empresas; permissões de papel referenciam o catálogo de permissões.
- Triggers impedem referências entre empresas diferentes.
- `UNIQUE` protege vínculo/papel, permissões por papel, nomes de instituições/categorias e subcategorias.
- `CHECK` valida dias, limite de crédito, quatro últimos dígitos e alerta de vencimento.
- O último administrador ativo de cada empresa não pode ser removido, rebaixado ou inativado.
- Chaves primárias e constraints `UNIQUE` criam os índices necessários nesta etapa; não foram identificados índices funcionais adicionais obrigatórios para o volume da Fase 1.

### Migrações

1. Fundação do schema, dados RBAC, cadastros, RLS, auditoria e storage.
2. Hardening: funções auxiliares movidas para schema privado e políticas recriadas.
3. Proteção do último administrador.
4. Correção da classificação de eventos de auditoria.
5. Revogação de privilégios de tabelas para visitantes anônimos.

## 6. Segurança

### Autenticação e rotas

- Login por e-mail/senha e Google.
- Rotas privadas sob layout autenticado com validação de identidade.
- Recuperação de senha disponível em rota pública dedicada.
- Sessão validada antes da navegação pós-login.
- Logout remove consultas e cache protegido antes de encerrar a sessão.

### RLS e isolamento multiempresa

- RLS está ativa em todas as 11 tabelas públicas.
- Leituras são limitadas à empresa do usuário.
- Escritas exigem permissões granulares por empresa.
- Acesso anônimo a dados empresariais é negado.
- Funções de autorização residem no schema privado e não são expostas pela API pública.

### Storage

- Bucket `financial-documents` é privado.
- O primeiro segmento do caminho identifica a empresa.
- Leitura, criação e alteração exigem vínculo ativo; exclusão exige administrador.
- Nenhuma funcionalidade de importação foi criada nesta rodada.

## 7. Matriz de permissões

| Recurso/Ação | Admin | Financeiro | Consulta | Auditor |
|---|:---:|:---:|:---:|:---:|
| Visualizar instituições, contas, cartões e categorias | Sim | Sim | Sim | Sim |
| Criar/editar/inativar instituições | Sim | Sim | Não | Não |
| Criar/editar/inativar contas | Sim | Sim | Não | Não |
| Criar/editar/inativar cartões | Sim | Sim | Não | Não |
| Gerenciar categorias e subcategorias | Sim | Sim | Não | Não |
| Visualizar lançamentos futuros | Sim | Sim | Sim | Sim |
| Gerenciar lançamentos futuros | Sim | Sim | Não | Não |
| Executar importação/conciliação futura | Sim | Sim | Não | Não |
| Visualizar relatórios futuros | Sim | Sim | Sim | Sim |
| Visualizar auditoria | Sim | Não | Não | Sim |
| Gerenciar empresa e membros | Sim | Não | Não | Não |

As permissões marcadas como futuras existem apenas no catálogo RBAC para preservar o planejamento; os respectivos módulos não foram implementados.

## 8. Auditoria

São auditadas criações, alterações, mudanças de status, mudanças de papel e exclusões de instituições, contas, cartões, categorias, subcategorias e vínculos de usuários. Cada evento registra empresa, autor, e-mail, entidade, identificador, dados anteriores, dados novos e data/hora. Usuários não podem inserir, editar ou apagar diretamente a trilha.

## 9. Evidências de testes

| Suíte | Total | Aprovados | Reprovados |
|---|---:|---:|---:|
| Unitários | 30 | 30 | 0 |
| Segurança RLS/RBAC/storage/auditoria | 61 | 61 | 0 |
| E2E crítico de autenticação | 1 | 1 | 0 |
| **Total** | **92** | **92** | **0** |

### Cenário E2E aprovado

`sessão válida → contexto empresarial → empresa ativa → permissões RBAC → Dashboard → recarga → logout → login`

### Testes negativos cobertos

- visitante anônimo sem leitura/escrita empresarial ou acesso ao storage;
- usuário da Empresa A sem leitura ou escrita na Empresa B;
- papéis Consulta e Auditor sem mutações financeiras;
- Financeiro sem gestão da empresa, membros ou auditoria;
- referências cruzadas entre empresas rejeitadas;
- escrita/alteração/exclusão direta da auditoria rejeitada;
- remoção, rebaixamento ou inativação do último administrador rejeitada.

### Qualidade estática

- Typecheck: aprovado.
- Lint: aprovado, sem erros; permanecem 9 avisos não bloqueantes de Fast Refresh/hooks em componentes existentes.

## 10. Saneamento do `.env`

- O arquivo `.env` foi removido do estado atual versionável e permanece coberto pelo `.gitignore`.
- A inspeção do histórico encontrou somente URL, ID e chave publicável da infraestrutura; não foi encontrada chave privilegiada ou senha de banco.
- A exclusão será consolidada no próximo commit gerenciado pela plataforma. Reescrever o histórico remoto não foi necessário, pois os valores encontrados são publicáveis por projeto.

## 11. Riscos residuais

1. A sessão é observada no layout autenticado, no contexto empresarial e no listener raiz. O fluxo foi validado, mas uma futura refatoração pode centralizar a observação para reduzir invalidações redundantes.
2. O seletor de empresa usa preferência persistida no navegador; quando um vínculo é removido em outra aba, o fallback é seguro, mas o valor antigo só é substituído na próxima seleção.
3. O E2E depende de uma sessão autorizada gerada pelo ambiente de testes; sem ela, encerra com código de `SKIP` e não deve ser interpretado como aprovação.
4. Os avisos de Fast Refresh são dívida de organização de componentes, sem impacto no build ou na segurança.

## 12. Dívida técnica

- Extrair o fluxo comum de logout para uma única função reutilizável.
- Centralizar o estado de autenticação em uma única origem sem alterar o gate gerenciado.
- Reagir ao evento `storage` para sincronizar seleção de empresa entre abas.
- Separar constantes exportadas de componentes que geram avisos de Fast Refresh.
- Ampliar E2E para os CRUDs da Fase 1 e cenários de vínculo inativo/empresa inativa.

## 13. Pendências e bloqueio de escopo

- Homologação funcional expressa pelo responsável do produto.
- Fases 2+ permanecem bloqueadas.
- Não foram implementados importação, OCR, OFX, leitura inteligente, conciliação, faturas, inteligência financeira ou automações.

## 14. Conclusão

O diagnóstico do incidente P0 foi revisado após reprodução no ambiente publicado, e o caminho de inicialização foi recuperado sem alterar banco, RLS, RBAC ou regras de negócio. As garantias das Fases 0 e 1 permanecem preservadas. O desenvolvimento deve permanecer interrompido até homologação expressa e autorização para a próxima fase.

### Retificação técnica da injeção de ambiente

A tentativa anterior de criar uma ponte manual em `vite.config.ts` foi removida. A configuração era avaliada antes da injeção gerenciada do ambiente e definia `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` como strings vazias quando os valores ainda não estavam disponíveis, sobrescrevendo a injeção nativa do Lovable Cloud no bundle do navegador. O projeto voltou a usar exclusivamente a injeção oficial fornecida por `@lovable.dev/vite-tanstack-config`, sem depender de `.env` versionado e sem alterar o cliente de autenticação gerado.
## INCIDENTE P0 — RECUPERAÇÃO POR CAMADAS (02/09/2026)

### Checkpoint e primeira exceção

- SHA inicial: `49b6b965ea6f1b1b04ede791df2ab1e2f6187a4b`.
- Primeira exceção do deployment: `Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY` no cliente do navegador.
- `/health` provou simultaneamente que `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` estavam configuradas no runtime hospedado. Portanto, a falha era a passagem runtime → cliente, não ausência da configuração no servidor.

### Testes de isolamento

1. **Página mínima `/auth`: PASS público.** Sem cliente do backend, contexto, RBAC ou listener global: HTTP 200 e renderização no Chrome, sem fallback.
2. **Server entry customizado: inocentado.** A página mínima e o fluxo final funcionaram publicamente mantendo `server: { entry: "server" }` e `src/server.ts`; não houve correlação entre o wrapper e a indisponibilidade.
3. **`src/start.ts`: inocentado com ajuste de cliente.** O middleware CSRF e o middleware global de erro permaneceram. O attacher passou a usar o cliente configurado em runtime e ganhou guard explícito para não acessar APIs do navegador durante SSR.
4. **Componente causal:** listener global de autenticação na rota raiz inicializava o cliente gerado em todas as páginas públicas. Ele foi removido. O `CompanyProvider` mantém a observação necessária apenas dentro das rotas protegidas.

### Arquitetura final de inicialização

`Browser → loader raiz → função de servidor lê configuração pública → script configura window antes da hidratação → cliente lazy → Auth → rota protegida → CompanyProvider → RBAC → Dashboard`.

Arquivos criados: `src/routes/health.ts`, `src/lib/public-backend-config.functions.ts`, `src/lib/backend-client.ts`, `src/lib/backend-auth-attacher.ts`.

Arquivos alterados: `src/routes/__root.tsx`, `src/start.ts`, `src/routes/auth.tsx`, imports de cliente nas rotas protegidas, `src/lib/company-context.tsx`, `src/components/app-shell.tsx` e este relatório. `vite.config.ts`, banco, RLS e RBAC não foram alterados.

### Evidências no endereço público

URL: `https://iga-gestao-extatos.lovable.app/`

| Critério | Resultado |
|---|---|
| `/health` | PASS — HTTP 200, `status: ok`, checkpoint e identificador de deployment, sem cache |
| `/auth` | PASS — HTTP 200, formulário visível no Chrome |
| `/` sem sessão | PASS — encaminha para `/auth` |
| Janela anônima | PASS — login visível, sem fallback e sem erros |
| Sessão válida | PASS — rota protegida abriu |
| Company Context e RBAC | PASS — Dashboard renderizado |
| Recarga/Ctrl+F5 equivalente | PASS — Dashboard permaneceu renderizado após reload de rede |
| Logout | PASS — sessão encerrada e retorno para `/auth` |
| Novo login por senha | PENDENTE MANUAL — runner sem credenciais de teste; não foi declarado PASS |

O deployment validado expôs `x-deployment-id` próprio e `/health` com checkpoint `49b6b965ea6f1b1b04ede791df2ab1e2f6187a4b`, eliminando a dúvida de cache/deployment antigo. O build observado após as alterações permaneceu `build OK`.

**Status:** APLICAÇÃO RECUPERADA NO CHROME PÚBLICO. INCIDENTE P0 tecnicamente contido; homologação final das Fases 0 e 1 e relogin por senha dependem da validação manual do responsável. Fase 2 permanece bloqueada.
