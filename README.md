# Cocotte — Market Intelligence

Terminal de recherche financière en français : univers USA / France / Global, scanner d'actions, flux d'actualités, carte de transmission économique et analyse IA.

## Site web

URL GitHub Pages : https://remiheinze.github.io/Cocotte/

Le déploiement statique est automatisé par GitHub Actions (`.github/workflows/pages.yml`). Dans GitHub, vérifier **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## État actuel

- Interface complète et responsive : publiée dans ce dépôt.
- Mode démonstration : disponible sans compte fournisseur. Les indices affichés en mode démo sont des valeurs d'exemple, pas des cours actuels.
- Backend : code Cloudflare Worker inclus dans `worker/`, mais il doit encore être déployé sur un compte Cloudflare.
- Données réelles et IA : indisponibles tant que le Worker et les clés fournisseurs ne sont pas configurés.

## Fournisseurs optionnels

- Financial Modeling Prep (FMP) : cotations pour un univers de titres défini.
- Marketaux : actualités financières et entités associées.
- Anthropic Claude : analyse structurée des événements et scénarios.

Les offres, droits de redistribution, marchés couverts et délais de cotation dépendent des contrats des fournisseurs. Vérifier les conditions et quotas avant activation.

## Déployer le backend

Prérequis : Node.js LTS et compte Cloudflare.

Depuis un terminal, à la racine du dépôt :

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put FMP_API_KEY
npx wrangler secret put MARKETAUX_API_TOKEN
npx wrangler secret put ANTHROPIC_API_KEY
npm run deploy
```

Les commandes `wrangler secret put` demandent les clés de façon interactive. Ne jamais les coller dans une conversation, dans le dépôt, dans `config.js` ou dans du JavaScript client.

Wrangler affiche une URL du type `https://cocotte-market-intelligence-api.<compte>.workers.dev`.

## Relier le site au Worker

Modifier `config.js` et remplacer la valeur vide de `API_BASE_URL` par l'URL exacte du Worker. Enregistrer le changement dans GitHub : le site GitHub Pages se redéploiera automatiquement.

Tester ensuite `https://TON-WORKER.workers.dev/api/health`. La réponse indique quels fournisseurs sont configurés sans révéler les secrets.

## Routes API

- `GET /api/health` — état de configuration des fournisseurs.
- `GET /api/market?market=usa|france|global` — cotations de l'univers surveillé.
- `GET /api/news?market=usa|france|global` — articles financiers.
- `POST /api/analyze` — analyse IA en français.

## Limites et prudence

- Le scanner couvre uniquement la liste de symboles dans `worker/src/index.js`, pas toutes les actions mondiales.
- Les indices du tableau de bord sont des valeurs de démonstration et ne sont pas encore alimentés par un fournisseur d'indices.
- La disponibilité et la fraîcheur des cotations dépendent de l'abonnement et des licences de données.
- Les liens d'articles renvoient aux sources originales ; le modèle ne lit pas automatiquement les pages complètes.
- Les relations du graphe sont des hypothèses économiques, pas des causalités prouvées.
- Le score de marché est un simple ratio de titres en hausse dans l'échantillon ; ce n'est pas un modèle prédictif.
- L'application ne passe aucun ordre et ne constitue pas un conseil financier.

Avant une ouverture publique à grande échelle, ajouter des règles de limitation de requêtes et de protection sur Cloudflare, surveiller les coûts et vérifier les conditions d'utilisation des données.
