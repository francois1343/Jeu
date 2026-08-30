"use strict";

global.window = global;
global.CustomEvent = class CustomEvent {};
global.dispatchEvent = () => {};
global.ARCADE_CONFIG = {
  feedbackEmail: {
    enabled: true,
    serviceId: "service_test",
    templateId: "template_test",
    publicKey: "public_test_key",
  },
};

const values = new Map();
global.localStorage = {
  getItem: (key) => (values.has(key) ? values.get(key) : null),
  setItem: (key, value) => values.set(key, value),
};

let emailRequest = null;
global.fetch = async (url, options) => {
  emailRequest = { url, options };
  return { ok: true, status: 200, text: async () => "OK" };
};

require("../js/core/arcade-feedback.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async function run() {
  const created = ArcadeFeedbackStore.create({
    type: "problème visuel",
    gameKey: "snake",
    gameTitle: "Snake",
    urgency: "élevée",
    description: "Le bouton principal manque de contraste sur mobile.",
    reporterPseudo: "NeoPlayer",
  });

  assert(created.status === "nouveau", "Un retour doit commencer avec le statut nouveau");
  assert(created.delivery.status === "pending", "Un email doit être en attente avant l’envoi");
  assert(created.createdAt && created.updatedAt, "Les dates de suivi sont requises");
  assert(ArcadeFeedbackStore.list({ gameKey: "snake" }).length === 1, "Le filtre par jeu doit fonctionner");
  assert(ArcadeFeedbackStore.list({ urgency: "faible" }).length === 0, "Le filtre par urgence doit fonctionner");

  const updated = ArcadeFeedbackStore.updateStatus(created.id, "en cours");
  assert(updated.status === "en cours", "Le futur admin doit pouvoir mettre à jour le statut");
  assert(ArcadeFeedbackStore.list({ status: "en cours" }).length === 1, "Le filtre par statut doit fonctionner");

  const emailed = await ArcadeFeedbackStore.sendByEmail(created.id);
  const payload = JSON.parse(emailRequest.options.body);
  assert(emailRequest.url === "https://api.emailjs.com/api/v1.0/email/send", "L’endpoint EmailJS doit être utilisé");
  assert(payload.service_id === "service_test", "Le Service ID doit être transmis");
  assert(payload.template_id === "template_test", "Le Template ID doit être transmis");
  assert(payload.user_id === "public_test_key", "La clé publique doit être transmise");
  assert(payload.template_params.message.includes(created.description), "Le message doit contenir la description");
  assert(payload.template_params.game === "Snake", "Le jeu concerné doit être transmis");
  assert(emailed.delivery.status === "sent" && emailed.delivery.sentAt, "L’envoi réussi doit être historisé");

  let invalidDescriptionRejected = false;
  try {
    ArcadeFeedbackStore.create({ type: "bug", urgency: "normale", description: "Court" });
  } catch (error) {
    invalidDescriptionRejected = error.message === "feedback_description_too_short";
  }
  assert(invalidDescriptionRejected, "Une description trop courte doit être refusée");

  console.log("Stockage, classement et envoi EmailJS des retours : OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});