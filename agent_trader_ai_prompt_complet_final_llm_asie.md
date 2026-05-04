# Prompt produit complet — Agent Trader AI

## Objectif du document

Créer une application web complète appelée **Agent Trader AI**, destinée à connecter, superviser, configurer, auditer et faire évoluer un agent de trading autonome spécialisé crypto.

Ce document n’est pas un code. C’est un **prompt produit complet** qui explique précisément ce que l’agent de création d’application doit construire : pages, modules, règles métier, comportements attendus, garde-fous, logique de progression, journalisation, apprentissage, audit et validation humaine.

L’application ne doit pas être un simple bot de trading. Elle doit être un **cockpit complet de pilotage, d’audit, d’apprentissage et de contrôle du risque**.

Le premier mode d’utilisation est le **paper trading**. Ensuite, l’utilisateur pourra confier de très petits montants à l’agent pour observer son comportement réel :

```text
Observateur → Paper Trading → 5 $ → 10 $ → 25 $ → 50 $ → 100 $
```

Le but initial n’est pas de gagner rapidement de l’argent. Le but est de vérifier que l’agent :

- respecte ses règles ;
- sait ne pas trader quand les conditions sont mauvaises ;
- documente toutes ses décisions ;
- apprend de ses erreurs ;
- protège le capital ;
- ne prend jamais de décisions dangereuses sans contrôle du risque ;
- mérite progressivement plus de capital.

---

# 1. Positionnement produit

L’application doit ressembler à un **dashboard SaaS premium de trading autonome**.

Style visuel attendu :

- dark mode ;
- fond bleu nuit / noir ;
- néons subtils bleu, vert, violet, rouge et orange ;
- cartes arrondies ;
- graphiques riches ;
- typographie moderne ;
- interface dense mais lisible ;
- sensation de cockpit d’agent IA financier ;
- design sérieux, crédible, professionnel.

L’application doit donner l’impression d’un **centre de contrôle d’agent trader autonome**, pas d’un simple bot crypto.

---

# 2. Philosophie centrale

Le système repose sur cette règle :

> L’agent ne reçoit pas plus de capital parce qu’il gagne. Il reçoit plus de capital parce qu’il respecte les règles, survit aux mauvaises périodes, documente ses décisions et améliore son comportement.

Le profit doit être un critère secondaire au début.

Critères principaux d’évaluation :

- discipline ;
- respect des règles ;
- gestion du risque ;
- qualité du raisonnement ;
- patience ;
- capacité à ne pas trader ;
- comportement après une perte ;
- robustesse en crise ;
- qualité du journal ;
- amélioration continue.

---

# 3. Navigation globale

La sidebar doit contenir les pages suivantes :

- Vue d’ensemble ;
- Agents ;
- Marchés ;
- Stratégies ;
- Backtests ;
- Journal ;
- Risque ;
- Capital & progression ;
- Évaluation & maturité ;
- Post-mortem hebdo ;
- Simulateur de crise ;
- Replay de décision ;
- Centre d’alertes ;
- Bibliothèque de règles ;
- Validation humaine ;
- Paramètres.

La top bar doit toujours afficher :

```text
Agent connecté : Alpha-01
Mode : Paper Trading / Live
Capital alloué : 10 $
Mode autonome : ACTIVÉ
Bouton : Arrêt d’urgence
```

---

# 4. Modes de fonctionnement de l’agent

## 4.1 Mode Observateur

Avant le paper trading, l’agent doit pouvoir fonctionner en mode observateur.

Dans ce mode :

- il scanne le marché ;
- il détecte des signaux ;
- il écrit ce qu’il aurait fait ;
- il explique son raisonnement ;
- il ne simule aucun ordre ;
- il ne passe aucun ordre réel.

Objectif : tester son raisonnement sans risque.

## 4.2 Mode Paper Trading

C’est le mode principal au démarrage.

L’agent :

- trade avec capital virtuel ;
- gère stop-loss et take-profit ;
- journalise chaque décision ;
- produit des rapports ;
- peut être évalué comme s’il gérait du vrai capital.

## 4.3 Mode réel limité

Après validation, l’agent peut gérer de petits montants réels :

```text
5 $ → 10 $ → 25 $ → 50 $ → 100 $
```

Chaque montée doit être conditionnée par des critères de discipline, risque et maturité.

## 4.4 Mode Validation humaine

Même si l’agent est autonome, certains trades sensibles doivent pouvoir demander validation humaine.

Déclencheurs possibles :

- premier trade d’une nouvelle stratégie ;
- trade après deux pertes ;
- actif non testé ;
- montant élevé ;
- confiance faible ;
- risque élevé ;
- comportement inhabituel.

---

# 5. Règles de risque non négociables

L’agent doit avoir une constitution stricte.

Règles obligatoires :

```text
1. Ne jamais trader sans stop-loss.
2. Ne jamais utiliser de levier au démarrage.
3. Ne jamais risquer plus que le seuil autorisé.
4. Ne jamais ouvrir trop de positions simultanées.
5. Ne jamais moyenner à la baisse sans autorisation.
6. Ne jamais trader après une série de pertes sans pause.
7. Ne jamais trader en volatilité extrême.
8. Ne jamais trader si le spread est trop élevé.
9. Ne jamais trader si la décision n’est pas expliquée.
10. Arrêt automatique si perte journalière excessive.
```

Ces règles doivent être centralisées dans une **Bibliothèque de règles**.

---

# 6. Vue d’ensemble

La page Vue d’ensemble est le cockpit principal.

Elle doit afficher :

- P&L total ;
- win rate ;
- drawdown max ;
- trades du jour ;
- positions ouvertes ;
- score discipline ;
- graphique principal ;
- actifs autorisés ;
- raisonnement actuel ;
- état de l’agent ;
- gestion du risque ;
- journal de trading ;
- apprentissage / amélioration ;
- historique d’actions.

Le panneau « Mode de réflexion / Raisonnement actuel » doit montrer :

```text
Signal détecté : tendance haussière + momentum modéré
Confiance : 68 %
Risque par trade : 0,5 %
Décision : Attendre confirmation
Conditions de refus : volatilité trop forte / frais trop élevés / 3 pertes consécutives
```

Le workflow doit être visible :

```text
Scanner → Analyser → Valider le risque → Exécuter → Journaliser → Apprendre
```

---

# 7. Agents

La page Agents doit gérer tous les agents.

Elle doit afficher :

- agents totaux ;
- agents actifs ;
- performance moyenne ;
- incidents ;
- score global de discipline ;
- liste des agents ;
- statut de chaque agent ;
- focus de marché ;
- mode paper/live ;
- détail de l’agent sélectionné ;
- capacités ;
- rôles ;
- paramètres de comportement ;
- workflow actuel ;
- apprentissage ;
- actions & historique.

Chaque agent doit avoir des rôles possibles :

- Scanner : surveille le marché ;
- Analyste : identifie opportunités et signaux ;
- Exécuteur : passe et gère les ordres ;
- Auditeur : contrôle risque et conformité.

