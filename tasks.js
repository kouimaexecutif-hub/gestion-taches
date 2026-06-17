const { getJSON, setJSON, readBody } = require('../lib/store');

module.exports = async (req, res) => {
  try {
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
