function validate(requiredFields = []) {
  return function (req, res, next) {
    const body = req.body || {};
    const missing = [];

    requiredFields.forEach((field) => {
      const value = body[field];

      if (
        value === undefined ||
        value === null ||
        value === ""
      ) {
        missing.push(field);
      }
    });

    if (missing.length > 0) {
      return res.status(400).json({
        error: true,
        message: "Campi obbligatori mancanti",
        missing
      });
    }

    next();
  };
}

module.exports = {
  validate
};