export interface PromptGroup { label: string; icon: string; items: { label: string; prompt: string; assistance?: "continue-video"; scope?: "media" }[] }
export const START_GROUPS: PromptGroup[] = [
  { label: "Toute la vidéo", icon: "◉", items: [
    { label: "Enlever le fond vert", prompt: "Enlever le fond vert sur toute la vidéo.", scope: "media" },
    { label: "Changer le décor", prompt: "Remplacer le décor sur toute la vidéo ; me demander le décor souhaité.", scope: "media" },
    { label: "Harmoniser les couleurs", prompt: "Harmoniser les couleurs sur toute la vidéo.", scope: "media" },
    { label: "Nettoyer le son", prompt: "Réduire les bruits parasites et équilibrer la voix sur toute la vidéo.", scope: "media" },
  ] },
  { label: "Créer une introduction", icon: "✦", items: [
    { label: "Titre animé", prompt: "Ajouter un titre de présentation animé au début ; me demander le texte du titre." },
    { label: "Accroche", prompt: "Proposer une courte accroche pour ouvrir cette vidéo." },
    { label: "Présenter le sujet", prompt: "Créer une introduction en motion design qui présente le sujet ; me demander les informations manquantes." },
    { label: "Insérer un plan", prompt: "Ajouter un plan d’ouverture avant cette vidéo ; me demander le plan souhaité." },
  ] },
];
export const END_GROUPS: PromptGroup[] = [
  { label: "Imaginer la suite", icon: "✦", items: [
    { label: "Prolonger cette scène", prompt: "Utiliser la dernière frame comme référence pour générer la suite de cette scène.", assistance: "continue-video" },
    { label: "Créer un nouveau plan", prompt: "Proposer un nouveau plan pour la suite, générer son image de référence puis une vidéo à partir de cette image ; me demander la direction souhaitée." },
    { label: "Enchaîner une vidéo", prompt: "Créer une transition vers la vidéo que je vais mentionner." },
  ] },
  { label: "Conclure", icon: "↗", items: [
    { label: "Conclusion animée", prompt: "Ajouter une conclusion animée qui résume le message de la vidéo." },
    { label: "Visiter mon site", prompt: "Terminer avec une invitation à visiter mon site ; me demander son adresse et le message." },
    { label: "S’abonner", prompt: "Créer une fin invitant à s’abonner à ma chaîne, adaptée à la plateforme ; me demander laquelle." },
    { label: "Écran de fin", prompt: "Créer un écran de fin avec une place pour une vidéo recommandée et l’abonnement." },
  ] },
];
export const PROMPT_GROUPS: PromptGroup[] = [
  {
    label: "Modifier",
    icon: "✂",
    items: [
      { label: "Couper cette partie", prompt: "Couper cette partie." },
      { label: "Ralentir", prompt: "Ralentir ce passage." },
      {
        label: "Attirer l’attention",
        prompt: "Attirer l’attention sur la zone indiquée.",
      },
    ],
  },
  {
    label: "Créer",
    icon: "✦",
    items: [
      {
        label: "Être créatif",
        prompt: "Proposer une direction créative pour ce passage.",
      },
      {
        label: "Motion design",
        prompt: "Transformer cette partie en motion design.",
      },
      {
        label: "Générer la suite",
        prompt:
          "Prendre la dernière frame de ce passage comme référence pour générer la suite de la vidéo.",
        assistance: "continue-video" as const,
      },
    ],
  },
  {
    label: "M’aider",
    icon: "?",
    items: [
      {
        label: "Me poser des questions",
        prompt:
          "Pose-moi des questions sur cette partie pour m’aider à préciser mon intention avant de la modifier.",
      },
      {
        label: "Suggérer une transition",
        prompt: "Proposer une transition adaptée à ce passage.",
      },
    ],
  },
];
