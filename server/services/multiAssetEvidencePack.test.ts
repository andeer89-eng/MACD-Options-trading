import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildMultiAssetEvidencePack } from './multiAssetEvidencePack.ts';
const now=Date.UTC(2026,10,27,18);
const digest=(v:string)=>createHash('sha256').update(v).digest('hex');
const source={kind:'market_quote',provider:'fixture',retrievedAt:now-1000,sha256:digest('source')};
const risk={evaluatedAt:now-500,allowNewEntries:true,status:'OK' as const,reasons:[],policyVersion:'risk-v1'};
function stock(){return {assetClass:'STOCK' as const,symbol:'AAPL',generatedAt:now,asOf:now-1000,sources:[source],risk,
 stock:{symbol:'AAPL',market:{provider:'Yahoo Finance',retrievedAt:now-1000,timeframe:'1d',candles:[{close:200}],payloadSha256:digest('stock')},
 technical:{trend:'BULLISH',rsi:58},fundamentals:{asOfDate:'2026-11-27',facts:[{metric:'revenue',value:100,unit:'USD',periodEnd:'2026-09-30',filingDate:'2026-10-30',accession:'0000320193-26-000001',sourceUri:'https://www.sec.gov/Archives/example'}]}}};}
function option(){return {assetClass:'OPTION' as const,symbol:'AAPL',generatedAt:now,asOf:now-1000,sources:[source],risk,
 option:{contract:{occSymbol:'AAPL261218C00250000',underlyingSymbol:'AAPL',optionType:'CALL' as const,expirationDate:'2026-12-18',strike:250,multiplier:100},
 quote:{bid:5.1,ask:5.3,bidSize:10,askSize:12,last:5.2,volume:500,openInterest:1200,impliedVolatility:.32,greeks:{delta:.55,gamma:.02,theta:-.08,vega:.12,rho:.03},quoteAt:now-1000,underlyingPrice:252},
 market:{provider:'Alpaca Options',retrievedAt:now-1000,payloadSha256:digest('option')}}};}
test('builds a stock pack with point-in-time fundamentals provenance',()=>{const r=buildMultiAssetEvidencePack(stock());assert.equal(r.ok,true);if(r.ok){assert.equal(r.pack.assetClass,'STOCK');assert.equal(r.pack.packId,r.pack.canonicalSha256);}});
test('builds an options pack with OCC contract, quote and Greeks',()=>{const r=buildMultiAssetEvidencePack(option());assert.equal(r.ok,true);if(r.ok){assert.equal(r.pack.assetClass,'OPTION');assert.equal((r.pack.evidence as any).contract.occSymbol,'AAPL261218C00250000');}});
test('canonical hash ignores object key insertion order',()=>{const a=stock(),b=stock();a.stock.technical={trend:'BULLISH',rsi:58};b.stock.technical={rsi:58,trend:'BULLISH'};const x=buildMultiAssetEvidencePack(a),y=buildMultiAssetEvidencePack(b);assert.equal(x.ok&&y.ok?x.pack.canonicalSha256:null,x.ok&&y.ok?y.pack.canonicalSha256:undefined);});
test('rejects mixed stock and option payloads',()=>{const x={...stock(),option:option().option} as any;assert.equal(buildMultiAssetEvidencePack(x).ok,false);});
test('rejects crossed option markets and non-finite Greeks',()=>{const a=option();a.option.quote.ask=5;assert.equal(buildMultiAssetEvidencePack(a).ok,false);const b=option();b.option.quote.greeks.delta=Number.NaN;assert.equal(buildMultiAssetEvidencePack(b).ok,false);});
test('rejects future source timestamps, missing sources and missing risk policy',()=>{const a=stock();a.stock.market.retrievedAt=now+1;assert.equal(buildMultiAssetEvidencePack(a).ok,false);const b=stock();b.sources=[];assert.equal(buildMultiAssetEvidencePack(b).ok,false);const c=stock();c.risk.policyVersion='';assert.equal(buildMultiAssetEvidencePack(c).ok,false);});
test('rejects fundamentals filed after the as-of date',()=>{const a=stock();a.stock.fundamentals!.facts[0].filingDate='2026-11-28';assert.equal(buildMultiAssetEvidencePack(a).ok,false);});
