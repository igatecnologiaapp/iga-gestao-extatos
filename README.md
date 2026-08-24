# Iga Gestão de Extratos

PROMPT — CRIAÇÃO DO APP DE GESTÃO DE EXTRATOS BANCÁRIOS E CARTÕES

Desenvolver um aplicativo web responsivo para Gestão de Extratos Bancários, Contas Bancárias e Cartões de Crédito/Débito, com foco em organização financeira, importação de documentos, categorização dos lançamentos, conciliação, controle de vencimentos, despesas financeiras e análise consolidada.

O sistema deverá possuir uma interface clara, profissional, intuitiva e organizada, permitindo que usuários sem conhecimento técnico consigam localizar rapidamente contas, cartões, lançamentos, faturas, taxas, juros, pagamentos e divergências.

1. OBJETIVO DO SISTEMA

O aplicativo deverá permitir centralizar em um único ambiente:

contas bancárias;

cartões de crédito;

cartões de débito;

administradoras de cartões;

extratos bancários;

faturas;

lançamentos financeiros;

compras;

taxas;

juros;

pagamentos;

vencimentos;

conciliações;

análises por período;

despesas financeiras;

documentos importados.

O objetivo é permitir uma visão consolidada da movimentação financeira, sem perder a possibilidade de análise individual por banco, conta ou cartão.

2. CADASTRO DE INSTITUIÇÕES FINANCEIRAS

Criar módulo denominado:

Instituições Financeiras

Permitir cadastrar instituições bancárias e administradoras de cartões.

Para contas bancárias

Cadastrar:

Código do banco;

Nome da instituição;

Agência;

Número da conta;

Dígito da conta;

Tipo da conta:

Corrente;

Poupança;

Pagamento;

Investimento;

Outra;

Titular;

CPF/CNPJ do titular;

Apelido da conta;

Status:

Ativa;

Inativa.

Uma mesma instituição poderá possuir várias contas cadastradas.

Exemplo:

Banco Itaú

Conta Matriz;

Conta Filial;

Conta Aplicações.

3. CADASTRO DE CARTÕES

Criar estrutura específica para cartões.

Campos:

Administradora;

Banco emissor;

Nome/apelido do cartão;

Bandeira;

Tipo:

Crédito;

Débito;

Crédito e Débito;

Número mascarado do cartão;

Preferencialmente armazenar apenas os últimos 4 dígitos;

Titular;

Dia de fechamento da fatura;

Dia de vencimento;

Limite do cartão;

Status:

Ativo;

Bloqueado;

Cancelado;

Inativo.

Por segurança, não armazenar CVV ou senha do cartão.

O número completo do cartão não deverá ser exibido nas telas comuns do sistema.

4. IMPORTAÇÃO DE EXTRATOS E DOCUMENTOS

Criar módulo:

Importar Extrato / Fatura

O sistema deverá permitir importar documentos nos formatos:

PDF;

PDF pesquisável;

PDF digitalizado;

XLS;

XLSX;

CSV;

OFX;

TXT;

DOC;

DOCX;

outros formatos estruturados que possam ser interpretados com segurança.

Sempre que possível, priorizar leitura direta de dados estruturados.

Utilizar OCR somente quando o documento for imagem ou PDF digitalizado.

5. INTELIGÊNCIA PARA LEITURA DOS DOCUMENTOS

O sistema deverá interpretar os documentos importados e tentar identificar automaticamente:

instituição financeira;

conta;

cartão;

período do extrato;

data do lançamento;

descrição;

estabelecimento;

valor;

débito;

crédito;

saldo, quando disponível;

data de compra;

data de vencimento;

número da parcela;

quantidade de parcelas;

taxas;

juros;

pagamento;

estorno;

crédito recebido.

Antes de gravar definitivamente os dados, apresentar:

Prévia da Importação

Exemplo:

DataDescriçãoValorTipoCategoria02/08/2026POSTO ABCR$ 250,00DébitoCompra03/08/2026TARIFA BANCÁRIAR$ 39,90DébitoTaxa05/08/2026JUROS ROTATIVOR$ 127,40DébitoJuros

O usuário deverá poder corrigir qualquer informação antes da confirmação.

6. PREVENÇÃO DE DUPLICIDADE

Criar mecanismo para evitar que o mesmo extrato ou os mesmos lançamentos sejam importados duas vezes.

Comparar, entre outros elementos:

instituição;

conta/cartão;

data;

descrição;

valor;

identificador original;

documento de origem.

Quando houver suspeita de duplicidade, apresentar:

Possível lançamento duplicado

com as opções:

Ignorar;

Importar mesmo assim;

Comparar;

Substituir registro existente.

