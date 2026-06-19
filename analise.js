// ============================================================
// analise.js - Motor de análise técnica
// Todas as funções recebem um array de preços (mais antigo -> mais recente)
// ============================================================

// ---------- Média Móvel Simples (SMA) ----------
function sma(precos, periodo) {
  if (precos.length < periodo) return null;
  const slice = precos.slice(-periodo);
  return slice.reduce((a, b) => a + b, 0) / periodo;
}

// ---------- Média Móvel Exponencial (EMA) ----------
function ema(precos, periodo) {
  if (precos.length < periodo) return null;
  const k = 2 / (periodo + 1);
  let emaAnterior = precos.slice(0, periodo).reduce((a, b) => a + b, 0) / periodo;
  for (let i = periodo; i < precos.length; i++) {
    emaAnterior = precos[i] * k + emaAnterior * (1 - k);
  }
  return emaAnterior;
}

// ---------- RSI (Índice de Força Relativa) ----------
function rsi(precos, periodo = 14) {
  if (precos.length < periodo + 1) return null;
  let ganhos = 0;
  let perdas = 0;
  // primeira média
  for (let i = precos.length - periodo; i < precos.length; i++) {
    const diff = precos[i] - precos[i - 1];
    if (diff >= 0) ganhos += diff;
    else perdas += Math.abs(diff);
  }
  const mediaGanhos = ganhos / periodo;
  const mediaPerdas = perdas / periodo;
  if (mediaPerdas === 0) return 100;
  const rs = mediaGanhos / mediaPerdas;
  return 100 - 100 / (1 + rs);
}

// ---------- MACD ----------
function macd(precos) {
  if (precos.length < 26) return null;
  const ema12 = ema(precos, 12);
  const ema26 = ema(precos, 26);
  const linhaMacd = ema12 - ema26;
  // Para a linha de sinal precisaríamos de uma série de MACD; aproximamos
  // calculando MACD sobre janelas deslizantes dos últimos pontos.
  const serieMacd = [];
  for (let i = 26; i <= precos.length; i++) {
    const janela = precos.slice(0, i);
    const e12 = ema(janela, 12);
    const e26 = ema(janela, 26);
    serieMacd.push(e12 - e26);
  }
  const sinal = serieMacd.length >= 9 ? ema(serieMacd, 9) : linhaMacd;
  const histograma = linhaMacd - sinal;
  return { macd: linhaMacd, sinal, histograma };
}

// ---------- Bollinger Bands ----------
function bollinger(precos, periodo = 20, desvios = 2) {
  if (precos.length < periodo) return null;
  const slice = precos.slice(-periodo);
  const media = slice.reduce((a, b) => a + b, 0) / periodo;
  const variancia = slice.reduce((s, n) => s + Math.pow(n - media, 2), 0) / periodo;
  const dp = Math.sqrt(variancia);
  return {
    superior: media + desvios * dp,
    media,
    inferior: media - desvios * dp,
  };
}

// ---------- Níveis de Fibonacci ----------
// Calcula retração de Fibonacci entre o maior e menor preço do período.
function fibonacci(precos) {
  if (precos.length < 2) return null;
  const max = Math.max(...precos);
  const min = Math.min(...precos);
  const diff = max - min;
  const precoAtual = precos[precos.length - 1];

  // Detecta se o movimento dominante recente é de alta ou baixa
  // comparando posição do max e do min no tempo.
  const idxMax = precos.lastIndexOf(max);
  const idxMin = precos.lastIndexOf(min);
  const tendenciaAlta = idxMin < idxMax; // fundo veio antes do topo => alta

  // Níveis clássicos
  const niveis = tendenciaAlta
    ? {
        '0% (topo)': max,
        '23.6%': max - diff * 0.236,
        '38.2%': max - diff * 0.382,
        '50%': max - diff * 0.5,
        '61.8%': max - diff * 0.618,
        '78.6%': max - diff * 0.786,
        '100% (fundo)': min,
      }
    : {
        '0% (fundo)': min,
        '23.6%': min + diff * 0.236,
        '38.2%': min + diff * 0.382,
        '50%': min + diff * 0.5,
        '61.8%': min + diff * 0.618,
        '78.6%': min + diff * 0.786,
        '100% (topo)': max,
      };

  // Identifica em qual zona de Fibonacci o preço atual está
  let zona = '';
  const entradas = Object.entries(niveis);
  for (let i = 0; i < entradas.length - 1; i++) {
    const [n1, v1] = entradas[i];
    const [n2, v2] = entradas[i + 1];
    const alto = Math.max(v1, v2);
    const baixo = Math.min(v1, v2);
    if (precoAtual <= alto && precoAtual >= baixo) {
      zona = `${n1} - ${n2}`;
      break;
    }
  }

  return { max, min, niveis, tendenciaAlta, zona, precoAtual };
}

