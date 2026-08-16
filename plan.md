# Planejamento — Suporte a WhatsApp Channels/Newsletters na Evolution API

## 1. Objetivo

Adicionar ao fork da Evolution API um endpoint específico para publicação de mensagens de texto em WhatsApp Channels/Newsletters, identificados por JIDs terminados em `@newsletter`, sem alterar o comportamento existente dos endpoints convencionais de mensagens para contatos (`@s.whatsapp.net`) e grupos (`@g.us`).

Endpoint planejado:

```http
POST /newsletter/sendText/:instance
```

A implementação deve reutilizar a sessão WhatsApp/Baileys já autenticada e mantida pela Evolution API para a instância informada, evitando criar uma segunda conexão independente com o WhatsApp.

## 2. Contexto e problema atual

A instalação atual utiliza Evolution API v2.3.7 no EasyPanel.

O envio convencional é realizado por:

```http
POST /message/sendText/:instance
```

Para contatos e grupos funciona normalmente. Para um Channel, usando um JID como:

```text
120363429376422315@newsletter
```

a API retorna HTTP 400:

```json
{
  "status": 400,
  "error": "Bad Request",
  "response": {
    "message": ["[object Object]"]
  }
}
```

O JID foi confirmado a partir de payloads `newsletterAdminInviteMessage`, que expõem `newsletterJid` e `newsletterName`. Portanto, não tratar o problema como ausência ou transformação incorreta do JID.

Também foi observado que mensagens privadas geram normalmente `MESSAGES_UPSERT` no webhook, enquanto publicações manuais em Channels não chegaram pelo mesmo webhook. Channels/Newsletters devem ser tratados como integração específica.

## 3. Princípio da implementação

Não modificar inicialmente o endpoint global `/message/sendText/:instance`.

Criar um módulo dedicado `/newsletter/*` que receba o JID completo e acesse diretamente a instância WhatsApp já carregada pela Evolution API.

Fluxo:

```text
Cliente / n8n
  ↓
POST /newsletter/sendText/:instance
  ↓
Autenticação por apikey
  ↓
Validação do payload
  ↓
Localização da instância
  ↓
Obtenção do socket Baileys existente
  ↓
socket.sendMessage(newsletterJid, { text })
  ↓
WhatsApp Channel
  ↓
Resposta normalizada
```

O objetivo é evitar apenas as validações convencionais incompatíveis com `@newsletter`, preservando autenticação, validação de instância e tratamento de erros.

## 4. Contrato do endpoint

### 4.1 Rota

```http
POST /newsletter/sendText/:instance
```

Exemplo para a instância `Canais CPG`:

```text
/newsletter/sendText/Canais%20CPG
```

### 4.2 Payload

```json
{
  "jid": "120363429376422315@newsletter",
  "text": "Teste de publicação no canal"
}
```

| Campo  | Tipo   | Obrigatório | Regra                          |
| ------ | ------ | ----------: | ------------------------------ |
| `jid`  | string |         Sim | Deve terminar em `@newsletter` |
| `text` | string |         Sim | Não pode ser vazio             |

Não converter automaticamente números em `@newsletter`. O cliente deve enviar o JID completo.

## 5. Autenticação

Usar o mesmo mecanismo de API Key das demais rotas protegidas da Evolution API:

```http
apikey: SUA_API_KEY
```

Reutilizar middleware, guards ou hooks existentes. Não criar um segundo sistema de autenticação.

## 6. DTO e validações

Criar DTO específico seguindo o padrão real do projeto:

```ts
export class SendNewsletterTextDto {
  jid: string;
  text: string;
}
```

Validações obrigatórias:

1. `jid` deve existir e ser string.
2. `jid` deve terminar exatamente em `@newsletter`.
3. `text` deve existir, ser string e não ficar vazio após `trim()`.
4. A instância da URL deve existir.
5. A instância deve estar conectada.
6. O socket Baileys deve estar disponível.
7. Não aceitar `@s.whatsapp.net` ou `@g.us` nessa rota.

## 7. Controller e serviço

Criar controller específico para newsletter, adaptando caminhos ao padrão encontrado no repositório. Estrutura conceitual:

```text
src/api/controllers/newsletter.controller.ts
src/api/routes/newsletter.router.ts
src/api/dto/newsletter.dto.ts
```

Responsabilidades:

- receber `instance`, `jid` e `text`;
- validar o payload;
- localizar a instância;
- verificar conexão;
- encaminhar para service/use-case responsável pelo Baileys;
- normalizar resposta e erros;
- nunca expor sessão, tokens ou chaves internas.

Evitar concentrar toda a lógica Baileys no controller se o projeto já possuir service/use-case adequado.

## 8. Localização do socket Baileys

A Evolution mantém instâncias internamente, conceitualmente semelhantes a `waMonitor.waInstances[instanceName]`. Não assumir que o socket esteja em `instance.client`.

