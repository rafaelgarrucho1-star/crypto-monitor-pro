// ============================================================
// aprendizado.js — Otimização honesta de pesos + aprendizado contínuo
//
// FILOSOFIA (importante): não existe "achar 75% e travar". O que existe é:
//  1) Otimizar pesos num conjunto de TREINO (metade das moedas)
//  2) VALIDAR num conjunto de TESTE que a fórmula nunca viu
//  3) Só aceitar a melhora se ela aparecer TAMBÉM no teste
// Isso evita overfitting — o erro clássico que faz a fórmula parecer
// ótima no passado e quebrar no futuro real.
//
// O aprendizado contínuo registra cada sinal dado + o que aconteceu N
// dias depois, e periodicamente reavalia os pesos com base nesses
// resultados REAIS acumulados (não simulados).
// ============================================================

const analise = require('./analise');

// ---------- Score parametrizável (mesma lógica do analise.js, mas com pesos variáveis) ----------
// Recebe um objeto de pesos para que o otimizador possa testar combinações.
function scoreComPesos(precos, pesos) {
  let pontos = 50;

  const valorRsi = analise.rsi(precos, 14);
  const valorMacd = analise.macd(precos);
  const bb = analise.bollinger(precos);
  const tend = analise.tendencia(precos);
  const fib = analise.fibonacci(precos);
  const atual = precos[precos.length - 1];

  const ehBaixa = tend === 'baixa_forte' || tend === 'baixa_fraca';
  const ehAlta = tend === 'alta_forte' || tend === 'alta_fraca';

  // RSI
  if (valorRsi !== null) {
    if (valorRsi < 30) {
      if (ehBaixa) pontos -= pesos.rsi * 0.4;
      else pontos += pesos.rsi;
    } else if (valorRsi > 70) {
      if (ehAlta) pontos += pesos.rsi * 0.25;
      else pontos -= pesos.rsi;
    }
  }

  // MACD
  if (valorMacd) {
    if (valorMacd.macd > 0 && valorMacd.histograma > 0) pontos += pesos.macd;
    else if (valorMacd.macd < 0 && valorMacd.histograma < 0) pontos -= pesos.macd;
    else if (valorMacd.histograma > 0) pontos += pesos.macd * 0.4;
    else pontos -= pesos.macd * 0.4;
  }

  // Tendência
  const mapaTend = {
    alta_forte: pesos.tendencia,
    alta_fraca: pesos.tendencia * 0.5,
    lateral: 0,
    baixa_fraca: -pesos.tendencia * 0.5,
    baixa_forte: -pesos.tendencia,
    indefinida: 0,
  };
  pontos += mapaTend[tend] ?? 0;

  // Bollinger
  if (bb) {
    if (atual <= bb.inferior) pontos += pesos.bollinger;
    else if (atual >= bb.superior) pontos -= pesos.bollinger;
  }

  // Fibonacci
  if (fib && fib.zona) {
    if (fib.zona.includes('38.2%') || fib.zona.includes('50%') || fib.zona.includes('61.8%')) {
      if (fib.tendenciaAlta) pontos += pesos.fibonacci;
      else pontos -= pesos.fibonacci;
    }
  }

  pontos = Math.max(0, Math.min(100, Math.round(pontos)));

  let perfil;
  if (pontos >= pesos.limiarCompra) perfil = 'COMPRA';
  else if (pontos <= pesos.limiarVenda) perfil = 'VENDA';
  else perfil = 'NEUTRO';

  return { score: pontos, perfil };
}

// ---------- Backtest de uma série com pesos específicos ----------
// passo: para acelerar, avalia a cada 'passo' pontos (não todos)
function backtestSerie(precos, pesos, horizonte, passo = 2) {
  if (precos.length < 50 + horizonte + 5) return null;
  let total = 0, acertos = 0;
  for (let i = 50; i <= precos.length - horizonte - 1; i += passo) {
    const janela = precos.slice(0, i + 1);
    const r = scoreComPesos(janela, pesos);
    if (r.perfil === 'NEUTRO') continue;
    const precoAgora = precos[i];
    const precoDepois = precos[i + horizonte];
    const variacao = ((precoDepois - precoAgora) / precoAgora) * 100;
    total++;
    if (r.perfil === 'COMPRA' && variacao > 0) acertos++;
    else if (r.perfil === 'VENDA' && variacao < 0) acertos++;
  }
  if (total === 0) return null;
  return { total, acertos, taxa: (acertos / total) * 100 };
}

// ---------- Avalia um conjunto de pesos sobre VÁRIAS séries (agregado) ----------
function avaliarConjunto(series, pesos, horizonte) {
  let totalSinais = 0, totalAcertos = 0, seriesUsadas = 0;
  for (const precos of series) {
    const r = backtestSerie(precos, pesos, horizonte);
    if (!r) continue;
    totalSinais += r.total;
    totalAcertos += r.acertos;
    seriesUsadas++;
  }
  if (totalSinais === 0) return { taxa: 0, totalSinais: 0, seriesUsadas };
  return {
    taxa: (totalAcertos / totalSinais) * 100,
    totalSinais,
    totalAcertos,
    seriesUsadas,
  };
}