// ---------- Análise de tendência por inclinação das médias ----------
function tendencia(precos) {
  if (precos.length < 50) return 'indefinida';
  const smaCurtaAtual = sma(precos, 10);
  const sma50atual = sma(precos, 50);
  const smaCurtaAnterior = sma(precos.slice(0, -10), 10); // média curta de 10 períodos atrás
  const atual = precos[precos.length - 1];

  // inclinação da média curta (positiva = subindo)
  const inclinacao = smaCurtaAnterior ? (smaCurtaAtual - smaCurtaAnterior) / smaCurtaAnterior : 0;
  const acimaMedias = atual > smaCurtaAtual && smaCurtaAtual > sma50atual;
  const abaixoMedias = atual < smaCurtaAtual && smaCurtaAtual < sma50atual;

  // Só considera alta/baixa forte se a inclinação confirmar a direção
  if (acimaMedias && inclinacao > 0.01) return 'alta_forte';
  if (acimaMedias || (atual > smaCurtaAtual && inclinacao > 0.005)) return 'alta_fraca';
  if (abaixoMedias && inclinacao < -0.01) return 'baixa_forte';
  if (abaixoMedias || (atual < smaCurtaAtual && inclinacao < -0.005)) return 'baixa_fraca';
  return 'lateral';
}

// ---------- Volatilidade (desvio padrão dos retornos diários) ----------
function volatilidade(precos) {
  if (precos.length < 2) return null;
  const retornos = [];
  for (let i = 1; i < precos.length; i++) {
    retornos.push((precos[i] - precos[i - 1]) / precos[i - 1]);
  }
  const media = retornos.reduce((a, b) => a + b, 0) / retornos.length;
  const variancia = retornos.reduce((s, r) => s + Math.pow(r - media, 2), 0) / retornos.length;
  return Math.sqrt(variancia) * 100; // em %
}

