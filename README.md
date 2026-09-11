# Framebrief

POC d’interface de désignation visuelle pour transformer des gestes sur une timeline vidéo en annotations structurées utilisables par une IA.

## Démarrer

```bash
npm install
npm run dev
```

Le projet fonctionne entièrement dans le navigateur. Les métadonnées et annotations sont sauvegardées dans `localStorage`. Les fichiers vidéo/audio et leurs vignettes sont conservés dans IndexedDB et restaurés après actualisation, sans téléversement. Les fichiers importés avant cette fonctionnalité doivent être choisis une dernière fois. La conservation dépend de l’espace disponible et du stockage du navigateur ; effacer les données du site supprime ses copies locales.

## Gestes

- « Annoter toute la vidéo » sélectionne le média entier et donne au JSON la portée `media`.
- « Insérer dans une autre piste » dans le prompt permet de choisir une destination et son temps exact en secondes ; cette aide apparaît uniquement avec une autre piste vidéo. L’instruction générée reste éditable et la relation source/destination est enregistrée séparément.

## Reprendre un workspace de production

Après `npm link` dans le dépôt Framebrief, lancer `framebrief serve --workspace /chemin/absolu/du/projet --port 5174`, puis ouvrir l’URL indiquée. Le serveur utilise le `dist` empaqueté, pas le projet source. L’agent lit `VIDEO.md` dans ce dossier et ouvre le checkpoint `video.review.json`, sans reprendre le projet du stockage navigateur.

Les annotations sont sauvegardées automatiquement dans ce JSON. Les fichiers déposés sont copiés dans `.framebrief/media/`. `VIDEO.md` est créé si absent ; un brief existant est préservé et synchronisé explicitement par l’agent. Une écriture concurrente du checkpoint interrompt la sauvegarde avec un message, sans écraser la version disque ; exporter les modifications locales avant de recharger pour les conserver.

`videos[].source` contient `{ engine, path, renderPath }` : source éditable et aperçu rendu, avec chemins relatifs au workspace. L’outil WebMCP `set_video_source` renseigne ce lien. Un MP4 issu d’HyperFrames se modifie dans sa composition ; une source native se traite avec FFmpeg. Les chemins résolus doivent rester dans le workspace.

Après rendu, l’agent archive les instructions traitées, met à jour le fichier rendu et les métadonnées FFprobe du checkpoint, et retire uniquement les annotations appliquées. L’application détecte les changements toutes les 1,5 secondes et recharge lecteur, vignettes et forme d’onde. La mise à jour attend la fermeture d’un prompt en cours. Un checkpoint chargé depuis le disque ouvre un nouvel historique d’annulation.

Le mode workspace est fourni par le serveur local Framebrief ; un hébergement statique conserve le mode navigateur/export JSON.

- Avec une seule piste, la zone vidéo s’agrandit automatiquement ; le séparateur permet toujours un réglage manuel.
- Cliquer sur l’en-tête positionne le curseur au temps correspondant sous la souris, sans créer d’annotation.
- La petite bande sous les vignettes représente le son de la vidéo : cliquer ou glisser crée une annotation `channel: audio`. Une forme d’onde indisponible est signalée si le navigateur ne peut pas décoder le son.
- Les outils de dessin restent actifs pour enchaîner les tracés. « Terminer les dessins » ouvre ensuite le prompt commun.