---

# 8. Nouvel agent

La page « Nouvel agent » apparaît quand l’utilisateur clique sur **+ Nouvel agent**.

Elle doit permettre de créer et configurer un nouvel agent.

Sections attendues :

## 8.1 Identité de l’agent

- nom ;
- avatar ;
- description ;
- tags.

## 8.2 Rôle & type de trading

L’utilisateur doit choisir les rôles :

- Scanner ;
- Analyste ;
- Exécuteur ;
- Auditeur.

Type de trading :

- Spot recommandé ;
- Futures verrouillé ou désactivé au début.

## 8.3 Marché & instruments

Configurer :

- classe d’actifs ;
- paires surveillées ;
- exchanges ;
- mode de marché ;
- heure de trading.

## 8.4 Mode d’opération

- Paper Trading sélectionné par défaut ;
- Live Trading présent mais verrouillé tant que la configuration n’est pas complète.

## 8.5 Niveau d’autonomie

Slider de Conservateur à Élevé.

## 8.6 Comportement de trading

Sliders :

- agressivité ;
- prudence ;
- fréquence ;
- adaptation.

## 8.7 Stratégie attachée

Possibilités :

- utiliser une stratégie existante ;
- personnaliser les paramètres ;
- créer une stratégie personnalisée.

## 8.8 Garde-fous & risque

Configurer :

- risque max par trade ;
- perte max quotidienne ;
- stop-loss requis ;
- positions ouvertes max ;
- drawdown max autorisé ;
- kill switch automatique.

## 8.9 Permissions & notifications

Configurer :

- peut placer des ordres ;
- peut modifier stop-loss / TP ;
- peut désactiver l’agent ;
- recevoir des alertes ;
- notifications push ;
- canaux App / Email / Telegram.

## 8.10 Apprentissage & journalisation

Configurer :

- apprentissage automatique ;
- optimisation continue ;
- journalisation de toutes les décisions ;
- durée de conservation des données.

## 8.11 Aperçu de l’agent

Panneau latéral avec :

- résumé de l’agent ;
- score de discipline estimé ;
- compatibilité système ;
- checklist de lancement ;
- résumé de lancement.

Boutons :

- Annuler ;
- Enregistrer comme brouillon ;
- Tester en paper trading ;
- Créer l’agent.

---

# 9. Marchés

La page Marchés doit permettre de choisir les cryptos que l’agent peut traiter.

Elle doit afficher :

- filtres exchange ;
- timeframe ;
- secteur ;
- volatilité ;
- recherche de paire ;
- tendance globale ;
- volatilité moyenne ;
- paires surveillées ;
- opportunités détectées ;
- sentiment du marché ;
- heatmap des performances ;
- watchlist ;
- corrélations ;
- calendrier macro ;
- signaux actifs ;
- top opportunités ;
- graphique principal ;
- régime de marché.

Chaque actif doit pouvoir être autorisé ou interdit pour l’agent.

---

# 10. Stratégies

La page Stratégies doit afficher une bibliothèque de stratégies.

Elle doit contenir :

- stratégie active ;
- rendement moyen ;
- drawdown moyen ;
- taux de validation ;
- stratégies testées ;
- cartes de stratégies ;
- éditeur de stratégie ;
- comparaison des stratégies ;
- conditions d’activation ;
- raison du choix de stratégie ;
- recommandations IA ;
- notes.

Stratégies d’exemple :

- Trend Momentum ;
- Mean Reversion ;
- Breakout H4 ;
- Scalp Volatilité.

---

# 11. Nouvelle stratégie

La page « Nouvelle stratégie » apparaît quand l’utilisateur clique sur **+ Nouvelle stratégie**.

Elle doit permettre de construire une stratégie complète.

Sections attendues :

## 11.1 Identité de la stratégie

- nom ;
- description ;
- catégorie ;
- icône ;
- tags.

## 11.2 Type de stratégie & objectif

Types possibles :

- Trend Following ;
- Mean Reversion ;
- Breakout ;
- Scalping ;
- Arbitrage ;
- Custom.

Objectifs :

- maximiser le rendement ajusté au risque ;
- réduire le drawdown ;
- privilégier la régularité ;
- détecter les breakouts ;
- exploiter les ranges.

## 11.3 Marché & unités de temps

Configurer :

- marché crypto ;
- unité de temps principale ;
- unité de confirmation ;
- session de trading.

## 11.4 Règles d’entrée

Exemples de conditions :

- prix au-dessus EMA 50 ;
- RSI > 55 ;
- MACD ligne au-dessus signal ;
- volume supérieur SMA 20 ;
- breakout au-dessus du plus haut des 20 périodes ;
- absence d’actualité majeure.

## 11.5 Règles de sortie

Exemples :

- prix sous EMA 50 ;
- RSI < 45 ;
- take-profit atteint ;
- temps max en position ;
- stop-loss atteint.

## 11.6 Gestion du risque

Configurer :

- stop-loss ;
- take-profit ;
- trailing stop ;
- risque par trade ;
- positions simultanées max ;
- risque quotidien max ;
- risque hebdomadaire max.

## 11.7 Filtres & conditions de marché

Configurer :

- tendance de fond ;
- volatilité ;
- volume minimum ;
- plage horaire ;
- annonces majeures.

## 11.8 Actifs autorisés

Choisir :

- BTC/USDT ;
- ETH/USDT ;
- SOL/USDT ;
- BNB/USDT ;
- AVAX/USDT ;
- autres actifs personnalisés.

## 11.9 Validation & test

Configurer :

- données historiques ;
- frais ;
- slippage ;
- capital initial ;
- bouton lancer le backtest.

## 11.10 Aperçu de la stratégie

Panneau latéral avec :

- taux de réussite estimé ;
- ratio rendement / risque ;
- drawdown max cible ;
- conditions d’activation ;
- compatibilité agents ;
- score global de stratégie ;
- recommandation IA.

Boutons :

- Annuler ;
- Enregistrer comme brouillon ;
- Lancer un backtest ;
- Créer la stratégie.

---

# 12. Backtests

La page Backtests doit permettre de tester une stratégie historiquement.

Elle doit afficher :

- rendement backtesté ;
- drawdown max ;
- ratio gain / risque ;
- nombre de trades ;
- score de robustesse ;
- configuration du backtest ;
- courbe d’équité ;
- graphique des prix avec trades ;
- statistiques détaillées ;
- distribution des résultats ;
- heatmap des mois ;
- comparaison de stratégies ;
- observations IA ;
- recommandations avant live.

Le système doit rappeler :

> Les résultats passés ne garantissent pas les performances futures.

---

# 13. Journal de trading

Le journal doit être un outil d’audit complet.

Il doit afficher :

- trades total ;
- taux de réussite ;
- P&L cumulé ;
- erreurs critiques ;
- qualité des décisions ;
- filtres ;
- table des trades ;
- détail du trade sélectionné ;
- confiance ;
- risque ;
- graphique ;
- chaîne de raisonnement ;
- chronologie des actions ;
- checklist pré-trade ;
- post-mortem ;
- notes ;
- leçons apprises.

