const express = require('express');
const mysql = require('mysql2/promise');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs').promises;
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const PORT = 3000;
const TELEGRAM_TOKEN = '8037175742:AAFh5gCkKKWJrbpk77L-9VlDHlu5KaOmm7Y';
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '19122005П',
    database: 'todolist',
};

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// Функция полной очистки БД
async function resetDatabase() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password
        });

        await connection.query('DROP DATABASE IF EXISTS todolist');
        await connection.query('CREATE DATABASE todolist');
        await connection.query('USE todolist');

        await connection.query(`
            CREATE TABLE users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                telegram_id VARCHAR(50) UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await connection.query(`
            CREATE TABLE items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                text VARCHAR(255) NOT NULL,
                user_id INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        console.log('✅ База данных успешно очищена и пересоздана');
    } catch (error) {
        console.error('❌ Ошибка очистки БД:', error);
        throw error;
    } finally {
        if (connection) await connection.end();
    }
}

// Инициализация БД
async function initDatabase() {
    await resetDatabase();
    
    // Добавляем тестового пользователя (опционально)
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const hashedPassword = await bcrypt.hash('test123', 10);
        await connection.execute(
            'INSERT INTO users (username, password) VALUES (?, ?)',
            ['testuser', hashedPassword]
        );
        console.log('✅ Тестовый пользователь создан (логин: testuser, пароль: test123)');
    } catch (error) {
        console.error('❌ Ошибка создания тестового пользователя:', error);
    } finally {
        if (connection) await connection.end();
    }
}

// Получение списка задач
async function retrieveListItems(userId) {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute(
            'SELECT id, text FROM items WHERE user_id = ? ORDER BY id ASC',
            [userId]
        );
        return rows;
    } catch (error) {
        console.error('❌ Ошибка получения задач:', error);
        throw error;
    } finally {
        if (connection) await connection.end();
    }
}

// Добавление задачи
async function addListItem(text, userId) {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [result] = await connection.execute(
            'INSERT INTO items (text, user_id) VALUES (?, ?)',
            [text, userId]
        );
        return { id: result.insertId, text };
    } catch (error) {
        console.error('❌ Ошибка добавления задачи:', error);
        throw error;
    } finally {
        if (connection) await connection.end();
    }
}

// Удаление задачи
async function deleteListItem(id, userId) {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [result] = await connection.execute(
            'DELETE FROM items WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        return result.affectedRows > 0;
    } catch (error) {
        console.error('❌ Ошибка удаления задачи:', error);
        throw error;
    } finally {
        if (connection) await connection.end();
    }
}

// Обновление задачи
async function updateListItem(id, newText, userId) {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [result] = await connection.execute(
            'UPDATE items SET text = ? WHERE id = ? AND user_id = ?',
            [newText, id, userId]
        );
        return result.affectedRows > 0;
    } catch (error) {
        console.error('❌ Ошибка обновления задачи:', error);
        throw error;
    } finally {
        if (connection) await connection.end();
    }
}

// Получение пользователя по Telegram ID
async function getUserByTelegramId(telegramId) {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute(
            'SELECT * FROM users WHERE telegram_id = ?',
            [telegramId]
        );
        return rows[0];
    } catch (error) {
        console.error('❌ Ошибка получения пользователя:', error);
        throw error;
    } finally {
        if (connection) await connection.end();
    }
}

// Привязка Telegram ID
async function linkTelegramId(username, telegramId) {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        
        const [userRows] = await connection.execute(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );
        
        if (userRows.length === 0) {
            return { success: false, message: `❌ Пользователь "${username}" не найден` };
        }
        
        const [telegramRows] = await connection.execute(
            'SELECT * FROM users WHERE telegram_id = ?',
            [telegramId]
        );
        
        if (telegramRows.length > 0) {
            return { success: false, message: '❌ Этот Telegram ID уже привязан' };
        }
        
        await connection.execute(
            'UPDATE users SET telegram_id = ? WHERE username = ?',
            [telegramId, username]
        );
        
        return { 
            success: true, 
            message: '✅ Аккаунт успешно привязан!\n\n' +
                     'Доступные команды:\n' +
                     '/add <текст> - добавить задачу\n' +
                     '/delete <номер> - удалить задачу\n' +
                     '/update <номер> - <новый текст> - изменить задачу\n' +
                     '/list - показать все задачи'
        };
    } catch (error) {
        console.error('❌ Ошибка привязки Telegram:', error);
        return { success: false, message: '❌ Ошибка сервера' };
    } finally {
        if (connection) await connection.end();
    }
}

