require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();
const bodyParser = require('body-parser');
const session = require('express-session');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const multer = require('multer');


const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, unique + ext);
    }
});

const upload = multer({ storage });


const PORT = 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

app.use(session({
    secret: 'sylabus-secret',
    resave: false,
    saveUninitialized: true
}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));



app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Login.html'));
});


app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

    if (error || !user) {
        return res.status(401).json({ error: 'Nieprawidłowy login lub hasło' });
    }

    if (user.password !== password) {
        return res.status(401).json({ error: 'Nieprawidłowy login lub hasło' });
    }

    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.username = user.email;
    res.json({ success: true });
});



app.get('/api/my-courses', async (req, res) => {
    if (req.session.role === 'teacher') {
        const { data, error } = await supabase
            .from('courses')
            .select('*')
            .eq('teacher_id', req.session.userId);
        if (error) return res.status(500).json({ error: error.message });
        return res.json(data);
    } else {
        const { data, error } = await supabase
            .from('student_courses')
            .select('course:courses(*)')
            .eq('student_id', req.session.userId);
        if (error) return res.status(500).json({ error: error.message });
        const courses = data.map(row => row.course);
        return res.json(courses);
    }
});

app.get('/api/courses', async (req, res) => {
    let coursesQuery = supabase
        .from('courses')
        .select('*, users(name)');
    if (req.session.role === 'student') {
        const { data: followed, error: errFollowed } = await supabase
            .from('student_courses')
            .select('course_id')
            .eq('student_id', req.session.userId);
        if (errFollowed) {
            console.log('GET /api/courses FOLLOWED ERROR:', errFollowed);
            return res.status(500).json({ error: errFollowed.message });
        }
        const followedIds = followed.map(f => f.course_id);
        if (followedIds.length) {
            coursesQuery = coursesQuery.not('id', 'in', `(${followedIds.join(',')})`);
        }
    }
    const { data, error } = await coursesQuery;
    if (error) {
        console.log('GET /api/courses ERROR:', error);
        return res.status(500).json({ error: error.message });
    }
    const coursesWithName = data.map(c => ({
        ...c,
        teacher_name: c.users ? c.users.name : ''
    }));
    res.json(coursesWithName);
});

app.get('/main', (req, res) => {
    if (!req.session.role) return res.redirect('/');
    const filePath = path.join(__dirname, 'MainPage.html');
    fs.readFile(filePath, 'utf8', (err, html) => {
        if (err) return res.status(500).send('Помилка сервера');
        const injected = `
            <script>
                window.roleFromServer = "${req.session.role}";
                window.usernameFromServer = "${req.session.username}";
            </script>
        `;
        html = html.replace('</head>', `${injected}\n</head>`);
        res.send(html);
    });
});

app.post('/api/courses', upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'document', maxCount: 1 }
]), async (req, res) => {
    if (req.session.role !== 'teacher') return res.status(403).json({ error: 'Доступ заборонено' });

    const { title, description } = req.body;
    if (!title || !description) {
        return res.status(400).json({ error: 'Wprowadź tytuł i opis kursu' });
    }
    let image_url = '';
    let document_url = '';

    if (req.files && req.files['image']) {
        image_url = '/uploads/' + req.files['image'][0].filename;
    }
    if (req.files && req.files['document']) {
        document_url = '/uploads/' + req.files['document'][0].filename;
    }

    const { data, error } = await supabase
        .from('courses')
        .insert([{
            title,
            description,
            image_url,
            document_url,
            teacher_id: req.session.userId,
            teacher_email: req.session.username
        }]);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});


app.post('/api/follow-course', async (req, res) => {
    if (req.session.role !== 'student') return res.status(403).json({ error: 'Доступ заборонено' });
    const { courseId } = req.body;
    const { error } = await supabase
        .from('student_courses')
        .insert([{ student_id: req.session.userId, course_id: courseId }]);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

app.post('/api/unfollow-course', async (req, res) => {
    if (req.session.role !== 'student') return res.status(403).json({ error: 'Доступ заборонено' });
    const { courseId } = req.body;
    const { error } = await supabase
        .from('student_courses')
        .delete()
        .eq('student_id', req.session.userId)
        .eq('course_id', courseId);
    if (error) {
        console.log('UNFOLLOW ERROR:', error);
        return res.status(500).json({ error: error.message });
    }
    res.json({ success: true });
});

app.delete('/api/courses/:id', async (req, res) => {
    if (req.session.role !== 'teacher') return res.status(403).json({ error: 'Доступ заборонено' });
    const courseId = req.params.id;

    const { data: course, error: getError } = await supabase
        .from('courses')
        .select('id, teacher_id')
        .eq('id', courseId)
        .single();

    if (getError || !course) {
        return res.status(404).json({ error: 'Kurs nie został znaleziony' });
    }
    if (course.teacher_id !== req.session.userId) {
        return res.status(403).json({ error: 'Możesz usuwać tylko swoje kursy' });
    }

    const { error } = await supabase
        .from('courses')
        .delete()
        .eq('id', courseId);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});