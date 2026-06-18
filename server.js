// ============================================================
// server.js - Crypto Monitor Pro v2.0
// Backend completo: CoinGecko + análise técnica + Telegram + monitoramento 24/7
// ============================================================

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const analise = require('./analise');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ============================================================
// CONFIGURAÇÃO PERSISTENTE
// Em servidores grátis (Render free) o disco é efêmero — reinicia ao
// dormir. Por isso lemos config do env var quando existir, e mantemos
// também em arquivo para uso local.
// ============================================================
const CONFIG_PATH = path.join(__dirname, 'config.json');

function carregarConfig() {
  let cfg;
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('Erro ao ler config:', e.message);
  }
  
  if (!cfg) {
    cfg = {
      moedas: [],
      carteira: [],
      intervaloMs: 60000,
      telegram: {
        token: process.env.TELEGRAM_TOKEN || '',
        chatId: process.env.TELEGRAM_CHAT_ID || '',
      },
      admin: {
        configurado: false,
        adminMestre: '',
        admins: [],
        monetizacaoAtiva: false,
        analisesGratis: 1,
        planos: [
          { id: 'semanal', nome: 'Semanal', preco: 19.90, dias: 7 },
          { id: 'quinzenal', nome: 'Quinzenal', preco: 34.90, dias: 15 },
          { id: 'mensal', nome: 'Mensal', preco: 49.90, dias: 30 },
        ],
      },
      assinantes: [],
    };
  }
  
  // FORÇA MONETIZAÇÃO DESLIGADA SEMPRE
  // Mesmo que o config antigo tenha true, ignora e coloca false
  if (cfg.admin) {
    cfg.admin.monetizacaoAtiva = false;
  }
  
  return cfg;
}

// Contagem simples de uso por sessão (em memória). Em produção real,
// isto seria por usuário autenticado num banco de dados.
let contadorAnalises = {}; // { sessaoId: numero }

function salvarConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  } catch (e) {
    console.error('Erro ao salvar config (normal em servidor efêmero):', e.message);
  }
  config = cfg;
}

let config = carregarConfig();
// Estado em memória
let precosAtuais = {};   // { id: { preco, variacao24h, marketCap, volume } }
let analiseCache = {};   // { id: { ...scoreConsolidado, timestamp } }
let historicoAlertas = [];
let ultimoEstadoAlerta = {}; // controle p/ não repetir alerta

// ============================================================
// COINGECKO - API gratuita, sem chave necessária
// ============================================================
const CG = 'https://api.coingecko.com/api/v3';

// Cache da lista de moedas (atualiza 1x por dia)
let listaMoedas = [];
let listaMoedasTimestamp = 0;

async function buscarListaMoedas() {
  const agora = Date.now();
  // cache por 24 horas
  if (listaMoedas.length > 0 && agora - listaMoedasTimestamp < 86400000) {
    return listaMoedas;
  }
  try {
    // Top 250 moedas — uma página só para reduzir requisições
    const todas = [];
    const r = await axios.get(`${CG}/coins/markets`, {
      params: {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: 250,
        page: 1,
        sparkline: false,
      },
      timeout: 15000,
    });
    r.data.forEach((c) => {
      todas.push({
        id: c.id,
        nome: c.name,
        simbolo: c.symbol.toUpperCase(),
        imagem: c.image,
        rank: c.market_cap_rank,
      });
    });
    listaMoedas = todas;
    listaMoedasTimestamp = agora;
    console.log(`✅ Lista de ${todas.length} moedas carregada (top 250)`);
  } catch (e) {
    console.error('Erro ao buscar lista de moedas:', e.message);
  }
  return listaMoedas;
}

