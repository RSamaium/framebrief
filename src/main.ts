import "./styles.css";
import "./desktop.css";
import { FramebriefApp } from "./app";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Élément #app introuvable.");

new FramebriefApp(root);