Antes de implementar, localizar na versão efetivamente usada:

- definição e registro de `waInstances`;
- chamada a `makeWASocket`;
- propriedade que contém o socket ativo;
- métodos existentes que chegam a `sendMessage()`;
- verificação de conexão;
- tratamento de erros do Baileys;
- implementação atual de `/message/sendText/:instance`.

Comandos úteis:

```bash
grep -R "waInstances\[" src -n
grep -R "makeWASocket" src -n
grep -R "sendMessage(" src -n
```

A implementação deve reutilizar a infraestrutura existente e desviar somente das validações incompatíveis com newsletters.

## 9. Envio pelo Baileys

Depois de obter o socket correto, o envio deverá equivaler conceitualmente a:

```ts
const result = await socket.sendMessage(jid, { text });
```

Exemplo:

```ts
await socket.sendMessage("120363429376422315@newsletter", { text: "Teste de publicação no canal" });
```

Esse trecho é conceitual. Adaptar à API e aos tipos da versão do Baileys instalada no fork. Não criar uma nova sessão Baileys para newsletters.

## 10. Router

Registrar uma rota dedicada seguindo o padrão existente:

```ts
router.post("/newsletter/sendText/:instance", authenticationMiddleware, controller.sendText.bind(controller));
```

Usar os middlewares e a forma de registro reais do projeto. Registrar a rota no agregador principal da aplicação.

## 11. Respostas da API

### Sucesso

```json
{
  "status": "success",
  "jid": "120363429376422315@newsletter",
  "messageId": "..."
}
```

### JID inválido

HTTP 400:

```json
{
  "status": 400,
  "error": "Bad Request",
  "message": "Invalid newsletter JID"
}
```

### Texto ausente

HTTP 400 com `Text is required`.

### Instância inexistente

HTTP 404 com `Instance not found`.

### Instância desconectada

Usar status e formato já adotados pela Evolution.

### Erro Baileys

Nunca retornar `[object Object]`. Normalizar o erro para uma mensagem útil, sem incluir credenciais, tokens de sessão ou chaves criptográficas.

## 12. Teste via cURL

```bash
curl -i --request POST \
  --url 'https://evolutionapi.wocody.com.br/newsletter/sendText/Canais%20CPG' \
  --header 'Content-Type: application/json' \
  --header 'apikey: SUA_API_KEY' \
  --data '{
    "jid": "120363429376422315@newsletter",
    "text": "Teste de publicação pelo endpoint customizado"
  }'
```

Critérios de sucesso:

- HTTP 2xx;
- identificador da mensagem quando disponível;
- publicação efetiva no Channel;
- sessão existente permanece íntegra;
- endpoints convencionais continuam funcionando.

## 13. Integração com n8n

Após validar por cURL, usar node `HTTP Request` em vez da operação convencional `Mensagem > Enviar Texto` do node Evolution.

```text
Method: POST
URL: https://evolutionapi.wocody.com.br/newsletter/sendText/Canais%20CPG
```

Headers:

```text
Content-Type: application/json
apikey: <credencial>
```

Body:

```json
{
  "jid": "120363429376422315@newsletter",
  "text": "{{$json.message}}"
}
```

Manter API Key em credenciais protegidas do n8n quando possível.

## 14. Arquitetura de deploy

Não editar arquivos diretamente dentro do container em produção, pois alterações serão perdidas em redeploy, recriação ou atualização.

Arquitetura desejada:

```text
Evolution API upstream
  ↓
Fork próprio
  ↓
Customização Newsletter
  ↓
Build Docker
  ↓
Container Registry
  ↓
EasyPanel
```

Exemplo de imagem:

```text
ghcr.io/<organizacao>/evolution-api:2.3.7-newsletter
```

O EasyPanel executará essa imagem mantendo ambiente, PostgreSQL, Redis e volumes persistentes existentes.

## 15. Estratégia de fork

Criar fork baseado exatamente na versão compatível com produção. Não desenvolver diretamente sobre `main` se produção está em v2.3.7.

Branch sugerida:

```text
custom/2.3.7-newsletter
```

Manter commits de customização claramente separados dos updates do upstream.

## 16. Docker

Preferir o Dockerfile oficial do próprio projeto/fork. Não substituir por Dockerfile simplificado sem verificar:

- package manager;
- build multi-stage;
- Prisma Client/migrations;
- assets;
- entrypoint;
- permissões;
- healthcheck;
- versão Node;
- dependências nativas.

A imagem customizada deve alterar apenas o necessário.

## 17. Banco, Redis e volumes

A primeira versão não deve exigir novo banco, Redis ou mudança de schema.

Reutilizar PostgreSQL, Redis, variáveis, volumes e sessões existentes.

