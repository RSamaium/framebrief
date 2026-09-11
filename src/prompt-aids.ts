export const PROMPT_GROUPS = [
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
