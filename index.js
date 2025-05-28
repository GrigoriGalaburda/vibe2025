const http = require('http');
const fs = require('fs');
const path = require('path');
<<<<<<< HEAD

const PORT = 3000;

// Пустой массив для задач
let todoItems = [];
let nextId = 1;

// Генерация HTML строк для таблицы (без данных пока)
=======
const url = require('url');
const qs = require('querystring');

const PORT = 3000;

// Хранилище задач в памяти
let todoItems = [];
let nextId = 1;

// Генерация HTML строк для таблицы
>>>>>>> 3749202 (Add task addition feature)
function getHtmlRows() {
    return todoItems.map(item => `
        <tr>
            <td>${item.id}</td>
            <td><span contenteditable="true" data-id="${item.id}">${item.text}</span></td>
            <td><button class="delete-btn" data-id="${item.id}">×</button></td>
        </tr>
    `).join('');
}

// Обработка запросов
async function handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);

    if (req.method === 'GET' && parsedUrl.pathname === '/') {
        try {
            const html = await fs.promises.readFile(
                path.join(__dirname, 'index.html'),
                'utf8'
            );
            const processedHtml = html.replace('{{rows}}', getHtmlRows());
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(processedHtml);
        } catch (err) {
            console.error(err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error loading index.html');
        }
<<<<<<< HEAD
=======
    } else if (req.method === 'POST' && parsedUrl.pathname === '/delete') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const { id } = qs.parse(body);
            if (id) {
                todoItems = todoItems.filter(item => item.id !== parseInt(id));
            }
            res.writeHead(302, { 'Location': '/' });
            res.end();
        });
>>>>>>> 3749202 (Add task addition feature)
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Route not found');
    }
}

// Создание и запуск сервера
const server = http.createServer(handleRequest);
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
