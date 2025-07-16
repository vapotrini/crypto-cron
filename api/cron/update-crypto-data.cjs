// api/cron/update-crypto-data.cjs
/* eslint-disable no-console */

// ────────────────────────────────
// 0. IMPORTS
// ────────────────────────────────
const { createClient } = require('@supabase/supabase-js');

// (GitHub runners already have fetch in Node 20; remove the next line if not needed.)
// global.fetch ??= (...a) => import('node-fetch').then(m => m.default(...a));

// ────────────────────────────────
// 1. ENV-VAR CHECKS
// ────────────────────────────────
const SUPABASE_URL                  = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY     = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const LUNARCRUSH_API_KEY            = process.env.EXPO_PUBLIC_LUNARCRUSH_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !LUNARCRUSH_API_KEY) {
  console.error(
    '❌  Missing env vars: EXPO_PUBLIC_SUPABASE_URL, ' +
    'EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY, EXPO_PUBLIC_LUNARCRUSH_API_KEY',
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ────────────────────────────────
// 2. LUNARCRUSH CACHING SERVICE
// ────────────────────────────────
class CachingLunarCrushService {
  constructor() {
    this.baseURL = 'https://lunarcrush.com/api4/public';
    this.apiKey  = LUNARCRUSH_API_KEY;
  }

  /* generic fetch helper — 1 sec throttle */
  async makeRequest(endpoint, params = {}) {
    await new Promise(r => setTimeout(r, 1_000));          // rudimentary rate-limit

    const url = new URL(`${this.baseURL}${endpoint}`);
    url.searchParams.append('key', this.apiKey);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.append(k, v);
    }

    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${endpoint} → HTTP ${res.status}`);
    return res.json();
  }

  /* ── group: TRENDS ───────────────────────────────────── */
  async cacheTrendsData() {
    console.log('🔄  Caching trends data…');

    const [trendingCoins, topCreators, hotSectors, galaxyLeaders] = await Promise.all([
      this.makeRequest('/coins/list/v1'),
      this.makeRequest('/category/cryptocurrencies/creators/v1'),
      this.makeRequest('/categories/list/v1'),
      this.makeRequest('/coins/list/v1'),
    ]);

    /* blacklist filter */
    const blacklist = [
      'mexc','etoro','power slap','powerslap','krsna','coinex','kucoin','luno',
      'binance','coinbase','kraken','espn','fox news','cnn','nbc',
      'abc','cbs','okx','bybit','gate.io','huobi','bitgetglobal','cryptocom',
      'bitget','crypto.com','bitcoinmagazine','fantompro1','cointelegraph',
    ];

    const filteredCreators = (topCreators?.data || []).filter(c =>
      !blacklist.some(b => c.creator_name?.toLowerCase().includes(b)),
    ).slice(0, 10);

    const sortedCoins = (trendingCoins?.data || [])
      .filter(c => c.interactions_24h > 0)
      .sort((a, b) => (b.interactions_24h || 0) - (a.interactions_24h || 0))
      .slice(0, 10);

    const alphaLeaders = (galaxyLeaders?.data || [])
      .filter(c => c.galaxy_score >= 60)
      .sort((a, b) => (b.galaxy_score || 0) - (a.galaxy_score || 0))
      .slice(0, 10);

    await Promise.all([
      this.cacheData('trends_trending_coins',   '/coins/list/v1', sortedCoins),
      this.cacheData('trends_top_creators',     '/category/cryptocurrencies/creators/v1', filteredCreators),
      this.cacheData('trends_hot_sectors',      '/categories/list/v1', (hotSectors?.data || []).slice(0, 8)),
      this.cacheData('trends_galaxy_leaders',   '/coins/list/v1', alphaLeaders),
    ]);

    console.log('✅  Trends cached');
  }

  /* ── group: MARKET ───────────────────────────────────── */
  async cacheMarketData() {
    console.log('🔄  Caching market data…');

    const [allCoins, cryptoCategory, defiCategory] = await Promise.all([
      this.makeRequest('/coins/list/v1'),
      this.makeRequest('/category/cryptocurrencies/v1'),
      this.makeRequest('/category/defi/v1'),
    ]);

    const coins = allCoins?.data || [];

    const topGainers = [...coins]
      .filter(c => c.percent_change_24h > 0)
      .sort((a, b) => (b.percent_change_24h || 0) - (a.percent_change_24h || 0))
      .slice(0, 10);

    const altRankChampions = [...coins]
      .filter(c => c.alt_rank)
      .sort((a, b) => (a.alt_rank || 1e9) - (b.alt_rank || 1e9))
      .slice(0, 10);

    const sentimentLeaders = [...coins]
      .filter(c => c.sentiment)
      .sort((a, b) => (b.sentiment || 0) - (a.sentiment || 0))
      .slice(0, 10);

    await Promise.all([
      this.cacheData('market_top_gainers',        '/coins/list/v1', topGainers),
      this.cacheData('market_crypto_category',    '/category/cryptocurrencies/v1', cryptoCategory?.data || []),
      this.cacheData('market_defi_category',      '/category/defi/v1', defiCategory?.data || []),
      this.cacheData('market_altrank_champions',  '/coins/list/v1', altRankChampions),
      this.cacheData('market_sentiment_leaders',  '/coins/list/v1', sentimentLeaders),
    ]);

    console.log('✅  Market cached');
  }

  /* ── group: LATEST ───────────────────────────────────── */
  async cacheLatestData() {
    console.log('🔄  Caching latest data…');

    const [btc, eth, sol, news, posts] = await Promise.all([
      this.makeRequest('/topic/bitcoin/v1'),
      this.makeRequest('/topic/ethereum/v1'),
      this.makeRequest('/topic/solana/v1'),
      this.makeRequest('/category/cryptocurrencies/news/v1'),
      this.makeRequest('/category/cryptocurrencies/posts/v1'),
    ]);

    const trimFeed = (arr, n) => (arr || []).slice(0, n).map(p => ({
      id: p.id,
      post_type: p.post_type,
      post_title: p.post_title,
      post_link: p.post_link,
      post_image: p.post_image,
      post_created: p.post_created,
      post_sentiment: p.post_sentiment,
      creator_id: p.creator_id,
      creator_name: p.creator_name,
      creator_display_name: p.creator_display_name,
      creator_followers: p.creator_followers,
      creator_avatar: p.creator_avatar,
      interactions_24h: p.interactions_24h,
      interactions_total: p.interactions_total,
    }));

    await Promise.all([
      this.cacheData('latest_bitcoin',        '/topic/bitcoin/v1', btc?.data   || null),
      this.cacheData('latest_ethereum',       '/topic/ethereum/v1', eth?.data  || null),
      this.cacheData('latest_solana',         '/topic/solana/v1',   sol?.data  || null),
      this.cacheData('latest_crypto_news',    '/category/cryptocurrencies/news/v1',  trimFeed(news?.data, 15)),
      this.cacheData('latest_crypto_posts',   '/category/cryptocurrencies/posts/v1', trimFeed(posts?.data, 10)),
    ]);

    console.log('✅  Latest cached');
  }

  /* ── helper: UPSERT one record into Supabase ─────────── */
  async cacheData(cacheKey, endpoint, data) {
    const { error } = await supabase.from('crypto_cache').upsert(
      {
        cache_key: cacheKey,
        endpoint_url: endpoint,
        data,
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(), // +10 min
        response_status: 'success',
      },
      { onConflict: 'cache_key' },
    );
    if (error) throw new Error(`${cacheKey} → ${error.message}`);
  }

  /* ── helper: status row (id = 1) ─────────────────────── */
  async updateCacheStatus(status, ok = 0, fail = 0, msg = null) {
    const { error } = await supabase.from('crypto_cache_status').upsert(
      {
        id: 1,
        status,
        successful_endpoints: ok,
        failed_endpoints: fail,
        error_message: msg,
        last_full_update: status === 'complete' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
    if (error) console.error('Status-row upsert failed:', error.message);
  }
}

// ────────────────────────────────
// 3. MAIN ENTRY POINT
// ────────────────────────────────
(async () => {
  const svc = new CachingLunarCrushService();

  try {
    console.log('🚀  Starting crypto-cache refresh…');
    await svc.updateCacheStatus('updating');

    let ok = 0, fail = 0, errs = [];

    const wrap = async (fn, count) => {
      try       { await fn(); ok   += count; }
      catch (e) { fail += count; errs.push(e.message); console.error(e.message); }
    };

    await wrap(() => svc.cacheTrendsData(),  4);
    await wrap(() => svc.cacheMarketData(),  4);
    await wrap(() => svc.cacheLatestData(),  5);

    const final = fail ? 'partial' : 'complete';
    await svc.updateCacheStatus(final, ok, fail, errs.join('; '));

    console.log(`🏁  Finished — ${ok} ok, ${fail} failed`);
    if (fail) process.exit(1);              // mark GHA run red if anything failed
  } catch (fatal) {
    console.error('💥  Fatal error:', fatal);
    await svc.updateCacheStatus('error', 0, 13, fatal.message);
    process.exit(1);
  }
})();
