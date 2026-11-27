import test from 'node:test';
import assert from 'node:assert/strict';
import { runAIInvestmentCommittee, type AgentRequest, type AICommitteeAgent } from './aiInvestmentCommittee.ts';
import type { MultiAssetEvidencePack } from './multiAssetEvidencePack.ts';
const now=Date.UTC(2026,10,27,19);
function pack(assetClass:'STOCK'|'OPTION'='STOCK',allowNewEntries=true):MultiAssetEvidencePack{
 const evidence=assetClass==='STOCK'
 ?{symbol:'AAPL',market:{provider:'fixture',retrievedAt:now-1000,timeframe:'1d',candles:[{close:250}],payloadSha256:'a'.repeat(64)}}
 :{contract:{occSymbol:'AAPL261218C00250000',underlyingSymbol:'AAPL',optionType:'CALL' as const,expirationDate:'2026-12-18',strike:250,multiplier:100},quote:{bid:5,ask:5.2,volume:100,openInterest:1000,impliedVolatility:.3,greeks:{delta:.5,gamma:.02,theta:-.1,vega:.1},quoteAt:now-1000,underlyingPrice:252},market:{provider:'fixture',retrievedAt:now-1000,payloadSha256:'b'.repeat(64)}};
 return {schemaVersion:'1.0.0',packId:'c'.repeat(64),assetClass,symbol:'AAPL',generatedAt:now,asOf:now-1000,
 sources:[{kind:'market',provider:'fixture',retrievedAt:now-1000}],
 risk:{evaluatedAt:now-500,allowNewEntries,status:allowNewEntries?'OK':'HALTED',reasons:allowNewEntries?[]:['daily loss limit'],policyVersion:'risk-v1'},
 evidence,canonicalSha256:'c'.repeat(64)} as MultiAssetEvidencePack;
}
function assessment(request:AgentRequest){
 return {role:request.role,packId:request.evidencePack.packId,assetClass:request.assetClass,symbol:request.evidencePack.symbol,
 thesis:request.role+' assessment based on supplied evidence.',score:request.role==='BULL'?65:request.role==='BEAR'?-20:10,
 confidence:.7,keyPoints:['Evidence pack reviewed'],risks:['Data limitations'],evidenceSourceIndexes:[0],
 ...(request.role==='RISK'?{riskDisposition:'ACCEPT',restrictions:[]}:{}),model:'test-model',promptVersion:'test-v1'};
}
const goodAgent:AICommitteeAgent={assess:async request=>assessment(request)};
test('runs all four roles on same STOCK evidence pack',async()=>{
 const requests:AgentRequest[]=[];
 const result=await runAIInvestmentCommittee({evidencePack:pack(),agent:{assess:async request=>{requests.push(request);return assessment(request);}},now:()=>now+100});
 assert.equal(result.status,'COMPLETE');assert.deepEqual(result.assessments.map(x=>x.role),['STRATEGIST','BULL','BEAR','RISK']);
 assert.equal(new Set(requests.map(x=>x.evidencePack.packId)).size,1);assert.equal(new Set(requests.map(x=>x.assetClass)).size,1);
});
test('runs an asset-specific committee for OPTION contracts',async()=>{
 const result=await runAIInvestmentCommittee({evidencePack:pack('OPTION'),agent:goodAgent,now:()=>now+100});
 assert.equal(result.assetClass,'OPTION');assert.equal(result.status,'COMPLETE');
});
test('deterministic risk veto blocks committee regardless of agent optimism',async()=>{
 const result=await runAIInvestmentCommittee({evidencePack:pack('STOCK',false),agent:goodAgent,now:()=>now+100});
 assert.equal(result.status,'BLOCKED');assert.equal(result.deterministicRiskVeto,true);
 assert.ok(result.deterministicRiskReasons.includes('EXISTING_RISK_ENGINE_BLOCKS_NEW_ENTRIES'));
});
test('AI risk agent veto blocks committee',async()=>{
 const agent:AICommitteeAgent={assess:async request=>({...assessment(request),...(request.role==='RISK'?{riskDisposition:'VETO'}:{})})};
 const result=await runAIInvestmentCommittee({evidencePack:pack(),agent,now:()=>now+100});assert.equal(result.status,'BLOCKED');
});
test('invalid or missing agent output produces INCOMPLETE',async()=>{
 const agent:AICommitteeAgent={assess:async request=>request.role==='BEAR'?{role:'BULL'}:assessment(request)};
 const result=await runAIInvestmentCommittee({evidencePack:pack(),agent,now:()=>now+100});
 assert.equal(result.status,'INCOMPLETE');assert.deepEqual(result.failedRoles,['BEAR']);
});
test('agent cannot change evidence identity or fabricate source references',async()=>{
 const agent:AICommitteeAgent={assess:async request=>({...assessment(request),packId:'different',evidenceSourceIndexes:[99]})};
 const result=await runAIInvestmentCommittee({evidencePack:pack(),agent,now:()=>now+100});
 assert.equal(result.status,'INCOMPLETE');assert.equal(result.assessments.length,0);
});
test('roles receive distinct instructions and only RISK can return risk disposition',async()=>{
 const requests:AgentRequest[]=[];
 await runAIInvestmentCommittee({evidencePack:pack('OPTION'),agent:{assess:async request=>{requests.push(request);return assessment(request);}},now:()=>now+100});
 assert.equal(new Set(requests.map(x=>x.systemInstruction)).size,4);
 assert.equal(requests.find(x=>x.role==='RISK')?.outputContract.riskDispositionRequired,true);
 assert.equal(requests.find(x=>x.role==='BULL')?.outputContract.riskDispositionRequired,false);
});
