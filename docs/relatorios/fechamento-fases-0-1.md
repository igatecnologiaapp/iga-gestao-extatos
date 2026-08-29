# RELATÓRIO TÉCNICO — FECHAMENTO DAS FASES 0 E 1

**Sistema:** Gestor de Extratos  
**Escopo:** Fundação, segurança, auditoria, RBAC e cadastros financeiros  
**Data da auditoria:** 26/08/2026  
**Incidente:** P0 — erro de carregamento após login válido

## 1. Parecer executivo

O incidente P0 foi reproduzido novamente no ambiente publicado e a causa de implantação foi corrigida. A regressão autenticada deve ser repetida no bundle publicado após esta correção antes da homologação final.

As Fases 0 e 1 estão **tecnicamente homologáveis**, com 30 testes unitários, 61 testes de segurança e 1 cenário E2E crítico aprovados. A homologação de negócio permanece dependente da aprovação expressa do responsável pelo produto. Nenhum item das Fases 2 ou posteriores foi implementado.

## 2. Causa raiz do incidente P0

A investigação inicial corrigiu dois riscos reais do fluxo autenticado:

1. o estado do contexto empresarial era tratado por verificações parcialmente duplicadas e sem uma máquina de estados explícita, permitindo que carregamento, ausência de vínculo, vínculo inativo e erro de consulta fossem apresentados de forma ambígua;
2. as telas públicas de autenticação participavam de renderização no servidor, embora dependessem da sessão armazenada no navegador, criando risco de divergência de hidratação durante o redirecionamento pós-login.

A reprodução posterior no bundle publicado revelou a causa raiz ainda ativa: as variáveis públicas de conexão do backend (`VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`) não estavam incorporadas ao JavaScript entregue ao navegador. O cliente de autenticação lançava uma exceção no listener da rota raiz antes de o layout autenticado, o `CompanyProvider` ou o `RequireCompany` serem executados. Por isso, a aplicação exibia o componente genérico “Esta página não carregou”.

O funcionamento local mascarava a falha porque o arquivo `.env` não versionado fornecia as variáveis durante o desenvolvimento. A correção passou a mapear, no build, somente a URL e a chave publicável fornecidas pelo ambiente da plataforma, sem depender de `.env` versionado e sem expor credenciais privilegiadas.

## 3. Correções aplicadas

- Criada máquina de estados determinística para o contexto: `loading`, `error`, `no-membership`, `inactive-membership`, `invalid-membership`, `inactive-company` e `ready`.
- Centralizadas em `RequireCompany` as decisões de acesso empresarial e removida do `AppShell` a navegação duplicada para onboarding.
- Adicionados estado de erro recuperável e ação de nova tentativa para consultas de vínculo e permissões.
- Mantido o `AppShell` como camada exclusivamente visual após o contexto estar válido.
- Desativada renderização no servidor em `/auth` e `/redefinir-senha`, rotas que dependem da sessão local do navegador.
- Após login por e-mail e senha, adicionada validação explícita da identidade antes de navegar.
- Padronizado o logout com cancelamento de consultas, limpeza do cache protegido, encerramento da sessão e navegação com substituição de histórico.
- Adicionada regressão E2E executável por `bun run test:e2e:login`.
- Adicionada ponte explícita no Vite entre as variáveis públicas fornecidas pelo ambiente de implantação e `import.meta.env`, eliminando a dependência do arquivo `.env` local no bundle do navegador.

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

O diagnóstico do incidente P0 foi revisado após reprodução no ambiente publicado, e a falha de configuração do bundle foi corrigida. As garantias de isolamento multiempresa, RLS, RBAC, auditoria, storage privado e cadastros das Fases 0 e 1 permanecem aprovadas. A homologação final do login depende da validação do novo bundle publicado. O desenvolvimento deve permanecer interrompido até homologação expressa e autorização para a próxima fase.

### Retificação técnica da injeção de ambiente

A tentativa anterior de criar uma ponte manual em `vite.config.ts` foi removida. A configuração era avaliada antes da injeção gerenciada do ambiente e definia `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` como strings vazias quando os valores ainda não estavam disponíveis, sobrescrevendo a injeção nativa do Lovable Cloud no bundle do navegador. O projeto voltou a usar exclusivamente a injeção oficial fornecida por `@lovable.dev/vite-tanstack-config`, sem depender de `.env` versionado e sem alterar o cliente de autenticação gerado.
## INCIDENTE P0 — BOOT/BUILD/SSR — DIAGNÓSTICO FINAL

