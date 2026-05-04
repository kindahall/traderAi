# Agent Trader AI

Application Next.js App Router pour superviser un agent trader autonome crypto : cockpit, agents, marchés, stratégies, backtests, journal, risque, capital progressif, maturité, post-mortem, simulateur de crise, replay, alertes, règles, validation humaine et configuration multi-LLM.

## Stack

- Next.js App Router dynamique
- TypeScript
- Tailwind CSS v4
- Composants shadcn-like locaux dans `src/components/ui`
- lucide-react
- Graphiques SVG locaux, sans dépendance à une taille de conteneur runtime
- Données marché publiques multi-exchange via `/api/markets`, `/api/markets/candles` et polling/WebSocket configuré
- Configuration LLM réelle depuis `.env.local` via `/api/llm/providers`
- Garde-fou serveur pour refuser les ordres live tant qu'un adapter exchange/risk engine n'est pas activé

## Installation

```bash
npm install
cp .env.example .env.local
npm run dev
```

Ouvrir ensuite `http://localhost:3000`.

## Vérification

```bash
npm run lint
npm run build
npm audit --audit-level=moderate
```

## Navigation principale

- `/` Vue d'ensemble
- `/markets`
- `/agents`
- `/strategies`
- `/journal`
- `/risk`
- `/capital-progress`
- `/settings`

## Routes secondaires conservées

- `/agents/new`
- `/strategies/new`
- `/ai-architect`
- `/backtests`
- `/decision-replay`
- `/weekly-postmortem`
- `/alerts`
- `/rules`
- `/human-validation`
- `/crisis-simulator`
- `/maturity`
- `/llm-providers`
- `/openclaw`

## Sources de données

- `src/server/adapters/market-data.ts` connecte les marchés publics dYdX, Kraken, Coinbase ou Binance selon `.env.local`.
- `src/server/adapters/llm.ts` lit les clés présentes dans `.env.local`, masque les secrets et expose le statut provider.
- `src/server/app-data.ts` agrège les données API, les configurations runtime et les statuts de source.
- `src/data/runtime/*` contient la configuration locale de départ pour agents, stratégies, règles, validations et journal opérationnel. Ces fichiers sont remplaçables par une base de données sans changer les composants.

## Endpoints API

- `GET /api/markets` : snapshot marché public multi-exchange, sans secret.
- `GET /api/markets/candles` : chandeliers OHLC réels pour les charts de trading.
- `GET /api/llm/providers` : catalogue providers + statut selon `.env.local`, secrets masqués.
- `POST /api/llm/providers/test` : test réel de connexion au provider configuré, déclenché uniquement par action utilisateur.
- `POST /api/llm/insight` : appel réel au rôle LLM configuré pour générer un audit court, avec fallback si disponible.
- `POST /api/analysis/run` : analyse locale via OpenClaw ou Codex pour backtests, architecte stratégie, replay, crise ou post-mortem. Analyse uniquement, aucun ordre ni modification de fichier.
- `GET|POST /api/openclaw/status` : test serveur du Gateway OpenClaw configuré, sans exposer les secrets au frontend.
- `GET|POST /api/openclaw/agents` : synchronisation des agents OpenClaw via le connecteur serveur.
- `GET|POST /api/openclaw/policy` : lecture et persistance locale de la policy de rôle OpenClaw.
- `GET /api/openclaw/context` : contexte contrôlé pour les agents OpenClaw : marché, bougies, stratégies, règles de risque et journal récent.
- `POST /api/trading/order` : verrouillé par défaut, retourne `423` tant que `LIVE_TRADING_ENABLED` n'est pas activé et qu'aucun adapter exchange sécurisé n'est implémenté.

## Sécurité produit

- Paper trading par défaut.
- Live trading verrouillé côté UI et côté endpoint serveur.
- Retraits désactivés par défaut.
- Clés API masquées, jamais exposées en clair au frontend.
- Moteur de risque indépendant du LLM.
- Kill switch visible dans la topbar et la page Risque.
- Validation humaine pour trades sensibles.
- Les LLM ne peuvent pas exécuter directement : ils proposent, le moteur risque bloque ou autorise.

## Intégration OpenClaw recommandée

OpenClaw doit rester un runtime agentique externe, séparé de l'application Agent Trader AI. L'application ne doit pas embarquer ni copier tout le code OpenClaw dans son code principal.

L'intégration cible est :

```text
Agent Trader AI
  -> API backend de l'application
  -> Connecteur OpenClaw
  -> OpenClaw Gateway / runtime séparé
  -> Agents OpenClaw
```

Dans l'application, le code doit rester limité à une couche connecteur, actuellement dans `src/server/openclaw/*` pour les appels serveur et `src/components/openclaw/*` pour la console UI. Cette couche teste la connexion, synchronise les agents, récupère les logs et expose le statut du runtime au dashboard sans copier OpenClaw dans ce dépôt.

OpenClaw peut proposer une action, mais le moteur de risque d'Agent Trader AI reste l'autorité finale avant toute simulation ou exécution. Une proposition OpenClaw doit toujours passer par les garde-fous produit : risk engine, kill switch, journalisation, validation humaine si nécessaire et verrouillage du live trading.

