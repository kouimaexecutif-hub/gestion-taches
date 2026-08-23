const { getJSON, setJSON, readBody } = require('../lib/store');
const { refuse } = require('../lib/garde');

module.exports = async (req, res) => {
  try {
    // Lecture ET ecriture derriere le code administrateur : les titres des
    // taches nomment les clients du cabinet, et l'ecriture ouverte permettait
    // a un inconnu de reecrire le registre ou d'y deposer du balisage.
    if (await refuse(req, res)) return;
    if (req.method === 'GET') {
      const tasks = await getJSON('tasks', []);
      return res.status(200).json({ tasks });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = await readBody(req);
      const tasks = Array.isArray(body.tasks) ? body.tasks : [];
      await setJSON('tasks', tasks);
      return res.status(200).json({ ok: true, count: tasks.length });
    }
    res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