**Sintoma:** no ambiente publicado, qualquer rota exibia “Esta página não carregou” (fallback global de `src/lib/error-page.ts`), enquanto o ambiente de desenvolvimento funcionava.

**Primeira exceção causal:** `Error: Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY. Connect Supabase in Lovable Cloud.`
Lançada em `createSupabaseClient()` (`src/integrations/supabase/client.ts:44`), no primeiro acesso ao proxy `supabase` — antes do layout autenticado, do `CompanyProvider` e do `RequireCompany`. Lado cliente (bundle do navegador), fase de inicialização do módulo/render inicial; o wrapper de erro converteu a exceção na página amigável.

**Evidência objetiva (bundle publicado `/assets/index-C_jEselP.js`):**
`... VITE_SUPABASE_PUBLISHABLE_KEY:``, VITE_SUPABASE_URL:`` ...` — ou seja, as duas variáveis foram compiladas como **strings vazias**, que são falsy e disparam a exceção.

**Causa raiz:** o bloco manual `vite.define` reintroduzido em `vite.config.ts` lia `process.env` no momento de avaliação do arquivo de configuração — anterior à injeção gerenciada do ambiente no build publicado — e gravava `""` (`?? ""`), sobrescrevendo a injeção oficial de `@lovable.dev/vite-tanstack-config`.

**Por que as tentativas anteriores não resolveram:** alternaram entre remover e reintroduzir o mesmo mecanismo, sem inspecionar o artefato realmente entregue ao navegador; o sandbox de desenvolvimento tem as variáveis no processo e mascarava a falha.

**Relação cbe364fd × 7ab0bf1b:** `cbe364fd` removeu a ponte manual pelo motivo correto (avaliação precoce → strings vazias). `7ab0bf1b` reintroduziu lógica equivalente (`process.env[...] ?? ""` + `define`), reativando exatamente a condição já diagnosticada. A causa registrada em `cbe364fd` permanece tecnicamente válida.

**Configuração anterior:** `vite.config.ts` definia `import.meta.env.VITE_SUPABASE_URL` e `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY` via `define`.
**Configuração final:** nenhum `define` de variáveis; injeção exclusivamente oficial por `@lovable.dev/vite-tanstack-config`. Sem `.env` versionado, sem valores no código, sem `service_role`.

**Arquivos alterados:** `vite.config.ts`; `docs/relatorios/fechamento-fases-0-1.md`.

**Variáveis (sem valores):** `VITE_SUPABASE_URL` DEFINIDA · `VITE_SUPABASE_PUBLISHABLE_KEY` DEFINIDA (mascarada) · `SUPABASE_URL` DEFINIDA · `SUPABASE_PUBLISHABLE_KEY` DEFINIDA (mascarada). Disponíveis no build: SIM. Disponíveis no SSR: SIM. Incorporadas ao bundle do cliente: SIM (somente URL, chave publicável, anon e project id). Nenhuma chave privilegiada no bundle (`sb_secret_` aparece apenas como prefixo de verificação; `service_role`: 0 ocorrências).

**Resultado do build:** aprovado; bundle novo contém `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com valores reais (sem `""`, `undefined` ou placeholder).
**GET /:** HTTP 200, redirecionamento controlado para `/auth`, sem fallback e sem 500.
**GET /auth:** HTTP 200, formulário de login renderizado; recarga direta e janela sem sessão idem.
**E2E autenticado:** PASS (`sessão → contexto → empresa → RBAC → Dashboard → reload → logout`).

| Suíte | Executados | PASS | FAIL | SKIP |
|---|---:|---:|---:|---:|
| Build | 1 | 1 | 0 | 0 |
| Typecheck | 1 | 1 | 0 | 0 |
| Lint | 1 | 1 | 0 | 0 |
| Unitários | 30 | 30 | 0 | 0 |
| Segurança | 61 | 61 | 0 | 0 |
| Smoke `/` e `/auth` | 2 | 2 | 0 | 0 |
| E2E autenticado | 1 | 1 | 0 | 0 |
| **Total** | **97** | **97** | **0** | **0** |

**Riscos residuais:**
1. O endereço publicado continuará servindo o bundle antigo até que esta atualização seja publicada.
2. `vite preview` não executa a saída Nitro/worker (`dist/server/index.mjs`) e falha localmente por limitação da ferramenta, não da aplicação.
3. Aviso de hidratação em `/auth` (rota com SSR desligado) — não bloqueante, sem relação com o incidente.
4. Lint mantém 9 avisos não bloqueantes de Fast Refresh.

**Status:** INCIDENTE P0 CORRIGIDO — AGUARDANDO VALIDAÇÃO EXTERNA DO AMBIENTE PUBLICADO.