Chaque trade doit avoir une fiche :

```text
ID trade :
Date :
Agent :
Actif :
Type : LONG / SHORT
Entrée :
Sortie :
Stop-loss :
Take-profit :
Risque :
Confiance :
Raison initiale :
Raison de sortie :
Résultat :
Erreur éventuelle :
Leçon apprise :
Score discipline :
Tag :
```

---

# 14. Gestion du risque

La page Risque doit contrôler la protection du capital.

Elle doit afficher :

- perte quotidienne utilisée ;
- drawdown actuel ;
- exposition totale ;
- conformité des règles ;
- alertes actives ;
- vue d’ensemble du risque ;
- exposition par actif ;
- concentration ;
- corrélation ;
- moteur de règles ;
- analyse de scénarios ;
- kill switch ;
- flux d’alertes.

Le kill switch doit permettre :

- arrêt automatique ;
- arrêt manuel ;
- blocage des nouvelles positions ;
- réduction d’exposition ;
- mise en pause des agents.

---

# 15. Capital & progression

Cette nouvelle page est fondamentale.

Elle gère la montée progressive du capital.

## 15.1 Objectif

Contrôler le passage :

```text
Observateur → Paper Trading → 5 $ → 10 $ → 25 $ → 50 $ → 100 $
```

## 15.2 Contenu attendu

La page doit afficher :

- niveau actuel ;
- capital paper ;
- capital réel actif ;
- score de maturité ;
- progression vers le palier suivant ;
- échelle de progression des paliers ;
- conditions pour passer au niveau suivant ;
- conditions de rétrogradation ;
- historique des paliers ;
- capital confié par niveau ;
- décision de promotion ;
- activité & tendance sur 7 jours ;
- résumé du niveau actuel ;
- checklist de readiness.

## 15.3 Conditions pour monter

Exemple :

```text
7 jours sans violation critique
Drawdown max < 5 %
20 trades journalisés
Respect des règles > 95 %
```

## 15.4 Conditions de rétrogradation

Exemple :

```text
Trade exécuté sans stop-loss
Levier détecté
Drawdown excessif
3 violations critiques
```

## 15.5 Décision de promotion

Le système doit afficher une décision claire :

- éligible au palier suivant ;
- attendre encore X jours ;
- maintenir le niveau ;
- rétrograder ;
- retour en observation.

---

# 16. Évaluation & maturité de l’agent

Cette page juge si l’agent mérite plus de capital.

## 16.1 Scores principaux

- score global de maturité ;
- discipline ;
- gestion du risque ;
- qualité des décisions ;
- patience / capacité à ne pas trader ;
- évolution sur 30 jours.

## 16.2 Profil de maturité

Afficher un radar ou score pondéré sur :

- discipline ;
- conformité aux règles ;
- robustesse ;
- comportement après perte ;
- patience ;
- qualité des décisions ;
- gestion du risque.

## 16.3 Pondération recommandée

```text
Discipline : 30 %
Gestion du risque : 25 %
Qualité décisionnelle : 20 %
Patience / ne pas trader : 15 %
Profit net : 10 %
```

Le profit ne doit pas être le critère dominant.

## 16.4 Décisions possibles

- maintenir en paper trading ;
- autoriser 10 $ ;
- retour en observation ;
- réduction d’autonomie ;
- validation humaine renforcée.

---

# 17. Post-mortem hebdomadaire

Cette page produit une revue hebdomadaire automatique.

## 17.1 KPI attendus

- trades analysés ;
- gagnants / perdants ;
- trades évités correctement ;
- violations ;
- leçon principale ;
- performance nette.

## 17.2 Sections attendues

- résumé hebdomadaire ;
- résultats journaliers ;
- résumé exécutif ;
- ce qui a bien fonctionné ;
- ce qui a moins bien fonctionné ;
- erreurs répétées ;
- ajustements proposés ;
- règles à renforcer ;
- performance par jour / heure ;
- stratégies à activer ou désactiver ;
- meilleure décision de la semaine ;
- pire décision de la semaine ;
- plan d’actions de la semaine suivante.

## 17.3 Exemple de leçon

```text
Patience & filtration : attendre la confluence paie.
```

---

# 18. Simulateur de crise

Cette page teste l’agent contre des scénarios extrêmes.

## 18.1 Scénarios

- flash crash BTC -10 % en 15 min ;
- API exchange indisponible ;
- spread anormal ;
- 3 pertes consécutives ;
- news macro violente ;
- ordre partiellement exécuté ;
- gap sous stop-loss.

## 18.2 Contenu attendu

- scénario sélectionné ;
- impact estimé ;
- réaction de l’agent ;
- risque résiduel ;
- robustesse ;
- taux de survie ;
- sélection du scénario ;
- timeline ;
- résultats ;
- attendu vs réponse de l’agent ;
- points de défaillance ;
- mesures correctives ;
- détails du scénario ;
- compatibilité de l’agent ;
- recommandation avant capital réel ;
- historique des tests.

## 18.3 Timeline type

```text
Détection → Freeze → Réduction d’exposition → Refus d’ordre → Kill Switch → Reprise
```

---

# 19. Replay de décision

Cette page permet de rejouer une décision passée.

## 19.1 Objectif

Voir exactement :

- ce que l’agent a vu ;
- ce qu’il a compris ;
- ce qu’il a décidé ;
- ce qu’il a fait ;
- ce qu’il aurait dû faire.

## 19.2 Contenu attendu

- résumé du trade ;
- résultat ;
- date ;
- durée ;
- confiance ;
- entrée / sortie ;
- montant ;
- chronologie ;
- contrôles de lecture ;
- données visibles ;
- raisonnement ;
- instantané du marché ;
- comparaison action réelle vs action optimale ;
- annotations ;
- verdict d’audit ;
- faiblesses détectées.

## 19.3 Chronologie type

```text
Signal détecté → Analyse terminée → Risque validé → Ordre exécuté → Stop déplacé → TP atteint → Trade clôturé
```

---

# 20. Centre d’alertes

Cette page centralise les alertes et incidents.

## 20.1 KPI attendus

- alertes actives ;
- critiques ;
- avertissements ;
- incidents API ;
- trades refusés ;
- actions requises.

## 20.2 Types d’alertes

- risque ;
- API ;
- stratégie ;
- apprentissage ;
- validation humaine ;
- système.

## 20.3 Contenu attendu

- flux d’alertes ;
- timeline ;
- clusters par gravité ;
- incidents récents ;
- actions recommandées ;
- escalade humaine ;
- causes récurrentes ;
- détail de l’alerte ;
- cause racine IA ;
- prochaine étape suggérée ;
- boutons Acquitter / Assigner / Résoudre.

---

# 21. Bibliothèque de règles

Cette page centralise les règles réutilisables.

## 21.1 Règles attendues

