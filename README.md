# Cocotte — Market Intelligence

Terminal de recherche financière en français : univers USA / France / Global, scanner d'actions, actualités, carte de transmission économique et analyse IA.

## Site web

https://remiheinze.github.io/Cocotte/

Le déploiement statique est automatisé par GitHub Actions (.github/workflows/pages.yml). Dans GitHub, vérifier **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## État actuel

- Interface complète responsive publiée dans ce dépôt.
- Mode démonstration disponible sans compte fournisseur. Les indices et cours de démonstration sont fictifs.
- Backend Cloudflare Worker inclus dans worker/, prêt à être déployé via GitHub Actions lorsque les identifiants sont configurés.
- Données réelles et analyse IA indisponibles tant que les comptes et clés fournisseurs ne sont pas configurés.

## Activer les données et l'IA

Fournisseurs prévus : Financial Modeling Prep (FMP) pour les cotations d'un univers défini, Finnhub pour les actualités, Anthropic Claude pour l'analyse structurée. Vérifier les tarifs, quotas, marchés couverts, délais et licences auprès des fournisseurs.

Dans **GitHub → Settings → Secrets and variables → Actions**, ajouter :

| Secret | Rôle |
|---|---|
| CLOUDFLARE_API_TOKEN | Jeton Cloudflare autorisant le déploiement du Worker |
| CLOUDFLARE_ACCOUNT_ID | Identifiant du compte Cloudflare |
| FMP_API_KEY | Clé Financial Modeling Prep |
| FINNHUB_API_KEY | Jeton Finnhub |
| ANTHROPIC_API_KEY | Clé Anthropic |

Les clés fournisseurs sont facultatives individuellement ; seules les fonctions dont le fournisseur est configuré fonctionneront. Ne jamais placer de clé dans le code, config.js, une issue ou un message.

Une fois les secrets enregistrés, lancer **Actions → Deploy Cocotte API Worker → Run workflow**. Le workflow déploie le Worker cocotte-market-intelligence-api et y installe les secrets fournisseurs présents.

Après le premier déploiement, récupérer l'URL Worker affichée dans le journal Wrangler, de la forme https://cocotte-market-intelligence-api.<sous-domaine>.workers.dev. Ajouter ensuite dans les secrets Actions le secret MARKET_API_BASE_URL avec cette URL complète. Le workflow Pages injecte automatiquement cette URL dans config.js lors de la publication.

Tester l'API avec https://TON-WORKER.workers.dev/api/health. La réponse indique les fournisseurs configurés sans révéler les clés.

## Routes API

- GET /api/health — statut des fournisseurs.
- GET /api/market?market=usa|france|global — cotations de l'univers surveillé.
- GET /api/news?market=usa|france|global — articles financiers.
- POST /api/analyze — analyse IA en français.

## Limites et prudence

- Le scanner couvre uniquement la liste de symboles dans worker/src/index.js, pas toutes les actions mondiales.
- Les indices du tableau de bord sont des exemples et ne sont pas alimentés par un fournisseur d'indices.
- La disponibilité et la fraîcheur des cotations dépendent de l'abonnement et des licences de données.
- Les articles renvoient aux sources originales ; le modèle ne lit pas automatiquement les pages complètes.
- Les relations du graphe sont des hypothèses économiques, pas des causalités prouvées.
- Le score de marché est un simple ratio de titres en hausse dans l'échantillon, pas un modèle prédictif.
- L'application ne passe aucun ordre et ne constitue pas un conseil financier personnalisé.

Avant une ouverture publique à grande échelle, ajouter des limites de requêtes et des protections Cloudflare, surveiller les coûts et vérifier les conditions d'utilisation des données.