Nunca excluir ou substituir automaticamente um lançamento sem confirmação do usuário.

7. CADASTRO DOS LANÇAMENTOS

Cada lançamento deverá possuir, no mínimo:

Data;

Instituição;

Conta/cartão;

Descrição original;

Descrição ajustada;

Valor;

Natureza:

Débito;

Crédito;

Categoria;

Subcategoria;

Documento de origem;

Observação;

Status da conciliação.

8. CATEGORIAS OBRIGATÓRIAS

Inicialmente deverão existir as categorias:

Compra;

Taxa;

Juros.

Essas opções deverão estar disponíveis em lista suspensa.

Entretanto, estruturar o sistema para permitir futuramente ou desde já categorias adicionais, por exemplo:

Pagamento;

Transferência;

PIX;

Recebimento;

Estorno;

Saque;

Investimento;

Imposto;

Tarifa;

Multa;

Anuidade;

Encargos;

Outros.

As categorias deverão ser administráveis.

9. SUBCATEGORIAS

Permitir opcionalmente subdividir uma categoria.

Exemplo:

Taxa

Tarifa bancária;

Anuidade;

Taxa administrativa;

Taxa de manutenção;

IOF;

Taxa de saque.

Juros

Juros rotativos;

Juros de atraso;

Juros de financiamento;

Juros de parcelamento.

Isso permitirá identificar com precisão onde estão ocorrendo despesas financeiras.

10. CATEGORIZAÇÃO INTELIGENTE

O sistema poderá sugerir automaticamente categorias com base no histórico.

Exemplo:

Descrição:

TARIFA MANUT CONTA

Sugestão:

Taxa → Manutenção de conta

Descrição:

JUROS ROTATIVO

Sugestão:

Juros → Rotativo do cartão

A classificação automática deverá ser apresentada como sugestão, permitindo confirmação ou alteração pelo usuário.

Nunca modificar classificações históricas silenciosamente.

11. REGRAS AUTOMÁTICAS

Permitir criar regras.

Exemplo:

Quando a descrição contiver "ANUIDADE", classificar como Taxa → Anuidade.

Outro exemplo:

Quando a descrição contiver "JUROS ROTATIVO", classificar como Juros → Rotativo.

Permitir:

criar;

alterar;

excluir;

ativar;

desativar regras.

12. SOMATÓRIA E ANÁLISE POR CATEGORIA

O sistema deverá calcular valores consolidados para:

Compras;

Taxas;

Juros;

demais categorias.

Permitir selecionar:

Período

Hoje;

Semana;

Mês;

Trimestre;

Semestre;

Ano;

Período personalizado.

Instituição

Uma instituição;

Algumas instituições;

Todas.

Conta/cartão

Conta específica;

Cartão específico;

vários selecionados;

consolidado.

Exemplo:

Agosto/2026

Compras: R$ 21.450,00
Taxas: R$ 780,00
Juros: R$ 1.340,00

Despesas financeiras:
R$ 2.120,00

O indicador de despesas financeiras deverá considerar principalmente:

Taxas + Juros + Multas + outros encargos configurados.

13. CONCILIAÇÃO FINANCEIRA

Criar módulo:

Conciliação

Permitir conciliar:

uma conta bancária;

um cartão;

um banco;

vários bancos;

várias administradoras;

toda a operação.

Exibir:

saldo inicial;

entradas;

saídas;

saldo calculado;

saldo informado pelo banco;

diferença encontrada.

Exemplo:

Saldo banco: R$ 35.480,00
Saldo calculado: R$ 35.230,00
Diferença: R$ 250,00

Destacar divergências.

14. STATUS DA CONCILIAÇÃO

Cada lançamento poderá possuir:

Não conciliado;

Conciliado;

Divergente;

Em análise;

Ignorado justificadamente.

Permitir conciliação individual ou em lote.

Manter histórico de quem realizou a conciliação e quando.

15. GESTÃO DE FATURAS DE CARTÃO

Criar módulo específico:

Faturas

Apresentar:

cartão;

mês de referência;

data de fechamento;

vencimento;

valor da fatura;

valor pago;

saldo pendente;

status.

Status:

Aberta;

Fechada;

Paga;

Parcialmente paga;

Vencida.

16. CONTROLE DE VENCIMENTOS

O sistema deverá identificar vencimentos de:

faturas;

pagamentos;

contas;

compromissos financeiros cadastrados.

Utilizar sinalização:

Verde

Pago / regularizado.

Amarelo

Próximo do vencimento.

Vermelho

Vencido / pagamento atrasado.

Permitir configurar quantos dias antes do vencimento um pagamento passa para amarelo.

Exemplo padrão:

5 dias antes do vencimento.

17. CENTRAL DE ALERTAS