async function buscarPrecos(ids) {
  if (!ids.length) return {};
  try {
    // limita a 50 IDs por requisição para não exceder URL length
    const chunks = [];
    for (let i = 0; i < ids.length; i += 50) {
      chunks.push(ids.slice(i, i + 50));
    }
    let resultado = {};
    for (const chunk of chunks) {
      const r = await axios.get(`${CG}/simple/price`, {
        params: {
          ids: chunk.join(','),
          vs_currencies: 'usd',
          include_market_cap: true,
          include_24hr_vol: true,
          include_24hr_change: true,
        },
        timeout: 15000,
      });
      resultado = { ...resultado, ...r.data };
      // delay entre chunks para respeitar rate limit
      if (chunks.indexOf(chunk) < chunks.length - 1) {
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
    return resultado;
  } catch (e) {
    console.error('Erro ao buscar preços:', e.message);
    return {};
  }
}

async function buscarHistorico(id, dias = 7) {
  try {
    const r = await axios.get(`${CG}/coins/${id}/market_chart`, {
      params: { vs_currency: 'usd', days: dias },
      timeout: 15000,
    });
    // retorna [[timestamp, preco], ...]
    return r.data.prices.map((p) => ({ t: p[0], preco: p[1] }));
  } catch (e) {
    console.error(`Erro histórico ${id}:`, e.message);
    return [];
  }
}

// Busca o preço de uma moeda numa data específica (formato dd-mm-yyyy)
async function buscarPrecoNaData(id, dataISO) {
  try {
    const d = new Date(dataISO);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const r = await axios.get(`${CG}/coins/${id}/history`, {
      params: { date: `${dd}-${mm}-${yyyy}`, localization: false },
      timeout: 15000,
    });
    return r.data?.market_data?.current_price?.usd ?? null;
  } catch (e) {
    console.error(`Erro preço na data ${id}:`, e.message);
    return null;
  }
}

// Variação percentual de uma moeda entre uma data e hoje
async function variacaoDesdeData(id, dataISO) {
  const precoCompra = await buscarPrecoNaData(id, dataISO);
  const atual = precosAtuais[id]?.preco || (await buscarPrecos([id]))[id]?.usd;
  if (!precoCompra || !atual) return null;
  return ((atual - precoCompra) / precoCompra) * 100;
}

// ============================================================
// TELEGRAM
// ============================================================
async function enviarTelegram(mensagem) {
  const { token, chatId } = config.telegram;
  if (!token || !chatId) return false;
  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: mensagem,
      parse_mode: 'HTML',
    }, { timeout: 10000 });
    return true;
  } catch (e) {
    console.error('Erro Telegram:', e.response?.data?.description || e.message);
    return false;
  }
}

function registrarAlerta(moeda, tipo, mensagem, dados) {
  const alerta = {
    id: Date.now() + Math.random(),
    timestamp: new Date().toISOString(),
    moeda, tipo, mensagem, dados,
  };
  historicoAlertas.unshift(alerta);
  if (historicoAlertas.length > 500) historicoAlertas.pop();
  return alerta;
}

// ============================================================
// LOOP DE MONITORAMENTO
// ============================================================
async function cicloMonitoramento() {
  if (!config.moedas.length) return;
  const ids = config.moedas.map((m) => m.id);
  const precos = await buscarPrecos(ids);

  for (const moeda of config.moedas) {
    const dados = precos[moeda.id];
    if (!dados) continue;

    const precoAnterior = precosAtuais[moeda.id]?.preco;
    precosAtuais[moeda.id] = {
      preco: dados.usd,
      variacao24h: dados.usd_24h_change,
      marketCap: dados.usd_market_cap,
      volume: dados.usd_24h_vol,
    };

    // Atualiza análise técnica (busca histórico 30d p/ ter dados suficientes)
    try {
      const hist = await buscarHistorico(moeda.id, 30);
      if (hist.length >= 50) {
        const precosArr = hist.map((h) => h.preco);
        const resultado = analise.scoreConsolidado(precosArr);
        analiseCache[moeda.id] = { ...resultado, timestamp: Date.now() };

        // Verifica gatilhos de alerta
        verificarAlertas(moeda, dados, precoAnterior, resultado);
      }
      await new Promise((r) => setTimeout(r, 2000)); // rate limit
    } catch (e) {
      console.error(`Erro análise ${moeda.id}:`, e.message);
    }
  }
}

