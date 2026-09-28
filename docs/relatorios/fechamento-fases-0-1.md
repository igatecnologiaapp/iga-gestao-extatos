# RELATÓRIO TÉCNICO — FECHAMENTO DAS FASES 0, 1 E IMPLEMENTAÇÃO DA FASE 2

**Sistema:** Gestor de Extratos  
**Escopo:** Fundação, segurança, auditoria, RBAC, cadastros financeiros, importações e lançamentos  
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
| `/` sem sessão | PASS — encaminha para `/auth`; React registra aviso de hidratação não bloqueante durante o redirecionamento |
| Janela anônima | PASS — login visível, sem fallback e sem erros |
| Sessão válida | PASS — rota protegida abriu |
| Company Context e RBAC | PASS — Dashboard renderizado |
| Recarga/Ctrl+F5 equivalente | PASS — Dashboard permaneceu renderizado após reload de rede |
| Logout | PASS — sessão encerrada e retorno para `/auth` |
| Novo login por senha | PENDENTE MANUAL — runner sem credenciais de teste; não foi declarado PASS |

O deployment validado expôs `x-deployment-id` próprio e `/health` com checkpoint `49b6b965ea6f1b1b04ede791df2ab1e2f6187a4b`, eliminando a dúvida de cache/deployment antigo. O build observado após as alterações permaneceu `build OK`.

Risco residual: o acesso inicial por `/` sem sessão registra o aviso React #418 durante o redirecionamento client-only para `/auth`. A tela de login é exibida, não há fallback nem indisponibilidade; acesso direto a `/auth`, Dashboard e recarga autenticada não registraram o aviso. Duas correções isoladas (supressão no script de bootstrap e SSR da rota de login) não o eliminaram e foram revertidas para evitar novas alterações por hipótese.

**Status:** APLICAÇÃO RECUPERADA NO CHROME PÚBLICO. INCIDENTE P0 tecnicamente contido; homologação final das Fases 0 e 1 e relogin por senha dependem da validação manual do responsável. Fase 2 permanece bloqueada.

---

## 15. Fase 2 — Importação e gestão dos lançamentos

### Controle de versão e escopo

- SHA inicial: `27d9375f402acbe69041ff515987fc336344a613`.
- SHA de referência do fechamento: `6310191ec70e2c057c86fa43dd594228b3cfc04d`.
- Escopo encerrado em importação, revisão, classificação e gestão de lançamentos.
- Não foram iniciadas conciliação avançada, OCR/IA, previsões, dashboards avançados, faturas ou qualquer item das Fases 3–6.

### Migrações aplicadas

1. `20260903020232_910ca1a4-9a35-418d-ba10-0739a3942ed0.sql`: enums e tabelas de importações, itens em revisão e lançamentos; GRANTs; RLS/RBAC; índices; auditoria; validações multiempresa; políticas do storage privado.
2. `0000_fix_movement_company_reference_validation.sql`: valida referências opcionais pela representação JSON do registro, preservando a validação de empresa sem acessar colunas inexistentes em lotes de importação.
3. `0001_revoke_anonymous_phase2_table_writes.sql`: remove de visitantes anônimos qualquer privilégio de inclusão, alteração ou exclusão nas três tabelas da Fase 2.

### Arquivos e formatos suportados

- PDF com camada de texto, OFX, CSV, XLS e XLSX.
- Arquitetura de parsers separada por formato e preparada para inclusão de novos adaptadores.
- Os arquivos originais ficam no bucket privado `financial-documents`, em caminho segregado pela empresa, com acesso por URL temporária autorizada.
- Metadados registrados: empresa, usuário, data/hora, nome original, formato, tamanho, origem, instituição, conta/cartão, período, estado e hash SHA-256.
- PDF digitalizado sem camada de texto não é processado nesta fase porque OCR foi expressamente excluído.

### Fluxo implementado

`ARQUIVO → UPLOAD → PROCESSAMENTO → REVISÃO → CLASSIFICAÇÃO → CONFIRMAÇÃO → LANÇAMENTO → FILTRO → TOTALIZAÇÃO`