// Генерация HTML для задач
async function getHtmlRows(userId) {
    const todoItems = await retrieveListItems(userId);
    return todoItems.map((item, index) => `
        <tr>
            <td>${index + 1}</td>
            <td class="text-cell" data-id="${item.id}">${item.text}</td>
            <td>
                <div class="action-buttons">
                    <button class="edit-btn" data-id="${item.id}"><i class="fas fa-edit"></i></button>
                    <button class="delete-btn" data-id="${item.id}"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Проверка авторизации
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Маршруты
app.get('/login', async (req, res) => {
    try {
        const html = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8');
        res.send(html.replace('{{rows}}', ''));
    } catch (error) {
        res.status(500).send('Ошибка загрузки страницы');
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }
    
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );
        await connection.end();
        
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }
        
        const user = rows[0];
        const match = await bcrypt.compare(password, user.password);
        
        if (match) {
            req.session.user = { id: user.id, username: user.username };
            return res.json({ message: 'Вход выполнен успешно' });
        } else {
            return res.status(401).json({ error: 'Неверный пароль' });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }
    
    try {
        const connection = await mysql.createConnection(dbConfig);
        const hashedPassword = await bcrypt.hash(password, 10);
        
        await connection.execute(
            'INSERT INTO users (username, password) VALUES (?, ?)',
            [username, hashedPassword]
        );
        
        await connection.end();
        return res.json({ message: 'Регистрация успешна' });
    } catch (error) {
        console.error(error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }
        return res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.get('/', isAuthenticated, async (req, res) => {
    try {
        const html = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8');
        const processedHtml = html.replace('{{rows}}', await getHtmlRows(req.session.user.id));
        res.send(processedHtml);
    } catch (error) {
        console.error(error);
        res.status(500).send('Ошибка загрузки страницы');
    }
});

app.post('/add', isAuthenticated, async (req, res) => {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string' || text.trim() === '') {
        return res.status(400).json({ error: 'Неверный текст задачи' });
    }
    
    try {
        const newItem = await addListItem(text.trim(), req.session.user.id);
        res.json(newItem);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка добавления задачи' });
    }
});

app.delete('/delete', isAuthenticated, async (req, res) => {
    const id = req.query.id;
    
    if (!id || isNaN(id)) {
        return res.status(400).json({ error: 'Неверный ID задачи' });
    }
    
    try {
        const success = await deleteListItem(id, req.session.user.id);
        if (success) {
            res.json({ message: 'Задача удалена' });
        } else {
            res.status(404).json({ error: 'Задача не найдена' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка удаления задачи' });
    }
});

app.put('/update', isAuthenticated, async (req, res) => {
    const id = req.query.id;
    const { text } = req.body;
    
    if (!id || isNaN(id) || !text || typeof text !== 'string' || text.trim() === '') {
        return res.status(400).json({ error: 'Неверные данные для обновления' });
    }
    
    try {
        const success = await updateListItem(id, text.trim(), req.session.user.id);
        if (success) {
            res.json({ message: 'Задача обновлена', text: text.trim() });
        } else {
            res.status(404).json({ error: 'Задача не найдена' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка обновления задачи' });
    }
});

// Обработчики Telegram бота
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        await bot.sendMessage(chatId, '🔑 Введите ваш логин для привязки аккаунта:');
        
        bot.once('message', async (responseMsg) => {
            if (responseMsg.text.startsWith('/')) return;
            
            const username = responseMsg.text.trim();
            const result = await linkTelegramId(username, chatId.toString());
            await bot.sendMessage(chatId, result.message, { parse_mode: 'Markdown' });
        });
    } catch (error) {
        console.error('❌ Ошибка в /start:', error);
        bot.sendMessage(chatId, '❌ Произошла ошибка, попробуйте позже');
    }
});

bot.onText(/\/add (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    try {
        const user = await getUserByTelegramId(chatId.toString());
        if (!user) {
            return bot.sendMessage(chatId, '❌ Ваш Telegram ID не привязан. Используйте /start');
        }
        
        const text = match[1].trim();
        await addListItem(text, user.id);
        bot.sendMessage(chatId, `✅ Задача добавлена: "${text}"`);
    } catch (error) {
        console.error('❌ Ошибка в /add:', error);
        bot.sendMessage(chatId, '❌ Ошибка добавления задачи');
    }
});

bot.onText(/\/delete (\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    try {
        const user = await getUserByTelegramId(chatId.toString());
        if (!user) {
            return bot.sendMessage(chatId, '❌ Ваш Telegram ID не привязан. Используйте /start');
        }
        
        const id = match[1];
        const success = await deleteListItem(id, user.id);
        
        if (success) {
            bot.sendMessage(chatId, `✅ Задача #${id} удалена`);
        } else {
            bot.sendMessage(chatId, `❌ Задача #${id} не найдена`);
        }
    } catch (error) {
        console.error('❌ Ошибка в /delete:', error);
        bot.sendMessage(chatId, '❌ Ошибка удаления задачи');
    }
});

bot.onText(/\/update (\d+) - (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    try {
        const user = await getUserByTelegramId(chatId.toString());
        if (!user) {
            return bot.sendMessage(chatId, '❌ Ваш Telegram ID не привязан. Используйте /start');
        }
        
        const id = match[1];
        const newText = match[2].trim();
        const success = await updateListItem(id, newText, user.id);
        
        if (success) {
            bot.sendMessage(chatId, `✅ Задача #${id} обновлена: "${newText}"`);
        } else {
            bot.sendMessage(chatId, `❌ Задача #${id} не найдена`);
        }
    } catch (error) {
        console.error('❌ Ошибка в /update:', error);
        bot.sendMessage(chatId, '❌ Ошибка обновления задачи');
    }
});

bot.onText(/\/list/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        const user = await getUserByTelegramId(chatId.toString());
        if (!user) {
            return bot.sendMessage(chatId, '❌ Ваш Telegram ID не привязан. Используйте /start');
        }
        
        const items = await retrieveListItems(user.id);
        if (items.length === 0) {
            return bot.sendMessage(chatId, '📭 Список задач пуст');
        }
        
        const message = items.map((item, index) => 
            `${index + 1}. ${item.text}`
        ).join('\n');
        
        bot.sendMessage(chatId, `📋 Ваши задачи:\n\n${message}`);
    } catch (error) {
        console.error('❌ Ошибка в /list:', error);
        bot.sendMessage(chatId, '❌ Ошибка получения списка задач');
    }
});

// Обработка ошибок бота
bot.on('polling_error', (error) => {
    console.error('❌ Telegram Bot Polling Error:', error);
});

// Запуск сервера
initDatabase()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`🚀 Сервер запущен на порту ${PORT}`);
            console.log('🤖 Telegram Bot активен');
        });
    })
    .catch(error => {
        console.error('❌ Фатальная ошибка запуска:', error);
        process.exit(1);
    });
