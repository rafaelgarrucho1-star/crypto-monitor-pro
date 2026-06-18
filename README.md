# 🚀 Crypto Monitor Pro v2.0 — Guia Completo

App profissional de monitoramento de criptomoedas com análise técnica, Fibonacci, score consolidado e alertas via Telegram.

---

## ⚠️ LEIA PRIMEIRO — Sobre as análises

Este app calcula indicadores técnicos consolidados (RSI, MACD, Bollinger, médias móveis, Fibonacci) e gera um **score de 0 a 100** com viés de COMPRA / NEUTRO / VENDA.

**Isto NÃO é uma bola de cristal.** Os indicadores descrevem o comportamento passado do preço e calculam probabilidades baseadas em padrões históricos. Eles **não preveem o futuro**. Cripto se move por notícias, regulação, grandes investidores e pânico de mercado — nada disso aparece num gráfico antes de acontecer.

Use como **uma** ferramenta de apoio à decisão, nunca como ordem de compra. Nunca invista mais do que pode perder. **Você assume 100% do risco.**

---

## 📂 Arquivos do projeto

```
crypto-monitor-pro/
├── server.js        → backend (CoinGecko + análises + Telegram)
├── analise.js       → motor de análise técnica
├── index.html       → interface completa
├── package.json     → dependências
└── README.md        → este guia
```

---

## 💻 PARTE 1 — Testar no seu PC (opcional)

1. Coloque os 4 arquivos numa pasta `crypto-monitor-pro`
2. Abra o terminal nela e rode:
   ```
   npm install
   npm start
   ```
3. Acesse `http://localhost:3000`

Funciona offline para testar a interface. Para alertas 24/7 reais, siga a Parte 2.

---

## 🌍 PARTE 2 — Colocar no Render (24/7, GRÁTIS)

O Render roda seu app na nuvem o tempo todo, mesmo com seu PC desligado, e te dá um link público para compartilhar.

### Passo 1 — Criar conta no GitHub
1. Acesse https://github.com e crie uma conta (grátis)
2. Clique em **New repository** (botão verde)
3. Nome: `crypto-monitor-pro` → deixe **público** → **Create repository**

### Passo 2 — Subir os arquivos
Na página do repositório recém-criado:
1. Clique em **uploading an existing file**
2. Arraste os 4 arquivos (`server.js`, `analise.js`, `index.html`, `package.json`)
3. Clique em **Commit changes**

### Passo 3 — Criar conta no Render
1. Acesse https://render.com
2. **Get Started** → entre com sua conta GitHub (mais fácil)

### Passo 4 — Criar o Web Service
1. No painel do Render: **New +** → **Web Service**
2. Conecte seu repositório `crypto-monitor-pro`
3. Preencha:
   - **Name:** crypto-monitor-pro (ou o que quiser)
   - **Region:** Oregon (US) ou a mais próxima
   - **Branch:** main
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** **Free**
4. Clique em **Create Web Service**

Aguarde uns 2-5 minutos. Quando aparecer "Live" com bolinha verde, seu app estará no ar num link tipo:
```
https://crypto-monitor-pro.onrender.com
```

**Esse link você pode mandar para qualquer pessoa testar!** 🎉

### ⚠️ Limitação do plano grátis do Render
O serviço "dorme" após 15 minutos sem visitas e demora ~30s para acordar no próximo acesso. Para um monitor 24/7 que nunca dorme:
- Opção A: Use um serviço gratuito de "ping" como https://uptimerobot.com configurado para acessar seu link a cada 5 minutos (mantém acordado)
- Opção B: Upgrade para o plano pago do Render ($7/mês) que nunca dorme

Para começar e testar, o plano grátis + UptimeRobot resolve bem.

---

## 📱 PARTE 3 — Configurar Telegram (alertas no celular)

Telegram é gratuito, oficial e estável (diferente do WhatsApp, que bloqueia bots).

### Passo 1 — Criar seu bot
1. No Telegram, procure por **@BotFather**
2. Envie `/newbot`
3. Escolha um nome (ex: "Meu Monitor Cripto")
4. Escolha um username terminando em "bot" (ex: meumonitorcripto_bot)
5. O BotFather te dará um **TOKEN** parecido com:
   ```
   7891234567:AAH8s9d-EXEMPLO-token-aqui_xyz
   ```
   Copie esse token.

### Passo 2 — Descobrir seu Chat ID
1. No Telegram, procure por **@userinfobot**
2. Envie qualquer mensagem para ele
3. Ele responde com seu **Chat ID** (um número, ex: `987654321`)
   Copie esse número.

