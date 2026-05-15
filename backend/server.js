const express = require('express');
const os = require('os');
const { Pool } = require('pg');
const { createClient } = require('redis');

const app = express();
app.use(express.json());

// polaczenie z pgsql przez zmienne srodowiskowe, orbimy connection pool
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'db',
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
});

// laczymy z redisem
const redis = createClient({
    socket: { host: process.env.REDIS_HOST || 'cache', port: 6379 }
});

const ITEMS_KEY = 'items';
const CACHE_TTL = 30; // sekundy

let cacheHits = 0;
function _resetForTesting() { cacheHits = 0; }

// tworzy tabele jesli nie istnieje
async function initDb() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS products (
            id    SERIAL PRIMARY KEY,
            name  TEXT NOT NULL,
            price NUMERIC(10,2) NOT NULL DEFAULT 0
        )
    `);
}

// GET /items - najpierw sprawdza cache Redis, przy braku pobiera z bazy i zapisuje cache na 30s
app.get('/items', async (_req, res) => {
    try {
        const cached = await redis.get(ITEMS_KEY);
        if (cached) {
            // trafienie cache - inkrementuj licznik i zwroc z Redis
            cacheHits++;
            return res.json(JSON.parse(cached));
        }
        // miss cache - pobierz z bazy i zapisz w cache
        const { rows } = await pool.query('SELECT * FROM products ORDER BY id');
        await redis.set(ITEMS_KEY, JSON.stringify(rows), { EX: CACHE_TTL });
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /items - dodaje produkt do bazy, unieważnia cache
app.post('/items', async (req, res) => {
    const { name, price } = req.body;
    if (!name || price === undefined) {
        return res.status(400).json({ error: 'name and price are required' });
    }
    try {
        const { rows } = await pool.query(
            'INSERT INTO products (name, price) VALUES ($1, $2) RETURNING *',
            [name, parseFloat(price)]
        );
        // unieważnienie cache - nastepny GET /items odczyta swiezy stan z bazy
        await redis.del(ITEMS_KEY);
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /stats - liczba produktow i liczba trafien cache
app.get('/stats', async (_req, res) => {
    try {
        const { rows } = await pool.query('SELECT COUNT(*) AS count FROM products');
        res.json({
            totalProducts: parseInt(rows[0].count, 10),
            cache_hits: cacheHits,
            instanceId: process.env.INSTANCE_ID || os.hostname()
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;

// najpierw polacz z Redis, potem zainicjalizuj baze, potem uruchom serwer
// require.main === module jest false gdy plik jest importowany przez testy
if (require.main === module) {
    redis.connect()
        .then(() => initDb())
        .then(() => {
            app.listen(PORT, () => console.log('Backend running on port ' + PORT));
        })
        .catch(err => {
            console.error('Startup failed:', err);
            process.exit(1);
        });
}

module.exports = { app, _resetForTesting };