- stop-loss obligatoire ;
- pas de levier ;
- pause après 3 pertes ;
- pas de trade pendant news majeures ;
- pas de trade si spread élevé ;
- pas de trade si volatilité extrême ;
- pas de trade si confiance < seuil ;
- pas de trade si décision inexpliquée.

## 21.2 Contenu attendu

- règles actives ;
- règles système ;
- règles personnalisées ;
- règles critiques ;
- couverture des agents ;
- conformité ;
- table de règles ;
- filtres ;
- éditeur de règle ;
- conditions ;
- actions ;
- cibles ;
- conflits détectés ;
- garde-fous recommandés ;
- impact de la règle ;
- utilisation de la règle.

## 21.3 Principe

Chaque règle doit pouvoir être attachée à :

- un agent ;
- une stratégie ;
- un marché ;
- un mode de trading ;
- un niveau de capital.

---

# 22. Validation humaine

Cette page gère les trades nécessitant approbation.

## 22.1 KPI attendus

- en attente de validation ;
- approuvés ;
- refusés ;
- expirés ;
- temps moyen de réponse ;
- trades sensibles.

## 22.2 Déclencheurs de validation

- premier trade d’une stratégie ;
- après 2 pertes ;
- actif non testé ;
- montant élevé ;
- confiance faible ;
- risque élevé.

## 22.3 Contenu attendu

- file d’attente ;
- filtres ;
- détails du trade ;
- graphique ;
- raisonnement de l’agent ;
- évaluation du risque ;
- checklist de validation ;
- boutons Valider / Refuser / Modifier conditions ;
- règles de déclenchement ;
- journal d’audit ;
- statut du réviseur ;
- recommandations IA ;
- contexte global.

---

# 23. Apprentissage de l’agent

L’agent doit apprendre, mais de façon contrôlée.

Il doit produire :

- erreurs fréquentes ;
- leçon du jour ;
- ajustements proposés ;
- hypothèses à backtester ;
- règles à renforcer ;
- score d’amélioration.

Il ne doit pas modifier une stratégie critique sans test ou validation.

---

# 24. Journalisation obligatoire

Tout doit être journalisé :

- trades ;
- décisions refusées ;
- alertes ;
- validations humaines ;
- changements de règles ;
- changements de stratégie ;
- simulations de crise ;
- post-mortems ;
- progressions de capital ;
- rétrogradations ;
- arrêts d’urgence.

---

# 25. Disclaimers obligatoires

L’application doit intégrer ces messages :

```text
Cette application ne fournit pas de conseil financier.
Les performances passées ou simulées ne garantissent pas les performances futures.
Le trading comporte un risque de perte en capital.
L’utilisateur reste responsable de l’activation du mode réel.
Le paper trading doit être utilisé avant tout déploiement réel.
```

---

# 26. Résultat final attendu

L’application finale doit permettre de répondre à tout moment :

- Que fait l’agent ?
- Pourquoi le fait-il ?
- Que voit-il ?
- Respecte-t-il les règles ?
- Est-il discipliné ?
- Est-il mature ?
- Est-il trop risqué ?
- Mérite-t-il plus de capital ?
- Faut-il le rétrograder ?
- Faut-il demander une validation humaine ?
- Quelle décision aurait-il dû prendre ?
- Que doit-il apprendre ?

---

# 27. Résumé final

**Agent Trader AI** doit être un système complet de supervision d’agent trader autonome avec :

- mode observateur ;
- paper trading ;
- micro-capital réel progressif ;
- dashboard global ;
- gestion des agents ;
- création d’agents ;
- sélection des marchés ;
- création de stratégies ;
- backtests ;
- journal de trading ;
- gestion du risque ;
- capital & progression ;
- maturité de l’agent ;
- post-mortem hebdomadaire ;
- simulateur de crise ;
- replay de décision ;
- centre d’alertes ;
- bibliothèque de règles ;
- validation humaine ;
- paramètres complets.

Le cœur du produit :

> Créer un agent trader autonome, mais jamais hors contrôle. Il doit prouver sa discipline, sa robustesse et sa maturité avant de recevoir plus de capital.

---

# 18. Sélection du LLM, clés API et fournisseurs IA

## 18.1 Objectif

L’application doit permettre à l’utilisateur de choisir **quel LLM pilote chaque agent**.

L’utilisateur doit pouvoir utiliser :

- un modèle OpenAI ;
- un modèle Anthropic ;
- un modèle Google Gemini ;
- un modèle Mistral ;
- un modèle xAI Grok ;
- un modèle open-source auto-hébergé ;
- un endpoint compatible OpenAI ;
- un modèle personnalisé si l’utilisateur possède une référence privée.

Le système doit être conçu comme une couche d’orchestration multi-LLM.

---

## 18.2 Point important sur GPT-5.5

Le dashboard doit permettre de sélectionner un modèle nommé **GPT-5.5 Thinking** si l’utilisateur dispose d’un accès API ou d’une référence privée.

Cependant, le système ne doit pas présupposer que ce modèle est publiquement disponible. Il doit permettre de l’ajouter comme modèle personnalisé.

Exemple :

```text
Fournisseur : OpenAI
Nom affiché : GPT-5.5 Thinking
Model ID : gpt-5.5-thinking
Statut : personnalisé / accès privé
Rôle : raisonnement stratégique
```

Si l’API retourne une erreur ou si le modèle n’est pas disponible, le système doit basculer vers un modèle de secours.

---

## 18.3 Où configurer le LLM dans l’application

La sélection du LLM doit apparaître à plusieurs endroits.

### Dans la page Paramètres

Section :

```text
Paramètres → Modèles IA & fournisseurs
```

Cette section doit permettre de gérer :

- fournisseur IA ;
- clé API ;
- endpoint ;
- modèle par défaut ;
- modèle de secours ;
- coût estimé ;
- latence moyenne ;
- statut de connexion ;
- test de connexion ;
- rotation de clé API ;
- journal d’utilisation.

### Dans la page Nouvel agent

Lors de la création d’un agent, l’utilisateur doit pouvoir choisir :

```text
LLM principal : raisonnement stratégique
LLM rapide : scan marché
LLM auditeur : contrôle des décisions
LLM fallback : secours
```

### Dans la fiche d’un agent

Chaque agent doit afficher :

```text
Modèle actif : GPT-5.5 Thinking
Fournisseur : OpenAI
Rôle : Raisonnement stratégique
Latence moyenne : 820 ms
Coût estimé aujourd’hui : 0,42 $
Fallback : GPT-5.2
Statut API : Opérationnel
```

---

## 18.4 Architecture recommandée des modèles

Un seul LLM ne doit pas tout faire.

L’agent doit être découpé en rôles :

```text
LLM de raisonnement stratégique
↓
Moteur de stratégie
↓
Moteur de risque déterministe
↓
LLM auditeur
↓
Exécuteur d’ordres
↓
Journalisation
```

Le LLM ne doit jamais exécuter directement un ordre sans passer par :