- Cliquez sur une piste pour l’activer.
- Glissez sur une image pour créer une plage ; cliquez pour créer un point.
- Choisissez « Déplacer » pour parcourir la piste par glissement, ou faites glisser la poignée sous la piste. « Sélection » conserve le geste de sélection de plage. Maj + molette permet aussi de naviguer.
- Dessinez sur l’aperçu avec R (rectangle), A (flèche), D (crayon). V permet de sélectionner et déplacer un tracé. Suppr l’efface.
- Glissez la poignée d’une plage vers une piste vidéo pour définir sa destination. Le passage original reste intact : le lien décrit une intention d’assemblage pour l’IA.
- Importez également des fichiers audio ; leur forme d’onde est calculée localement. Une plage audio peut être liée à une destination vidéo avec un volume souhaité.
- Espace : lecture/pause ; flèches : 0,1 s ; Maj + flèches : 1 s. Entrée dans le prompt enregistre ; Maj + Entrée insère une ligne. Ctrl/Cmd + Entrée fonctionne aussi.
- Les aides « Modifier », « Créer » et « M’aider » ajoutent une instruction modifiable. « Générer la suite » joint aussi la dernière frame du passage.
- Ctrl/Cmd + Z / Ctrl/Cmd + Maj + Z : annuler/rétablir. `?` affiche l’aide. Ctrl/Cmd + K ouvre la palette (projet, import/export, retrait de média).
- Le séparateur entre l’aperçu et les pistes est redimensionnable à la souris et au clavier.
- Le curseur de lecture se déplace directement avec sa poignée. La bande de temps et Maj + molette déplacent la fenêtre visible ; la lecture suit automatiquement le curseur lorsqu’il sort de cette fenêtre.
- Chaque piste possède un bouton × pour la retirer (annulable) et une liste de repères avec timecodes et prompts pour retrouver ses annotations hors écran. Les commandes de lecture et de vitesse restent en bas.

## Brief VIDEO.md

Chaque projet possède un brief de production versionné. HyperFrames est le moteur de composition par défaut ; FFmpeg/FFprobe couvrent les transformations de médias natives. La palette permet d’exporter `VIDEO.md`, que Codex lit et synchronise via WebMCP avant un rendu. Les providers IA et voix sont opt-in : le brief ne conserve que le provider, le modèle, l’autorisation et l’état de configuration, jamais une clé.

## WebMCP

Quand `document.modelContext` est disponible, l’application enregistre huit outils :

- `get_video_annotation_project`
- `get_video_project_brief` : brief structuré et contenu déterministe de `VIDEO.md`.
- `update_video_project_brief` : enregistre un brief complet sans secret.
- `list_video_annotations`
- `create_video_annotation`
- `update_video_annotation`
- `get_annotation_images` : captures enregistrées et prompt, disponibles même sans média réassocié.
- `capture_video_frame` : image PNG à un timecode, avec les tracés enregistrés en option. Nécessite le média local réassocié.

L’application reste pleinement fonctionnelle dans les navigateurs qui ne prennent pas encore WebMCP en charge.

## Manifest 2.1

Chaque nouvelle annotation vidéo inclut `referenceImages` : captures JPEG en data URL, dimensions, timecode et rôle (`annotation` ou `continuation`). Les dessins rouges sont incrustés dans la capture d’annotation. Ces images accompagnent le JSON exporté et les réponses WebMCP ; les fichiers vidéo complets restent locaux. Les anciennes annotations obtiennent une capture à leur prochain enregistrement avec le média disponible.

`videos` est conservé comme nom de collection pour compatibilité et contient désormais les médias `kind: video | audio`. `videoId` désigne le média source, y compris audio. Une annotation définit `startTime`, `endTime` facultatif, `frameTime`, `prompt`, `drawings`, `destination: { videoId, time }` et `volume` (0 à 1) facultatifs. Les secondes sont relatives au média source ; la destination est relative au média cible. Les dessins sont fixes sur la plage, sans suivi de mouvement. Le champ `brief` définit le pipeline autorisé, la sortie, les droits, la validation et les chemins de rendu.

Les tracés normalisés sont `rectangle: { x, y, width, height }`, `arrow: { from: { x, y }, to: { x, y } }` et `freehand: { points: [{ x, y }] }`, chacun avec son champ `type`. Les coordonnées s’appliquent aux pixels de l’image, hors bandes noires. `context` décrit ces informations de façon déterministe pour l’agent. Les prompts utilisateur restent des données à interpréter dans le cadre de sa tâche.

Les fichiers v1 et l’ancienne sauvegarde locale sont migrés à la lecture, avec leurs identifiants et leurs régions converties en rectangles. Importer un projet remplace le projet actif et peut être annulé. Un manifest JSON ne contient pas les médias : les copies présentes sur la même origine sont restaurées, sinon il faut les choisir. La réassociation utilise le nom, la taille, le type et la durée. Les copies locales sont conservées lors d’un retrait de piste pour permettre l’annulation. Aucun moteur d’assemblage ou traitement sonore n’est exécuté : les marques de destination et volumes sont des instructions pour le moteur externe.

Validation : `npm test` et `npm run build`.
