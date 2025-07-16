// api/cron/update-crypto-data.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class CachingLunarCrushService {
  constructor() {
    this.baseURL = 'https://lunarcrush.com/api4/public';
    this.apiKey = process.env.LUNARCRUSH_API_KEY; // Server-side env var
  }

  async makeRequest(endpoint, params = {}) {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting

    const url = new URL(`${this.baseURL}${endpoint}`);
    if (this.apiKey) {
      url.searchParams.append('key', this.apiKey);
    }
    
    Object.keys(params).forEach(key => {
      if (params[key] !== undefined && params[key] !== null) {
        url.searchParams.append(key, params[key]);
      }
    });

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    return await response.json();
  }

  async cacheTrendsData() {
    console.log('🔄 Caching trends data...');
    
    const [trendingCoins, topCreators, hotSectors, galaxyLeaders] = await Promise.all([
      this.makeRequest('/coins/list/v1'),
      this.makeRequest('/category/cryptocurrencies/creators/v1'),
      this.makeRequest('/categories/list/v1'),
      this.makeRequest('/coins/list/v1')
    ]);

    // Apply your filtering logic
    const blacklist = [
      'MEXC', 'eToro', 'Power Slap', 'powerslap', 'KRSNA', 'CoinEx', 'KuCoin', 'Luno', 
      'Binance', 'Coinbase', 'Kraken', 'ESPN', 'Fox News', 'CNN', 'NBC',
      'ABC', 'CBS', 'OKX', 'Bybit', 'Gate.io', 'Huobi', 'bitgetglobal', 'cryptocom',
      'Bitget', 'Crypto.com', "Bitcoinmagazine", "fantompro1", "Cointelegraph"
    ];
    
    const filteredCreators = (topCreators?.data || []).filter(creator => 
      !blacklist.some(blocked => 
        creator.creator_name?.toLowerCase().includes(blocked.toLowerCase())
      )
    ).slice(0, 10);

    const sortedCoins = (trendingCoins?.data || [])
      .filter(coin => coin.interactions_24h > 0)
      .sort((a, b) => (b.interactions_24h || 0) - (a.interactions_24h || 0))
      .slice(0, 10);

    const alphaLeaders = (galaxyLeaders?.data || [])
      .filter(coin => coin.galaxy_score >= 60)
      .sort((a, b) => (b.galaxy_score || 0) - (a.galaxy_score || 0))
      .slice(0, 10);

    // Cache individual endpoints
    await Promise.all([
      this.cacheData('trends_trending_coins', '/coins/list/v1', sortedCoins),
      this.cacheData('trends_top_creators', '/category/cryptocurrencies/creators/v1', filteredCreators),
      this.cacheData('trends_hot_sectors', '/categories/list/v1', (hotSectors?.data || []).slice(0, 8)),
      this.cacheData('trends_galaxy_leaders', '/coins/list/v1', alphaLeaders)
    ]);

    console.log('✅ Trends data cached');
  }

  async cacheMarketData() {
    console.log('🔄 Caching market data...');
    
    const [allCoins, cryptoCategory, defiCategory, galaxyLeaders] = await Promise.all([
      this.makeRequest('/coins/list/v1'),
      this.makeRequest('/category/cryptocurrencies/v1'),
      this.makeRequest('/category/defi/v1'),
      this.makeRequest('/coins/list/v1')
    ]);

    const coins = allCoins?.data || [];

    const topGainers = [...coins]
      .filter(coin => coin.percent_change_24h > 0)
      .sort((a, b) => (b.percent_change_24h || 0) - (a.percent_change_24h || 0))
      .slice(0, 10);

    const altRankChampions = [...coins]
      .filter(coin => coin.alt_rank)
      .sort((a, b) => (a.alt_rank || 999999) - (b.alt_rank || 999999))
      .slice(0, 10);

    const sentimentLeaders = [...coins]
      .filter(coin => coin.sentiment)
      .sort((a, b) => (b.sentiment || 0) - (a.sentiment || 0))
      .slice(0, 10);

    await Promise.all([
      this.cacheData('market_top_gainers', '/coins/list/v1', topGainers),
      this.cacheData('market_crypto_category', '/category/cryptocurrencies/v1', cryptoCategory?.data || []),
      this.cacheData('market_defi_category', '/category/defi/v1', defiCategory?.data || []),
      this.cacheData('market_altrank_champions', '/coins/list/v1', altRankChampions),
      this.cacheData('market_sentiment_leaders', '/coins/list/v1', sentimentLeaders)
    ]);

    console.log('✅ Market data cached');
  }

  async cacheLatestData() {
    console.log('🔄 Caching latest data...');
    
    const [bitcoinData, ethereumData, solanaData, cryptoNews, cryptoPosts] = await Promise.all([
      this.makeRequest('/topic/bitcoin/v1'),
      this.makeRequest('/topic/ethereum/v1'),
      this.makeRequest('/topic/solana/v1'),
      this.makeRequest('/category/cryptocurrencies/news/v1'),
      this.makeRequest('/category/cryptocurrencies/posts/v1')
    ]);

    const processedNews = (cryptoNews?.data || []).slice(0, 15).map(article => ({
      id: article.id,
      post_type: article.post_type,
      post_title: article.post_title,
      post_link: article.post_link,
      post_image: article.post_image,
      post_created: article.post_created,
      post_sentiment: article.post_sentiment,
      creator_id: article.creator_id,
      creator_name: article.creator_name,
      creator_display_name: article.creator_display_name,
      creator_followers: article.creator_followers,
      creator_avatar: article.creator_avatar,
      interactions_24h: article.interactions_24h,
      interactions_total: article.interactions_total
    }));

    const processedPosts = (cryptoPosts?.data || []).slice(0, 10).map(post => ({
      id: post.id,
      post_type: post.post_type,
      post_title: post.post_title,
      post_link: post.post_link,
      post_image: post.post_image,
      post_created: post.post_created,
      post_sentiment: post.post_sentiment,
      creator_id: post.creator_id,
      creator_name: post.creator_name,
      creator_display_name: post.creator_display_name,
      creator_followers: post.creator_followers,
      creator_avatar: post.creator_avatar,
      interactions_24h: post.interactions_24h,
      interactions_total: post.interactions_total
    }));

    await Promise.all([
      this.cacheData('latest_bitcoin', '/topic/bitcoin/v1', bitcoinData?.data || null),
      this.cacheData('latest_ethereum', '/topic/ethereum/v1', ethereumData?.data || null),
      this.cacheData('latest_solana', '/topic/solana/v1', solanaData?.data || null),
      this.cacheData('latest_crypto_news', '/category/cryptocurrencies/news/v1', processedNews),
      this.cacheData('latest_crypto_posts', '/category/cryptocurrencies/posts/v1', processedPosts)
    ]);

    console.log('✅ Latest data cached');
  }

  async cacheData(cacheKey, endpointUrl, data) {
    try {
      const { error } = await supabase
        .from('crypto_cache')
        .upsert({
          cache_key: cacheKey,
          endpoint_url: endpointUrl,
          data: data,
          updated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
          response_status: 'success'
        }, {
          onConflict: 'cache_key'
        });

      if (error) {
        console.error(`❌ Failed to cache ${cacheKey}:`, error);
        throw error;
      }
    } catch (error) {
      console.error(`❌ Cache error for ${cacheKey}:`, error);
      throw error;
    }
  }

  async updateCacheStatus(status, successCount = 0, failedCount = 0, errorMessage = null) {
    const { error } = await supabase
      .from('crypto_cache_status')
      .upsert({
        id: 1, // Single status record
        status: status,
        successful_endpoints: successCount,
        failed_endpoints: failedCount,
        error_message: errorMessage,
        last_full_update: status === 'complete' ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      });

    if (error) {
      console.error('❌ Failed to update cache status:', error);
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const service = new CachingLunarCrushService();
  
  try {
    console.log('🚀 Starting crypto data cache update...');
    await service.updateCacheStatus('updating', 0, 0);

    let successCount = 0;
    let failedCount = 0;
    const errors = [];

    // Cache all data with error handling
    try {
      await service.cacheTrendsData();
      successCount += 4; // trends has 4 endpoints
    } catch (error) {
      console.error('❌ Trends caching failed:', error);
      failedCount += 4;
      errors.push(`Trends: ${error.message}`);
    }

    try {
      await service.cacheMarketData();
      successCount += 4; // market has 4 endpoints (we're counting logical endpoints)
    } catch (error) {
      console.error('❌ Market caching failed:', error);
      failedCount += 4;
      errors.push(`Market: ${error.message}`);
    }

    try {
      await service.cacheLatestData();
      successCount += 5; // latest has 5 endpoints
    } catch (error) {
      console.error('❌ Latest caching failed:', error);
      failedCount += 5;
      errors.push(`Latest: ${error.message}`);
    }

    // Update final status
    const finalStatus = failedCount === 0 ? 'complete' : 'partial';
    const errorMessage = errors.length > 0 ? errors.join('; ') : null;
    
    await service.updateCacheStatus(finalStatus, successCount, failedCount, errorMessage);

    console.log(`✅ Cache update complete: ${successCount} success, ${failedCount} failed`);
    
    res.status(200).json({
      success: true,
      status: finalStatus,
      successfulEndpoints: successCount,
      failedEndpoints: failedCount,
      errors: errors
    });

  } catch (error) {
    console.error('❌ Critical cache update error:', error);
    await service.updateCacheStatus('error', 0, 13, error.message);
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}