1. A Central de Importações solicita origem (conta ou cartão), instituição, conta/cartão, período e arquivo.
2. O arquivo é validado, recebe hash e é enviado ao armazenamento privado.
3. O lote percorre `Recebido → Processando → Revisão`, com estados alternativos `Erro` e `Cancelado`.
4. Data, descrição, valor, natureza e origem são normalizados sem perder casas decimais ou sinal de crédito/débito.
5. A classificação inicial usa categorias existentes e contempla Compra, Taxa, Juros e Não classificado.
6. A revisão é obrigatória; permite editar, classificar em lote, descartar e confirmar itens.
7. A confirmação cria lançamentos com proveniência do lote e do item revisado.
8. A Central de Lançamentos oferece filtros por período, instituição, conta, cartão, categoria, natureza, origem e descrição, além de totais de entradas, saídas, saldo e resumo por categoria.
9. Lançamentos manuais podem ser criados, editados e inativados, mantendo a origem `Manual`; itens confirmados mantêm a origem `Importado`.

### Duplicidade, segurança e auditoria

- Nível de arquivo: hash SHA-256 por empresa sinaliza/rejeita reenvio do mesmo documento.
- Nível de lançamento: impressão digital por empresa, data, descrição normalizada, valor e natureza marca `Possível duplicidade` para revisão humana.
- As políticas exigem vínculo ativo com a empresa e as permissões `import.execute`, `transaction.view` ou `transaction.manage`, conforme a operação.
- Não há uso de acesso privilegiado nas operações da aplicação; o usuário atua sob RLS.
- Gatilhos impedem referências de instituição, conta, cartão, categoria ou subcategoria pertencentes a outra empresa.
- Lotes e lançamentos são auditados em criação, alteração, confirmação, mudança de estado e inativação, com dados anteriores e posteriores.
- O linter do banco não encontrou problemas de segurança ou configuração.

### Experiência responsiva

- Desktop: revisão e lançamentos em tabelas densas e pesquisáveis.
- Mobile: importações e lançamentos em cards, menu recolhível e filtros em seção expansível.
- Totais e ações principais permanecem visíveis sem sobreposição em 390 × 844 px.

### Evidências e resultado

| Verificação | Resultado |
|---|---|
| 50 testes unitários, incluindo 20 dos parsers e duplicidade | PASS |
| 61 cenários de segurança RLS/RBAC/storage/auditoria | PASS |
| Typecheck | PASS |
| Lint | PASS sem erros; 9 avisos preexistentes e não bloqueantes |
| Build observado | PASS |
| Linter do banco | PASS — nenhuma ocorrência |
| Upload CSV → revisão de 4 itens → confirmação → lançamentos e totais | PASS |
| Console durante o fluxo E2E | PASS — nenhum erro |
| Interface desktop | PASS |
| Interface mobile autenticada em 390 × 844 px | PASS |
| PDF com camada de texto, OFX, CSV e XLSX em testes automatizados | PASS |
| XLS legado | SUPORTADO pelo adaptador tabular; fixture automatizada específica não incluída |
| PDF digitalizado/OCR | SKIP — fora do escopo |
| Homologação funcional pelo responsável do produto | PENDENTE |

### Limitações e riscos residuais

1. Layouts de CSV/XLS/XLSX muito diferentes das colunas reconhecidas podem exigir novo mapeamento.
2. PDFs bancários variam por instituição; sem camada textual ou com layout não tabular exigirão adaptador futuro, não OCR nesta fase.
3. A detecção de lançamento duplicado é deliberadamente conservadora e exige decisão na revisão.
4. Os testes de segurança legados mantêm o título “Fases 0 e 1”, embora também validem os GRANTs globais que cobrem as tabelas adicionadas.
5. Os dados E2E são fictícios e não contêm informações bancárias reais.

### Situação da fase

**FASE 2 IMPLEMENTADA — AGUARDANDO VALIDAÇÃO/HOMOLOGAÇÃO.** O desenvolvimento deve parar neste ponto; a Fase 3 permanece bloqueada até autorização expressa.

