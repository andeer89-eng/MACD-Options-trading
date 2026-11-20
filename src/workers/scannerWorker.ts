/**
 * Web Worker for background processing of scanner results.
 * Offloads heavy filtering/calculation from the main UI thread.
 */

import { AlertLogItem } from '../components/AlertStream';

self.onmessage = async (event: MessageEvent) => {
  const { taskId, tickers, filters } = event.data;
  
  try {
    // 1. Fetch data
    const results = await fetchResults(tickers);
    
    // 2. Perform intensive processing
    const processedResults = processResults(results, filters);
    
    self.postMessage({ taskId, result: processedResults });
  } catch (error: any) {
    self.postMessage({ taskId, error: error.message });
  }
};

async function fetchResults(tickers: string[]) {
  // Deduplicate tickers before sending
  const uniqueTickers = Array.from(new Set((tickers || []).map((t) => t.trim().toUpperCase())));
  // Parallel fetch using the backend API
  const res = await fetch('/api/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tickers: uniqueTickers, timeframe: '1d' }),
  });
  if (!res.ok) {
    throw new Error(`Scan API responded with status ${res.status}`);
  }
  const text = await res.text();
  if (text.trim().startsWith('<')) {
    throw new Error('Scan API returned HTML instead of JSON');
  }
  const data = JSON.parse(text);
  return data.results || [];
}

function processResults(results: any[], filters: any) {
  return results.filter((item) => {
    if (filters.minScore && (item.setups?.[0]?.qualityScore || 0) < filters.minScore) {
      return false;
    }
    return true;
  });
}
