const JSON_HEADERS = {"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
const CORS_HEADERS = {"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type"};
const UNIVERSES = {
 usa:["AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","AVGO","JPM","LLY","V","WMT","XOM","COST","NFLX","ORCL","AMD","CRM","KO","DIS"],
 france:["AIR.PA","TTE.PA","MC.PA","OR.PA","BNP.PA","SAN.PA","SU.PA","AI.PA","DG.PA","SAF.PA","CS.PA","CAP.PA","KER.PA","RMS.PA","ACA.PA","ENGI.PA","GLE.PA","VIE.PA"],
 global:["AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","AIR.PA","TTE.PA","MC.PA","OR.PA","BNP.PA","7203.T","9984.T"]
};
const MARKET_COUNTRY={usa:"us",france:"fr",global:"us,fr,gb,de,jp"};
const MARKET_LANGUAGE={usa:"en",france:"fr,en",global:"en,fr"};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,...CORS_HEADERS}})}
function safeMarket(v){return ["usa","france","global"].includes(v)?v:"usa"}
async function fetchJson(url,headers={}){const r=await fetch(url,{headers,signal:AbortSignal.timeout(12000)});if(!r.ok){const body=await r.text();throw new Error(`Fournisseur HTTP ${r.status}: ${body.slice(0,180)}`)}return r.json()}
export default {async fetch(request,env){
 if(request.method==="OPTIONS")return new Response(null,{headers:CORS_HEADERS});
 const url=new URL(request.url);
 try{
  if(url.pathname==="/api/health"&&request.method==="GET")return json({ok:true,providers:{fmp:!!env.FMP_API_KEY,finnhub:!!env.FINNHUB_API_KEY,anthropic:!!env.ANTHROPIC_API_KEY},timestamp:new Date().toISOString()});
  if(url.pathname==="/api/market"&&request.method==="GET"){
   if(!env.FMP_API_KEY)return json({error:"FMP_API_KEY non configurée côté Worker."},503);
   const market=safeMarket(url.searchParams.get("market")),symbols=UNIVERSES[market].join(",");
   const endpoint=`https://financialmodelingprep.com/stable/batch-quote?symbols=${encodeURIComponent(symbols)}&apikey=${encodeURIComponent(env.FMP_API_KEY)}`;
   const [stockResult,indexResult]=await Promise.allSettled([
    fetchJson(endpoint),
    fetchJson("https://financialmodelingprep.com/stable/batch-index-quotes?apikey="+encodeURIComponent(env.FMP_API_KEY))
   ]);
   if(stockResult.status==="rejected")throw stockResult.reason;
   const quotes=(Array.isArray(stockResult.value)?stockResult.value:[]).map(q=>({symbol:q.symbol,name:q.name||q.symbol,price:q.price,change:q.change,changePercentage:q.changePercentage,volume:q.volume,exchange:q.exchange,timestamp:q.timestamp})).filter(q=>Number.isFinite(Number(q.price))&&Number.isFinite(Number(q.changePercentage))).sort((a,b)=>b.changePercentage-a.changePercentage);
   const indexSets={
    usa:[["S&P 500",/S&P 500/i],["NASDAQ COMPOSITE",/NASDAQ Composite/i],["DOW JONES",/Dow Jones Industrial Average/i],["RUSSELL 2000",/Russell 2000/i]],
    france:[["CAC 40",/CAC 40/i],["SBF 120",/SBF 120/i],["CAC MID 60",/CAC Mid 60/i],["EURO STOXX 50",/EURO STOXX 50/i]],
    global:[["MSCI WORLD",/MSCI World/i],["S&P 500",/S&P 500/i],["EURO STOXX 50",/EURO STOXX 50/i],["NIKKEI 225",/Nikkei 225/i]]
   };
   const allIndexes=indexResult.status==="fulfilled"&&Array.isArray(indexResult.value)?indexResult.value:[];
   const indices=indexSets[market].map(([label,pattern])=>{const q=allIndexes.find(item=>pattern.test(String(item.name||""))||pattern.test(String(item.symbol||"")));return q&&Number.isFinite(Number(q.price))?{label,symbol:q.symbol,name:q.name,price:q.price,changePercentage:q.changePercentage??(Number(q.change)&&Number(q.price)?100*Number(q.change)/(Number(q.price)-Number(q.change)):0),timestamp:q.timestamp}:null}).filter(Boolean);
   return json({market,quotes,indices,source:"Financial Modeling Prep",asOf:new Date().toISOString(),universeSize:UNIVERSES[market].length,indexSource:indexResult.status==="fulfilled"?"Financial Modeling Prep":"unavailable"});
  }
  if(url.pathname==="/api/news"&&request.method==="GET"){
   if(!env.FINNHUB_API_KEY)return json({error:"FINNHUB_API_KEY non configurée côté Worker."},503);
   const market=safeMarket(url.searchParams.get("market"));
   const params=new URLSearchParams({category:"general",token:env.FINNHUB_API_KEY});
   const raw=await fetchJson(`https://finnhub.io/api/v1/news?${params.toString()}`);
   const articles=(Array.isArray(raw)?raw:[]).slice(0,30).map(a=>({uuid:String(a.id),title:a.headline,description:a.summary||"",url:a.url,source:a.source,published_at:a.datetime?new Date(a.datetime*1000).toISOString():null,entities:[]}));
   return json({market,articles,found:articles.length,source:"Finnhub",asOf:new Date().toISOString()});
  }
  if(url.pathname==="/api/analyze"&&request.method==="POST"){
   if(!env.ANTHROPIC_API_KEY)return json({error:"ANTHROPIC_API_KEY non configurée côté Worker."},503);
   const body=await request.json(),question=String(body.question||"").trim().slice(0,2500);
   if(question.length<8)return json({error:"La question doit contenir au moins 8 caractères."},400);
   const horizon=String(body.horizon||"short").slice(0,30),market=safeMarket(body.market);
   const articles=Array.isArray(body.articles)?body.articles.slice(0,8).map(a=>({title:String(a.title||"").slice(0,300),description:String(a.description||"").slice(0,700),url:String(a.url||"").slice(0,500),published_at:String(a.published_at||"")})):[];
   const system="Tu es un assistant de recherche financière prudent. Tu n'es pas conseiller financier et tu ne dois jamais présenter une hypothèse comme un fait ni promettre une performance. Réponds en français. Distingue explicitement les faits fournis et informations manquantes, les mécanismes économiques plausibles, l'exposition directe et indirecte, les scénarios optimiste/central/pessimiste et leurs conditions d'invalidation, les risques et contre-arguments, ainsi que les données supplémentaires à vérifier. N'invente ni chiffres, ni cours, ni probabilités, ni sources. Les URLs fournies sont des pistes à consulter, pas une preuve que leur contenu complet a été lu. Aucune recommandation personnalisée d'achat ou de vente.";
   const user=`Marché : ${market}. Horizon : ${horizon}.\nQuestion : ${question}\n\nArticles (métadonnées et extraits non vérifiés indépendamment) :\n${JSON.stringify(articles,null,2)}\n\nConstruis une analyse rigoureuse et signale les limites.`;
   const model=env.ANTHROPIC_MODEL||"claude-sonnet-4-5";
   const response=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model,max_tokens:1800,system,messages:[{role:"user",content:user}]}),signal:AbortSignal.timeout(30000)});
   const payload=await response.json();if(!response.ok)throw new Error(payload.error?.message||`Anthropic HTTP ${response.status}`);
   const analysis=(payload.content||[]).filter(c=>c.type==="text").map(c=>c.text).join("\n\n");
   return json({analysis,model:payload.model||model,usage:payload.usage||null,source:"Anthropic Claude"});
  }
  return json({error:"Route introuvable."},404);
 }catch(error){return json({error:error.message||"Erreur interne du Worker."},502)}
}};