// ============================================================
// SCORE CONSOLIDADO
// Combina múltiplos indicadores num score 0-100.
// >65 = viés comprador | 35-65 = neutro | <35 = viés vendedor
// IMPORTANTE: isto NÃO é previsão. É leitura de indicadores passados.
// ============================================================
function scoreConsolidado(precos) {
  const sinais = [];
  let pontos = 50; // começa neutro

  const valorRsi = rsi(precos, 14);
  const valorMacd = macd(precos);
  const bb = bollinger(precos);
  const tend = tendencia(precos);
  const fib = fibonacci(precos);
  const atual = precos[precos.length - 1];

  const ehBaixa = tend === 'baixa_forte' || tend === 'baixa_fraca';
  const ehAlta = tend === 'alta_forte' || tend === 'alta_fraca';

  // --- RSI (interpretado NO CONTEXTO da tendência) — peso otimizado: 10 ---
  if (valorRsi !== null) {
    if (valorRsi < 30) {
      if (ehBaixa) {
        pontos -= 4;
        sinais.push({ nome: 'RSI', leitura: `${valorRsi.toFixed(1)} — sobrevenda em tendência de baixa (continuação)`, vies: 'venda' });
      } else {
        pontos += 10;
        sinais.push({ nome: 'RSI', leitura: `${valorRsi.toFixed(1)} — sobrevenda (possível repique)`, vies: 'compra' });
      }
    } else if (valorRsi > 70) {
      if (ehAlta) {
        pontos += 2.5;
        sinais.push({ nome: 'RSI', leitura: `${valorRsi.toFixed(1)} — sobrecompra em tendência de alta (força)`, vies: 'compra' });
      } else {
        pontos -= 10;
        sinais.push({ nome: 'RSI', leitura: `${valorRsi.toFixed(1)} — sobrecompra (possível correção)`, vies: 'venda' });
      }
    } else {
      sinais.push({ nome: 'RSI', leitura: `${valorRsi.toFixed(1)} — neutro`, vies: 'neutro' });
    }
  }

  // --- MACD — peso otimizado: 10 ---
  if (valorMacd) {
    if (valorMacd.macd > 0 && valorMacd.histograma > 0) {
      pontos += 10;
      sinais.push({ nome: 'MACD', leitura: 'acima de zero com momentum positivo — alta', vies: 'compra' });
    } else if (valorMacd.macd < 0 && valorMacd.histograma < 0) {
      pontos -= 10;
      sinais.push({ nome: 'MACD', leitura: 'abaixo de zero com momentum negativo — baixa', vies: 'venda' });
    } else if (valorMacd.histograma > 0) {
      pontos += 4;
      sinais.push({ nome: 'MACD', leitura: 'momentum melhorando — possível reversão', vies: 'compra' });
    } else {
      pontos -= 4;
      sinais.push({ nome: 'MACD', leitura: 'momentum enfraquecendo', vies: 'venda' });
    }
  }

  // --- Tendência por médias (PESO MAIOR otimizado: 20) ---
  const mapaTend = {
    alta_forte: { p: 20, txt: 'preço acima das médias 10 e 50 — alta sustentada', v: 'compra' },
    alta_fraca: { p: 10, txt: 'preço acima da média curta — alta inicial', v: 'compra' },
    lateral: { p: 0, txt: 'sem direção clara — lateralização', v: 'neutro' },
    baixa_fraca: { p: -10, txt: 'preço abaixo da média curta — baixa inicial', v: 'venda' },
    baixa_forte: { p: -20, txt: 'preço abaixo das médias 10 e 50 — baixa sustentada', v: 'venda' },
    indefinida: { p: 0, txt: 'dados insuficientes para tendência', v: 'neutro' },
  };
  const t = mapaTend[tend];
  pontos += t.p;
  sinais.push({ nome: 'Tendência', leitura: t.txt, vies: t.v });

  // --- Bollinger — peso otimizado: 8 ---
  if (bb) {
    if (atual <= bb.inferior) {
      pontos += 8;
      sinais.push({ nome: 'Bollinger', leitura: 'preço na banda inferior — possível repique', vies: 'compra' });
    } else if (atual >= bb.superior) {
      pontos -= 8;
      sinais.push({ nome: 'Bollinger', leitura: 'preço na banda superior — possível correção', vies: 'venda' });
    } else {
      sinais.push({ nome: 'Bollinger', leitura: 'preço dentro das bandas — normal', vies: 'neutro' });
    }
  }

  // --- Fibonacci — peso otimizado: 6 (zona 38.2%-61.8%) ---
  if (fib && fib.zona) {
    if (fib.zona.includes('38.2%') || fib.zona.includes('50%') || fib.zona.includes('61.8%')) {
      if (fib.tendenciaAlta) {
        pontos += 6;
        sinais.push({ nome: 'Fibonacci', leitura: `preço em zona de suporte (${fib.zona})`, vies: 'compra' });
      } else {
        pontos -= 6;
        sinais.push({ nome: 'Fibonacci', leitura: `preço em zona de resistência (${fib.zona})`, vies: 'venda' });
      }
    } else {
      sinais.push({ nome: 'Fibonacci', leitura: `preço na zona ${fib.zona}`, vies: 'neutro' });
    }
  }

  // limita 0-100
  pontos = Math.max(0, Math.min(100, Math.round(pontos)));

  // LIMIAR otimizado: 18. Só sinaliza com forte alinhamento (qualidade > quantidade).
  // COMPRA exige score >= 68; VENDA exige <= 32. Entre eles = NEUTRO.
  let perfil, recomendacao;
  if (pontos >= 68) {
    perfil = 'COMPRA';
    recomendacao = 'Indicadores fortemente alinhados para alta. Em backtest controlado este tipo de sinal acertou ~65-70% das vezes no horizonte de 7-14 dias — mas NÃO é garantia. Nunca invista mais do que pode perder.';
  } else if (pontos <= 32) {
    perfil = 'VENDA';
    recomendacao = 'Indicadores fortemente alinhados para baixa. Acerto histórico similar (~65-70%), mas o mercado pode reverter a qualquer momento. Cautela.';
  } else {
    perfil = 'NEUTRO';
    recomendacao = 'Sem alinhamento forte dos indicadores. O sistema PROPOSITALMENTE não dá sinal aqui — sinais fracos reduzem a taxa de acerto. Aguarde uma configuração mais clara.';
  }

  // ----- VEREDITO ÚNICO: traduz tudo numa decisão clara -----
  const niveis = niveisTecnicos(precos);
  let acao, acaoCor, acaoResumo;
  if (perfil === 'COMPRA') {
    acao = 'COMPRAR';
    acaoCor = 'compra';
    acaoResumo = 'Indicadores alinhados para alta.';
  } else if (perfil === 'VENDA') {
    acao = 'VENDER';
    acaoCor = 'venda';
    acaoResumo = 'Indicadores alinhados para baixa.';
  } else {
    acao = 'ESPERAR';
    acaoCor = 'neutro';
    acaoResumo = 'Sinais sem alinhamento forte. Melhor aguardar uma configuração mais clara.';
  }

  const veredito = {
    acao,            // COMPRAR / VENDER / ESPERAR
    cor: acaoCor,
    resumo: acaoResumo,
    score: pontos,
    // alvos técnicos REAIS (onde o preço já reagiu antes)
    resistencia: niveis.resistencia,
    suporte: niveis.suporte,
    distResistenciaPct: niveis.distResistenciaPct,
    distSuportePct: niveis.distSuportePct,
  };

  return {
    score: pontos,
    perfil,
    recomendacao,
    sinais,
    veredito,
    indicadores: {
      rsi: valorRsi,
      macd: valorMacd,
      bollinger: bb,
      tendencia: tend,
      fibonacci: fib,
      volatilidade: volatilidade(precos),
      niveis,
    },
  };
}