Criar central de alertas para:

fatura próxima do vencimento;

fatura vencida;

pagamento parcial;

juros lançados;

taxa acima do padrão;

aumento de despesas financeiras;

diferença de conciliação;

possível lançamento duplicado;

documento importado com erro;

lançamento sem classificação;

cartão próximo do limite.

Os alertas deverão direcionar o usuário para o registro correspondente.

18. DASHBOARD PRINCIPAL

Criar dashboard gerencial limpo e objetivo.

Apresentar indicadores como:

Financeiro

Saldo bancário consolidado;

Total movimentado no período;

Entradas;

Saídas;

Compras;

Taxas;

Juros;

Despesas financeiras;

Faturas em aberto;

Faturas vencidas.

Cartões

Limite total;

Limite utilizado;

Limite disponível;

Faturas abertas;

Próximos vencimentos.

Conciliação

Lançamentos conciliados;

Pendentes;

Divergentes.

19. GRÁFICOS

Disponibilizar gráficos simples e gerenciais.

Exemplos:

Despesas financeiras por mês

Janeiro
Fevereiro
Março
Abril

Separando:

Taxas;

Juros;

Multas;

outros encargos.

Também disponibilizar:

movimentação por banco;

gastos por cartão;

evolução de compras;

evolução das taxas;

evolução dos juros;

gastos por categoria.

Evitar excesso de gráficos sem finalidade gerencial.

20. COMPARATIVO ENTRE INSTITUIÇÕES

Criar relatório que permita comparar custos bancários.

Exemplo:

BancoTaxasJurosOutros custosTotalBanco AR$ 600R$ 350R$ 100R$ 1.050Banco BR$ 250R$ 80R$ 0R$ 330Banco CR$ 430R$ 210R$ 80R$ 720

Isso deverá ajudar a identificar quais instituições estão gerando maior custo financeiro.

21. ANÁLISE DE JUROS E TAXAS

Criar visão específica:

Custos Financeiros

Apresentando:

taxas no período;

juros no período;

multas;

anuidades;

tarifas;

encargos;

comparação com período anterior;

instituições com maior custo.

Quando houver crescimento relevante, exibir alerta.

Exemplo:

Juros bancários aumentaram 38% em relação ao mês anterior.

22. LANÇAMENTOS PARCELADOS

Para cartões, identificar quando possível:

parcela atual;

total de parcelas;

valor da parcela.

Exemplo:

Notebook — parcela 4/10 — R$ 650,00

Criar estrutura para mostrar:

parcelas já lançadas;

parcelas futuras estimadas;

saldo ainda comprometido.

23. PESQUISA E FILTROS

Criar busca global.

Permitir pesquisar por:

descrição;

instituição;

cartão;

conta;

valor;

categoria;

período;

documento;

estabelecimento.

Criar filtros combináveis.

24. EDIÇÃO EM LOTE

Permitir selecionar vários lançamentos para:

alterar categoria;

alterar subcategoria;

conciliar;

adicionar observação;

vincular documento;

aplicar regra de classificação.

Apresentar confirmação antes de alterações em massa.

25. DOCUMENTOS ORIGINAIS

Manter vínculo entre o lançamento e o documento que originou sua importação.

Exemplo:

Lançamento:

03/08/2026 — Tarifa bancária — R$ 45,00

Origem:

Extrato_Itau_Agosto_2026.pdf

O usuário poderá abrir o documento original para conferência.

Os documentos deverão ser armazenados de forma privada.

26. HISTÓRICO E AUDITORIA

Registrar operações relevantes.

Exemplo:

usuário;

data/hora;

ação;

registro;

valor anterior;

valor novo.

Auditar:

importações;

exclusões;

alterações;

classificações;

conciliações;

alterações em faturas;

pagamentos;

regras automáticas.

Não permitir alteração silenciosa dos registros financeiros.

27. DASHBOARD DE PENDÊNCIAS

Criar quadro específico:

Pendências

Exibir:

lançamentos sem categoria;

lançamentos não conciliados;

divergências;

documentos com erro;

faturas próximas do vencimento;

pagamentos atrasados;

possíveis duplicidades.

O objetivo é permitir que o usuário saiba exatamente o que precisa ser tratado.

28. EXPORTAÇÃO DE DADOS

Permitir exportação para:

Excel;

CSV;

PDF.

Permitir exportar:

lançamentos;

conciliações;

categorias;

custos financeiros;

faturas;

relatórios.

Os filtros aplicados deverão ser respeitados na exportação.

29. PERFIS E PERMISSÕES

Preparar RBAC com perfis como:

Administrador

Acesso completo.

Financeiro

Importação, classificação, conciliação e relatórios.

Consulta

Somente visualização.

