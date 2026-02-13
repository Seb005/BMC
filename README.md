# BMC — Business Model Canvas interactif

Guide étape par étape pour construire un Business Model Canvas (méthode Osterwalder).
Projet du [Labo Kodra](https://labo.kodra.ca).

## Stack

- **Frontend** : HTML standalone (CSS + JS inline, aucun build)
- **Backend** : Vercel Serverless Function (`api/chat.js`)
- **IA** : Anthropic SDK — `claude-haiku-4-5-20251001`
- **Hébergement** : Vercel (à venir)

## Structure

```
BMC/
├── index.html        ← App complète (sidebar + formulaire + assistant IA)
├── api/
│   └── chat.js       ← Endpoint serverless (streaming SSE)
├── package.json      ← Dépendance @anthropic-ai/sdk
├── .gitignore
└── README.md
```

## Fonctionnalités

### ✅ Réalisé

- [x] **9 étapes du BMC** avec contenu éducatif (intro, questions clés, conseils)
- [x] **Menu latéral gauche** (sidebar) avec navigation directe entre les étapes
- [x] **États visuels** dans la sidebar : active (orange), complétée (vert ✓), inactive (gris)
- [x] **Formulaire** : textarea par étape avec compteur de caractères
- [x] **Écran de révision** : grille BMC classique (layout Osterwalder 10 colonnes)
- [x] **Export PDF** : format Tabloïd paysage via `window.print()` + `@media print`
- [x] **UI Assistant IA** : zone de chat, bulles, input, boutons rapides
- [x] **Backend IA** : `api/chat.js` avec streaming SSE, rate limiting (20 req/min)
- [x] **3 modes IA** : Suggérer du contenu, Améliorer le texte, Chat libre
- [x] **Contexte IA** : le prompt inclut les données de tous les blocs déjà remplis
- [x] **Bouton « Utiliser cette suggestion »** : insère le texte généré dans le textarea
- [x] **Historique IA par bloc** : chaque étape conserve son propre historique de chat
- [x] **Responsive** : sidebar repliable avec hamburger ≤ 900px
- [x] **Thème clair** : fond blanc, cartes `#f8fafc`, accent orange `#F97316`

### 🔲 À faire

- [ ] Déployer sur Vercel + configurer `ANTHROPIC_API_KEY` en variable d'environnement
- [ ] Configurer le sous-domaine `bmc.kodra.ca` (CNAME → `cname.vercel-dns.com`)
- [ ] Ajouter une carte dans le [labo-index](https://labo.kodra.ca)
- [ ] Tester l'assistant IA en conditions réelles (vérifier le streaming, les suggestions)
- [ ] Ajouter Google Analytics (`G-RE43BML4L2`)
- [ ] Sauvegarde locale (localStorage) pour ne pas perdre les données au refresh
- [ ] Import/export des données (JSON) pour partager ou reprendre un BMC
- [ ] Optimiser l'UX mobile (taille des textareas, scroll)

## Développement local

```bash
# Installer les dépendances (nécessaire pour l'IA)
npm install

# Lancer le serveur local Vercel
vercel dev
```

> **Note** : L'app HTML fonctionne sans serveur (double-clic sur `index.html`) pour tout sauf l'assistant IA qui nécessite `vercel dev` avec la clé API configurée.

### Variable d'environnement requise

```
ANTHROPIC_API_KEY=sk-ant-...
```

À configurer dans `.env.local` (dev) ou dans les settings Vercel (production).

## Charte visuelle

| Élément | Valeur |
|---------|--------|
| Fond | `#ffffff` |
| Cartes | `#f8fafc` |
| Bordures | `#e2e8f0` |
| Orange (accent) | `#F97316` |
| Orange hover | `#EA580C` |
| Texte principal | `#1e293b` |
| Texte secondaire | `#64748b` |
| Police | `system-ui, -apple-system, sans-serif` |

## Architecture IA

Le system prompt est construit dynamiquement avec :
- Le nom et la description du bloc actuel
- Le contenu déjà saisi dans les autres blocs (contexte croisé)
- Le mode demandé (`suggest`, `improve`, `chat`)

Modèle : **Claude Haiku 4.5** — rapide et économique pour de l'assistance conversationnelle.