- moteur de règles ;
- moteur de risque ;
- validation éventuelle ;
- audit ;
- journalisation.

---

## 18.5 Rôles LLM recommandés

Chaque agent doit pouvoir avoir plusieurs modèles associés.

### LLM principal

Usage :

- raisonnement stratégique ;
- analyse complexe ;
- décision haut niveau ;
- explication avant trade ;
- post-mortem ;
- validation des scénarios.

Modèle recommandé :

```text
GPT-5.5 Thinking si disponible
Sinon GPT-5.2 / Claude Opus / Gemini Pro / Grok reasoning / Mistral Large selon fournisseur choisi
```

### LLM rapide

Usage :

- scan marché ;
- résumé rapide ;
- classification de signaux ;
- monitoring ;
- alertes.

Modèles typiques :

```text
GPT-5 mini / GPT-5 nano
Claude Haiku
Gemini Flash
Mistral Small
Grok Fast
```

### LLM auditeur

Usage :

- vérifier que la décision respecte les règles ;
- détecter les contradictions ;
- refuser un trade mal justifié ;
- produire une conclusion d’audit.

Modèles typiques :

```text
GPT-5.5 Thinking si disponible
GPT-5.2 pro
Claude Opus
Gemini Pro
Magistral / Mistral reasoning
```

### LLM fallback

Usage :

- prendre le relais si le modèle principal est indisponible ;
- réduire les coûts ;
- assurer continuité de service.

---

## 18.6 Gestion des clés API

L’application doit proposer deux modes de configuration.

### Mode développeur : fichier .env

Pour un usage local ou technique, l’utilisateur peut configurer les clés dans un fichier `.env`.

Exemple :

```env
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
GOOGLE_API_KEY=...
MISTRAL_API_KEY=...
XAI_API_KEY=...
DEFAULT_LLM_PROVIDER=openai
DEFAULT_REASONING_MODEL=gpt-5.2
DEFAULT_FAST_MODEL=gpt-5-mini
CUSTOM_GPT55_MODEL_ID=gpt-5.5-thinking
```

Ce mode est recommandé pour :

- développement local ;
- prototype ;
- test technique ;
- déploiement privé.

### Mode utilisateur : dashboard sécurisé

Pour un produit SaaS, l’utilisateur doit pouvoir entrer ses clés API dans le dashboard.

La page doit proposer :

```text
Ajouter un fournisseur IA
→ Choisir OpenAI / Anthropic / Google / Mistral / xAI / Custom
→ Coller la clé API
→ Choisir le modèle
→ Tester la connexion
→ Enregistrer de manière sécurisée
```

La clé API ne doit jamais être exposée côté frontend après enregistrement.

Elle doit être :

- chiffrée côté serveur ;
- masquée dans l’interface ;
- révocable ;
- testable ;
- journalisée en cas d’utilisation ;
- associée à un utilisateur ou workspace ;
- protégée par permissions.

Affichage recommandé :

```text
OpenAI API Key : sk-••••••••••••••••ab92
Statut : Connecté
Dernier test : il y a 2 min
Modèle par défaut : GPT-5.2
Fallback : GPT-5 mini
```

---

## 18.7 Fournisseurs et modèles à proposer dans le dashboard

Le dashboard doit afficher une liste de modèles disponibles ou configurables.

La liste doit être dynamique, car les modèles changent souvent. Le système doit donc permettre de :

- charger les modèles depuis le fournisseur ;
- ajouter un modèle manuellement ;
- désactiver un modèle déprécié ;
- verrouiller une version stable ;
- utiliser un alias ou un snapshot ;
- définir un modèle fallback.

### OpenAI

Modèles à proposer :

```text
GPT-5.2
GPT-5.2 pro
GPT-5
GPT-5 mini
GPT-5 nano
GPT-4.1
gpt-oss-120b
gpt-oss-20b
Custom : GPT-5.5 Thinking si disponible pour l’utilisateur
```

Usage recommandé :

```text
GPT-5.2 / GPT-5.2 pro : raisonnement complexe, agent principal, audit
GPT-5 mini : tâches rapides, scan, résumé, monitoring
GPT-5 nano : tâches très fréquentes et économiques
gpt-oss : déploiement open-weight / self-hosting
Custom GPT-5.5 Thinking : cerveau principal si l’utilisateur a accès au modèle
```

### Anthropic Claude

Modèles à proposer :

```text
Claude Opus 4.7
Claude Sonnet 4.6
Claude Haiku 4.5
```

Usage recommandé :

```text
Claude Opus : audit, raisonnement complexe, analyse de risque
Claude Sonnet : bon équilibre coût / intelligence
Claude Haiku : scan rapide, monitoring, tâches simples
```

### Google Gemini

Modèles à proposer :

```text
Gemini 3 Pro Preview
Gemini 3 Flash Preview
Gemini 2.5 Pro
Gemini 2.5 Flash
Gemini 2.5 Flash-Lite
```

Usage recommandé :

```text
Gemini 3 Pro : analyse multimodale, raisonnement, documents, vision
Gemini 3 Flash : rapidité et coût maîtrisé
Gemini 2.5 Pro : raisonnement stable
Gemini 2.5 Flash / Flash-Lite : monitoring et tâches fréquentes
```

### Mistral AI

Modèles à proposer :

```text
Mistral Large 3
Mistral Medium 3.1
Mistral Small 4
Magistral Medium 1.2
Magistral Small 1.2
Devstral 2
Ministral 3
```

Usage recommandé :

```text
Mistral Large / Medium : raisonnement général et production
Magistral : raisonnement et vérification
Mistral Small : tâches rapides
Devstral : tâches code / agent engineering
Ministral : faible coût ou edge/local
```

### xAI Grok

Modèles à proposer :

```text
Grok 4.20 reasoning
Grok 4.20 non-reasoning
Grok 4.1 Fast reasoning
Grok 4.1 Fast non-reasoning
```

Usage recommandé :

```text
Grok reasoning : raisonnement et outils agentiques
Grok Fast : scan rapide, monitoring, faible latence
```


### Fournisseurs asiatiques à ajouter

Le dashboard doit proposer une catégorie dédiée **LLM asiatiques**, car plusieurs modèles chinois, coréens et japonais peuvent être intéressants pour un agent trader, notamment pour le coût, la latence, le long contexte, l’open-source, le raisonnement agentique ou les marchés asiatiques.

Cette section doit être affichée dans :

```text
Paramètres → Modèles IA
Nouvel agent → Choix du modèle IA
Fiche agent → Modèle actif
Validation humaine → Modèle auditeur utilisé
Replay de décision → Modèle ayant raisonné
```

Le système doit permettre à l’utilisateur de connecter ces modèles de deux façons :

```text
1. Via le dashboard utilisateur
   - fournisseur
   - base URL
   - clé API
   - secret key si nécessaire
   - model ID
   - région
   - format API

2. Via fichier .env
   - pour les développeurs
   - pour un déploiement serveur
   - pour éviter de stocker les clés côté interface
```