Antes de trocar a imagem no EasyPanel:

1. Fazer backup do banco.
2. Registrar a imagem atual.
3. Registrar variáveis de ambiente.
4. Conferir volumes persistentes.
5. Conferir Redis.
6. Conferir domínio/reverse proxy.
7. Definir rollback.

Não executar migrations adicionais sem necessidade explícita.

## 18. Rollback

Registrar a imagem oficial atualmente utilizada. Caso a customizada apresente problemas, restaurar a imagem anterior e realizar novo deploy.

A primeira versão não deve alterar schema do banco, tornando o rollback simples e seguro.

## 19. Segurança

Obrigatório:

- autenticação por API Key;
- nenhuma rota pública sem autenticação;
- validação explícita de `@newsletter`;
- validação de instância e conexão;
- sanitização de erros;
- não registrar API Key;
- não retornar sessão ou credenciais WhatsApp;
- preservar rate limits existentes, se aplicáveis;
- aceitar somente JIDs `@newsletter` nesse módulo.

## 20. Logging

Usar o logger existente da Evolution. Registrar quando apropriado:

- instância;
- operação `newsletter.sendText`;
- JID de destino;
- resultado/sucesso;
- message ID quando disponível;
- erro normalizado.

Nunca registrar API Keys, credenciais de sessão ou objetos criptográficos do Baileys.

## 21. Testes automatizados

Adicionar testes para:

- rejeitar JID ausente;
- rejeitar JID sem `@newsletter`;
- rejeitar `@s.whatsapp.net`;
- rejeitar `@g.us`;
- rejeitar texto vazio;
- retornar 404 para instância inexistente;
- tratar instância desconectada;
- encaminhar `jid` e `text` corretamente ao socket mockado;
- normalizar erro do Baileys;
- preservar autenticação por API Key;
- garantir que `/message/sendText/:instance` não seja alterado.

Evitar testes que dependam de publicação real no WhatsApp no pipeline padrão. O envio real deve ser teste de integração/manual controlado.

## 22. Teste manual em staging

Antes de produção:

1. Subir imagem customizada em staging.
2. Conectar uma instância WhatsApp de teste.
3. Confirmar envio privado convencional.
4. Confirmar envio para grupo convencional.
5. Testar `/newsletter/sendText/:instance` com Channel administrado pela conta.
6. Confirmar publicação no aplicativo do WhatsApp.
7. Testar JID inválido.
8. Testar Channel sem permissão administrativa, se possível.
9. Testar instância desconectada.
10. Verificar logs e ausência de segredos.
11. Reiniciar container e confirmar persistência da sessão.

## 23. Permissões do Channel

Ter o JID correto não garante autorização para publicar. A conta WhatsApp conectada à instância precisa possuir permissão suficiente no Channel.

Se o Baileys retornar erro de permissão, não mascarar como JID inválido. Preservar distinção entre:

- JID malformado;
- Channel inexistente/inacessível;
- falta de permissão;
- instância desconectada;
- falha de protocolo/Baileys.

## 24. Escopo inicial

### Incluído

- endpoint `POST /newsletter/sendText/:instance`;
- texto simples;
- JID explícito `@newsletter`;
- API Key existente;
- sessão Baileys existente;
- resposta e erros normalizados;
- integração por HTTP Request no n8n;
- testes e deploy via imagem própria.

### Fora do escopo inicial

- criação de Channels;
- descoberta automática de Channels;
- conversão de link `whatsapp.com/channel/...` em JID;
- upload de imagem/vídeo/documento;
- reactions;
- polls;
- edição/exclusão de publicações;
- listagem de seguidores;
- analytics;
- recebimento de eventos de Channel via webhook;
- alteração do endpoint global `sendText`.

Essas funcionalidades devem ser adicionadas somente depois que texto simples estiver comprovadamente estável.

## 25. Evolução futura do módulo

Após validar `sendText`, o módulo pode evoluir para:

```text
POST /newsletter/sendText/:instance
POST /newsletter/sendMedia/:instance
POST /newsletter/sendImage/:instance
POST /newsletter/sendVideo/:instance
GET  /newsletter/:instance
GET  /newsletter/:instance/:jid
```

Os endpoints futuros devem ser implementados apenas se houver suporte real na versão do Baileys utilizada e testes que comprovem o comportamento.

## 26. Compatibilidade com upstream

A customização deve ser pequena e isolada para facilitar futuras atualizações da Evolution.

Evitar:

- alterar métodos centrais de mensagens sem necessidade;
- modificar estruturas globais de instância;
- alterar schema do banco para o MVP;
- duplicar código de autenticação;
- fazer monkey patch do Baileys.

Preferir:

- módulo isolado;
- reutilização de services existentes;
- DTO próprio;
- router próprio;
- testes próprios;
- poucos pontos de integração com o core.