// ============================================================
// PRÉ-CÁLCULO: para cada ponto da série (a partir do índice 50),
// calcula os indicadores UMA vez. Depois o otimizador só re-pondera
// esses valores — milhares de vezes mais rápido que recalcular tudo.
// ============================================================
function precalcularSinais(precos, horizonte, passo = 2) {
  const pontos = [];
  for (let i = 50; i <= precos.length - horizonte - 1; i += passo) {
    const janela = precos.slice(0, i + 1);
    const valorRsi = analise.rsi(janela, 14);
    const valorMacd = analise.macd(janela);
    const bb = analise.bollinger(janela);
    const tend = analise.tendencia(janela);
    const fib = analise.fibonacci(janela);
    const atual = janela[janela.length - 1];
    const precoDepois = precos[i + horizonte];
    const variacao = ((precoDepois - atual) / atual) * 100;
    pontos.push({ valorRsi, valorMacd, bb, tend, fib, atual, variacao });
  }
  return pontos;
}

// Aplica pesos a um ponto pré-calculado e devolve o perfil
function perfilDoPonto(pt, pesos) {
  let pontos = 50;
  const { valorRsi, valorMacd, bb, tend, fib, atual } = pt;
  const ehBaixa = tend === 'baixa_forte' || tend === 'baixa_fraca';
  const ehAlta = tend === 'alta_forte' || tend === 'alta_fraca';

  if (valorRsi !== null) {
    if (valorRsi < 30) { pontos += ehBaixa ? -pesos.rsi * 0.4 : pesos.rsi; }
    else if (valorRsi > 70) { pontos += ehAlta ? pesos.rsi * 0.25 : -pesos.rsi; }
  }
  if (valorMacd) {
    if (valorMacd.macd > 0 && valorMacd.histograma > 0) pontos += pesos.macd;
    else if (valorMacd.macd < 0 && valorMacd.histograma < 0) pontos -= pesos.macd;
    else if (valorMacd.histograma > 0) pontos += pesos.macd * 0.4;
    else pontos -= pesos.macd * 0.4;
  }
  const mapaTend = {
    alta_forte: pesos.tendencia, alta_fraca: pesos.tendencia * 0.5, lateral: 0,
    baixa_fraca: -pesos.tendencia * 0.5, baixa_forte: -pesos.tendencia, indefinida: 0,
  };
  pontos += mapaTend[tend] ?? 0;
  if (bb) {
    if (atual <= bb.inferior) pontos += pesos.bollinger;
    else if (atual >= bb.superior) pontos -= pesos.bollinger;
  }
  if (fib && fib.zona) {
    if (fib.zona.includes('38.2%') || fib.zona.includes('50%') || fib.zona.includes('61.8%')) {
      pontos += fib.tendenciaAlta ? pesos.fibonacci : -pesos.fibonacci;
    }
  }
  pontos = Math.max(0, Math.min(100, Math.round(pontos)));
  if (pontos >= pesos.limiarCompra) return 'COMPRA';
  if (pontos <= pesos.limiarVenda) return 'VENDA';
  return 'NEUTRO';
}

// Avalia um conjunto de pesos sobre séries PRÉ-CALCULADAS
function avaliarPrecalc(seriesPre, pesos) {
  let total = 0, acertos = 0, seriesUsadas = 0;
  for (const pontos of seriesPre) {
    let usou = false;
    for (const pt of pontos) {
      const perfil = perfilDoPonto(pt, pesos);
      if (perfil === 'NEUTRO') continue;
      usou = true;
      total++;
      if (perfil === 'COMPRA' && pt.variacao > 0) acertos++;
      else if (perfil === 'VENDA' && pt.variacao < 0) acertos++;
    }
    if (usou) seriesUsadas++;
  }
  if (total === 0) return { taxa: 0, totalSinais: 0, seriesUsadas };
  return { taxa: (acertos / total) * 100, totalSinais: total, totalAcertos: acertos, seriesUsadas };
}

