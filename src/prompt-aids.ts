export type UiLanguage = "en" | "fr";
export interface PromptItem { label: string; prompt: string; assistance?: "continue-video"; scope?: "media"; action: "modify" | "insert"; insertionPosition?: "before" | "after" | "at" }
export interface PromptGroup { label: string; icon: string; items: PromptItem[] }
const text = (language: UiLanguage, en: string, fr: string) => language === "fr" ? fr : en;

export function promptGroups(language: UiLanguage, context: "start" | "middle" | "end"): PromptGroup[] {
  const x = (en: string, fr: string) => text(language, en, fr);
  if (context === "start") return [
    { label: x("Modify the whole video", "Modifier toute la vidéo"), icon: "◉", items: [
      { label: x("Remove green screen", "Enlever le fond vert"), prompt: x("Remove the green screen throughout this video.", "Enlever le fond vert sur toute la vidéo."), scope: "media", action: "modify" },
      { label: x("Change the background", "Changer le décor"), prompt: x("Replace the background throughout this video; ask me which background to use.", "Remplacer le décor sur toute la vidéo ; me demander le décor souhaité."), scope: "media", action: "modify" },
      { label: x("Match the colors", "Harmoniser les couleurs"), prompt: x("Match the colors throughout this video.", "Harmoniser les couleurs sur toute la vidéo."), scope: "media", action: "modify" },
      { label: x("Clean up audio", "Nettoyer le son"), prompt: x("Reduce noise and balance speech throughout this video.", "Réduire les bruits parasites et équilibrer la voix sur toute la vidéo."), scope: "media", action: "modify" },
    ] },
    { label: x("Add before the video", "Ajouter avant la vidéo"), icon: "+", items: [
      { label: x("Animated title scene", "Scène de titre animée"), prompt: x("Insert a new animated title scene before this video; ask me for the title.", "Insérer une nouvelle scène de titre animée avant cette vidéo ; me demander le texte."), action: "insert", insertionPosition: "before" },
      { label: x("Opening hook", "Accroche d’ouverture"), prompt: x("Insert a short opening hook before this video.", "Insérer une courte scène d’accroche avant cette vidéo."), action: "insert", insertionPosition: "before" },
      { label: x("Topic introduction", "Présentation du sujet"), prompt: x("Insert a motion-design scene before this video to introduce the topic; ask for missing details.", "Insérer avant cette vidéo une scène en motion design qui présente le sujet ; demander les informations manquantes."), action: "insert", insertionPosition: "before" },
      { label: x("New opening shot", "Nouveau plan d’ouverture"), prompt: x("Insert a new opening shot before this video; ask me what it should show.", "Insérer un nouveau plan d’ouverture avant cette vidéo ; me demander ce qu’il doit montrer."), action: "insert", insertionPosition: "before" },
    ] },
  ];
  if (context === "end") return [
    { label: x("Add after the video", "Ajouter après la vidéo"), icon: "+", items: [
      { label: x("Continue this scene", "Prolonger cette scène"), prompt: x("Insert a continuation after this video, using its last frame as the visual reference.", "Insérer une suite après cette vidéo en utilisant sa dernière frame comme référence visuelle."), assistance: "continue-video", action: "insert", insertionPosition: "after" },
      { label: x("Create a new shot", "Créer un nouveau plan"), prompt: x("Insert a new shot after this video; propose its reference image before generating the shot.", "Insérer un nouveau plan après cette vidéo ; proposer son image de référence avant de le générer."), action: "insert", insertionPosition: "after" },
      { label: x("Continue with another video", "Enchaîner une autre vidéo"), prompt: x("Insert another video after this one with an appropriate transition.", "Insérer une autre vidéo après celle-ci avec une transition adaptée."), action: "insert", insertionPosition: "after" },
    ] },
    { label: x("Add an ending", "Ajouter une conclusion"), icon: "↗", items: [
      { label: x("Animated conclusion", "Conclusion animée"), prompt: x("Insert an animated conclusion scene after this video.", "Insérer une scène de conclusion animée après cette vidéo."), action: "insert", insertionPosition: "after" },
      { label: x("Visit my website", "Visiter mon site"), prompt: x("Insert an ending scene inviting viewers to visit my website; ask for the URL and message.", "Insérer une scène finale invitant à visiter mon site ; me demander l’adresse et le message."), action: "insert", insertionPosition: "after" },
      { label: x("Subscribe", "S’abonner"), prompt: x("Insert an ending scene inviting viewers to subscribe; ask which platform this is for.", "Insérer une scène finale invitant à s’abonner ; me demander la plateforme."), action: "insert", insertionPosition: "after" },
    ] },
  ];
  return [
    { label: x("Modify this moment", "Modifier ce moment"), icon: "✂", items: [
      { label: x("Cut this part", "Couper cette partie"), prompt: x("Cut this part.", "Couper cette partie."), action: "modify" },
      { label: x("Slow it down", "Ralentir"), prompt: x("Slow down this part.", "Ralentir ce passage."), action: "modify" },
      { label: x("Draw attention", "Attirer l’attention"), prompt: x("Draw attention to the indicated area.", "Attirer l’attention sur la zone indiquée."), action: "modify" },
      { label: x("Motion design treatment", "Traitement motion design"), prompt: x("Improve the existing content here with a motion-design treatment.", "Améliorer le contenu existant ici avec un traitement motion design."), action: "modify" },
    ] },
    { label: x("Insert a new scene", "Insérer une nouvelle scène"), icon: "+", items: [
      { label: x("Creative scene", "Scène créative"), prompt: x("Insert a new creative scene at this point.", "Insérer une nouvelle scène créative à cet endroit."), action: "insert", insertionPosition: "at" },
      { label: x("Bridge both sides", "Relier avant et après"), prompt: x("Insert a new scene here using the frames immediately before and after as visual references.", "Insérer une nouvelle scène ici en utilisant les frames juste avant et juste après comme références visuelles."), action: "insert", insertionPosition: "at" },
      { label: x("Generated video", "Vidéo générée"), prompt: x("Insert a generated video scene here; ask me for its subject and intended motion.", "Insérer ici une scène vidéo générée ; me demander son sujet et le mouvement souhaité."), action: "insert", insertionPosition: "at" },
    ] },
    { label: x("Help me decide", "M’aider à décider"), icon: "?", items: [
      { label: x("Ask me questions", "Me poser des questions"), prompt: x("Ask me questions about this moment before changing it.", "Pose-moi des questions sur ce moment avant de le modifier."), action: "modify" },
      { label: x("Suggest an edit", "Suggérer une modification"), prompt: x("Suggest a suitable edit for this moment.", "Proposer une modification adaptée à ce moment."), action: "modify" },
    ] },
  ];
}