function verificarAlertas(moeda, dados, precoAnterior, analiseResult) {
  const alertas = moeda.alertas || [];
  const preco = dados.usd;

  for (const alerta of alertas) {
    if (!alerta.ativo) continue;
    const chave = `${moeda.id}_${alerta.tipo}_${alerta.valor || alerta.condicao}`;
    let disparou = false;
    let msg = '';

    if (alerta.tipo === 'variacao' && precoAnterior) {
      const variacao = ((preco - precoAnterior) / precoAnterior) * 100;
      if (Math.abs(variacao) >= alerta.valor) {
        disparou = true;
        const dir = variacao > 0 ? '📈 SUBIU' : '📉 CAIU';
        msg = `${dir} ${Math.abs(variacao).toFixed(2)}%`;
      }
    } else if (alerta.tipo === 'preco_acima' && preco >= alerta.valor) {
      if (ultimoEstadoAlerta[chave] !== 'acima') {
        disparou = true;
        msg = `✅ Preço passou de $${alerta.valor}`;
        ultimoEstadoAlerta[chave] = 'acima';
      }
    } else if (alerta.tipo === 'preco_abaixo' && preco <= alerta.valor) {
      if (ultimoEstadoAlerta[chave] !== 'abaixo') {
        disparou = true;
        msg = `⚠️ Preço caiu abaixo de $${alerta.valor}`;
        ultimoEstadoAlerta[chave] = 'abaixo';
      }
    } else if (alerta.tipo === 'score_compra' && analiseResult.perfil === 'COMPRA') {
      if (ultimoEstadoAlerta[chave] !== 'compra') {
        disparou = true;
        msg = `🎯 Sinais mudaram para perfil COMPRA (score ${analiseResult.score})`;
        ultimoEstadoAlerta[chave] = 'compra';
      }
    } else if (alerta.tipo === 'score_venda' && analiseResult.perfil === 'VENDA') {
      if (ultimoEstadoAlerta[chave] !== 'venda') {
        disparou = true;
        msg = `🎯 Sinais mudaram para perfil VENDA (score ${analiseResult.score})`;
        ultimoEstadoAlerta[chave] = 'venda';
      }
    }

    if (disparou) {
      const fib = analiseResult.indicadores.fibonacci;
      const textoCompleto =
        `<b>🔔 ${moeda.nome} (${moeda.simbolo})</b>\n\n` +
        `${msg}\n\n` +
        `💰 Preço: $${preco.toLocaleString('en-US', { maximumFractionDigits: 6 })}\n` +
        `📊 Variação 24h: ${dados.usd_24h_change?.toFixed(2)}%\n\n` +
        `<b>Análise técnica:</b>\n` +
        `• RSI: ${analiseResult.indicadores.rsi?.toFixed(1) ?? 'N/A'}\n` +
        `• Tendência: ${analiseResult.indicadores.tendencia}\n` +
        `• Score: ${analiseResult.score}/100 — <b>${analiseResult.perfil}</b>\n` +
        (fib ? `• Fibonacci: ${fib.zona || 'N/A'}\n` : '') +
        `\n⚠️ <i>Análise baseada em indicadores históricos. Não é garantia de movimento futuro. Você assume o risco.</i>`;

      registrarAlerta(moeda.nome, alerta.tipo, msg, {
        preco, score: analiseResult.score, perfil: analiseResult.perfil,
      });
      enviarTelegram(textoCompleto);
      console.log(`🔔 ALERTA: ${moeda.nome} — ${msg}`);
    }
  }
}

// ============================================================
// ROTAS DA API
// ============================================================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/api/moedas-disponiveis', async (req, res) => {
  const lista = await buscarListaMoedas();
  res.json(lista);
});