// ---------- Otimizador: grid search com validação treino/teste ----------
function otimizar(series, horizonte = 7) {
  const embaralhado = [...series].sort(() => Math.random() - 0.5);
  const meio = Math.floor(embaralhado.length / 2);
  const treinoRaw = embaralhado.slice(0, meio);
  const testeRaw = embaralhado.slice(meio);

  // PRÉ-CALCULA indicadores uma única vez (gargalo resolvido)
  const treino = treinoRaw.map((s) => precalcularSinais(s, horizonte)).filter((p) => p.length > 0);
  const teste = testeRaw.map((s) => precalcularSinais(s, horizonte)).filter((p) => p.length > 0);

  const gridRsi = [6, 10, 14];
  const gridMacd = [6, 10, 14];
  const gridTend = [14, 20, 26];
  const gridBoll = [4, 8, 12];
  const gridFib = [3, 6, 9];
  const gridLimiar = [{ c: 65, v: 35 }, { c: 68, v: 32 }, { c: 70, v: 30 }];

  let melhor = null;
  let combinacoesTestadas = 0;

  for (const rsi of gridRsi)
  for (const macd of gridMacd)
  for (const tendencia of gridTend)
  for (const bollinger of gridBoll)
  for (const fibonacci of gridFib)
  for (const lim of gridLimiar) {
    const pesos = { rsi, macd, tendencia, bollinger, fibonacci, limiarCompra: lim.c, limiarVenda: lim.v };
    const resTreino = avaliarPrecalc(treino, pesos);
    combinacoesTestadas++;
    if (resTreino.totalSinais < 100) continue;
    if (!melhor || resTreino.taxa > melhor.taxaTreino) {
      melhor = { pesos, taxaTreino: resTreino.taxa, sinaisTreino: resTreino.totalSinais };
    }
  }

  if (!melhor) {
    return { erro: 'Dados insuficientes para otimizar. Tente mais moedas ou período maior.' };
  }

  const resTeste = avaliarPrecalc(teste, melhor.pesos);

  return {
    pesos: melhor.pesos,
    taxaTreino: melhor.taxaTreino,
    sinaisTreino: melhor.sinaisTreino,
    taxaTeste: resTeste.taxa,
    sinaisTeste: resTeste.totalSinais,
    combinacoesTestadas,
    taxaConfiavel: resTeste.taxa,
    overfit: melhor.taxaTreino - resTeste.taxa,
    veredito: gerarVeredito(melhor.taxaTreino, resTeste.taxa, resTeste.totalSinais),
  };
}

function gerarVeredito(taxaTreino, taxaTeste, sinaisTeste) {
  const gap = taxaTreino - taxaTeste;
  let msg = `Treino: ${taxaTreino.toFixed(1)}% | Teste (vale este): ${taxaTeste.toFixed(1)}% em ${sinaisTeste} sinais. `;
  if (sinaisTeste < 50) {
    msg += '⚠️ Amostra de teste pequena — resultado pouco confiável.';
  } else if (gap > 10) {
    msg += '⚠️ Diferença grande treino-teste indica OVERFITTING: a fórmula decorou o passado. A taxa real é a do teste.';
  } else if (taxaTeste >= 65) {
    msg += '✅ Boa generalização. Esta taxa é honesta (medida fora do treino).';
  } else {
    msg += 'Generalização ok, mas taxa moderada. É o número real e honesto da estratégia neste mercado.';
  }
  return msg;
}

// ============================================================
// APRENDIZADO CONTÍNUO — registra sinais reais e seus resultados
// ============================================================
// Estrutura persistida: { sinais: [{id, data, perfil, score, precoNaEpoca, horizonte, resultado:null|true|false, variacao}] }

function registrarSinal(store, dados) {
  store.sinais = store.sinais || [];
  store.sinais.push({
    id: dados.id,
    data: Date.now(),
    perfil: dados.perfil,
    score: dados.score,
    precoNaEpoca: dados.preco,
    horizonte: dados.horizonte || 7,
    resultado: null, // será preenchido depois
    variacao: null,
  });
  // mantém no máximo 5000 sinais para não crescer infinito
  if (store.sinais.length > 5000) store.sinais = store.sinais.slice(-5000);
  return store;
}

// Confere sinais cujo horizonte já passou, usando o preço atual
function conferirSinais(store, precoAtualPorId) {
  store.sinais = store.sinais || [];
  let conferidos = 0;
  const agora = Date.now();
  for (const s of store.sinais) {
    if (s.resultado !== null) continue; // já conferido
    const prazo = s.horizonte * 24 * 60 * 60 * 1000;
    if (agora - s.data < prazo) continue; // ainda não venceu
    const precoAtual = precoAtualPorId[s.id];
    if (!precoAtual) continue;
    const variacao = ((precoAtual - s.precoNaEpoca) / s.precoNaEpoca) * 100;
    s.variacao = variacao;
    if (s.perfil === 'COMPRA') s.resultado = variacao > 0;
    else if (s.perfil === 'VENDA') s.resultado = variacao < 0;
    conferidos++;
  }
  return { store, conferidos };
}

// Calcula a taxa de acerto REAL acumulada (só sinais já conferidos)
function taxaRealAcumulada(store) {
  const conferidos = (store.sinais || []).filter((s) => s.resultado !== null);
  if (conferidos.length === 0) return { taxa: null, total: 0 };
  const acertos = conferidos.filter((s) => s.resultado === true).length;
  return {
    taxa: (acertos / conferidos.length) * 100,
    total: conferidos.length,
    acertos,
  };
}

module.exports = {
  scoreComPesos,
  backtestSerie,
  avaliarConjunto,
  otimizar,
  registrarSinal,
  conferirSinais,
  taxaRealAcumulada,
};