---

## 16. Fase 2 — Publicação e validação final no ambiente público

### 16.1 Publicação

| Item | Valor |
| --- | --- |
| URL pública | https://iga-gestao-extatos.lovable.app |
| SHA publicado (confirmado em `/health`) | `49b6b965ea6f1b1b04ede791df2ab1e2f6187a4b` |
| Identificador do deployment | `psr2.a137a48c-7559-400f-9989-c0e758e185cc` |
| Data/hora da verificação pública (UTC) | 2026-09-26 |
| Build | PASS — `/health` responde HTTP 200 com `status: ok` e runtime do backend configurado |
| Correspondência ambiente público × estado aprovado | CONFIRMADA |

### 16.2 Regressão das Fases 0 e 1 (ambiente publicado)

| Verificação | Resultado |
| --- | --- |
| `/health` | PASS — HTTP 200 |
| `/auth` | PASS — HTTP 200, tela de login renderizada |
| Sessão autenticada de e-mail/senha (conta igatecnologia.app@gmail.com) | PASS |
| Dashboard | PASS |
| Contexto da empresa (empresa exibida no menu lateral) | PASS |
| RBAC (itens de menu filtrados por permissão) | PASS |
| Cadastros existentes (Instituições com registros) | PASS |
| Refresh completo da página | PASS — Dashboard recarrega sem erro |
| Logout | PASS — redireciona para `/auth` |
| Relogin | PASS — Dashboard novamente disponível |

### 16.3 Fase 2 no ambiente público

Fluxo executado com arquivo fictício (`tests/fixtures/extrato.csv`, sem dados bancários reais).

| Etapa | Resultado |
| --- | --- |
| Importações → Nova importação (instituição + conta bancária) | PASS |
| Upload e processamento | PASS |
| Arquivo armazenado em storage privado (abertura por URL temporária em “Arquivo original”) | PASS |
| Lançamentos extraídos (4 itens) | PASS |
| Revisão obrigatória antes da confirmação | PASS |
| Edição/classificação na revisão | PASS |
| Confirmação | PASS — aviso “Importação concluída” |
| Lançamentos apresentados corretamente | PASS |
| Entradas / Saídas / Saldo | PASS — R$ 7.000,00 / R$ 2.613,62 / R$ 4.386,38 |
| Totais por categoria (Compra, Taxa, Juros, Não classificado) | PASS |
| Filtros (busca por descrição) | PASS — 1 registro, totais recalculados |
| Rastreabilidade da importação (lote, arquivo original e origem “Importado”) | PASS |

### 16.4 Duplicidade (ambiente publicado)

| Verificação | Resultado |
| --- | --- |
| Reenvio do mesmo arquivo → aviso de duplicidade de arquivo com ação explícita “Importar mesmo assim” | PASS |
| Processamento só ocorre após decisão do usuário | PASS |
| Lançamentos duplicados sinalizados como “Possível duplicidade” (4 de 4) | PASS |
| Ausência de exclusão ou decisão automática | PASS — itens permanecem pendentes aguardando revisão |

### 16.5 Mobile (390 × 844 px, ambiente publicado)

| Verificação | Resultado |
| --- | --- |
| Menu lateral (abrir/fechar) | PASS |
| Importações | PASS |
| Revisão em cards | PASS |
| Lançamentos em cards (8 registros) | PASS |
| Filtros recolhíveis | PASS |
| Valores e ações visíveis | PASS |
| Sobreposição ou rolagem horizontal indevida | NENHUMA |

### 16.6 Console e rede (ambiente publicado)

| Verificação | Resultado |
| --- | --- |
| Erros de console | 0 |
| Erros JavaScript | 0 |
| Respostas HTTP 4xx/5xx | 0 |
| Erros de autenticação, RLS ou storage | 0 |

### 16.7 Segurança (sem novas alterações nesta rodada)

| Item | Resultado |
| --- | --- |
| Testes unitários | 51/51 PASS |
| Cenários de segurança | 76/76 PASS |
| Scanner de segurança | Sem alertas |
| Critical | 0 |
| High | 0 |
| Fase 3 | Não iniciada |