#### DeepSeek

Modèles à proposer :

```text
deepseek-v4-pro
deepseek-v4-flash
deepseek-chat
deepseek-reasoner
```

Usage recommandé :

```text
DeepSeek V4 Pro : raisonnement complexe, agent principal, audit technique
DeepSeek V4 Flash : scan rapide, monitoring, décisions fréquentes à faible coût
DeepSeek Reasoner : raisonnement si encore disponible ou via alias de compatibilité
```

Configuration attendue :

```text
Provider : DeepSeek
Base URL : https://api.deepseek.com
API key : DEEPSEEK_API_KEY
Format : OpenAI-compatible / Anthropic-compatible selon mode choisi
```

Note produit : le dashboard doit afficher un avertissement si un modèle DeepSeek est marqué comme déprécié, remplacé ou aliasé vers une nouvelle version.

#### Alibaba Qwen / DashScope

Modèles à proposer :

```text
qwen3.5-plus
qwen-plus
qwen-max
qwen-turbo
qwen-coder
qwen-long
qwen-omni / qwen-vl selon disponibilité
```

Usage recommandé :

```text
Qwen Max / Qwen 3.5 Plus : agent principal, raisonnement, analyse multimodale
Qwen Plus : équilibre coût / qualité
Qwen Turbo : scan marché, monitoring, tâches rapides
Qwen Coder : génération ou analyse de code de stratégie
Qwen Long : documents longs, rapports, journalisation étendue
```

Configuration attendue :

```text
Provider : Alibaba Cloud DashScope
Base URL : https://dashscope-intl.aliyuncs.com/api/v1 ou endpoint régional
API key : DASHSCOPE_API_KEY
Model ID : qwen-plus / qwen3.5-plus / qwen-max / autre
Format : DashScope natif ou OpenAI-compatible
```

Note produit : l’utilisateur doit pouvoir choisir la région, car certains modèles ou endpoints peuvent dépendre de la zone Alibaba Cloud utilisée.

#### Moonshot AI / Kimi

Modèles à proposer :

```text
kimi-k2.6
kimi-k2.5
moonshot-v1-8k
moonshot-v1-32k
moonshot-v1-128k
moonshot-v1-vision-preview
```

Usage recommandé :

```text
Kimi K2.6 / K2.5 : agent principal, long contexte, raisonnement agentique, analyse de documents
Moonshot 128k : rapports longs, mémoire de trading, analyse historique
Moonshot Vision : analyse de captures, graphiques, documents visuels
```

Configuration attendue :

```text
Provider : Moonshot AI / Kimi
Base URL : endpoint Kimi API
API key : KIMI_API_KEY ou MOONSHOT_API_KEY
Model ID : kimi-k2.6 / kimi-k2.5 / moonshot-v1-128k
Format : Kimi API / OpenAI-compatible si disponible
```

Note produit : Kimi doit être proposé pour les workflows à long contexte et les journaux détaillés, car il peut être utile pour relire beaucoup d’historique de trading.

#### MiniMax

Modèles à proposer :

```text
MiniMax-M2.7
MiniMax-M2.7-highspeed
MiniMax-M2.5
MiniMax-M2.5-highspeed
MiniMax-M2.1
MiniMax-M2.1-highspeed
MiniMax-M2
```

Usage recommandé :

```text
MiniMax M2.7 : agent principal, raisonnement, tâches agentiques longues
MiniMax M2.7 highspeed : scan rapide, monitoring, faible latence
MiniMax M2.5 : équilibre coût / intelligence
MiniMax M2 : agentic workflows et tool calling
```

Configuration attendue :

```text
Provider : MiniMax
Base URL : endpoint MiniMax API
API key : MINIMAX_API_KEY
Model ID : MiniMax-M2.7 / MiniMax-M2.7-highspeed
Format : MiniMax natif / Anthropic-compatible / OpenAI-compatible selon connecteur
```

Note produit : MiniMax doit être intéressant pour les agents qui font beaucoup de tool calling, de génération longue ou de tâches multi-étapes.

#### Tencent Hunyuan / Hy

Modèles à proposer :

```text
Hy3 Preview
Hunyuan / Tencent Hunyuan
Hunyuan Turbo / Lite selon disponibilité cloud
```

Usage recommandé :

```text
Hy3 Preview : raisonnement agentique, long contexte, analyse complexe
Hunyuan : génération, raisonnement, dialogue multi-tour
Hunyuan Lite / Turbo : monitoring, scan rapide, tâches répétitives
```

Configuration attendue :

```text
Provider : Tencent Cloud Hunyuan
Base URL : Tencent Cloud API endpoint
SecretId : TENCENT_SECRET_ID
SecretKey : TENCENT_SECRET_KEY
Model ID : hy3-preview / hunyuan / autre ID cloud
Format : Tencent Cloud API ou adaptateur custom
```

Note produit : prévoir un adaptateur spécifique Tencent, car l’authentification peut utiliser SecretId / SecretKey plutôt qu’une simple API key.

#### Baidu ERNIE / Wenxin

Modèles à proposer :

```text
ERNIE 4.5
ERNIE X1
ERNIE Bot 4.0
ERNIE Bot Turbo
ERNIE Bot Lite
```

Usage recommandé :

```text
ERNIE 4.5 : raisonnement général, analyse multimodale, agent principal Chine/Asie
ERNIE X1 : cas métiers spécialisés, analyse secteur, workflows entreprise
ERNIE Bot Turbo / Lite : tâches rapides et économiques
```

Configuration attendue :

```text
Provider : Baidu Qianfan / Wenxin
API key : BAIDU_API_KEY
Secret key : BAIDU_SECRET_KEY
Access token : généré côté backend
Model ID : ernie-4.5 / ernie-x1 / ERNIE-Bot-4.0 / autre
Format : Baidu Qianfan / Wenxin API
```

Note produit : prévoir une gestion OAuth / access token côté backend, car l’accès Baidu peut nécessiter API Key + Secret Key.

#### Zhipu AI / GLM / Z.ai

Modèles à proposer :

```text
GLM-5
GLM-5.1
GLM-5 Turbo
GLM-5V-Turbo
GLM-4.7-Flash
```

Usage recommandé :

```text
GLM-5 / GLM-5.1 : raisonnement, code, agent principal, audit technique
GLM-5 Turbo : équilibre vitesse / qualité
GLM-5V-Turbo : analyse multimodale et visuelle
GLM Flash : monitoring et tâches rapides
```

Configuration attendue :

```text
Provider : Zhipu AI / Z.ai
Base URL : endpoint GLM API
API key : ZHIPU_API_KEY ou ZAI_API_KEY
Model ID : glm-5 / glm-5.1 / glm-5-turbo / autre
Format : GLM natif / OpenAI-compatible si disponible
```

Note produit : GLM doit être proposé comme option asiatique forte pour le raisonnement, le code et les agents techniques.

#### ByteDance Doubao / Volcano Engine

Modèles à proposer :