Auditor

Consulta de lançamentos, documentos e histórico, sem alteração.

Estruturar permissões de forma granular.

30. SEGURANÇA

Como o sistema manipulará informações financeiras, implementar desde a fundação:

autenticação;

autorização;

isolamento dos dados;

RLS quando aplicável;

arquivos privados;

URLs temporárias/assinadas para documentos;

logs de auditoria;

proteção de dados sensíveis;

validação server-side;

prevenção de acesso indevido;

tratamento seguro de uploads;

controle de sessão.

Nunca expor dados financeiros em buckets públicos.

Nunca armazenar:

senha bancária;

token bancário sem necessidade;

CVV;

senha de cartão.

31. ESTRUTURA MULTIEMPRESA

Preparar o banco de dados para suportar:

Empresa → Instituições → Contas/Cartões → Extratos/Faturas → Lançamentos

Mesmo que inicialmente exista apenas uma empresa.

Cada empresa deverá visualizar somente seus próprios dados.

32. INTERFACE

A aplicação deverá ser:

responsiva;

desktop-first para análises;

plenamente utilizável no celular;

visualmente limpa;

com boa hierarquia de informações;

sem excesso de elementos;

com tabelas legíveis;

filtros fáceis de utilizar.

Menu sugerido:

Dashboard

Instituições

Contas

Cartões

Importações

Lançamentos

Faturas

Conciliação

Custos Financeiros

Relatórios

Pendências

Configurações

33. EXPERIÊNCIA DE IMPORTAÇÃO

Criar fluxo simples:

Selecionar instituição

↓

Selecionar conta/cartão

↓

Enviar documento

↓

Sistema interpreta

↓

Prévia dos lançamentos

↓

Corrigir/classificar

↓

Verificar duplicidades

↓

Confirmar importação

↓

Conciliação

Nunca gravar silenciosamente uma importação sem permitir conferência.

34. CONFIABILIDADE DA EXTRAÇÃO

Quando a leitura automática não tiver segurança suficiente sobre um campo, sinalizar.

Exemplo:

Data identificada com baixa confiança.

Categoria sugerida — confirmar.

Valor precisa de conferência.

Não inventar informações ausentes no documento.

Quando determinado campo não puder ser identificado, marcar como:

Pendente de revisão.

35. PREPARAÇÃO PARA INTEGRAÇÕES FUTURAS

Preparar a arquitetura, mas não implementar nesta etapa sem autorização, para futuras integrações com:

Open Finance;

APIs bancárias;

APIs de cartões;

importação automática de extratos;

integração com ERP;

contas a pagar;

contas a receber;

contabilidade;

fluxo de caixa;

IA para análise financeira;

integração com WhatsApp/e-mail para alertas.

Não criar dependência dessas integrações na primeira versão.

36. INTELIGÊNCIA FINANCEIRA FUTURA

Preparar arquitetura para futuramente permitir recursos como:

detecção de cobranças incomuns;

identificação de aumento de juros;

identificação de taxas recorrentes;

previsão de faturas;

projeção de compromissos parcelados;

comparação de custos entre instituições;

identificação de possíveis economias;

análise histórica.

Esses recursos deverão ser explicáveis e auditáveis, nunca alterando dados ou tomando decisões financeiras automaticamente.

37. MODELO DE DADOS

Criar arquitetura de dados organizada, evitando concentração de informações em uma única tabela.

Avaliar entidades como:

companies;

users;

profiles;

roles;

permissions;

financial_institutions;

bank_accounts;

cards;

statements;

statement_imports;

transactions;

transaction_categories;

transaction_subcategories;

classification_rules;

card_invoices;

invoice_items;

payments;

reconciliations;

reconciliation_items;

financial_alerts;

attachments;

audit_log.

Os nomes definitivos poderão ser adequados ao padrão técnico adotado no projeto.

38. REQUISITO DE RASTREABILIDADE

Para todo lançamento importado, manter quando disponível:

arquivo de origem;

data da importação;

usuário responsável;

instituição;

conta/cartão;

linha original do documento;

dados interpretados;

eventuais correções realizadas.

Devemos conseguir responder:

De qual documento este lançamento veio?

39. EXCLUSÕES

Evitar exclusão física de informações financeiras relevantes.

Quando necessário, utilizar:

cancelamento;

inativação;

estorno lógico;

soft delete;

preservando auditoria e rastreabilidade.

40. FASEAMENTO DA IMPLEMENTAÇÃO

Não desenvolver todas as funcionalidades indiscriminadamente em uma única rodada.

Organizar o projeto em fases.

Fase 0 — Fundação e Segurança

arquitetura;

autenticação;

empresas;

usuários;

RBAC;

banco de dados;