### 16.8 Situação

**FASE 2 IMPLEMENTADA E TECNICAMENTE VALIDADA NO AMBIENTE PUBLICADO — AGUARDANDO HOMOLOGAÇÃO DO RESPONSÁVEL.**

**FASE 3 PERMANECE BLOQUEADA.** Desenvolvimento encerrado neste ponto.

## 17. Reconciliação de SHA/deployment

- Antes: `/health` retornava `49b6b965ea6f…`, que era uma **constante estática de fallback** (`CHECKPOINT_SHA`) em `src/routes/health.ts`, correspondente ao commit histórico "Simplificou build publicável" (anterior à Fase 2). O ambiente hospedado não injeta variável de SHA, então o fallback sempre era exibido. Não representava o código publicado.
- Deployment `psr2.a137a48c-7559-400f-9989-c0e758e185cc`: o código executado continha a Fase 2 e as correções de segurança (comprovado funcionalmente: Central de Importações, Lançamentos, duplicidade e testes de segurança contra o backend), mas o SHA exato não era identificável pelo `/health`.
- Correção (somente metadata): `vite.config.ts` grava `git rev-parse HEAD` e horário do build (`__BUILD_COMMIT__`, `__BUILD_TIME__`); `src/routes/health.ts` passa a informar esse SHA e `builtAt`, sem constante estática. O deployment ID é o cabeçalho `x-deployment-id`.
- Nenhuma alteração em banco, RLS/RBAC, storage, parsers, importações, lançamentos ou autenticação.
- Verificação pós-correção (público): `/health` → commit `a8a439749ef174c2788a96c851c78f7252de558a` (= HEAD do repositório, contém Fase 2 + correções de segurança), deployment `psr2.064f358c-a01f-45f1-8ac8-ee2cd4bdecdf`; `/auth` 200; login, Dashboard, Importações, Lançamentos PASS; console 0 erros. Critical 0 / High 0.
- Status: FASE 2 IMPLEMENTADA, SEGURA E TECNICAMENTE VALIDADA NO AMBIENTE PUBLICADO — AGUARDANDO HOMOLOGAÇÃO FORMAL DO RESPONSÁVEL. FASE 3 PERMANECE BLOQUEADA.

---

## 18. HOMOLOGAÇÃO FORMAL — FASE 2 (26/09/2026)

O responsável pelo projeto registrou a **HOMOLOGAÇÃO FORMAL DA FASE 2 — IMPORTAÇÃO E GESTÃO DOS LANÇAMENTOS**.

### Base técnica da homologação

| Item | Resultado |
| --- | --- |
| SHA publicado (confirmado em `/health`) | `a8a439749ef174c2788a96c851c78f7252de558a` |
| Deployment | `psr2.064f358c-a01f-45f1-8ac8-ee2cd4bdecdf` |
| `/health` | PASS |
| `/auth` | PASS |
| Dashboard | PASS |
| Importações | PASS |
| Lançamentos | PASS |
| Console | 0 erros |
| Testes unitários (executados anteriormente) | 51/51 PASS |
| Testes de segurança (executados anteriormente) | 76/76 PASS |
| Último scanner de segurança | 0 Critical / 0 High |
| Fluxo público completo da Fase 2 | Validado anteriormente |
| Duplicidade | Validada |
| Storage privado | Validado |
| Experiência mobile | Validada |
| Identificação do SHA do deployment | Corrigida |

### Ressalvas registradas pelo responsável

- **Não foram novamente executados** login por digitação de e-mail/senha nem o scanner de segurança após a última alteração de versionamento.
- A homologação considera que a última alteração ficou **restrita à identificação de versão** e não modificou regras funcionais, banco, RLS/RBAC, storage, importações, lançamentos ou autenticação.

### Status registrados

**FASE 2 HOMOLOGADA PELO RESPONSÁVEL DO PROJETO.**
**FASES 0, 1 E 2 HOMOLOGADAS.**
**FASE 3 PERMANECE BLOQUEADA ATÉ AUTORIZAÇÃO EXPRESSA DO RESPONSÁVEL.**

