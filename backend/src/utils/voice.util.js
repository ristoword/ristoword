function normalizeVoiceText(text = "") {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function detectKitchenCommand(text = "") {
  const t = normalizeVoiceText(text);

  if (t.includes("ordine") && t.includes("pronto")) {
    return "ORDER_READY";
  }

  if (t.includes("ordine") && t.includes("consegnato")) {
    return "ORDER_DELIVERED";
  }

  if (t.includes("inizia") || t.includes("in preparazione")) {
    return "ORDER_START";
  }

  return "UNKNOWN";
}

function extractOrderNumber(text = "") {
  const match = text.match(/\d+/);
  if (!match) return null;

  return Number(match[0]);
}

function parseKitchenVoiceCommand(text = "") {
  const command = detectKitchenCommand(text);
  const orderId = extractOrderNumber(text);

  return {
    command,
    orderId,
    raw: text
  };
}

module.exports = {
  normalizeVoiceText,
  detectKitchenCommand,
  extractOrderNumber,
  parseKitchenVoiceCommand
};