app.get('/api/config', (req, res) => {
  // não devolve o token completo por segurança
  const safe = JSON.parse(JSON.stringify(config));
  if (safe.telegram?.token) safe.telegram.tokenConfigurado = true;
  if (safe.telegram) delete safe.telegram.token;
  res.json(safe);
});

app.post('/api/moedas', (req, res) => {
  const { id, nome, simbolo, imagem } = req.body;
  if (config.moedas.find((m) => m.id === id)) {
    return res.status(400).json({ erro: 'Moeda já monitorada' });
  }
  config.moedas.push({ id, nome, simbolo, imagem, alertas: [] });
  salvarConfig(config);
  res.json({ ok: true, moedas: config.moedas });
  // dispara análise imediata
  cicloMonitoramento().catch(() => {});
});

app.delete('/api/moedas/:id', (req, res) => {
  config.moedas = config.moedas.filter((m) => m.id !== req.params.id);
  delete precosAtuais[req.params.id];
  delete analiseCache[req.params.id];
  salvarConfig(config);
  res.json({ ok: true, moedas: config.moedas });
});

app.post('/api/moedas/:id/alertas', (req, res) => {
  const moeda = config.moedas.find((m) => m.id === req.params.id);
  if (!moeda) return res.status(404).json({ erro: 'Moeda não encontrada' });
  const alerta = { id: Date.now(), ativo: true, ...req.body };
  moeda.alertas = moeda.alertas || [];
  moeda.alertas.push(alerta);
  salvarConfig(config);
  res.json({ ok: true, alertas: moeda.alertas });
});

app.delete('/api/moedas/:id/alertas/:alertaId', (req, res) => {
  const moeda = config.moedas.find((m) => m.id === req.params.id);
  if (moeda) {
    moeda.alertas = (moeda.alertas || []).filter((a) => a.id != req.params.alertaId);
    salvarConfig(config);
  }
  res.json({ ok: true });
});

app.get('/api/dados/:id', (req, res) => {
  res.json({
    preco: precosAtuais[req.params.id] || null,
    analise: analiseCache[req.params.id] || null,
  });
});

app.get('/api/historico-grafico/:id', async (req, res) => {
  const dias = parseInt(req.query.dias) || 7;
  const hist = await buscarHistorico(req.params.id, dias);
  let analiseResult = null;
  if (hist.length >= 50) {
    analiseResult = analise.scoreConsolidado(hist.map((h) => h.preco));
  }
  res.json({ historico: hist, analise: analiseResult });
});

// BACKTEST — mede aderência da fórmula olhando para o passado
app.get('/api/backtest/:id', async (req, res) => {
  const dias = parseInt(req.query.dias) || 180; // padrão 6 meses
  const horizonte = parseInt(req.query.horizonte) || 7; // confere 7 dias à frente
  const hist = await buscarHistorico(req.params.id, dias);
  if (hist.length < 60) {
    return res.json({ erro: 'Histórico insuficiente. Tente um período maior.' });
  }
  const resultado = analise.backtest(hist.map((h) => h.preco), horizonte);
  res.json(resultado);
});

// BACKTEST AGREGADO — roda em várias moedas e mostra a taxa MÉDIA real
// É a métrica honesta: a estratégia vale pela média, não por um ativo isolado.
app.get('/api/backtest-agregado', async (req, res) => {
  const horizonte = parseInt(req.query.horizonte) || 7;
  // usa as moedas monitoradas; se não houver, usa um conjunto padrão
  let ids = config.moedas.map((m) => m.id);
  if (ids.length < 3) {
    ids = ['bitcoin', 'ethereum', 'binancecoin', 'solana', 'cardano', 'ripple', 'polkadot', 'chainlink'];
  }
  ids = ids.slice(0, 10); // limita para não estourar rate limit

  let totalSinais = 0, totalAcertos = 0;
  const porMoeda = [];

  for (const id of ids) {
    try {
      const hist = await buscarHistorico(id, 180);
      if (hist.length < 70) continue;
      const bt = analise.backtest(hist.map((h) => h.preco), horizonte);
      if (bt.erro || !bt.totalSinais) continue;
      totalSinais += bt.totalSinais;
      totalAcertos += bt.acertos;
      porMoeda.push({ id, taxa: bt.taxaAcerto, sinais: bt.totalSinais });
      await new Promise((r) => setTimeout(r, 2500)); // rate limit
    } catch (e) {}
  }

  const taxaMedia = totalSinais ? (totalAcertos / totalSinais) * 100 : 0;
  res.json({
    taxaMedia,
    totalSinais,
    totalAcertos,
    moedasTestadas: porMoeda.length,
    porMoeda: porMoeda.sort((a, b) => b.taxa - a.taxa),
    horizonte,
  });
});

