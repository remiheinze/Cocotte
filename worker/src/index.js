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
function xmlText(s=""){return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/\s+/g," ").trim()}
function xmlField(block,name){const m=block.match(new RegExp("<"+name+"(?:\\s+[^>]*)?>([\\s\\S]*?)</"+name+">","i"));return m?xmlText(m[1]):""}
async function fetchRssFeed(feed){
 const response=await fetch(feed.url,{headers:{"user-agent":"Mozilla/5.0 CocotteMarket/1.0","accept":"application/rss+xml, application/xml, text/xml, */*"},signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error(feed.name+" HTTP "+response.status);
 const xml=await response.text(),items=[...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(m=>m[1]);
 return items.map((item,i)=>{
  const title=xmlField(item,"title"),link=xmlField(item,"link")||((item.match(/<link[^>]*href=["']([^"']+)["']/i)||[])[1]||"");
  const description=xmlField(item,"description")||xmlField(item,"content:encoded")||xmlField(item,"summary");
  const rawDate=xmlField(item,"pubDate")||xmlField(item,"dc:date")||xmlField(item,"published")||xmlField(item,"updated");
  const date=rawDate?new Date(rawDate):null;
  return {uuid:feed.id+"-"+i,title,description:description.slice(0,700),url:link,source:feed.name,published_at:date&&!Number.isNaN(date.getTime())?date.toISOString():null,entities:[],language:"fr"};
 }).filter(a=>a.title&&a.url);
}
async function fetchJson(url,headers={}){const r=await fetch(url,{headers,signal:AbortSignal.timeout(12000)});if(!r.ok){const body=await r.text();throw new Error(`Fournisseur HTTP ${r.status}: ${body.slice(0,180)}`)}return r.json()}
export default {async fetch(request,env){
 if(request.method==="OPTIONS")return new Response(null,{headers:CORS_HEADERS});
 const url=new URL(request.url);
 try{
  if(url.pathname==="/api/health"&&request.method==="GET"){
   const [marketCheck,newsCheck]=await Promise.allSettled([
    fetchJson("https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=1d&interval=1d",{"user-agent":"Mozilla/5.0 CocotteMarket/1.0"}),
    fetchRssFeed({id:"health-lesechos",name:"Les Échos",url:"https://services.lesechos.fr/rss/les-echos-economie.xml"})
   ]);
   const marketOk=marketCheck.status==="fulfilled"&&!!marketCheck.value.chart?.result?.[0]?.meta?.regularMarketPrice;
   const newsOk=newsCheck.status==="fulfilled"&&newsCheck.value.length>0;
   return json({ok:true,providers:{marketdata:marketOk,news:newsOk,newsFeeds:newsOk?1:0,finnhub:!!env.FINNHUB_API_KEY,anthropic:!!env.ANTHROPIC_API_KEY},checks:{marketdata:marketOk?"ok":marketCheck.status==="rejected"?marketCheck.reason.message:"no quote",news:newsOk?"ok":newsCheck.status==="rejected"?newsCheck.reason.message:"empty feed"},timestamp:new Date().toISOString()});
  }
  if(url.pathname==="/api/market"&&request.method==="GET"){
   const market=safeMarket(url.searchParams.get("market"));
   const indexSymbols={usa:[["S&P 500","^GSPC"],["NASDAQ COMPOSITE","^IXIC"],["DOW JONES","^DJI"],["RUSSELL 2000","^RUT"]],france:[["CAC 40","^FCHI"],["SBF 120","^SBF120"],["CAC MID 60","^CACMD"],["EURO STOXX 50","^STOXX50E"]],global:[["S&P 500","^GSPC"],["EURO STOXX 50","^STOXX50E"],["NIKKEI 225","^N225"],["FTSE 100","^FTSE"]]}[market];
   const symbols=[...UNIVERSES[market],...indexSymbols.map(x=>x[1])];
   const results=await Promise.allSettled(symbols.map(async symbol=>{
    const payload=await fetchJson("https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(symbol)+"?range=1d&interval=1d",{ "user-agent":"Mozilla/5.0 CocotteMarket/1.0","accept":"application/json"});
    const result=payload.chart?.result?.[0];
    if(!result)throw new Error(payload.chart?.error?.description||"Aucune cotation pour "+symbol);
    const meta=result.meta||{},price=Number(meta.regularMarketPrice),previous=Number(meta.chartPreviousClose??meta.previousClose);
    if(!Number.isFinite(price)||!Number.isFinite(previous)||previous===0)throw new Error("Cours incomplet pour "+symbol);
    return {symbol,name:meta.longName||meta.shortName||symbol,price,change:price-previous,changePercentage:(price-previous)/previous*100,volume:meta.regularMarketVolume??null,exchange:meta.fullExchangeName||meta.exchangeName||"Yahoo Finance",timestamp:meta.regularMarketTime??null,currency:meta.currency??null};
   }));
   const bySymbol=new Map();
   results.forEach((r,i)=>{if(r.status==="fulfilled")bySymbol.set(symbols[i],r.value)});
   const quotes=UNIVERSES[market].map(s=>bySymbol.get(s)).filter(Boolean).sort((x,y)=>y.changePercentage-x.changePercentage);
   const indices=indexSymbols.map(([label,symbol])=>{const q=bySymbol.get(symbol);return q?{...q,label}:null}).filter(Boolean);
   if(!quotes.length&&!indices.length)throw new Error("Yahoo Finance ne renvoie aucune cotation pour cet univers. Réessaie dans quelques instants.");
   return json({market,quotes,indices,source:"Yahoo Finance",notice:"Source non officielle ; délai et disponibilité variables.",asOf:new Date().toISOString(),universeSize:UNIVERSES[market].length});
  }
  if(url.pathname==="/api/patterns"&&request.method==="GET"){
   const market=safeMarket(url.searchParams.get("market"));
   const period=url.searchParams.get("period")==="daily"?"daily":url.searchParams.get("period")==="monthly"?"monthly":"weekly";
   const symbols=UNIVERSES[market];
   const now=Math.floor(Date.now()/1000),from=now-366*24*60*60;
   const settled=await Promise.allSettled(symbols.map(async symbol=>{
    const payload=await fetchJson("https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(symbol)+"?period1="+from+"&period2="+now+"&interval=1d",{ "user-agent":"Mozilla/5.0 CocotteMarket/1.0","accept":"application/json"});
    const r=payload.chart?.result?.[0];if(!r)throw new Error("Historique indisponible pour "+symbol);
    const q=r.indicators?.quote?.[0]||{},ts=r.timestamp||[],candles=[];
    for(let i=0;i<ts.length;i++){const open=Number(q.open?.[i]),close=Number(q.close?.[i]);if(Number.isFinite(open)&&Number.isFinite(close)&&open>0)candles.push({time:ts[i],open,close})}
    const buckets=new Map();
    for(const c of candles){
     const d=new Date(c.time*1000),key=period==="daily"?d.toISOString().slice(0,10):period==="monthly"?d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0"):(()=>{const x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));const day=(x.getUTCDay()+6)%7;x.setUTCDate(x.getUTCDate()-day+3);const first=new Date(Date.UTC(x.getUTCFullYear(),0,4));const wk=1+Math.round(((x-first)/86400000-3+((first.getUTCDay()+6)%7))/7);return x.getUTCFullYear()+"-S"+String(wk).padStart(2,"0")})();
     const b=buckets.get(key)||{period:key,open:c.open,close:c.close};b.close=c.close;buckets.set(key,b);
    }
    const values=[...buckets.values()].map(b=>({period:b.period,changePercentage:(b.close-b.open)/b.open*100})).filter(x=>Number.isFinite(x.changePercentage));
    const up=values.filter(x=>x.changePercentage>0).length,down=values.filter(x=>x.changePercentage<0).length,flat=values.length-up-down;
    return {symbol,name:r.meta?.longName||r.meta?.shortName||symbol,periods:values.length,up,down,flat,upFrequency:values.length?up/values.length*100:0,downFrequency:values.length?down/values.length*100:0,recent:values.slice(-12).map(x=>({period:x.period,changePercentage:Number(x.changePercentage.toFixed(2))})),source:"Yahoo Finance"};
   }));
   const rows=settled.filter(x=>x.status==="fulfilled").map(x=>x.value).sort((a,b)=>Math.max(b.upFrequency,b.downFrequency)-Math.max(a.upFrequency,a.downFrequency));
   return json({market,period,lookbackDays:366,rows,unavailable:settled.filter(x=>x.status==="rejected").length,source:"Yahoo Finance",asOf:new Date().toISOString()});
  }
  if(url.pathname==="/api/news"&&request.method==="GET"){
   const market=safeMarket(url.searchParams.get("market"));
   const feeds=[
    {id:"lesechos",name:"Les Échos",url:"https://services.lesechos.fr/rss/les-echos-economie.xml"},
    {id:"bfmbusiness",name:"BFM Business",url:"https://www.bfmtv.com/rss/economie/"},
    {id:"lemonde",name:"Le Monde – Économie",url:"https://www.lemonde.fr/economie-francaise/rss_full.xml"},
    {id:"bercy",name:"Ministère de l’Économie",url:"https://www.economie.gouv.fr/rss/toutesactualites"}
   ];
   const frenchResults=await Promise.allSettled(feeds.map(fetchRssFeed));
   let articles=frenchResults.filter(x=>x.status==="fulfilled").flatMap(x=>x.value);
   let internationalCount=0;
   if(env.FINNHUB_API_KEY&&market!=="france"){
    try{
     const params=new URLSearchParams({category:"general",token:env.FINNHUB_API_KEY});
     const raw=await fetchJson("https://finnhub.io/api/v1/news?"+params.toString());
     const international=(Array.isArray(raw)?raw:[]).slice(0,15).map(a=>({uuid:"fh-"+String(a.id),title:a.headline,description:a.summary||"",url:a.url,source:a.source,published_at:a.datetime?new Date(a.datetime*1000).toISOString():null,entities:[],language:"en"}));
     articles=articles.concat(international);internationalCount=international.length;
    }catch(e){/* Les sources françaises restent disponibles si Finnhub est indisponible. */}
   }
   const unique=new Map();
   for(const a of articles){const key=a.url||a.title;if(!unique.has(key))unique.set(key,a)}
   articles=[...unique.values()].sort((a,b)=>(Date.parse(b.published_at||"")||0)-(Date.parse(a.published_at||"")||0)).slice(0,50);
   const availableFeeds=feeds.filter((f,i)=>frenchResults[i].status==="fulfilled").map(f=>f.name);
   return json({market,articles,found:articles.length,sources:availableFeeds,source:"Flux RSS français"+(internationalCount?" + Finnhub":"")+"",asOf:new Date().toISOString(),unavailableFeeds:feeds.length-availableFeeds.length});
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
