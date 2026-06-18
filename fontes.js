// ============================================================
// fontes.js — Camada de ENRIQUECIMENTO (CoinGecko + DefiLlama)
//
// Filosofia anti-429: estas fontes são SECUNDÁRIAS. A Binance é a
// espinha dorsal (preço/candles). Aqui buscamos dados que mudam
// devagar (market cap, FDV, supply, TVL) com CACHE PESADO (1 hora),
// então quase nunca batemos no limite do CoinGecko.
//
// Se qualquer fonte aqui falhar, o app NÃO quebra — só fica sem o
// dado extra naquele momento. O preço/gráfico continuam pela Binance.
//
// Também resolve moedas que a Binance não lista (ex: AERO/Aerodrome):
// para essas, o preço vem do CoinGecko como fallback.
// ============================================================

const axios = require('axios');

const CG = 'https://api.coingecko.com/api/v3';
const LLAMA = 'https://api.llama.fi';

// ------------------------------------------------------------
// Moedas que NÃO existem na Binance e precisam vir do CoinGecko.
// id = id interno do app | cgId = id no CoinGecko | llama = slug DefiLlama
// IMPORTANTE: confirmar os ids na primeira execução online.
// ------------------------------------------------------------
const MOEDAS_FORA_BINANCE = {
  'aerodrome-finance': { simbolo: 'AERO', nome: 'Aerodrome Finance', cgId: 'aerodrome-finance', llama: 'aerodrome-v2' },
};

// Mapa símbolo -> cgId para enriquecer moedas que ESTÃO na Binance
// (preço vem da Binance, mas market cap/FDV vêm daqui).
// Lista enxuta das principais; expansível.
const SIMBOLO_PARA_CG = {
  BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin', SOL: 'solana', XRP: 'ripple',
  ADA: 'cardano', DOGE: 'dogecoin', TRX: 'tron', DOT: 'polkadot', MATIC: 'matic-network',
  LTC: 'litecoin', SHIB: 'shiba-inu', AVAX: 'avalanche-2', LINK: 'chainlink', ATOM: 'cosmos',
  UNI: 'uniswap', XLM: 'stellar', ETC: 'ethereum-classic', BCH: 'bitcoin-cash', FIL: 'filecoin',
  APT: 'aptos', NEAR: 'near', ICP: 'internet-computer', VET: 'vechain', HBAR: 'hedera-hashgraph',
  ARB: 'arbitrum', OP: 'optimism', AAVE: 'aave', GRT: 'the-graph', ALGO: 'algorand',
  PENDLE: 'pendle', SUI: 'sui', SEI: 'sei-network', INJ: 'injective-protocol', RUNE: 'thorchain',
  LDO: 'lido-dao', PEPE: 'pepe', WLD: 'worldcoin-wld', TIA: 'celestia', JUP: 'jupiter-exchange-solana',
  RENDER: 'render-token', IMX: 'immutable-x', STX: 'blockstack', FET: 'fetch-ai', GALA: 'gala',
};

// Protocolos DeFi com TVL relevante (símbolo -> slug DefiLlama)
const SIMBOLO_PARA_LLAMA = {
  AERO: 'aerodrome-v2', PENDLE: 'pendle', UNI: 'uniswap', AAVE: 'aave',
  CRV: 'curve-dex', MKR: 'makerdao', LDO: 'lido', GMX: 'gmx', SNX: 'synthetix',
  COMP: 'compound-finance', SUSHI: 'sushi', BAL: 'balancer', RUNE: 'thorchain',
  DYDX: 'dydx', JUP: 'jupiter', INJ: 'injective',
};

// ------------------------------------------------------------
// CACHE PESADO: market cap / FDV / supply (atualiza a cada 1 hora)
// ------------------------------------------------------------
let cacheCG = { ts: 0, dados: {} }; // { cgId: { marketCap, fdv, supply, ... } }
const TTL_CG = 60 * 60 * 1000; // 1 hora

let cacheTVL = { ts: 0, dados: {} }; // { slug: tvl }
const TTL_TVL = 60 * 60 * 1000;

async function get(url, params = {}, timeout = 15000) {
  return axios.get(url, { params, timeout });
}

