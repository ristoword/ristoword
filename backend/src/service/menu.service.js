// backend/src/service/menu.service.js

const menuRepository = require("../repositories/menu.repository");

function listAll() {
  return menuRepository.getAll();
}

function listActive() {
  return menuRepository.getActive();
}

function create(data) {
  if (!data.name) {
    throw new Error("Nome piatto obbligatorio");
  }
  return menuRepository.add(data);
}

function getOne(id) {
  const item = menuRepository.getById(id);
  if (!item) {
    throw new Error("Piatto non trovato");
  }
  return item;
}

function update(id, data) {
  const item = menuRepository.update(id, data);
  if (!item) throw new Error("Piatto non trovato");
  return item;
}

function remove(id) {
  const ok = menuRepository.remove(id);
  if (!ok) throw new Error("Piatto non trovato");
  return true;
}

module.exports = {
  listAll,
  listActive,
  create,
  getOne,
  update,
  remove,
};