app.get('/api/alertas', (req, res) => res.json(historicoAlertas));

app.post('/api/telegram', async (req, res) => {
  const { token, chatId } = req.body;
  config.telegram = { token, chatId };
  salvarConfig(config);
  // testa envio
  const ok = await enviarTelegram('✅ <b>Crypto Monitor Pro conectado!</b>\n\nVocê receberá seus alertas aqui.');
  res.json({ ok, mensagem: ok ? 'Telegram conectado e testado!' : 'Salvo, mas o teste de envio falhou. Verifique token e chat ID.' });
});

// ============================================================
// CARTEIRA
// Cada posição: { id, moedaId, nome, simbolo, imagem, quantidade,
//                 precoCompra, dataCompra, valorInvestido }
// ============================================================

// Adicionar posição. Aceita dois modos:
//  modo "valor": informa quantidade e precoCompra direto
//  modo "data": informa quantidade e dataCompra -> busca preço histórico
app.post('/api/carteira', async (req, res) => {
  const { moedaId, nome, simbolo, imagem, quantidade, modo } = req.body;
  let precoCompra = req.body.precoCompra;
  const dataCompra = req.body.dataCompra || new Date().toISOString();

  if (modo === 'data') {
    const precoHist = await buscarPrecoNaData(moedaId, dataCompra);
    if (!precoHist) {
      return res.status(400).json({ erro: 'Não foi possível obter o preço nessa data. Verifique a data (não pode ser futura) e tente novamente.' });
    }
    precoCompra = precoHist;
  }

  if (!quantidade || !precoCompra) {
    return res.status(400).json({ erro: 'Informe quantidade e preço (ou data válida).' });
  }

  const posicao = {
    id: Date.now(),
    moedaId, nome, simbolo, imagem,
    quantidade: parseFloat(quantidade),
    precoCompra: parseFloat(precoCompra),
    dataCompra,
    valorInvestido: parseFloat(quantidade) * parseFloat(precoCompra),
  };
  config.carteira = config.carteira || [];
  config.carteira.push(posicao);
  salvarConfig(config);
  res.json({ ok: true, posicao });
});

app.delete('/api/carteira/:id', (req, res) => {
  config.carteira = (config.carteira || []).filter((p) => p.id != req.params.id);
  salvarConfig(config);
  res.json({ ok: true });
});