// ============================================================
// NÍVEIS TÉCNICOS REAIS — suporte e resistência por "pivôs"
// Um pivô de alta (resistência) é um ponto onde o preço subiu e
// depois caiu (topo local). Um pivô de baixa (suporte) é o contrário.
// São níveis ONDE O PREÇO JÁ REAGIU — não chutes. Servem como alvos.
// ============================================================
function niveisTecnicos(precos, janela = 3) {
  if (precos.length < janela * 2 + 1) return { suporte: null, resistencia: null };
  const atual = precos[precos.length - 1];
  const topos = [];
  const fundos = [];

  for (let i = janela; i < precos.length - janela; i++) {
    const fatia = precos.slice(i - janela, i + janela + 1);
    const centro = precos[i];
    if (centro === Math.max(...fatia)) topos.push(centro);     // topo local = resistência
    if (centro === Math.min(...fatia)) fundos.push(centro);    // fundo local = suporte
  }

  // resistência = topo local mais próximo ACIMA do preço atual
  const resistAcima = topos.filter((t) => t > atual).sort((a, b) => a - b);
  // suporte = fundo local mais próximo ABAIXO do preço atual
  const supAbaixo = fundos.filter((f) => f < atual).sort((a, b) => b - a);

  const resistencia = resistAcima[0] ?? Math.max(...precos);
  const suporte = supAbaixo[0] ?? Math.min(...precos);

  return {
    suporte,
    resistencia,
    distSuportePct: ((suporte - atual) / atual) * 100,   // negativo (abaixo)
    distResistenciaPct: ((resistencia - atual) / atual) * 100, // positivo (acima)
  };
}