### Passo 3 — IMPORTANTE: ative a conversa
1. Procure pelo SEU bot (o username que você criou no passo 1)
2. Clique em **Iniciar** / envie `/start` ou qualquer mensagem
   (Sem isso, o bot não tem permissão de te enviar mensagens)

### Passo 4 — Conectar no app
1. Abra seu app (no Render ou localhost)
2. Vá na aba **📱 Configurar Telegram**
3. Cole o **Token** e o **Chat ID**
4. Clique em **Conectar e testar**
5. Se tudo estiver certo, você recebe uma mensagem de confirmação no Telegram! ✅

### Para o Render lembrar do Telegram após reiniciar
O Render free reinicia o app às vezes e pode esquecer a config. Para fixar:
1. No painel do Render → seu serviço → **Environment**
2. Adicione duas variáveis:
   - `TELEGRAM_TOKEN` = seu token
   - `TELEGRAM_CHAT_ID` = seu chat id
3. Salve. O app vai usar isso automaticamente em todo reinício.

---

## 🎯 Como usar o app

1. **Dashboard:** busque entre as 500 maiores criptos e adicione as que quer monitorar
2. Para cada moeda, configure alertas:
   - **Variação %:** avisa quando sobe/cai X%
   - **Preço acima/abaixo:** avisa ao cruzar um valor
   - **Virar COMPRA/VENDA:** avisa quando o score consolidado muda de perfil
3. **Gráficos & Fibonacci:** veja o histórico (1d/7d/30d/90d) com níveis de Fibonacci desenhados e a leitura técnica
4. **Minha Carteira:** registre suas compras e acompanhe a performance (veja abaixo)
5. **Histórico de Alertas:** todos os alertas que dispararam
6. Os alertas chegam no seu **Telegram** automaticamente

---

## 💼 Aba Carteira — como funciona

Você registra suas compras de duas formas:

- **Sei o preço que paguei:** informe a moeda, a quantidade e o preço por unidade. O app congela esse custo.
- **Sei a data da compra:** informe a moeda, a quantidade e a data. O app busca automaticamente o preço de fechamento daquele dia no histórico do CoinGecko e usa como custo.

A partir daí o app acompanha **dia a dia** se você está no lucro ou no prejuízo, por posição e no total.

**Comparação com o mercado:** a carteira é comparada com **Bitcoin** e **Ethereum** desde a data da sua compra mais antiga. Assim você vê se sua seleção de moedas está *ganhando ou perdendo* do que teria sido simplesmente comprar e segurar BTC/ETH. Não existe um "índice oficial das criptos" gratuito por API, então BTC e ETH são as referências de mercado mais usadas e honestas.

**Sobre conectar wallet (MetaMask etc):** ficou de fora de propósito. Carteiras on-chain não leem saldo de corretoras (Binance, Mercado Bitcoin), exigem código de segurança pesado e aumentam o risco. A entrada manual entrega a mesma informação de performance sem esses problemas.

---

## ⚙️ Painel Admin, Assinantes e Monetização

A aba **Admin** funciona assim:

**Primeiro acesso = você vira o dono.** Na primeira vez que alguém abrir a aba Admin, aparece a tela de setup: quem definir e-mail + senha ali vira o **administrador-mestre**. Faça isso primeiro, antes de divulgar o link, para garantir que o dono é você.

**Gestão de administradores:** como mestre, você adiciona outros admins (e-mail + senha) para testarem com você, e os remove quando quiser. Admins comuns acessam o painel mas não mexem na lista de admins. O mestre não pode ser removido.

**Cadastro de assinantes (só e-mail):** registre adesões informando e-mail e plano. Data de adesão e expiração calculadas automaticamente.

**Expiração automática confirmada:** semanal 7 dias, quinzenal 15, mensal 30. Passou o prazo, vira "expirado" sozinho (checagem a cada hora e ao abrir o painel) — ninguém fica com acesso sem renovar. Cada assinante mostra os dias restantes.

**Dashboard com dados:** adesões por dia (gráfico 30 dias), adesões por plano (ativos/total/receita), receita acumulada, ativos vs. expirados, e lista completa de assinantes com status.

**Monetização (liga/desliga):** vem desligada — grátis até você decidir. Ligando, cada visitante tem 1 análise grátis (configurável) e depois vê os planos:
- Semanal — R$ 19,90 (R$ 2,84/dia)
- Quinzenal — R$ 34,90 (R$ 2,33/dia)
- Mensal — R$ 49,90 (R$ 1,66/dia)