// Resumo da carteira com performance atual + comparação com BTC e ETH
app.get('/api/carteira', async (req, res) => {
  const carteira = config.carteira || [];
  if (!carteira.length) {
    return res.json({ posicoes: [], resumo: null });
  }

  // garante que temos preços atuais de tudo na carteira
  const ids = [...new Set(carteira.map((p) => p.moedaId))];
  const precos = await buscarPrecos(ids);

  let totalInvestido = 0;
  let totalAtual = 0;
  const posicoes = carteira.map((p) => {
    const precoAtual = precos[p.moedaId]?.usd ?? p.precoCompra;
    const valorAtual = p.quantidade * precoAtual;
    const lucro = valorAtual - p.valorInvestido;
    const lucroPct = (lucro / p.valorInvestido) * 100;
    totalInvestido += p.valorInvestido;
    totalAtual += valorAtual;
    return {
      ...p,
      precoAtual,
      valorAtual,
      lucro,
      lucroPct,
    };
  });

  const lucroTotal = totalAtual - totalInvestido;
  const lucroTotalPct = totalInvestido > 0 ? (lucroTotal / totalInvestido) * 100 : 0;

  // Comparação com BTC e ETH desde a data média de compra (a mais antiga)
  const dataMaisAntiga = carteira.reduce((min, p) =>
    new Date(p.dataCompra) < new Date(min) ? p.dataCompra : min, carteira[0].dataCompra);

  let benchBTC = null;
  let benchETH = null;
  try {
    benchBTC = await variacaoDesdeData('bitcoin', dataMaisAntiga);
    benchETH = await variacaoDesdeData('ethereum', dataMaisAntiga);
  } catch (e) {}

  res.json({
    posicoes,
    resumo: {
      totalInvestido,
      totalAtual,
      lucroTotal,
      lucroTotalPct,
      dataReferencia: dataMaisAntiga,
      benchmark: {
        suaCarteira: lucroTotalPct,
        bitcoin: benchBTC,
        ethereum: benchETH,
      },
    },
  });
});

// ============================================================
// ADMIN / MONETIZAÇÃO / ASSINANTES
// ============================================================

// Helpers
function acharAdmin(email) {
  return config.admin.admins.find((a) => a.email.toLowerCase() === (email || '').toLowerCase());
}
function validarAdmin(email, senha) {
  const a = acharAdmin(email);
  return a && a.senha === senha;
}
function ehMestre(email) {
  const a = acharAdmin(email);
  return a && a.mestre;
}

// Marca assinantes vencidos como inativos. Roda a cada chamada e no loop.
function atualizarExpiracoes() {
  const agora = Date.now();
  let mudou = false;
  for (const s of config.assinantes || []) {
    if (s.ativo && agora > new Date(s.expiraEm).getTime()) {
      s.ativo = false;
      mudou = true;
    }
  }
  if (mudou) salvarConfig(config);
}

// Estado do setup: o primeiro acesso vira admin-mestre
app.get('/api/admin/estado', (req, res) => {
  res.json({ configurado: config.admin.configurado });
});

// Primeiro acesso — reivindica o admin-mestre
app.post('/api/admin/setup', (req, res) => {
  if (config.admin.configurado) {
    return res.status(400).json({ erro: 'Administrador já configurado. Faça login.' });
  }
  const { email, senha } = req.body;
  if (!email || !senha || senha.length < 4) {
    return res.status(400).json({ erro: 'Informe e-mail e senha (mínimo 4 caracteres).' });
  }
  config.admin.admins = [{ email, senha, mestre: true }];
  config.admin.adminMestre = email;
  config.admin.configurado = true;
  salvarConfig(config);
  res.json({ ok: true, email, mestre: true });
});

// Login
app.post('/api/admin/login', (req, res) => {
  const { email, senha } = req.body;
  if (validarAdmin(email, senha)) {
    const a = acharAdmin(email);
    res.json({ ok: true, email: a.email, mestre: a.mestre });
  } else {
    res.status(401).json({ ok: false, erro: 'E-mail ou senha incorretos' });
  }
});

// Listar admins (qualquer admin pode ver)
app.post('/api/admin/admins/listar', (req, res) => {
  const { email, senha } = req.body;
  if (!validarAdmin(email, senha)) return res.status(401).json({ erro: 'Não autorizado' });
  res.json(config.admin.admins.map((a) => ({ email: a.email, mestre: a.mestre })));
});