RLS;

auditoria;

armazenamento privado.

Fase 1 — Cadastros

instituições;

contas;

cartões;

categorias;

subcategorias.

Fase 2 — Importação e Lançamentos

upload;

PDF;

Excel;

CSV;

OFX;

interpretação;

preview;

duplicidades;

classificação;

lançamentos.

Fase 3 — Cartões e Faturas

faturas;

vencimentos;

parcelas;

pagamentos;

limites.

Fase 4 — Conciliação

conciliação bancária;

conciliação de cartões;

divergências;

ajustes controlados.

Fase 5 — Gestão e Indicadores

dashboard;

despesas financeiras;

comparativos;

relatórios;

alertas;

pendências.

Fase 6 — Inteligência

Somente após homologação das fases anteriores:

sugestões de classificação;

detecção de anomalias;

tendências;

recomendações;

projeções.

41. REGRA DE DESENVOLVIMENTO

Nesta primeira solicitação:

analisar os requisitos;

propor a arquitetura;

criar a fundação;

implementar somente as fases expressamente autorizadas;

documentar o banco de dados;

documentar regras de segurança;

criar testes;

apresentar relatório técnico ao final de cada fase.

Não avançar automaticamente para a próxima fase.

Ao finalizar cada fase, informar:

funcionalidades implementadas;

migrations criadas;

tabelas criadas;

políticas RLS;

permissões;

telas;

testes executados;

testes aprovados;

pendências;

riscos;

dívida técnica;

sugestões para a próxima fase.

A próxima fase somente deverá ser iniciada após autorização expressa.

42. RESULTADO ESPERADO

O objetivo final é construir um sistema capaz de transformar extratos bancários e faturas dispersos em uma estrutura gerencial organizada:

DOCUMENTOS

↓

IMPORTAÇÃO

↓

LANÇAMENTOS

↓

CLASSIFICAÇÃO

↓

CONCILIAÇÃO

↓

CONTROLE DE VENCIMENTOS

↓

ANÁLISE DE TAXAS E JUROS

↓

VISÃO CONSOLIDADA

↓

INFORMAÇÃO PARA DECISÃO

Priorizar sempre:

segurança + confiabilidade dos dados + rastreabilidade + simplicidade de operação + clareza gerencial.

PROMPT COMPLEMENTAR — FUNDAÇÃO, SEGURANÇA E GOVERNANÇA DA IMPLEMENTAÇÃO

Este prompt é complementar ao prompt principal do App de Gestão de Extratos Bancários e Cartões e deve ser considerado parte integrante da especificação do projeto.

Nesta rodada, o objetivo não é implementar todo o sistema.

O objetivo é construir e validar corretamente a Fundação Arquitetural, Segurança, Modelo de Dados e Cadastros Básicos, antes de permitir qualquer importação de extratos, faturas ou documentos financeiros reais.

1. DIRETRIZ PRINCIPAL

Não iniciar nesta rodada:

leitura de PDF;

OCR;

importação de Excel;

importação de CSV;

importação de OFX;

importação de Word;

inteligência para classificação;

conciliação automática;

dashboards financeiros definitivos;

análises de juros e taxas;

integrações bancárias;

Open Finance;

APIs bancárias;

automações externas.

Primeiro deverá ser comprovado que a fundação do sistema está:

segura;

corretamente modelada;

isolada por empresa;

auditável;

preparada para evolução;

testada;

documentada.

2. ESCOPO AUTORIZADO NESTA RODADA

Está autorizada somente a execução das seguintes etapas:

FASE 0 — FUNDAÇÃO E SEGURANÇA

e, somente após sua conclusão técnica:

FASE 1 — CADASTROS E ESTRUTURA FINANCEIRA BÁSICA

Não avançar além da Fase 1 sem autorização expressa.

3. FASE 0 — FUNDAÇÃO E SEGURANÇA

Implementar a arquitetura-base do sistema.

3.1 Empresas

Criar estrutura multiempresa desde a origem.

Entidades esperadas:

empresas;

usuários;

perfis;

vínculos usuário × empresa;

papéis;

permissões;

atribuição de papéis.

Mesmo que inicialmente exista apenas uma empresa utilizando o sistema, o banco de dados deverá estar preparado para múltiplas empresas.

Nenhum dado financeiro poderá existir sem vínculo com uma empresa.

4. ISOLAMENTO MULTIEMPRESA

Implementar isolamento rigoroso dos dados.

Um usuário pertencente à:

Empresa A

não poderá visualizar, consultar, alterar ou inferir dados da:

Empresa B.

Esse isolamento deverá ocorrer no backend/banco de dados e não apenas na interface.

Aplicar RLS — Row Level Security — quando a tecnologia utilizada suportar.