## 19. CORREÇÃO COMPLEMENTAR PÓS-HOMOLOGAÇÃO — DATAS DA IMPORTAÇÃO + MENU RECOLHÍVEL (26/09/2026)

Correção dos dois ajustes complementares solicitados após a homologação. Nenhuma regra de Fases 0–2 foi alterada; Fase 3 permanece bloqueada.

### 19.1 Diagnóstico da causa raiz do erro `0000-00-00`

- **Arquivo/parser:** todos os parsers da Fase 2 (`src/lib/importers/`: CSV/XLSX em `tabular.ts`, OFX em `ofx.ts`, PDF em `pdf.ts`) convertem datas pela função central `parseDate` em `src/lib/importers/shared.ts`.
- **Etapa:** parsing → staging. O valor não veio do arquivo: foi **criado pelo sistema** ao não conseguir interpretar a data.
- **Causa raiz:** `parseDate` só rejeitava mês > 12 e não validava o calendário. Entradas como `00/00/0000`, datas OFX `00000000` e dias impossíveis (`31/02`) geravam o literal `"0000-00-00"`, gravado em `staged_transactions.posted_at` (coluna `date`) e rejeitado pelo PostgreSQL na confirmação/persistência (`date/time field value out of range`).

### 19.2 Correção aplicada (normalização central)

- `parseDate` (`shared.ts`) agora valida via `isValidIsoDate`: ISO `yyyy-mm-dd` existente no calendário, ano 1900–2100, mês 1–12, dia ≤ dias do mês.
- Datas inválidas (`0000-00-00`, `00/00/0000`, `00000000`, `31/02/2026`, vazia, espaços, `null`, `undefined`, texto não reconhecido) retornam `null` — **nunca data fictícia** (sem data atual, sem 1970, sem data da importação). O valor original permanece preservado em `staged_transactions.raw`.
- A correção é central: vale automaticamente para CSV, OFX, XLS/XLSX e PDF textual, sem alterar os parsers individuais.
- Tela de Revisão: item sem data válida exibe **"Data inválida — informe a data da transação"** (desktop e mobile) e o banner de pendências orienta o preenchimento; a confirmação continua exigindo data, valor e natureza completos.

### 19.3 Menu lateral recolhível

- `src/components/app-shell.tsx`: navegação reorganizada em categorias **Painel, Movimentações, Cadastros, Administração e Configurações**, com submenus recolhíveis por clique (chevron + `aria-expanded`).
- O grupo da rota ativa abre automaticamente; grupos sem itens visíveis (RBAC por permissão) não são exibidos. Bloco "Próximas fases" mantido. Mobile inalterado em comportamento.

### 19.4 Testes e validação

| Verificação | Resultado |
| --- | --- |
| Testes unitários (incl. novos casos de datas válidas e inválidas) | 53/53 PASS |
| Testes de segurança RLS/RBAC/Storage | 76/76 PASS |
| Typecheck / Lint | PASS / 0 erros |
| Reprodução do erro `0000-00-00` (CSV com `00/00/0000` via tela de importação) | NÃO reproduzido — arquivo processado, item em Revisão marcado "Data inválida — informe a data da transação", sem erro de banco |
| Menu: grupos, recolher/expandir, grupo ativo automático, RBAC | PASS (desktop) |
| Mobile 390×844 (revisão + menu) | PASS |
| Console | 0 erros |
| Dados de teste | Fictícios; registros de teste removidos do banco após a validação |

### 19.5 Publicação

| Item | Valor |
| --- | --- |
| SHA anterior | `a8a439749ef174c2788a96c851c78f7252de558a` |
| SHA publicado (confirmado em `/health`) | `54231982ce0bb468dc4fbfe9ca52246e56a3d681` |
| Deployment | `psr2.25753728-1e59-4867-80df-1b0a918173e6.1791064542.ME1EOqEnnu5rXP-dPkRrXFWRK44dkh74K6WV_g-OI68` |
| URL pública | https://iga-gestao-extatos.lovable.app |
| `/health` / `/auth` | PASS / 200 |