// Adicionar admin (só mestre)
app.post('/api/admin/admins/add', (req, res) => {
  const { email, senha, novoEmail, novaSenha } = req.body;
  if (!validarAdmin(email, senha)) return res.status(401).json({ erro: 'Não autorizado' });
  if (!ehMestre(email)) return res.status(403).json({ erro: 'Apenas o admin-mestre pode adicionar outros administradores.' });
  if (!novoEmail || !novaSenha) return res.status(400).json({ erro: 'Informe e-mail e senha do novo admin.' });
  if (acharAdmin(novoEmail)) return res.status(400).json({ erro: 'Este e-mail já é administrador.' });
  config.admin.admins.push({ email: novoEmail, senha: novaSenha, mestre: false });
  salvarConfig(config);
  res.json({ ok: true, admins: config.admin.admins.map((a) => ({ email: a.email, mestre: a.mestre })) });
});

// Remover admin (só mestre, não pode remover a si mesmo)
app.post('/api/admin/admins/remover', (req, res) => {
  const { email, senha, alvo } = req.body;
  if (!validarAdmin(email, senha)) return res.status(401).json({ erro: 'Não autorizado' });
  if (!ehMestre(email)) return res.status(403).json({ erro: 'Apenas o admin-mestre pode remover administradores.' });
  if (alvo.toLowerCase() === email.toLowerCase()) return res.status(400).json({ erro: 'Você não pode remover a si mesmo.' });
  const alvoObj = acharAdmin(alvo);
  if (alvoObj && alvoObj.mestre) return res.status(400).json({ erro: 'Não é possível remover o admin-mestre.' });
  config.admin.admins = config.admin.admins.filter((a) => a.email.toLowerCase() !== alvo.toLowerCase());
  salvarConfig(config);
  res.json({ ok: true, admins: config.admin.admins.map((a) => ({ email: a.email, mestre: a.mestre })) });
});

// Configurar monetização
app.post('/api/admin/config', (req, res) => {
  const { email, senha, monetizacaoAtiva, analisesGratis, planos } = req.body;
  if (!validarAdmin(email, senha)) return res.status(401).json({ erro: 'Não autorizado' });
  if (typeof monetizacaoAtiva === 'boolean') config.admin.monetizacaoAtiva = monetizacaoAtiva;
  if (typeof analisesGratis === 'number') config.admin.analisesGratis = analisesGratis;
  if (Array.isArray(planos)) config.admin.planos = planos;
  contadorAnalises = {};
  salvarConfig(config);
  res.json({ ok: true });
});

// ---------- ASSINANTES ----------
// Adicionar assinante (cadastro de adesão a um plano)
app.post('/api/admin/assinantes/add', (req, res) => {
  const { email, senha, assinanteEmail, planoId } = req.body;
  if (!validarAdmin(email, senha)) return res.status(401).json({ erro: 'Não autorizado' });
  const plano = config.admin.planos.find((p) => p.id === planoId);
  if (!assinanteEmail || !plano) return res.status(400).json({ erro: 'Informe e-mail e plano válido.' });

  const agora = new Date();
  const expira = new Date(agora.getTime() + plano.dias * 86400000);
  const assinante = {
    id: Date.now(),
    email: assinanteEmail,
    planoId: plano.id,
    planoNome: plano.nome,
    preco: plano.preco,
    aderiuEm: agora.toISOString(),
    expiraEm: expira.toISOString(),
    ativo: true,
  };
  config.assinantes = config.assinantes || [];
  config.assinantes.push(assinante);
  salvarConfig(config);
  res.json({ ok: true, assinante });
});

app.post('/api/admin/assinantes/remover', (req, res) => {
  const { email, senha, alvoId } = req.body;
  if (!validarAdmin(email, senha)) return res.status(401).json({ erro: 'Não autorizado' });
  config.assinantes = (config.assinantes || []).filter((a) => a.id != alvoId);
  salvarConfig(config);
  res.json({ ok: true });
});

