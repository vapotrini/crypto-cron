// app/services/cryptoCacheService.js
import { supabase } from '../../hooks/useDatabase';

class CryptoCacheService {
  constructor() {
    console.log('🔧 CryptoCacheService initialized');
  }

  async getCachedData(cacheKey) {
    try {
      const { data, error } = await supabase
        .from('crypto_cache')
        .select('data, updated_at, expires_at')
        .eq('cache_key', cacheKey)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (error || !data) {
        console.log(`📦 No cached data for ${cacheKey}`);
        return null;
      }

      console.log(`✅ Retrieved cached data for ${cacheKey}`);
      return data.data;
    } catch (error) {
      console.error(`❌ Cache retrieval error for ${cacheKey}:`, error);
      return null;
    }
  }

  async getTrendsData() {
    try {
      const [trendingTopics, topCreators, hotSectors, galaxyLeaders] = await Promise.all([
        this.getCachedData('trends_trending_coins'),
        this.getCachedData('trends_top_creators'),
        this.getCachedData('trends_hot_sectors'),
        this.getCachedData('trends_galaxy_leaders')
      ]);

      return {
        trendingTopics: trendingTopics || [],
        topCreators: topCreators || [],
        hotSectors: hotSectors || [],
        galaxyLeaders: galaxyLeaders || []
      };
    } catch (error) {
      console.error('❌ Error getting cached trends data:', error);
      throw error;
    }
  }

  async getMarketData() {
    try {
      const [topGainers, altRankChampions, sentimentLeaders] = await Promise.all([
        this.getCachedData('market_top_gainers'),
        this.getCachedData('market_altrank_champions'),
        this.getCachedData('market_sentiment_leaders')
      ]);

      return {
        topGainers: topGainers || [],
        altRankChampions: altRankChampions || [],
        sentimentLeaders: sentimentLeaders || []
      };
    } catch (error) {
      console.error('❌ Error getting cached market data:', error);
      throw error;
    }
  }

  async getLatestData() {
    try {
      const [bitcoin, ethereum, solana, cryptoNews, viralPosts] = await Promise.all([
        this.getCachedData('latest_bitcoin'),
        this.getCachedData('latest_ethereum'),
        this.getCachedData('latest_solana'),
        this.getCachedData('latest_crypto_news'),
        this.getCachedData('latest_crypto_posts')
      ]);

      return {
        summaries: {
          bitcoin: bitcoin || null,
          ethereum: ethereum || null,
          solana: solana || null
        },
        cryptoNews: cryptoNews || [],
        viralPosts: viralPosts || []
      };
    } catch (error) {
      console.error('❌ Error getting cached latest data:', error);
      throw error;
    }
  }

  async getCacheStatus() {
    try {
      const { data, error } = await supabase
        .from('crypto_cache_status')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.error('❌ Error getting cache status:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('❌ Cache status error:', error);
      return null;
    }
  }

  async isCacheFresh() {
    const status = await this.getCacheStatus();
    if (!status) return false;
    
    // Cache is fresh if updated within last 10 minutes and status is complete
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const lastUpdate = new Date(status.last_full_update);
    
    return status.status === 'complete' && lastUpdate > tenMinutesAgo;
  }
}

export const cryptoCacheService = new CryptoCacheService();