// ------------------------------------------------------------
// Busca market cap / FDV / supply de várias moedas de uma vez.
// Recebe lista de cgIds. Devolve { cgId: {...} }. Cacheado 1h.
// ------------------------------------------------------------
async function enriquecerMarketCap(cgIds) {
  if (!cgIds.length) return {};
  const agora = Date.now();
  // se cache fresco cobre tudo, usa
  const faltando = cgIds.filter((id) => !cacheCG.dados[id]);
  if (agora - cacheCG.ts < TTL_CG && faltando.length === 0) {
    return cacheCG.dados;
  }
  try {
    // /coins/markets traz mcap, fdv, supply de até 250 de uma vez
    const r = await get(`${CG}/coins/markets`, {
      vs_currency: 'usd',
      ids: cgIds.join(','),
      per_page: 250,
      page: 1,
      sparkline: false,
    });
    const novo = { ...cacheCG.dados };
    r.data.forEach((c) => {
      novo[c.id] = {
        marketCap: c.market_cap,
        fdv: c.fully_diluted_valuation,
        supply: c.circulating_supply,
        supplyMax: c.max_supply,
        rank: c.market_cap_rank,
        ath: c.ath,
        athChangePct: c.ath_change_percentage,
        preco: c.current_price, // útil como fallback p/ moedas fora da Binance
        variacao24h: c.price_change_percentage_24h,
      };
    });
    cacheCG = { ts: agora, dados: novo };
  } catch (e) {
    console.warn('CoinGecko (enriquecimento) indisponível agora:', e.response?.status || e.message);
    // mantém cache antigo — não quebra o app
  }
  return cacheCG.dados;
}

// ------------------------------------------------------------
// Busca TVL de protocolos DeFi. Recebe lista de slugs DefiLlama.
// Devolve { slug: tvlUSD }. Cacheado 1h.
// ------------------------------------------------------------
async function enriquecerTVL(slugs) {
  if (!slugs.length) return {};
  const agora = Date.now();
  const faltando = slugs.filter((s) => cacheTVL.dados[s] === undefined);
  if (agora - cacheTVL.ts < TTL_TVL && faltando.length === 0) {
    return cacheTVL.dados;
  }
  const novo = { ...cacheTVL.dados };
  // DefiLlama: 1 chamada por protocolo, mas são poucos e cacheados 1h
  for (const slug of slugs) {
    if (novo[slug] !== undefined && agora - cacheTVL.ts < TTL_TVL) continue;
    try {
      const r = await get(`${LLAMA}/tvl/${slug}`);
      // /tvl/{slug} devolve só o número do TVL atual
      novo[slug] = typeof r.data === 'number' ? r.data : parseFloat(r.data);
    } catch (e) {
      novo[slug] = null; // não achou — segue a vida
    }
    await new Promise((r) => setTimeout(r, 400)); // gentil com a API
  }
  cacheTVL = { ts: agora, dados: novo };
  return cacheTVL.dados;
}

// ------------------------------------------------------------
// Preço de fallback para moedas FORA da Binance (ex: AERO).
// Usa o cache de market cap (que já traz current_price).
// ------------------------------------------------------------
async function precoFallback(cgId) {
  const dados = await enriquecerMarketCap([cgId]);
  const d = dados[cgId];
  if (!d) return null;
  return { usd: d.preco, usd_24h_change: d.variacao24h, usd_market_cap: d.marketCap, usd_24h_vol: 0 };
}

// ------------------------------------------------------------
// Lista as top moedas direto do CoinGecko (usado quando a Binance
// está bloqueada por região). Devolve no formato que o app espera.
// ------------------------------------------------------------
let cacheListaCG = { ts: 0, dados: [] };
async function listarTopMoedas() {
  // cache de 6h para não bater no limite
  if (Date.now() - cacheListaCG.ts < 6 * 60 * 60 * 1000 && cacheListaCG.dados.length) {
    return cacheListaCG.dados;
  }
  const r = await get(`${CG}/coins/markets`, {
    vs_currency: 'usd', order: 'market_cap_desc', per_page: 250, page: 1, sparkline: false,
  });
  const lista = r.data.map((c, idx) => ({
    id: c.id,
    nome: c.name,
    simbolo: (c.symbol || '').toUpperCase(),
    imagem: c.image || '',
    rank: c.market_cap_rank || idx + 1,
  }));
  cacheListaCG = { ts: Date.now(), dados: lista };
  return lista;
}

module.exports = {
  MOEDAS_FORA_BINANCE,
  SIMBOLO_PARA_CG,
  SIMBOLO_PARA_LLAMA,
  enriquecerMarketCap,
  enriquecerTVL,
  precoFallback,
  listarTopMoedas,
};