**Status: FASES 0, 1 E 2 PERMANECEM HOMOLOGADAS. CORREÇÃO COMPLEMENTAR IMPLEMENTADA, TESTADA E PUBLICADA. FASE 3 PERMANECE BLOQUEADA ATÉ AUTORIZAÇÃO EXPRESSA DO RESPONSÁVEL.**

---

## 20. Fase 3 — Gestão de Cartões e Faturas (28/09/2026)

**Status: FASE 3 IMPLEMENTADA E TECNICAMENTE VALIDADA — AGUARDANDO HOMOLOGAÇÃO DO RESPONSÁVEL. FASE 4 PERMANECE BLOQUEADA.**

### Estruturas criadas/alteradas
- Migrations: `drizzle/migrations/0003_phase3_card_invoices.sql`, `0004_phase3_revoke_anon.sql`.
- `cards.account_id` (conta relacionada, opcional).
- `card_invoices` (empresa, cartão, competência, abertura, fechamento, vencimento, ciclo de vida aberta/fechada/cancelada); única por (cartão, competência).
- `invoice_payments` (data, valor, conta, vínculo opcional a débito do extrato, observação, responsável, chave de idempotência; estorno = status inativo, sem exclusão; valor imutável).
- `transactions`: `invoice_id`, `charge_kind` (compra, juros, encargo, tarifa, ajuste, crédito, estorno, devolução, pagamento), `installment_number/total/group/total_amount`.
- View `card_invoice_summary` (security_invoker) consolida compras, juros, encargos, tarifas, ajustes, créditos, estornos, total e pago.
- Permissões novas: `invoice.view` (todos os papéis), `invoice.manage` e `invoice.pay` (admin, financeiro).

### Regras de competência (`src/lib/invoices.ts`)
- Fechamento do mês = min(dia de fechamento, último dia do mês) — nunca cria datas impossíveis (fev/bissexto tratados).
- Compra antes do fechamento → fatura corrente; no dia do fechamento ou depois → próxima.
- Vencimento no mesmo mês se dia venc. > dia fech.; senão no mês seguinte (dezembro→janeiro tratado).
- Competência = mês do vencimento. Período = [fechamento anterior, fechamento − 1].
- Status exibido derivado dos dados: Cancelada > Paga > Vencida > Parcialmente paga > Fechada > Aberta.
- Sinalização: verde normal; amarelo dentro de `companies.dias_alerta_vencimento`; vermelho vencida com saldo.
- Limite: Disponível = limite total − saldos em aberto das faturas (sem regras específicas de bancos).

### Parcelamento
- Compra parcelada gera uma parcela por fatura (competência inicial + i), valores divididos em centavos.
- Parcelas já importadas (mesma descrição base, nº e total) não são recriadas; reenvio bloqueado por índice único (grupo, nº).
- Parcelas importadas com "PARC 03/10"/"Parcela 3 de 10" são reconhecidas na associação.

### Integração com lançamentos e pagamentos
- "Associar lançamentos às faturas" preenche apenas o vínculo dos lançamentos do cartão sem fatura (idempotente, sem duplicar).
- Vínculo/desvínculo manual com sugestão pelo período; natureza editável.
- Linhas "pagamento" vindas da fatura não entram no total (evita duplicidade com o pagamento registrado).
- Pagamento com conta: busca débitos de mesmo valor ±5 dias e exibe "Possível pagamento já existente — revisar vínculo"; não exclui nem concilia (Fase 4).

### Segurança e auditoria
- RLS por `company_id` com `private.is_company_member` / `private.has_permission`; sem DELETE; anônimo sem acesso.
- Triggers garantem cartão, conta, fatura e lançamento da mesma empresa; lançamento só vincula à fatura do mesmo cartão; fatura cancelada não aceita vínculo/pagamento.
- `log_audit` registra criação, fechamento/reabertura/cancelamento (status_change), alteração de vencimento, pagamento, estorno e vínculos (via auditoria de lançamentos).

