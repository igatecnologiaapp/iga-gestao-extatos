# Roadmap — Gestor de Extratos

## Status

- **Fases 0, 1 e 2: IMPLEMENTADAS E HOMOLOGADAS** pelo responsável do projeto (26/09/2026).
- **Fase 3 (e demais fases): BLOQUEADA** até autorização expressa do responsável.

## Correção complementar pós-homologação (26/09/2026) — CONCLUÍDA

- [x] Diagnóstico e registro da causa raiz do erro `0000-00-00` (normalização de datas em `parseDate`, `src/lib/importers/shared.ts`)
- [x] Datas inválidas → `null` (nunca data fictícia); item marcado "Data inválida — informe a data da transação" na Revisão (desktop e mobile)
- [x] Menu lateral recolhível por categorias (Painel, Movimentações, Cadastros, Administração, Configurações), RBAC preservado
- [x] Testes unitários 53/53 (incl. datas), segurança 76/76, typecheck, lint
- [x] Regressão E2E: reprodução do erro `0000-00-00` NÃO ocorre; menu desktop/mobile; revisão; sem erros de console
- [x] Dados de teste removidos do banco
- [x] Publicação validada: SHA `54231982ce0bb468dc4fbfe9ca52246e56a3d681`, deployment `psr2.25753728-1e59-4867-80df-1b0a918173e6…`
- [x] Relatório técnico atualizado (seção 19 de `docs/relatorios/fechamento-fases-0-1.md`)
- [x] PARAR o desenvolvimento

## Próximos passos

- Aguardar autorização expressa do responsável para a Fase 3.
