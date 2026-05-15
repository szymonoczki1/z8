'use strict';

const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');

// robimy sobie polaczenie do prawdziwej bazy pgsql ktora jest zrobiona przez job github
// na obrazie pg 16 alpine, bierzemy env z processu node ktore on bierze z ci yml test:integration

const pool = new Pool({
    host:     process.env.PGHOST     || 'localhost',
    user:     process.env.PGUSER     || 'testuser',
    password: process.env.PGPASSWORD || 'testpass',
    database: process.env.PGDATABASE || 'testdb',
    port:     parseInt(process.env.PGPORT || '5432', 10),
});

// tworzymy table przed testami

before(async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS products (
            id    SERIAL PRIMARY KEY,
            name  TEXT NOT NULL,
            price NUMERIC(10,2) NOT NULL DEFAULT 0
        )
    `);
});

// before each czyscimy tabele i restartujemy auto id na 1

beforeEach(async () => {
    await pool.query('TRUNCATE TABLE products RESTART IDENTITY');
});

after(async () => {
    await pool.end();
});

// TESTY

test('INSERT then SELECT returns the inserted row', async () => {
    await pool.query(
        'INSERT INTO products (name, price) VALUES ($1, $2)',
        ['Widget', 19.99]
    );

    const { rows } = await pool.query('SELECT * FROM products');

    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'Widget');
    assert.equal(parseFloat(rows[0].price), 19.99);
});

test('COUNT(*) reflects number of inserts', async () => {
    await pool.query(
        'INSERT INTO products (name, price) VALUES ($1, $2), ($3, $4)',
        ['A', 1.00, 'B', 2.00]
    );

    const { rows } = await pool.query('SELECT COUNT(*) AS count FROM products');

    assert.equal(parseInt(rows[0].count, 10), 2);
});

test('DELETE removes the row', async () => {
    await pool.query(
        'INSERT INTO products (name, price) VALUES ($1, $2)',
        ['Temp', 0]
    );
    await pool.query('DELETE FROM products WHERE name = $1', ['Temp']);

    const { rows } = await pool.query(
        'SELECT * FROM products WHERE name = $1',
        ['Temp']
    );

    assert.equal(rows.length, 0);
});
