// ============================================================
// otimizador.js — Busca honesta de uma fórmula melhor
// Estratégia anti-overfitting: separa TREINO e TESTE.
// Otimiza os pesos no treino, mede a verdade no teste (dados nunca vistos).
// ============================================================

// ---------- indicadores base (cópia local p/ velocidade) ----------
function sma(p, n){ if(p.length<n) return null; return p.slice(-n).reduce((a,b)=>a+b,0)/n; }
function ema(p, n){ if(p.length<n) return null; const k=2/(n+1); let e=p.slice(0,n).reduce((a,b)=>a+b,0)/n; for(let i=n;i<p.length;i++) e=p[i]*k+e*(1-k); return e; }
function rsi(p, n=14){ if(p.length<n+1) return null; let g=0,l=0; for(let i=p.length-n;i<p.length;i++){const d=p[i]-p[i-1]; if(d>=0)g+=d; else l+=Math.abs(d);} const mg=g/n, ml=l/n; if(ml===0) return 100; return 100-100/(1+mg/ml); }
function macdHist(p){ if(p.length<26) return 0; const e12=ema(p,12), e26=ema(p,26); const linha=e12-e26; const serie=[]; for(let i=26;i<=p.length;i++){const j=p.slice(0,i); serie.push(ema(j,12)-ema(j,26));} const sinal=serie.length>=9?ema(serie,9):linha; return {linha, hist:linha-sinal}; }
function bollinger(p, n=20){ if(p.length<n) return null; const s=p.slice(-n); const m=s.reduce((a,b)=>a+b,0)/n; const dp=Math.sqrt(s.reduce((x,v)=>x+(v-m)**2,0)/n); return {sup:m+2*dp, inf:m-2*dp, m}; }
function inclinacao(p, n=20){ const atual=sma(p,n); const ant=sma(p.slice(0,-10),n); if(!atual||!ant) return 0; return (atual-ant)/ant; }

function fibZona(p){
  if(p.length<2) return null;
  const max=Math.max(...p), min=Math.min(...p), diff=max-min;
  if(diff===0) return null;
  const atual=p[p.length-1];
  const idxMax=p.lastIndexOf(max), idxMin=p.lastIndexOf(min);
  const alta = idxMin < idxMax;
  const pos = (atual-min)/diff; // 0=fundo, 1=topo
  return { alta, pos };
}

// ---------- Score parametrizável ----------
// pesos = { rsi, macd, tend, boll, fib, rsiPeriodo, smaCurta, smaLonga, limiar }
function scoreParam(precos, pesos) {
  const n = precos.length;
  if (n < Math.max(pesos.smaLonga + 12, 35)) return null;
  let s = 50;

  const r = rsi(precos, pesos.rsiPeriodo);
  const mac = macdHist(precos);
  const smaC = sma(precos, pesos.smaCurta);
  const smaL = sma(precos, pesos.smaLonga);
  const incl = inclinacao(precos, pesos.smaCurta);
  const bb = bollinger(precos);
  const fib = fibZona(precos);
  const atual = precos[n-1];

  // tendência (com inclinação)
  const acima = atual > smaC && smaC > smaL;
  const abaixo = atual < smaC && smaC < smaL;
  let tendForte = 0;
  if (acima && incl > 0.01) tendForte = 1;
  else if (acima || (atual>smaC && incl>0.005)) tendForte = 0.5;
  else if (abaixo && incl < -0.01) tendForte = -1;
  else if (abaixo || (atual<smaC && incl<-0.005)) tendForte = -0.5;

  const ehBaixa = tendForte < 0;
  const ehAlta = tendForte > 0;

  // RSI contextual
  if (r !== null) {
    if (r < 30) s += ehBaixa ? -pesos.rsi*0.4 : pesos.rsi;
    else if (r > 70) s += ehAlta ? pesos.rsi*0.25 : -pesos.rsi;
  }
  // MACD
  if (mac) {
    if (mac.linha>0 && mac.hist>0) s += pesos.macd;
    else if (mac.linha<0 && mac.hist<0) s -= pesos.macd;
    else if (mac.hist>0) s += pesos.macd*0.4;
    else s -= pesos.macd*0.4;
  }
  // tendência (peso maior)
  s += tendForte * pesos.tend;
  // bollinger
  if (bb) {
    if (atual <= bb.inf) s += pesos.boll;
    else if (atual >= bb.sup) s -= pesos.boll;
  }
  // fibonacci
  if (fib) {
    // zona 0.382-0.618 = suporte em alta / resistência em baixa
    if (fib.pos >= 0.35 && fib.pos <= 0.65) {
      s += fib.alta ? pesos.fib : -pesos.fib;
    }
  }

  s = Math.max(0, Math.min(100, s));
  if (s >= 50 + pesos.limiar) return 'COMPRA';
  if (s <= 50 - pesos.limiar) return 'VENDA';
  return 'NEUTRO';
}

// ---------- Backtest de um conjunto de pesos ----------
function avaliar(precos, pesos, horizonte) {
  let total=0, acertos=0, somaRet=0;
  const start = Math.max(pesos.smaLonga + 12, 35);
  for (let i=start; i<=precos.length-horizonte-1; i++) {
    const sinal = scoreParam(precos.slice(0,i+1), pesos);
    if (sinal === 'NEUTRO' || sinal === null) continue;
    const varReal = (precos[i+horizonte]-precos[i])/precos[i]*100;
    total++;
    if (sinal==='COMPRA'){ if(varReal>0){acertos++; somaRet+=varReal;} else somaRet+=varReal; }
    else { if(varReal<0){acertos++; somaRet+=-varReal;} else somaRet+=-varReal; }
  }
  return { total, taxa: total? acertos/total*100 : 0, retMedio: total? somaRet/total : 0 };
}

// ---------- Gerador de dados realistas de cripto ----------
// Mistura regimes: alta, baixa, lateral, com volatilidade e saltos (notícias)
function gerarSerieRealista(n, seed) {
  let rnd = seed;
  const rand = () => { rnd = (rnd*9301+49297)%233280; return rnd/233280; };
  const precos = [];
  let v = 100;
  let regime = 0; // -1 baixa, 0 lateral, 1 alta
  let regimeDur = 0;
  let drift = 0;
  for (let i=0;i<n;i++) {
    if (regimeDur<=0) {
      const r = rand();
      regime = r<0.4?1 : r<0.7?-1 : 0; // cripto tende mais a alta historicamente
      regimeDur = 20 + Math.floor(rand()*60);
      drift = regime===1 ? 0.002+rand()*0.004 : regime===-1 ? -(0.002+rand()*0.004) : 0;
    }
    regimeDur--;
    // volatilidade alta típica de cripto
    const vol = 0.02 + rand()*0.03;
    let ret = drift + (rand()-0.5)*vol;
    // saltos ocasionais (notícias) ~3% das vezes
    if (rand() < 0.03) ret += (rand()-0.5)*0.15;
    v *= (1+ret);
    if (v < 1) v = 1;
    precos.push(v);
  }
  return precos;
}

module.exports = { scoreParam, avaliar, gerarSerieRealista };
