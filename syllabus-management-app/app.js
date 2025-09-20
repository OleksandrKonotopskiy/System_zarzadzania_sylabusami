const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// Simple in-memory list of syllabuses
let syllabuses = [];

// Middleware
app.use(bodyParser.json());
app.use(express.static('public'));

// Main page
app.get('/', (req, res) => {
    res.send(`
        <h1>Syllabus Management System</h1>
        <form method="POST" action="/syllabuses">
            <input name="title" placeholder="Syllabus Title" required />
            <input name="description" placeholder="Description" required />
            <button type="submit">Add Syllabus</button>
        </form>
        <ul>
            ${syllabuses.map(s => `<li><b>${s.title}</b>: ${s.description}</li>`).join('')}
        </ul>
        <script>
            document.querySelector('form').onsubmit = async function(e) {
                e.preventDefault();
                const form = e.target;
                const data = {
                    title: form.title.value,
                    description: form.description.value
                };
                await fetch('/syllabuses', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(data)
                });
                location.reload();
            }
        </script>
    `);
});

// Add new syllabus
app.post('/syllabuses', (req, res) => {
    const { title, description } = req.body;
    syllabuses.push({ title, description });
    res.status(201).end();
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});