// Dashboard completo do admin: adesões por dia, por plano, lista, estatísticas
app.post('/api/admin/dashboard', (req, res) => {
  const { email, senha } = req.body;
  if (!validarAdmin(email, senha)) return res.status(401).json({ erro: 'Não autorizado' });

  atualizarExpiracoes();
  const assinantes = config.assinantes || [];

  // adesões por dia (últimos 30 dias)
  const porDia = {};
  const hoje = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(hoje.getTime() - i * 86400000);
    const chave = d.toISOString().slice(0, 10);
    porDia[chave] = 0;
  }
  // adesões por plano
  const porPlano = {};
  config.admin.planos.forEach((p) => { porPlano[p.id] = { nome: p.nome, total: 0, ativos: 0, receita: 0 }; });

  let receitaTotal = 0;
  let ativosTotal = 0;
  for (const a of assinantes) {
    const dia = a.aderiuEm.slice(0, 10);
    if (dia in porDia) porDia[dia]++;
    if (porPlano[a.planoId]) {
      porPlano[a.planoId].total++;
      porPlano[a.planoId].receita += a.preco;
      if (a.ativo) porPlano[a.planoId].ativos++;
    }
    receitaTotal += a.preco;
    if (a.ativo) ativosTotal++;
  }

  res.json({
    config: {
      monetizacaoAtiva: config.admin.monetizacaoAtiva,
      analisesGratis: config.admin.analisesGratis,
      planos: config.admin.planos,
    },
    stats: {
      totalAssinantes: assinantes.length,
      ativos: ativosTotal,
      inativos: assinantes.length - ativosTotal,
      receitaAcumulada: receitaTotal,
      moedasMonitoradas: config.moedas.length,
      sessoesAtivas: Object.keys(contadorAnalises).length,
    },
    adesoesPorDia: porDia,
    adesoesPorPlano: porPlano,
    assinantes: assinantes
      .slice()
      .sort((a, b) => new Date(b.aderiuEm) - new Date(a.aderiuEm))
      .map((a) => ({
        id: a.id, email: a.email, planoNome: a.planoNome, preco: a.preco,
        aderiuEm: a.aderiuEm, expiraEm: a.expiraEm, ativo: a.ativo,
        diasRestantes: Math.max(0, Math.ceil((new Date(a.expiraEm) - Date.now()) / 86400000)),
      })),
  });
});

// Info pública de monetização
app.get('/api/monetizacao', (req, res) => {
  res.json({
    ativa: config.admin.monetizacaoAtiva,
    analisesGratis: config.admin.analisesGratis,
    planos: config.admin.planos,
  });
});

app.get('/api/pode-analisar/:sessao', (req, res) => {
  if (!config.admin.monetizacaoAtiva) {
    return res.json({ liberado: true, motivo: 'monetizacao_desligada' });
  }
  const usados = contadorAnalises[req.params.sessao] || 0;
  const liberado = usados < config.admin.analisesGratis;
  res.json({ liberado, usados, limite: config.admin.analisesGratis });
});

app.post('/api/registrar-analise/:sessao', (req, res) => {
  if (config.admin.monetizacaoAtiva) {
    contadorAnalises[req.params.sessao] = (contadorAnalises[req.params.sessao] || 0) + 1;
  }
  res.json({ ok: true, usados: contadorAnalises[req.params.sessao] || 0 });
});

app.get('/api/status', (req, res) => {
  res.json({
    moedas: config.moedas.length,
    alertas: historicoAlertas.length,
    telegram: !!(config.telegram?.token && config.telegram?.chatId),
    uptime: Math.floor(process.uptime()),
  });
});

// ============================================================
// INICIAR
// ============================================================
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════╗
║      🚀 CRYPTO MONITOR PRO v2.0 — RODANDO          ║
║      🌐 http://localhost:${PORT}                        ║
╚════════════════════════════════════════════════════╝
  `);
  buscarListaMoedas();
  // primeiro ciclo após 5s, depois no intervalo configurado
  setTimeout(() => {
    cicloMonitoramento();
    setInterval(cicloMonitoramento, config.intervaloMs || 60000);
  }, 5000);
  // verifica expiração de assinantes a cada hora
  atualizarExpiracoes();
  setInterval(atualizarExpiracoes, 3600000);
});