### Testes
- Unitários: 70/70 PASS (17 novos: competência, virada de mês, dez/jan, fevereiro, bissexto, status, vencimento, limites, créditos/estornos, parcelas, possível pagamento).
- Segurança: 108/108 PASS (32 novos F3-01…F3-32: A×B SELECT/INSERT/UPDATE/DELETE, RBAC, idempotência, parcela duplicada, auditoria, anônimo). Ajuste no roteiro: papel Consulta restaurado antes da Fase 3 (AUD-07 o promove).
- Achado corrigido durante os testes: novas tabelas tinham privilégios padrão para anônimo → revogados (0004).
- E2E (desktop e 390×844): associação automática (compra de 12/09 → fatura 10/2026; demais → 09/2026, total 249,90 = 320 + 49,90 − 120), pagamento parcial 100 → "Parcialmente paga", saldo 100; Pagamentos de Faturas; menu recolhível. Dados sintéticos removidos.
- Regressão: typecheck e lint sem erros; testes das Fases 0–2 PASS.

### Limitações conhecidas
- Não há conciliação: vínculo de pagamento a débito é apenas referência.
- Filtro por empresa usa o seletor de empresa existente.
- Recomposição de limite segue regra genérica (saldos em aberto).
- Aviso de console do React ("state update on a component that hasn't mounted yet") observado no preview, sem impacto funcional.

## 21. Fase 3 — Validação final de segurança e ambiente publicado (28/09/2026)

Nenhuma alteração de código, regra, RLS ou RBAC nesta rodada (sem publicação corretiva).

**Segurança**
- Scanner (nova execução sobre o estado publicado): nenhum achado — Critical 0, High 0.
- ANON (API real, sem login): `card_invoices`, `invoice_payments`, `cards`, `transactions` → SELECT/INSERT/UPDATE/DELETE = 401 (permission denied); view `card_invoice_summary` → SELECT "permission denied" (42501), escrita impossível (view não atualizável). Falha anterior permanece corrigida.
- Empresa A × Empresa B e RBAC: cobertos por F3-01…F3-32 e suíte anterior (consultar, criar, alterar, excluir, vincular, desvincular, pagar, cancelar; cartões, faturas, vínculos, pagamentos, lançamentos) — PASS no backend real.
- Segurança: 108/108 PASS. Unitários: 70/70 PASS.

**Ambiente publicado**
- URL https://iga-gestao-extatos.lovable.app — `/health` SHA `47adbc9f35f0658ceaec509c3ca1ed9171be01be`, deployment `psr2.2c9c83dd-7129-4202-957f-6a8c6339b250`; `/auth` 200.
- Login por sessão injetada da conta igatecnologia.app@gmail.com (login por digitação não reexecutado).

**Fluxo Fase 3 (desktop, público, dados fictícios ZZ-F3-TESTE)**: cartão (fech. 5, venc. 15) → compra 10/09 R$ 200 → fatura 10/2026 (fechamento 04/10, vencimento 15/10, Aberta) → Fechar fatura → pagamento R$ 100 → "Parcialmente paga", Pago 100, Saldo 100 → pagamento R$ 100 → "Paga", Saldo 0,00. Aviso "Possível pagamento já existente — revisar vínculo" exibido (débito de R$ 100 na conta), sem conciliação automática. Pagamentos de Faturas lista os 2 pagamentos. Logout → /auth; relogin → /faturas.

**Mobile 390×844 (público)**: Dashboard, Faturas, detalhe, Pagamentos, Cartões, Lançamentos sem rolagem horizontal; menu recolhível funcional.

**Regressão Fases 0–2**: Dashboard, Instituições, Contas, Cartões, Importações, Lançamentos, menu, logout/relogin operacionais (desktop e mobile). Revisão de importação não reexecutada com novo arquivo nesta rodada.

**Console/rede (público)**: 0 erros, 0 warnings, 0 HTTP 4xx/5xx inesperados. O aviso citado anteriormente ("Can't perform a React state update on a component that hasn't mounted yet") foi visto apenas no preview (modo de desenvolvimento do React, que só emite esse warning em dev); não aparece em produção. Classificação: warning de desenvolvimento, sem impacto funcional ou de segurança — risco residual conhecido, sem correção necessária.