Criar testes específicos tentando acessar registros pertencentes a outra empresa.

Esses testes deverão falhar.

5. AUTENTICAÇÃO

Implementar:

login;

logout;

sessão autenticada;

recuperação de senha;

tratamento de sessão expirada;

bloqueio de páginas protegidas.

Nenhuma página contendo dados financeiros poderá ser acessada anonimamente.

Não criar fallback de perfil permissivo.

Na ausência de papel ou permissão válida, utilizar o princípio:

negação por padrão.

6. RBAC — CONTROLE DE ACESSO

Criar arquitetura de permissões baseada em papéis.

Perfis iniciais:

Administrador

Acesso completo ao ambiente da própria empresa.

Financeiro

Pode:

cadastrar instituições;

cadastrar contas;

cadastrar cartões;

futuramente importar documentos;

classificar lançamentos;

conciliar;

gerar relatórios.

Consulta

Pode consultar informações autorizadas, sem alterar dados.

Auditor

Pode consultar:

lançamentos;

documentos;

conciliações;

histórico;

auditoria.

Não poderá alterar registros financeiros.

7. PERMISSÕES GRANULARES

Não construir o sistema dependendo exclusivamente de nomes fixos de perfis.

Preparar permissões por operação, como:

institution.view;

institution.create;

institution.update;

institution.inactivate;

account.view;

account.create;

account.update;

card.view;

card.create;

card.update;

transaction.view;

transaction.create;

transaction.update;

import.execute;

reconciliation.execute;

report.view;

audit.view;

entre outras necessárias.

O papel deverá receber conjuntos de permissões.

Isso permitirá criar novos perfis futuramente sem reescrever a arquitetura de segurança.

8. AUDITORIA DESDE A FUNDAÇÃO

Criar mecanismo de auditoria antes da inclusão dos dados financeiros.

Registrar eventos como:

login quando aplicável;

criação;

alteração;

inativação;

mudança de permissão;

mudança de papel;

cadastro de banco;

cadastro de conta;

cadastro de cartão;

futuras importações;

futuras conciliações.

Registrar, sempre que tecnicamente possível:

empresa;

usuário;

data;

horário;

ação;

entidade;

identificador do registro;

dados anteriores;

dados posteriores.

Logs de auditoria não deverão ser livremente editáveis pelo usuário.

9. ARMAZENAMENTO PRIVADO

Preparar storage privado para os futuros documentos bancários.

Não utilizar bucket público para:

extratos;

faturas;

planilhas;

PDFs;

comprovantes;

documentos financeiros.

Quando futuramente esses arquivos forem exibidos, utilizar mecanismos como:

autorização;

URL temporária;

URL assinada;

validação de permissão.

Um usuário não poderá acessar um arquivo apenas conhecendo sua URL.

10. INFORMAÇÕES SENSÍVEIS

Não armazenar:

senha bancária;

senha de cartão;

CVV;

PIN;

token desnecessário;

credenciais de internet banking.

Para cartões, preferencialmente armazenar:

bandeira;

instituição;

titular;

apelido;

últimos quatro dígitos;

fechamento;

vencimento;

limite.

Caso algum dado sensível adicional seja realmente necessário futuramente, deverá existir justificativa técnica antes da implementação.

11. FASE 1 — CADASTROS FINANCEIROS

Após a fundação estar funcional, implementar os cadastros básicos.

Criar:

Instituições Financeiras

Campos principais:

código bancário;

nome;

tipo;

status.

Tipos possíveis:

Banco;

Cooperativa;

Fintech;

Administradora de cartão;

Instituição de pagamento;

Outra.

12. CONTAS BANCÁRIAS

Criar estrutura própria para contas bancárias.

Campos:

instituição;

empresa;

agência;

conta;

dígito;

tipo;

titular;

CPF/CNPJ quando necessário;

apelido;

status.

Não misturar estruturalmente conta bancária e cartão em uma única entidade genérica caso isso comprometa a evolução futura.

13. CARTÕES

Criar estrutura específica para cartões.

Campos:

empresa;

instituição emissora;

administradora;

bandeira;

titular;

apelido;

tipo;

últimos quatro dígitos;

fechamento;

vencimento;

limite;

status.

Tipos:

Crédito;

Débito;

Crédito e Débito.

14. CATEGORIAS

Criar estrutura de categorias financeiras administrável.

Categorias iniciais obrigatórias:

Compra;

Taxa;

Juros.

Permitir criação futura de novas categorias sem necessidade de migration para cada categoria.

Preparar subcategorias.

Exemplos:

Taxa:

Manutenção;

Tarifa bancária;

Anuidade;

IOF.

Juros:

Rotativo;

Mora;