```text
Doubao 2.0 Pro
Doubao 2.0 Lite
Doubao Pro 256K
Doubao Pro 128K
Doubao Lite 128K
Seed / Seed-OSS selon disponibilité
```

Usage recommandé :

```text
Doubao 2.0 Pro : agent principal, workflows multi-étapes, raisonnement complexe
Doubao Lite : monitoring, scan, faible coût
Doubao Pro 256K : long contexte, analyse historique, journalisation étendue
Seed-OSS : option open-source / self-host selon disponibilité
```

Configuration attendue :

```text
Provider : ByteDance Volcano Engine / Doubao
Base URL : Volcano Engine endpoint
API key : DOUBAO_API_KEY ou VOLCENGINE_API_KEY
Model ID : doubao-pro / doubao-lite / seed-oss / autre
Format : Volcano Engine natif / OpenAI-compatible si disponible
```

Note produit : Doubao doit être classé comme option asiatique majeure pour les agents orientés exécution, tâches longues et coûts optimisés.

#### Naver HyperCLOVA X

Modèles à proposer :

```text
HyperCLOVA X
HyperCLOVA X custom endpoint
```

Usage recommandé :

```text
HyperCLOVA X : langues coréennes et asiatiques, analyse régionale, contenu marché Asie
```

Configuration attendue :

```text
Provider : Naver Cloud / CLOVA Studio
Base URL : endpoint Naver Cloud
API key : NAVER_API_KEY
Secret : NAVER_SECRET_KEY si requis
Model ID : hyperclova-x / endpoint personnalisé
Format : Naver Cloud API / Custom adapter
```

#### Autres modèles asiatiques à prévoir en mode custom

Le dashboard doit aussi prévoir un ajout manuel pour des fournisseurs asiatiques non listés ou émergents, par exemple :

```text
LG EXAONE
Upstage Solar
Rakuten AI
Sakana AI
Preferred Networks
NTT Tsuzumi
Huawei Pangu
01.AI Yi
InternLM
Baichuan
StepFun Step
SenseTime SenseNova
```

Ces modèles doivent être ajoutables via :

```text
Provider custom
Base URL
API key
Secret key optionnelle
Model ID
Format API
Région
Coût estimé
Latence moyenne
Rôle dans l’agent
```

### Logique de sélection recommandée pour les LLM asiatiques

Le dashboard doit aider l’utilisateur à choisir le modèle selon le rôle :

```text
Raisonnement principal : DeepSeek V4 Pro, Qwen Max/3.5 Plus, Kimi K2.6, GLM-5, MiniMax M2.7, Hy3
Scan rapide : DeepSeek V4 Flash, Qwen Turbo, MiniMax highspeed, ERNIE Turbo, Doubao Lite
Audit / validation : DeepSeek Pro, GLM-5, Qwen Max, Kimi K2.6, MiniMax M2.7
Long contexte : Kimi K2.6, Moonshot 128k, Qwen Long, Doubao 256K, GLM-5
Marchés asiatiques : Qwen, ERNIE, Hunyuan, HyperCLOVA X, Kimi
Coût optimisé : DeepSeek Flash, Qwen Turbo, MiniMax highspeed, Doubao Lite, ERNIE Lite
```

### Variables .env à prévoir pour les LLM asiatiques

Le fichier `.env` doit pouvoir contenir :

```env
# DeepSeek
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_DEFAULT_MODEL=deepseek-v4-pro

# Alibaba Qwen / DashScope
DASHSCOPE_API_KEY=
DASHSCOPE_BASE_URL=https://dashscope-intl.aliyuncs.com/api/v1
QWEN_DEFAULT_MODEL=qwen-plus

# Moonshot / Kimi
KIMI_API_KEY=
KIMI_BASE_URL=
KIMI_DEFAULT_MODEL=kimi-k2.6

# MiniMax
MINIMAX_API_KEY=
MINIMAX_BASE_URL=
MINIMAX_DEFAULT_MODEL=MiniMax-M2.7

# Tencent Hunyuan
TENCENT_SECRET_ID=
TENCENT_SECRET_KEY=
TENCENT_HUNYUAN_REGION=
TENCENT_HUNYUAN_MODEL=hy3-preview

# Baidu ERNIE / Wenxin
BAIDU_API_KEY=
BAIDU_SECRET_KEY=
BAIDU_DEFAULT_MODEL=ernie-4.5

# Zhipu / GLM / Z.ai
ZHIPU_API_KEY=
ZHIPU_BASE_URL=
ZHIPU_DEFAULT_MODEL=glm-5

# ByteDance Doubao / Volcano Engine
VOLCENGINE_API_KEY=
VOLCENGINE_BASE_URL=
DOUBAO_DEFAULT_MODEL=doubao-pro

# Naver HyperCLOVA X
NAVER_API_KEY=
NAVER_SECRET_KEY=
NAVER_BASE_URL=
NAVER_DEFAULT_MODEL=hyperclova-x
```

### Affichage dashboard recommandé

Dans le dashboard, la sélection du LLM doit afficher :

```text
Fournisseur
Pays / région
Modèle
Rôle : principal / rapide / auditeur / fallback
Contexte max
Mode raisonnement disponible : oui/non
Tool calling : oui/non
Multimodal : oui/non
Coût estimé
Latence moyenne
Statut API
Dernière vérification
Clé configurée : oui/non
```

Le système doit aussi proposer un bouton :

```text
Tester la connexion
Tester un prompt
Comparer avec modèle actuel
Définir comme modèle principal
Définir comme fallback
```

### Modèles custom / OpenAI-compatible

Le dashboard doit aussi permettre :

```text
Provider : Custom
Base URL : https://...
API key : ...
Model ID : ...
Format : OpenAI compatible / Anthropic compatible / Custom adapter
```

Utile pour :

- modèles locaux ;
- modèles hébergés sur serveur privé ;
- routeurs LLM ;
- modèles open source ;
- modèles propriétaires ;
- accès privés ou bêta.

---

## 18.8 Configuration par agent

Chaque agent doit avoir sa propre configuration LLM.

Exemple :

```yaml
agent_id: alpha-01
llm_profile:
  reasoning_model:
    provider: openai
    model: gpt-5.5-thinking
    fallback: gpt-5.2
  fast_model:
    provider: openai
    model: gpt-5-mini
  audit_model:
    provider: anthropic
    model: claude-opus-4.7
  report_model:
    provider: google
    model: gemini-3-flash-preview
  local_fallback:
    provider: mistral
    model: mistral-small-4
```

---

## 18.9 Sécurité autour des LLM

Le LLM ne doit pas pouvoir :

- passer un ordre directement ;
- modifier une règle critique sans validation ;
- changer son propre modèle sans autorisation ;
- augmenter son niveau d’autonomie ;
- désactiver le moteur de risque ;
- ignorer une validation humaine ;
- contourner le kill switch.

Toutes les sorties du LLM doivent être structurées et validées.

Exemple :