## 27. Critérios de aceite

A implementação estará concluída quando:

1. `POST /newsletter/sendText/:instance` estiver autenticado.
2. Aceitar somente `@newsletter`.
3. Reutilizar a sessão existente da Evolution.
4. Publicar texto em um Channel administrado pela conta conectada.
5. Retornar HTTP e JSON úteis.
6. Não retornar `[object Object]` em falhas.
7. Não alterar o comportamento de contatos e grupos.
8. Não exigir nova sessão WhatsApp.
9. Não exigir alteração de banco no MVP.
10. Funcionar após restart/redeploy.
11. Poder ser chamado pelo n8n via HTTP Request.
12. Permitir rollback para a imagem oficial.
13. Possuir testes automatizados para validações e fluxo principal.

## 28. Ordem recomendada de implementação

### Fase 1 — Investigação

- fixar código-base na v2.3.7;
- localizar `waInstances`;
- localizar socket Baileys;
- estudar fluxo atual de `sendText`;
- identificar middleware de autenticação;
- identificar padrões de DTO, controller, router e errors.

### Fase 2 — MVP

- criar DTO;
- criar service/use-case;
- criar controller;
- criar router;
- registrar rota;
- chamar socket existente;
- normalizar retorno e erros.

### Fase 3 — Testes

- testes unitários;
- testes de rota;
- build local;
- teste cURL;
- teste real em Channel controlado;
- regressão de contato e grupo.

### Fase 4 — Container

- build da imagem customizada;
- publicar no registry;
- subir em staging;
- validar sessão, Redis e banco;
- reiniciar e retestar.

### Fase 5 — Produção

- backup;
- registrar imagem atual;
- deploy da customizada;
- smoke tests;
- testar newsletter;
- testar envio privado;
- monitorar logs;
- manter rollback pronto.

## 29. Restrições para a IA que implementar

A IA deve:

- primeiro inspecionar o código real antes de criar abstrações;
- não assumir nomes de arquivos, propriedades ou classes;
- preservar os padrões arquiteturais existentes;
- não alterar banco sem necessidade;
- não criar uma segunda conexão Baileys;
- não remover validações do endpoint global;
- não adicionar `@newsletter` automaticamente a números;
- não expor segredos em logs/respostas;
- não considerar a tarefa concluída apenas porque o build passou;
- exigir teste real controlado no Channel;
- documentar todos os arquivos alterados;
- manter a mudança pequena e facilmente removível;
- atualizar este planejamento se a investigação do código revelar diferenças relevantes.

## 30. Resultado esperado

Ao final, uma automação externa deverá conseguir executar:

```http
POST /newsletter/sendText/Canais%20CPG
```

com:

```json
{
  "jid": "120363429376422315@newsletter",
  "text": "Conteúdo da publicação"
}
```

e a Evolution API deverá utilizar a sessão WhatsApp já conectada da instância `Canais CPG` para publicar o texto diretamente no Channel correspondente, sem passar pela validação convencional de destinatários de `/message/sendText`, sem criar uma segunda sessão e sem comprometer o funcionamento existente da plataforma.

## 31. Resultado da investigação e execução local

Código-base fixado na tag upstream `2.3.7` (commit anotado
`cd800f2976e1e5b682fbf86a01ee4d85ae61f370`) e desenvolvido na branch
`custom/2.3.7-newsletter`.

Diferenças concretas encontradas em relação aos nomes conceituais deste plano:

- as rotas usam o parâmetro interno `:instanceName` por meio de
  `RouterBroker.routerPath()`;
- `WAMonitoringService.waInstances[instanceName]` contém o próprio channel
  service da instância;
- o socket Baileys ativo fica na propriedade pública `client`, herdada de
  `ChannelStartupService` e inicializada por `makeWASocket()`;
- o estado de conexão é exposto por `connectionStatus.state`;
- os erros HTTP globais seguem o envelope existente
  `{ status, error, response: { message } }`;
- o status de criação usado pelos endpoints de envio é HTTP 201.

O módulo implementado usa esses pontos reais, valida integração
`WHATSAPP-BAILEYS`, estado `open` e disponibilidade de `client.sendMessage`, e
executa diretamente `client.sendMessage(jid, { text })`. O endpoint global de
mensagens não foi alterado.

Validações concluídas localmente:

- 16 testes automatizados aprovados;
- ESLint aprovado;
- TypeScript e bundle de produção aprovados;
- imagem Docker oficial construída como `evolution-api:2.3.7-newsletter`.

Pendente por depender de infraestrutura e credenciais externas: iniciar uma
instância de staging com PostgreSQL/Redis, autenticar uma conta administradora
de um Channel controlado, realizar a publicação real e os smoke tests de contato
e grupo. Nenhuma imagem foi publicada e nenhum ambiente EasyPanel foi alterado.