La page `/openclaw` contient la console dédiée : configuration Gateway, test de connexion, synchronisation des agents et policy de rôle. Par défaut, OpenClaw peut scanner, analyser et auditer. L'exécution directe reste verrouillée.

## LLM providers

La page `/llm-providers` inclut les rôles : principal, rapide, auditeur et fallback. Les fournisseurs incluent OpenAI, Anthropic, Google, Mistral, xAI, DeepSeek, Qwen/DashScope, Moonshot/Kimi, MiniMax, Tencent Hunyuan, Baidu ERNIE, Zhipu/GLM, Doubao, Naver HyperCLOVA X et providers custom.

Pour connecter un provider, renseigner sa clé dans `.env.local`, puis redémarrer le serveur dev. L'UI affichera `connected` si la clé existe côté serveur. Les boutons de test et d'audit déclenchent des appels réels uniquement au clic, afin d'éviter toute consommation de tokens au chargement des pages.

### Analyse via OpenClaw ou Codex local

Le runtime paper et certaines pages d'audit peuvent déléguer la revue ou certains rôles d'agents à un provider local utilisant l'auth déjà configurée par l'utilisateur. Les pages `/backtests` et `/ai-architect` exposent aussi un bouton d'analyse locale qui appelle `/api/analysis/run`.

```bash
# Codex local est le provider par défaut dans l'app Codex
# Optionnel si vous voulez l'expliciter
TRADERAI_ANALYSIS_PROVIDER=codex
TRADERAI_CODEX_MODEL=gpt-5.2

# OpenClaw reste possible plus tard
TRADERAI_ANALYSIS_PROVIDER=openclaw
TRADERAI_OPENCLAW_ANALYSIS_AGENT=ops
TRADERAI_OPENCLAW_THINKING=medium

# Désactivation explicite possible, mais le choix se fait aussi dans l'UI
TRADERAI_ANALYSIS_PROVIDER=none

# Valeur par défaut du routing paper avant configuration UI
# Rôles disponibles: scanner, analyst, risk, auditor, executor
TRADERAI_CODEX_AGENT_ROLES=scanner,analyst,risk,auditor,executor

# Optionnel : bloquer le plan si le provider externe échoue
TRADERAI_ANALYSIS_FAIL_CLOSED=true
TRADERAI_CODEX_AGENT_FAIL_CLOSED=true
TRADERAI_ANALYSIS_TIMEOUT_MS=90000
```

Sans `TRADERAI_ANALYSIS_PROVIDER`, Codex est utilisé comme provider local par défaut. Sur `/agents`, le panneau "Routing agents paper" permet aussi de choisir le provider global (`Off`, `Codex`, `OpenClaw`) et de choisir rôle par rôle entre déterministe et IA. Ces configurations sont persistées dans `.agent-trader-runtime/local-analysis-provider.json` et `.agent-trader-runtime/paper-agent-routing.json`. Le live trading garde ses verrous séparés.

## Disclaimers inclus

Cette application ne fournit pas de conseil financier. Les performances passées ou simulées ne garantissent pas les performances futures. Le trading comporte un risque de perte en capital. L'utilisateur reste responsable de l'activation du mode réel. Le paper trading doit être utilisé avant tout déploiement réel.

## Limites connues

- Les marchés publics sont configurables avec `MARKET_DATA_PROVIDER=dydx|kraken|coinbase|binance`, `MARKET_SYMBOLS=auto`, `MARKET_MAX_SYMBOLS`, `MARKET_REST_BASE_URL`, `PRIMARY_MARKET_SYMBOL` et `AUTHORIZED_PAIRS`.
- Les charts Trading Desk affichent des chandeliers OHLC live, volumes, crosshair, entrée proposée, stop-loss, take-profit, zones risque/profit et R:R. Les niveaux d'agent sont calculés en paper depuis le flux réel et sont prêts à être remplacés par les décisions d'un moteur stratégie/LLM persistant.
- Aucun ordre réel n'est exécuté.
- Les statuts LLM détectent les clés `.env.local`; les appels de test couvrent les providers OpenAI-compatible, Anthropic-compatible et Google Gemini. Certains providers custom peuvent nécessiter un endpoint compatible `/models` ou `/chat/completions`.
- Agents, stratégies, règles et journaux sont encore dans un runtime local versionnable, prêt à migrer vers PostgreSQL ou autre base.
- OpenClaw n'est pas encore connecté : la prochaine étape doit être un connecteur API/Gateway, pas une copie du runtime dans ce dépôt.
- Le live trading nécessite un adapter exchange signé, un moteur de risque déterministe et une confirmation humaine avant toute activation.

## Prochaines étapes recommandées

1. Ajouter une base de données pour `src/data/runtime/*`.
2. Implémenter un adapter exchange read-only pour soldes, positions et ordres paper.
3. Persister les journaux d'usage LLM et les coûts retournés par les providers.
4. Ajouter un connecteur OpenClaw externe : configuration Gateway, test de connexion, synchronisation agents, propositions structurées et logs.
5. Ajouter Playwright sur les parcours critiques : LLM, marchés, risque, validation humaine.