```json
{
  "decision": "propose_trade",
  "asset": "BTC/USDT",
  "side": "LONG",
  "confidence": 0.68,
  "risk_percent": 0.5,
  "requires_human_validation": true,
  "reason": "Momentum haussier confirmé, volume supérieur à la moyenne",
  "invalid_if": ["spread élevé", "volatilité extrême", "drawdown journalier dépassé"]
}
```

Le moteur de risque doit pouvoir refuser cette décision, même si le LLM est confiant.

---

## 18.10 UI recommandée pour la sélection LLM

Ajouter une page ou section :

```text
Paramètres → Modèles IA
```

Elle doit afficher :

- fournisseurs connectés ;
- clés API masquées ;
- modèles disponibles ;
- modèle principal ;
- modèle rapide ;
- modèle auditeur ;
- modèle fallback ;
- coût estimé journalier ;
- latence ;
- taux d’erreur ;
- tokens consommés ;
- statut API ;
- bouton tester ;
- bouton changer modèle ;
- bouton révoquer clé.

Dans l’écran **Nouvel agent**, ajouter un bloc :

```text
Configuration IA
- LLM principal
- LLM rapide
- LLM auditeur
- Fallback
- Niveau de raisonnement
- Budget de tokens
- Température
- Mode prudent / équilibré / créatif
```

Dans la fiche agent, afficher :

```text
Cerveau IA actif
Modèle : GPT-5.5 Thinking
Fournisseur : OpenAI
Rôle : Raisonnement stratégique
Fallback : GPT-5.2
Statut : Opérationnel
Coût aujourd’hui : 0,42 $
Latence moyenne : 820 ms
```

---

## 18.11 Recommandation finale de configuration pour ce projet

Configuration recommandée pour démarrer :

```text
LLM principal : GPT-5.5 Thinking si disponible, sinon GPT-5.2
LLM rapide : GPT-5 mini ou Gemini Flash
LLM auditeur : Claude Opus ou GPT-5.2 pro
LLM fallback : Mistral Large 3 ou Gemini 2.5 Pro
Mode : Paper Trading
Autonomie : modérée
Validation humaine : activée pour décisions sensibles
```

Le modèle idéal pour le cœur de l’agent est un modèle de raisonnement fort, mais il doit toujours être contraint par le moteur de règles.

---

# 19. Mise à jour du résumé final

L’application doit maintenant inclure une couche **multi-LLM configurable**.

Le produit final doit permettre à l’utilisateur de choisir :

- son fournisseur IA ;
- sa clé API ;
- son modèle principal ;
- son modèle rapide ;
- son modèle auditeur ;
- son modèle fallback ;
- un modèle personnalisé comme GPT-5.5 Thinking si disponible.

Le dashboard doit permettre cette configuration sans obliger l’utilisateur à modifier du code.

Le fichier `.env` reste utile pour les développeurs, mais dans une application complète, le choix du LLM et l’ajout de clés API doivent être disponibles depuis l’interface utilisateur sécurisée.

---

# 20. Intégration OpenClaw

OpenClaw doit être intégré comme un **runtime agentique externe**, connecté à l’application via son Gateway, son API, son protocole RPC/WebSocket, un webhook ou un SDK officiel selon la surface disponible.

L’application Agent Trader AI ne doit pas embarquer tout le code OpenClaw dans son code principal. Elle doit contenir uniquement un connecteur OpenClaw chargé de communiquer avec un runtime OpenClaw séparé.

Architecture cible :

```text
Frontend Next.js Agent Trader AI
   ↓
Backend API de l’application
   ↓
Connecteur OpenClaw
   ↓
OpenClaw Gateway / runtime séparé
   ↓
Agents OpenClaw
   ↓
LLM et outils autorisés
```

Dans Agent Trader AI, le code OpenClaw doit rester limité à une couche d’intégration :

```text
src/lib/openclaw/
  client.ts
  types.ts
  actions.ts
  sync.ts
```

Ce dossier ne contient pas le runtime OpenClaw. Il contient seulement le code permettant à l’application de parler à OpenClaw.

Le connecteur OpenClaw doit permettre de :

- configurer l’URL du Gateway OpenClaw ;
- configurer un token ou secret d’accès ;
- tester la connexion ;
- lire le statut du Gateway ;
- synchroniser les agents ;
- envoyer une demande d’analyse à un agent ;
- recevoir une proposition de trade structurée ;
- récupérer les logs et événements utiles ;
- afficher le statut des agents dans le dashboard ;
- transmettre les propositions au Risk Engine de l’application.

OpenClaw reste responsable de :

- agents ;
- sous-agents ;
- sessions ;
- workflows ;
- mémoire ;
- appels LLM ;
- outils agentiques ;
- exécution des tâches agentiques autorisées.

Agent Trader AI reste responsable de :

- dashboard ;
- Risk Engine ;
- validation humaine ;
- journal ;
- alertes ;
- progression du capital ;
- kill switch ;
- règles de risque ;
- supervision ;
- décision finale avant toute simulation ou exécution.

Principe non négociable :

```text
OpenClaw propose.
Agent Trader AI valide, bloque, journalise ou autorise.
```

Flux recommandé pour une proposition de trade :

```text
1. Un agent OpenClaw détecte une opportunité.
2. OpenClaw envoie une proposition structurée au backend Agent Trader AI.
3. Le backend passe la proposition au Risk Engine.
4. Le Risk Engine valide ou refuse.
5. Si validé : paper trading ou demande de validation humaine selon les règles.
6. Si refusé : alerte + journalisation.
7. Le dashboard affiche la décision, la raison et les logs OpenClaw associés.
```

La page Paramètres doit prévoir une section :

```text
Paramètres → OpenClaw Runtime
```

Elle doit afficher :

- Gateway URL ;
- mode d’authentification ;
- clé ou token masqué ;
- statut de connexion ;
- version détectée ;
- dernier heartbeat ;
- agents synchronisés ;
- bouton tester la connexion ;
- bouton synchroniser les agents ;
- bouton voir les logs ;
- avertissement sécurité si OpenClaw est exposé hors localhost.

Les agents synchronisés depuis OpenClaw doivent apparaître dans la page Agents avec un indicateur clair :

```text
Runtime : OpenClaw
Agent ID : alpha-01
Statut : connecté
Dernier heartbeat : il y a 8 s
Mémoire : active
Workflow : Trend Momentum
```

Sécurité obligatoire :

- ne jamais exposer le token OpenClaw au frontend ;
- ne jamais donner à OpenClaw le droit direct de passer un ordre réel ;
- ne jamais laisser OpenClaw contourner le Risk Engine ;
- refuser toute proposition mal formée ;
- journaliser chaque proposition reçue ;
- conserver le kill switch comme autorité supérieure ;
- exiger une validation humaine pour les trades sensibles ;
- préférer un Gateway local, tailnet ou réseau privé plutôt qu’un endpoint public.

OpenClaw peut être puissant, mais dans ce produit il doit rester un moteur agentique supervisé. Il ne doit jamais devenir l’autorité financière finale.
