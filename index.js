const http = require('http');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const url = require('url'); // Добавляем модуль url для парсинга запросов

const PORT = 3000;

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'todolist',
};

async function retrieveListItems() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const query = 'SELECT id, text FROM items';
        const [rows] = await connection.execute(query);
        await connection.end();
        return rows;
    } catch (error) {
        console.error('Ошибка при получении элементов:', error);
        throw error;
    }
}

async function addListItem(text) {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const query = 'INSERT INTO items (text) VALUES (?)';
        const [result] = await connection.execute(query, [text]);
        await connection.end();
        return { id: result.insertId, text };
    } catch (error) {
        console.error('Ошибка при добавлении элемента:', error);
        throw error;
    }
}

async function getHtmlRows() {
    const todoItems = await retrieveListItems();
    return todoItems.map(item => `
        <tr>
            <td>${item.id}</td>
            <td>${item.text}</td>
            <td><button class="delete-btn" data-id="${item.id}">×</button></td>
        </tr>
    `).join('');
}

async function handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);

    if (req.url === '/' && req.method === 'GET') {
        try {
            const html = await fs.promises.readFile(
                path.join(__dirname, 'index.html'), 
                'utf8'
            );
            const processedHtml = html.replace('{{rows}}', await getHtmlRows());
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(processedHtml);
        } catch (err) {
            console.error(err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Ошибка загрузки index.html');
        }
    } else if (req.url === '/add' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
            try {
                const { text } = JSON.parse(body);
                if (!text || typeof text !== 'string' || text.trim() === '') {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Некорректный или отсутствующий текст' }));
                    return;
                }
                const newItem = await addListItem(text.trim());
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(newItem));
            } catch (err) {
                console.error(err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Не удалось добавить элемент' }));
            }
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Маршрут не найден');
    }
}

const server = http.createServer(handleRequest);
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
