let license = {
  active: false,
  key: null,
  activatedAt: null,
  owner: null
};

// GET LICENSE
exports.getLicense = async () => {
  return license;
};

// ACTIVATE LICENSE
exports.activate = async (data) => {
  license = {
    active: true,
    key: data.key || null,
    owner: data.owner || null,
    activatedAt: new Date().toISOString()
  };

  return license;
};

// DEACTIVATE LICENSE
exports.deactivate = async () => {
  license = {
    active: false,
    key: null,
    activatedAt: null,
    owner: null
  };

  return license;
};

// STATUS
exports.getStatus = async () => {
  return {
    active: license.active,
    key: license.key,
    activatedAt: license.activatedAt
  };
};