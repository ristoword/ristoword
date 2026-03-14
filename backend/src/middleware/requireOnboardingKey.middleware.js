// backend/src/middleware/requireOnboardingKey.middleware.js
// Protects onboarding endpoint with X-Onboarding-Key header.

const ONBOARDING_SECRET = process.env.ONBOARDING_SECRET || "";

function requireOnboardingKey(req, res, next) {
  const key = req.get("X-Onboarding-Key") || req.body?.onboardingKey || req.query?.onboardingKey;
  if (!ONBOARDING_SECRET) {
    console.warn("[Onboarding] ONBOARDING_SECRET not set. Onboarding endpoint disabled.");
    return res.status(503).json({
      error: true,
      message: "Onboarding is not configured. Set ONBOARDING_SECRET.",
    });
  }
  if (key !== ONBOARDING_SECRET) {
    return res.status(401).json({
      error: true,
      message: "Unauthorized",
    });
  }
  next();
}

module.exports = { requireOnboardingKey };