**Dados sintéticos**: removidos (contagem final 0). Registros de auditoria preservados.

**FASE 3 IMPLEMENTADA, PUBLICADA E TECNICAMENTE VALIDADA — AGUARDANDO HOMOLOGAÇÃO DO RESPONSÁVEL. FASE 4 PERMANECE BLOQUEADA.**

## 22. Homologação formal — Fase 3 (28/09/2026)

**FASE 3 — GESTÃO DE CARTÕES E FATURAS: HOMOLOGADA PELO RESPONSÁVEL DO PROJETO.**

Base da homologação (evidências da seção 21):
- Segurança: varredura final 0 Critical / 0 High; ANON bloqueado; Empresa A × Empresa B PASS; RBAC PASS; 108/108 testes de segurança (operações no servidor: consultar, criar, alterar, excluir, vincular, desvincular, pagar, cancelar).
- Testes automatizados: 70/70 PASS.
- Ambiente publicado: https://iga-gestao-extatos.lovable.app — SHA `47adbc9f35f0658ceaec509c3ca1ed9171be01be`, deployment `psr2.2c9c83dd-7129-4202-957f-6a8c6339b250`.
- Fluxo público: Cartão → Compra → Fatura → Fechamento → Pagamento parcial (R$ 200 / R$ 100 → Parcialmente paga, saldo R$ 100) → Pagamento total (Paga, saldo R$ 0,00).
- Duplicidade: aviso "Possível pagamento já existente — revisar vínculo", sem conciliação automática nem exclusão.
- Mobile 390×844: sem rolagem horizontal nas principais telas; menu recolhível funcionando.
- Produção: 0 erros, 0 warnings, 0 falhas de comunicação.
- Dados fictícios removidos; auditoria preservada.

Verificações NÃO repetidas nesta rodada (registradas por fidelidade; não invalidam a homologação):
- login por digitação de usuário/senha;
- checagem específica de todos os filtros;
- nova importação passando pela tela de Revisão;
- verificação visual mobile de cada ação individual condicionada por RBAC.

Status: FASES 0, 1, 2 e 3 HOMOLOGADAS. **FASE 4 — BLOQUEADA ATÉ AUTORIZAÇÃO EXPRESSA DO RESPONSÁVEL.** Nenhuma alteração de código, banco, RLS, RBAC ou interface nesta solicitação. Desenvolvimento parado.

## 23. Ajuste pontual — Edição do nome da instituição (28/09/2026)

- Tela Cadastros → Instituições: botão "Editar" visível (texto + ícone) para quem tem `institution.update`; atualiza o MESMO registro (UPDATE por id), sem recriar/duplicar.
- Validações: espaços extras removidos; nome vazio bloqueado ("Informe o nome da instituição."); duplicidade pela regra existente (empresa+nome único) → "Já existe uma instituição com este nome nesta empresa."; sucesso → "Instituição atualizada com sucesso."; demais telas recarregam o novo nome.
- Sem alteração de banco, RLS, RBAC ou regras financeiras. Auditoria pelo gatilho existente (old/new, usuário, empresa, data/hora).
- Teste (preview, dados fictícios): "Banco Teste" → "Banco Teste S.A.": mesmo id; conta e cartão continuam vinculados; tela Contas exibe o novo nome; nenhuma duplicata; auditoria `update` com nome anterior/novo, e-mail, empresa e horário. Dados removidos.
- Segurança: novo teste INST-01 (admin da Empresa A não renomeia instituição da Empresa B) + RBAC-13 (auditor não edita) → 109/109 PASS; unitários 70/70.
- Publicado em https://iga-gestao-extatos.lovable.app.

AJUSTE DE EDIÇÃO DE INSTITUIÇÃO CONCLUÍDO. FASES 0, 1, 2 E 3 PERMANECEM HOMOLOGADAS. FASE 4 PERMANECE BLOQUEADA.