Financiamento;

Parcelamento.

15. NÃO TRATAR CATEGORIA COMO ENUM FIXO

Evitar limitar o banco definitivamente às opções:

Compra;

Taxa;

Juros.

Essas deverão ser apenas categorias iniciais.

O modelo deverá permitir que cada empresa, mediante permissão adequada, possa futuramente criar categorias adicionais.

16. SEPARAÇÃO DAS ENTIDADES

Preparar desde já a arquitetura para manter separadas as entidades:

Documento

Importação

Lançamento financeiro

Conciliação

Fatura

Pagamento

Esses conceitos não deverão ser tratados como se fossem o mesmo registro.

17. PRINCÍPIO FUNDAMENTAL DE RASTREABILIDADE

Quando futuramente um extrato for importado, a arquitetura deverá permitir responder:

Qual arquivo originou este lançamento?

Quando ele foi importado?

Quem importou?

Como ele aparecia originalmente?

Houve alguma alteração posterior?

Quem realizou a alteração?

Portanto, preparar as relações necessárias desde a modelagem inicial.

18. DADOS ORIGINAIS X DADOS INTERPRETADOS

Preparar o modelo de forma que seja possível manter separadamente:

Informação original

Dados exatamente como identificados no documento.

Informação interpretada

Dados transformados pelo sistema.

Informação corrigida

Dados eventualmente corrigidos pelo usuário.

Exemplo:

Descrição original:

PGTO CART 4587 POSTO XPTO

Descrição interpretada:

Posto XPTO

Categoria sugerida:

Compra

Categoria confirmada:

Combustível

Essa separação será importante para auditoria.

19. NÃO SOBRESCREVER A ORIGEM

Uma correção realizada pelo usuário futuramente não deverá eliminar o dado original importado.

O sistema poderá exibir uma versão amigável do lançamento, mas a origem deverá permanecer preservada.

20. PREPARAÇÃO PARA IDENTIFICAÇÃO DE DUPLICIDADE

Não implementar ainda toda a inteligência de duplicidade, mas preparar o banco para armazenar:

hash do arquivo;

identificador externo;

instituição;

conta/cartão;

data;

valor;

descrição;

origem;

lote de importação.

Isso permitirá desenvolver uma detecção robusta de duplicidades na Fase 2.

21. STATUS EM VEZ DE EXCLUSÃO FÍSICA

Para registros financeiros ou estruturais relevantes, evitar DELETE físico como comportamento normal.

Utilizar, conforme o caso:

ativo;

inativo;

cancelado;

arquivado;

soft delete.

Preservar auditoria.

Exclusões físicas deverão ser restritas a situações tecnicamente justificadas.

22. INTEGRIDADE REFERENCIAL

Implementar relacionamentos e restrições para impedir registros órfãos.

Exemplo:

um cartão não poderá estar vinculado a uma empresa inexistente.

Uma conta não poderá referenciar uma instituição inexistente.

Um lançamento futuro não poderá existir sem identificação adequada de empresa e origem.

23. IDENTIFICADORES

Utilizar identificadores internos robustos.

Evitar usar como chave primária:

número da conta;

agência;

número do cartão;

descrição;

código bancário.

Esses deverão ser atributos do registro, e não identificadores estruturais principais.

24. MIGRATIONS

Toda alteração estrutural do banco deverá ser registrada por migrations.

Não realizar mudanças manuais não documentadas diretamente no banco.

Ao final da fase, apresentar relação das migrations executadas.

25. AMBIENTES

Manter preparação para separação entre:

desenvolvimento;

homologação;

produção.

Não misturar dados reais de produção com dados de teste.

26. DADOS DE DEMONSTRAÇÃO

Se forem necessários registros fictícios para testar a interface, utilizar dados claramente identificados como demonstração.

Exemplo:

Banco Demonstração

Conta Teste

Cartão final 1234

Não utilizar dados bancários reais sem necessidade.

27. INTERFACE INICIAL

Nesta fase, criar somente as telas necessárias para validar a fundação:

Login;

Dashboard inicial;

Instituições;

Contas;

Cartões;

Categorias;

Usuários;

Perfis e permissões;

Auditoria;

Configurações.

O Dashboard ainda poderá conter apenas indicadores básicos dos cadastros.

Não criar análises financeiras fictícias como se fossem dados reais.

28. DASHBOARD INICIAL

Nesta etapa apresentar somente indicadores coerentes com os dados existentes.

Exemplo:

Instituições cadastradas;

Contas ativas;

Cartões ativos;

Usuários ativos;

Categorias cadastradas.

Não criar indicadores de:

juros;

taxas;

saldo;

conciliação;

faturas;

antes de existirem dados reais que sustentem essas métricas.

