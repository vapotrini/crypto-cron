// crypto-cache.js  –  lean 10-call version
const { createClient } = require('@supabase/supabase-js');

// ─── Supabase ────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── Helpers ────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Caching service ────────────────────────────────────────────────────────
class CachingLunarCrushService {
  constructor() {
    this.baseURL  = 'https://lunarcrush.com/api4/public';
    this.apiKey   = process.env.LUNARCRUSH_API_KEY;
    this._coins   = null;                 // in-memory cache for /coins/list
  }

  /** GET with automatic 429 retry (0 s → 10 s → 20 s). */
  async makeRequest(endpoint, params = {}) {
    let delay = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (delay) {
        console.log(`⏳  429 back-off – waiting ${delay / 1000}s … (${attempt}/2)`);
        await sleep(delay);
      }

      const url = new URL(`${this.baseURL}${endpoint}`);
      if (this.apiKey) url.searchParams.append('key', this.apiKey);
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.append(k, v);
      });

      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' }
      });

      if (res.status === 429) { delay = delay ? delay * 2 : 10_000; continue; }
      if (!res.ok) throw new Error(`API request failed: ${res.status}`);
      return res.json();
    }
    throw new Error('API request failed: 429 (after 3 attempts)');
  }

  /* --- shared coins list (1 call total) ----------------------------------- */
  async getCoinsList() {
    if (!this._coins) this._coins = await this.makeRequest('/coins/list/v1');
    return this._coins;
  }

  /* ───────────── Trends (3 calls) ───────────────────────────────────────── */
  async cacheTrendsData() {
    console.log('🔄 Caching trends data…');

    const [coinsList, topCreators, hotSectors] = await Promise.all([
      this.getCoinsList(),                                         // 1
      this.makeRequest('/category/cryptocurrencies/creators/v1'),  // 2
      this.makeRequest('/categories/list/v1')                      // 3
    ]);

    const blacklist = [
      'mexc','etoro','power slap','krsna','coinex','kucoin','luno',
      'binance','coinbase','kraken','espn','fox news','cnn','nbc','abc','cbs',
      'okx','bybit','gate.io','huobi','bitgetglobal','cryptocom',
      'bitget','crypto.com','bitcoinmagazine','fantompro1','cointelegraph'
    ];

    const filteredCreators = (topCreators?.data || [])
      .filter(c => !blacklist.some(b => c.creator_name?.toLowerCase().includes(b)))
      .slice(0, 10);

    const sortedCoins = (coinsList?.data || [])
      .filter(c => c.interactions_24h > 0)
      .sort((a, b) => (b.interactions_24h || 0) - (a.interactions_24h || 0))
      .slice(0, 10);

    const alphaLeaders = (coinsList?.data || [])
      .filter(c => c.galaxy_score >= 60)
      .sort((a, b) => (b.galaxy_score || 0) - (a.galaxy_score || 0))
      .slice(0, 10);

    await Promise.all([
      this.cacheData('trends_trending_coins', '/coins/list/v1', sortedCoins),
      this.cacheData('trends_top_creators',
                     '/category/cryptocurrencies/creators/v1', filteredCreators),
      this.cacheData('trends_hot_sectors', '/categories/list/v1',
                     (hotSectors?.data || []).slice(0, 8)),
      this.cacheData('trends_galaxy_leaders', '/coins/list/v1', alphaLeaders)
    ]);

    console.log('✅ Trends data cached');
    return 4;
  }

  /* ───────────── Market (2 more calls) ───────────────────────────────────── */
  async cacheMarketData() {
    console.log('🔄 Caching market data…');

    const [coinsList, cryptoCat, defiCat] = await Promise.all([
      this.getCoinsList(),                                         // (cached)
      this.makeRequest('/category/cryptocurrencies/v1'),           // 4
      this.makeRequest('/category/defi/v1')                        // 5
    ]);

    const coins = coinsList?.data || [];

    const topGainers = [...coins]
      .filter(c => c.percent_change_24h > 0)
      .sort((a, b) => (b.percent_change_24h || 0) - (a.percent_change_24h || 0))
      .slice(0, 10);

    const altRankChampions = [...coins]
      .filter(c => c.alt_rank)
      .sort((a, b) => (a.alt_rank || 999999) - (b.alt_rank || 999999))
      .slice(0, 10);

    const sentimentLeaders = [...coins]
      .filter(c => c.sentiment)
      .sort((a, b) => (b.sentiment || 0) - (a.sentiment || 0))
      .slice(0, 10);

    await Promise.all([
      this.cacheData('market_top_gainers', '/coins/list/v1', topGainers),
      this.cacheData('market_crypto_category', '/category/cryptocurrencies/v1',
                     cryptoCat?.data || []),
      this.cacheData('market_defi_category', '/category/defi/v1',
                     defiCat?.data || []),
      this.cacheData('market_altrank_champions', '/coins/list/v1', altRankChampions),
      this.cacheData('market_sentiment_leaders', '/coins/list/v1', sentimentLeaders)
    ]);

    console.log('✅ Market data cached');
    return 5;
  }

  /* ───────────── Latest (5 calls) ───────────────────────────────────────── */
  async cacheLatestData() {
    console.log('🔄 Caching latest data…');

    const [btc, eth, sol, news, posts] = await Promise.all([
      this.makeRequest('/topic/bitcoin/v1'),                       // 6
      this.makeRequest('/topic/ethereum/v1'),                      // 7
      this.makeRequest('/topic/solana/v1'),                        // 8
      this.makeRequest('/category/cryptocurrencies/news/v1'),      // 9
      this.makeRequest('/category/cryptocurrencies/posts/v1')      // 10
    ]);

    const processedNews  = (news?.data  || []).slice(0,15);
    const processedPosts = (posts?.data || []).slice(0,10);

    await Promise.all([
      this.cacheData('latest_bitcoin',  '/topic/bitcoin/v1',  btc?.data   || null),
      this.cacheData('latest_ethereum', '/topic/ethereum/v1', eth?.data   || null),
      this.cacheData('latest_solana',   '/topic/solana/v1',   sol?.data   || null),
      this.cacheData('latest_crypto_news',  '/category/cryptocurrencies/news/v1',
                   processedNews),
      this.cacheData('latest_crypto_posts', '/category/cryptocurrencies/posts/v1',
                   processedPosts)
    ]);

    console.log('✅ Latest data cached');
    return 5;
  }

  /* ───────────── Supabase write helper ───────────────────────────────────── */
  async cacheData(cacheKey, endpointUrl, data) {
    const { error } = await supabase.from('crypto_cache').upsert(
      {
        cache_key   : cacheKey,
        endpoint_url: endpointUrl,
        data,
        updated_at  : new Date().toISOString(),
        expires_at  : new Date(Date.now() + 3 * 60 * 60 * 1e3).toISOString(), // +3 hours
        response_status: 'success'
      },
      { onConflict: 'cache_key' }
    );
    if (error) throw error;
  }

  async updateCacheStatus(status, ok = 0, fail = 0, msg = null) {
    await supabase.from('crypto_cache_status').upsert(
      {
        id: 1,
        status,
        successful_endpoints: ok,
        failed_endpoints    : fail,
        error_message       : msg,
        last_full_update    : status === 'complete' ? new Date().toISOString() : undefined,
        updated_at          : new Date().toISOString()
      },
      { onConflict: 'id' }
    );
  }
}

// ─── Main runner ────────────────────────────────────────────────────────────
(async () => {
  const svc = new CachingLunarCrushService();
  try {
    console.log('🚀 Starting crypto data cache update…');
    await svc.updateCacheStatus('updating');

    let ok = 0, fail = 0, errs = [];

    const steps = [
      [svc.cacheTrendsData.bind(svc), 4],
      [svc.cacheMarketData.bind(svc), 5],
      [svc.cacheLatestData.bind(svc), 5]
    ];

    for (const [fn, expect] of steps) {
      try { ok += await fn(); }
      catch (e) { console.error(e.message); fail += expect; errs.push(e.message); }
    }

    const status = fail ? 'partial' : 'complete';
    await svc.updateCacheStatus(status, ok, fail, errs.join('; ') || null);
    console.log(`✅ Cache update complete: ${ok} success, ${fail} failed`);
    process.exit(0);
  } catch (err) {
    console.error('🔥 Critical failure:', err);
    await svc.updateCacheStatus('error', 0, 14, err.message);
    process.exit(1);
  }
})();