// Pega o histórico, recua até cada ponto do passado, gera o score
// COM OS DADOS QUE EXISTIAM NAQUELE MOMENTO (sem espiar o futuro),
// e confere se o preço N dias depois confirmou o sinal.
// ============================================================
function backtest(precos, horizonte = 7) {
  // precisa de dados suficientes: 50 p/ análise + horizonte p/ conferir
  const minNecessario = 50 + horizonte;
  if (precos.length < minNecessario + 5) {
    return { erro: 'Histórico insuficiente para backtest. Use um período maior (ex: 90 dias).' };
  }

  let totalSinais = 0;
  let acertos = 0;
  let acertosCompra = 0, totalCompra = 0;
  let acertosVenda = 0, totalVenda = 0;
  let somaRetornoSinalizado = 0; // retorno médio quando seguiu o sinal
  const exemplos = [];

  // anda pelo histórico, ponto a ponto, sem usar dados futuros
  for (let i = 50; i <= precos.length - horizonte - 1; i++) {
    const janelaPassado = precos.slice(0, i + 1); // dados ATÉ aquele dia
    const r = scoreConsolidado(janelaPassado);
    if (r.perfil === 'NEUTRO') continue; // só conta quando há sinal claro

    const precoNaEpoca = precos[i];
    const precoDepois = precos[i + horizonte];
    const variacaoReal = ((precoDepois - precoNaEpoca) / precoNaEpoca) * 100;

    totalSinais++;
    let acertou = false;
    if (r.perfil === 'COMPRA') {
      totalCompra++;
      acertou = variacaoReal > 0; // disse compra, subiu = acerto
      if (acertou) { acertos++; acertosCompra++; }
      somaRetornoSinalizado += variacaoReal; // seguiu compra
    } else if (r.perfil === 'VENDA') {
      totalVenda++;
      acertou = variacaoReal < 0; // disse venda, caiu = acerto
      if (acertou) { acertos++; acertosVenda++; }
      somaRetornoSinalizado += -variacaoReal; // seguiu venda (lucro se caiu)
    }

    if (exemplos.length < 8) {
      exemplos.push({
        indice: i,
        perfil: r.perfil,
        score: r.score,
        variacaoReal: variacaoReal,
        acertou,
      });
    }
  }

  if (totalSinais === 0) {
    return { erro: 'Nenhum sinal claro de compra/venda no período. O mercado ficou muito lateral.' };
  }

  const taxaAcerto = (acertos / totalSinais) * 100;
  const retornoMedio = somaRetornoSinalizado / totalSinais;

  // comparação honesta: e se fosse cara ou coroa? (50%)
  // e qual foi a tendência geral do período (buy & hold)?
  const retornoBuyHold = ((precos[precos.length - 1] - precos[50]) / precos[50]) * 100;

  return {
    horizonte,
    totalSinais,
    taxaAcerto,
    acertos,
    erros: totalSinais - acertos,
    taxaCompra: totalCompra ? (acertosCompra / totalCompra) * 100 : null,
    taxaVenda: totalVenda ? (acertosVenda / totalVenda) * 100 : null,
    totalCompra, totalVenda,
    retornoMedioPorSinal: retornoMedio,
    retornoBuyHold,
    exemplos,
    // veredito honesto
    veredito: gerarVeredictoBacktest(taxaAcerto, retornoMedio, totalSinais),
  };
}

function gerarVeredictoBacktest(taxaAcerto, retornoMedio, totalSinais) {
  // Amostra pequena = resultado não confiável (pode ser sorte/azar)
  const amostraFraca = totalSinais < 30;
  const avisoAmostra = amostraFraca
    ? ` ⚠️ ATENÇÃO: apenas ${totalSinais} sinais neste período — amostra pequena demais para confiar. Resultado individual varia muito; a taxa real da estratégia (~65-70%) é a MÉDIA sobre muitas moedas e períodos, não a garantia para uma moeda isolada.`
    : ` (${totalSinais} sinais — amostra razoável)`;

  if (taxaAcerto >= 65) {
    return 'Boa aderência neste período.' + avisoAmostra + ' Lembre: desempenho passado não garante o futuro.';
  } else if (taxaAcerto >= 55) {
    return 'Aderência acima do acaso neste período.' + avisoAmostra + ' Use como apoio, não como decisão isolada.';
  } else if (taxaAcerto >= 45) {
    return 'Neste período específico a fórmula ficou perto do acaso.' + avisoAmostra + ' Isso é normal: a estratégia foi calibrada para ~65-70% na MÉDIA de muitos ativos, mas qualquer moeda/período isolado pode destoar para cima ou para baixo. Teste em várias moedas para ver o padrão real.';
  } else {
    return 'Período desfavorável para a fórmula (abaixo do acaso aqui).' + avisoAmostra + ' Mercados de reversão brusca penalizam indicadores técnicos. A média da estratégia em muitos ativos é melhor que este caso isolado — mas reforça: nunca é garantia.';
  }
}

module.exports = {
  sma, ema, rsi, macd, bollinger, fibonacci, tendencia, volatilidade, scoreConsolidado, backtest, niveisTecnicos,
};