29. UX

Manter a interface:

objetiva;

profissional;

clara;

organizada;

responsiva;

sem excesso de cards;

com navegação previsível.

Utilizar tabelas para informações financeiras e administrativas que necessitem comparação.

30. TESTES OBRIGATÓRIOS — FASE 0

Executar testes envolvendo no mínimo:

Autenticação

usuário autenticado;

usuário não autenticado;

sessão inválida.

Multiempresa

usuário da Empresa A acessando Empresa A;

usuário da Empresa A tentando acessar Empresa B.

RBAC

administrador;

financeiro;

consulta;

auditor.

RLS

Tentar leitura e escrita indevida diretamente no backend.

Auditoria

Confirmar geração do histórico.

Storage

Confirmar que arquivo privado não pode ser acessado sem autorização.

31. TESTES OBRIGATÓRIOS — FASE 1

Testar:

criação de instituição;

edição;

inativação;

criação de conta;

edição;

inativação;

criação de cartão;

alteração;

inativação;

categorias;

subcategorias;

restrições de empresa;

permissões;

integridade referencial.

32. TESTES NEGATIVOS

Não executar apenas testes em que tudo funciona.

Testar deliberadamente situações que devem falhar.

Exemplos:

Usuário Consulta tentando cadastrar uma conta.

Deverá falhar.

Usuário Empresa A tentando abrir cartão da Empresa B.

Deverá falhar.

Usuário sem autenticação tentando acessar Instituições.

Deverá falhar.

Usuário comum tentando alterar auditoria.

Deverá falhar.

33. RELATÓRIO TÉCNICO OBRIGATÓRIO

Após concluir Fase 0 e Fase 1, interromper o desenvolvimento e apresentar:

RELATÓRIO TÉCNICO — FUNDAÇÃO DO APP DE GESTÃO DE EXTRATOS

Informar obrigatoriamente:

Arquitetura

tecnologias utilizadas;

estrutura geral;

organização do projeto.

Banco de Dados

Listar:

tabelas;

relacionamentos;

constraints;

índices;

migrations.

Segurança

Listar:

autenticação;

RLS;

RBAC;

storage;

políticas;

funções auxiliares.

Permissões

Apresentar matriz:

RecursoAdminFinanceiroConsultaAuditor

Auditoria

Informar quais ações estão sendo auditadas.

Testes

Apresentar:

quantidade total;

aprovados;

reprovados;

testes negativos;

evidências.

Riscos

Apresentar riscos ainda existentes.

Dívida Técnica

Relacionar todos os pontos conhecidos.

Pendências

Informar o que ainda precisa ser desenvolvido.

34. PROIBIÇÃO DE AVANÇO AUTOMÁTICO

Após entregar o relatório:

INTERROMPER O DESENVOLVIMENTO.

Não iniciar a Fase 2.

Não implementar importação de documentos.

Não implementar OCR.

Não implementar conciliação.

Não implementar inteligência artificial.

Não implementar dashboards financeiros avançados.

Aguardar homologação expressa.

35. CRITÉRIO PARA LIBERAÇÃO DA FASE 2

Somente consideraremos a Fundação homologável se houver evidência de:

autenticação funcionando;

isolamento multiempresa funcionando;

RLS validada;

RBAC validado;

auditoria funcionando;

storage privado;

cadastros funcionando;

integridade referencial;

migrations documentadas;

testes positivos;

testes negativos;

ausência de falhas críticas conhecidas.

36. PRÓXIMA FASE

A futura Fase 2 — Importação e Lançamentos deverá ser objeto de um novo prompt específico.

Nessa fase serão tratados, entre outros:

PDF;

XLS/XLSX;

CSV;

OFX;

DOC/DOCX quando justificável;

OCR;

parsing;

normalização;

prévia;

confiabilidade;

duplicidades;

importação;

classificação inicial.

Não antecipar essas implementações agora.

37. PRINCÍPIO DO PROJETO

A evolução do aplicativo deverá seguir:

FUNDAÇÃO

↓

SEGURANÇA

↓

CADASTROS

↓

IMPORTAÇÃO

↓

LANÇAMENTOS

↓

CONCILIAÇÃO

↓

FATURAS

↓

INDICADORES

↓

INTELIGÊNCIA

Nunca inverter essa sequência apenas para apresentar rapidamente funcionalidades visuais.

O projeto deve priorizar:

confiabilidade financeira + segurança + rastreabilidade + auditabilidade + simplicidade operacional.

Ao concluir esta solicitação, apresentar o relatório técnico e aguardar autorização expressa para qualquer nova fase.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://iga-gestao-extatos.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/fe02f12c-387e-424c-8d58-a696e8dd2bf0).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