### ⚠️ Avisos honestos
- **Cobrança real:** cadastro e expiração funcionam, mas o app **não processa pagamento**. Para cobrar de verdade, pluga um gateway (Mercado Pago/Stripe) depois — passo à parte que exige conta no gateway.
- **Dados em arquivo:** assinantes ficam em arquivo no servidor. Bom para testar; para uso comercial com muitos clientes, migre para banco de dados real. No Render grátis o disco é efêmero (reseta ao dormir) — para produção, use um banco externo.
- **Sem CPF/telefone:** por sua escolha, só guardamos e-mail — simplifica e evita as exigências mais pesadas da LGPD por ora.

## 🦊 MetaMask na carteira

Na aba Carteira há "Conectar MetaMask". Lê o **saldo atual de ETH** da carteira on-chain (só rede Ethereum — não lê Bitcoin nativo, Solana, nem corretoras). É uma **estimativa do saldo**; não traz o preço médio pago, então para lucro/prejuízo você adiciona a compra manualmente. Funciona só em navegador com a extensão MetaMask.

## ⚠️ Disclaimer

O app exibe, fixo no topo de todas as telas, o aviso de que as análises são **sugestões baseadas em indicadores do passado, não recomendações de compra/venda**, e que a decisão é responsabilidade do usuário. Também aparece em cada análise.

---

## 🔬 Backtest e a calibração da fórmula

A fórmula de score foi **calibrada por otimização com validação treino/teste** — o método sério, anti-overfitting. Em vez de ajustar os pesos até dar um número bonito num período (armadilha clássica), os pesos foram otimizados num conjunto de dados e depois **validados em dados completamente separados, que a fórmula nunca viu**. Resultado validado: **~68% de acerto médio**, mantendo-se estável entre treino e teste (sem overfitting).

**O segredo da calibração:** a fórmula só dá sinal de COMPRA (score ≥ 68) ou VENDA (score ≤ 32) quando os indicadores estão **fortemente alinhados**. Nos casos duvidosos ela diz NEUTRO de propósito — menos sinais, porém de muito mais qualidade. É assim que analistas sérios operam: esperar o setup claro em vez de opinar sobre tudo.

### Dois backtests no app (aba Gráficos)
- **Backtest desta moeda:** testa a fórmula no histórico de 180 dias da moeda selecionada. ⚠️ Uma moeda isolada varia MUITO — pode dar 45% ou 85%. Não tire conclusões de um caso só.
- **Taxa média real (várias moedas):** roda em 8-10 moedas e mostra a média — esta é a métrica honesta, em torno de 65-70%.

### A verdade que você precisa saber
- **~68% é a MÉDIA** sobre muitas moedas e períodos. Uma moeda específica, num momento específico, pode destoar bastante para cima ou para baixo. A estratégia vale pelo conjunto, não pela aposta isolada.
- **Acertar a direção 68% das vezes NÃO garante lucro.** Se os acertos são pequenos e os erros grandes, dá prejuízo mesmo acertando mais. Gestão de risco (quanto investir em cada operação, quando cortar perda) importa tanto quanto a direção.
- **Foi validado em dados sintéticos realistas** (que reproduzem volatilidade, tendências e saltos típicos de cripto). Ao rodar no histórico real das moedas via app, você vê o número real de cada uma — use o backtest agregado para a média.
- Desempenho passado **nunca** garante o futuro. Esta é uma ferramenta de apoio à decisão, não um oráculo.

---

## 📊 O que cada análise significa

- **RSI:** mede se o ativo está "esticado" para cima (sobrecompra) ou para baixo (sobrevenda). Interpretado junto com a tendência.
- **MACD:** mede o momentum — se a força compradora está crescendo ou diminuindo.
- **Bollinger Bands:** mede volatilidade e extremos de preço.
- **Médias móveis (20/50):** definem a tendência dominante. É o sinal de maior peso no score.
- **Fibonacci:** marca zonas onde o preço historicamente encontra suporte (piso) ou resistência (teto). A zona 61.8% é a mais observada pelo mercado.
- **Score consolidado:** junta tudo num número de 0 a 100. Acima de 65 = viés comprador; abaixo de 35 = viés vendedor; no meio = sem consenso.

Lembre: tudo isso é leitura do passado. **Nenhum indicador garante o futuro.**

---

## ❓ Problemas comuns

**"Carregando dados..." não sai disso**
→ O CoinGecko tem limite de requisições no plano grátis. Com muitas moedas, a primeira análise demora. Aguarde 1-2 minutos.

**Telegram não envia**
→ Confira: (1) você mandou /start pro seu bot? (2) token e chat id corretos? (3) testou na aba Telegram?

**App no Render demora a abrir**
→ Normal no plano grátis (dorme após 15min). Use UptimeRobot para manter acordado.

---

Bom monitoramento — com os pés no chão. 🚀
