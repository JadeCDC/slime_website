//Libraries
const express = require('express');
const multer = require('multer');
const mysql = require('mysql2/promise');
const { check, validationResult } = require('express-validator');
// const course = require('./Model/course');

//Setup defaults for script
const app = express();
app.use(express.static('public'))

const upload = multer()
const port = 80 //Default port to http server

let connection = null;

async function query(sql, params) {
    //Singleton DB connection
    if (null === connection) {
        console.log('FUCK');
        connection = await mysql.createConnection({
            host: "student-databases.cvode4s4cwrc.us-west-2.rds.amazonaws.com",
            user: "JADEDOMINGUEZ",
            password: "vWBp0yWtR9QxJYTl1Xxz4BwKAmmynhm3rIf",
            database: 'JADEDOMINGUEZ'
        });
    }

    const [results,] = await connection.execute(sql, params);
    return results;
}

//The * in app.* needs to match the method type of the request
app.get(
    '/slimes/',
    upload.none(),
    async (request, response) => {
        let result = {};
        try {

            let selectSql = `SELECT 
                                s.id,
                                s.name AS slime_name, 
                                s.diet, 
                                s.is_two, 
                                s.is_largo, 
                                GROUP_CONCAT(DISTINCT h.name SEPARATOR ', ') habitat_name, 
                                GROUP_CONCAT(DISTINCT f.name SEPARATOR ', ') favorite_food
                            FROM slimes_table s
                            INNER JOIN slimes_to_habitats sth ON s.id = sth.slimes_id
                            INNER JOIN habitats h ON sth.habitat_id = h.id
                            INNER JOIN slimes_to_foods stf ON s.id = stf.slimes_id
                            INNER JOIN foods f ON stf.food_id = f.id` ,
                whereStatements = [],
                havingStatements = [],
                orderByStatements = [],
                queryParameters = [];
            //got the group_concat stuff from gemini lmao but i think i know how it works


            if (typeof request.query.name !== 'undefined') {
                whereStatements.push('s.name LIKE ?');
                queryParameters.push("%" + request.query.name + "%");
            }

            if (typeof request.query.diet !== 'undefined') {
                whereStatements.push('s.diet LIKE ?');
                queryParameters.push("%" + request.query.diet + "%");
            }

            if (typeof request.query.is_two !== 'undefined' && parseInt(request.query.is_two) !== 0) {
                whereStatements.push('s.is_two = ?');
                queryParameters.push(request.query.is_two);
            }

            if (typeof request.query.is_largo !== 'undefined' && parseInt(request.query.is_largo) === 0) {
                whereStatements.push('s.is_largo = ?');
                queryParameters.push(request.query.is_largo);
            }

            if (typeof request.query.sort !== 'undefined' && (request.query.sort === 'ASC' || request.query.sort === 'DESC')) {
                orderByStatements.push('slime_name ' + request.query.sort);
            }

            //Might need to be HAVING statement
            if (typeof request.query.habitat !== 'undefined') {
                havingStatements.push('habitat_name LIKE ?');
                queryParameters.push("%" + request.query.habitat + "%");
            }

            //Might need to be a HAVING statement
            if (typeof request.query.fav_food !== 'undefined') {
                havingStatements.push('favorite_food LIKE ?');
                queryParameters.push("%" + request.query.fav_food + "%");
            }

            //Dynamically add WHERE expressions to SELECT statements if needed
            if (whereStatements.length > 0) {
                selectSql = selectSql + ' WHERE ' + whereStatements.join(' AND ');
            }

            selectSql = selectSql + ' GROUP BY s.id';

            //Dynamically add ORDER BY expressions to SELECT statements if needed
            if (orderByStatements.length > 0) {
                selectSql = selectSql + ' ORDER BY ' + orderByStatements.join(', ');
            }

            if (havingStatements.length > 0) {
                selectSql += " HAVING " + havingStatements.join(' AND ');
            }

            //Dynamically add LIMIT expressions to SELECT statements if needed
            if (typeof request.query.limit !== 'undefined' && request.query.limit >= 0 && request.query.limit <= 250) {
                selectSql = selectSql + ' LIMIT ' + request.query.limit;
            }

            result = await query(selectSql, queryParameters);
        } catch (error) {
            console.log(error);
            return response.status(500) //Error code 
                .json({ message: 'Something went wrong with the server.' });
        }
        //Default response object
        response.json({ 'data': result });
    });

app.get(
    '/slimes/:id/',
    upload.none(),
    async (request, response) => {
        try {
            const result = await query(
                `SELECT 
                    s.id,
                    s.name,
                    s.diet,
                    s.is_two,
                    s.is_largo,
                    GROUP_CONCAT(DISTINCT stf.food_id) AS food_ids,
                    GROUP_CONCAT(DISTINCT sth.habitat_id) AS habitat_ids
                FROM slimes_table s
                LEFT JOIN slimes_to_foods stf ON s.id = stf.slimes_id
                LEFT JOIN slimes_to_habitats sth ON s.id = sth.slimes_id
                WHERE s.id = ?
                GROUP BY s.id`,
                [request.params.id]
            );

            if (result.length === 0) {
                return response.status(404).json({ message: 'Slime not found.' });
            }

            const row = result[0];
            response.json({
                data: [
                    {
                        id: row.id,
                        name: row.name,
                        diet_ids: row.diet ? row.diet.split(',').map(item => item.trim()).filter(Boolean) : [],
                        is_two: row.is_two === 1 || row.is_two === '1',
                        is_largo: row.is_largo === 1 || row.is_largo === '1',
                        food_ids: row.food_ids ? row.food_ids.split(',').map(Number) : [],
                        habitat_ids: row.habitat_ids ? row.habitat_ids.split(',').map(Number) : [],
                    }
                ]
            });
        } catch (error) {
            console.error(error);
            return response
                .status(500)
                .json({ message: 'Something went wrong with the server.' });
        }
    });

app.post('/slimes/',
    upload.none(),
    check('name', 'Slime Name is required.').notEmpty(),

    check('food_ids', 'Select at least one Favorite Food.').notEmpty(),

    check('habitat_ids', 'Select at least one Habitat.').notEmpty(),

    check('diet_ids', 'Please select at least one Diet.')
        .notEmpty()
        .custom((submitted) => {
            const allowed = ['Meat', 'Fruit', 'Vegetables', 'All', 'None', 'Other'];
            const items = Array.isArray(submitted) ? submitted : [submitted];

            if (!items.every(diet => allowed.includes(diet))) {
                throw new Error('One or more selected diets are invalid.');
            }
            return true;
        }),

    check('is_two', 'Slime must be from the first or second game.').optional().isIn(['0', '1']),

    check('is_largo', 'Slime must be regular or largo.').optional().isIn(['0', '1']),

    async (request, response) => {
        const errors = validationResult(request);

        if (!errors.isEmpty()) {
            return response.status(400).json({
                messages: errors.array().map(err => err.msg)
            });
        }

        try {
            const foods = Array.isArray(request.body.food_ids)
                ? request.body.food_ids
                : [request.body.food_ids];

            const habitats = Array.isArray(request.body.habitat_ids)
                ? request.body.habitat_ids
                : [request.body.habitat_ids];

            const diets = Array.isArray(request.body.diet_ids)
                ? request.body.diet_ids
                : [request.body.diet_ids];

            const slimeSql = `INSERT INTO slimes_table (name, is_two, is_largo, diet) VALUES (?, ?, ?, ?)`;
            const slimeParams = [
                request.body.name,
                request.body.is_two || 0,
                request.body.is_largo || 0,
                diets.join(', ')
            ];

            const result = await query(slimeSql, slimeParams);
            const newSlimeId = result.insertId;

            for (const fId of foods) {
                await query(`INSERT INTO slimes_to_foods (slimes_id, food_id) VALUES (?, ?)`, [newSlimeId, fId]);
            }

            for (const hId of habitats) {
                await query(`INSERT INTO slimes_to_habitats (slimes_id, habitat_id) VALUES (?, ?)`, [newSlimeId, hId]);
            }

            response.json({ message: "Slime successfully added!" });

        } catch (e) {
            console.error(e);
            response.status(500).json({ messages: ["Database Error: " + e.message] });
        }
    }
);

app.put(
    '/slimes/:id/',
    upload.none(),
    check('name', 'Slime Name is required.').notEmpty(),

    check('food_ids', 'Select at least one Favorite Food.').notEmpty(),

    check('habitat_ids', 'Select at least one Habitat.').notEmpty(),

    check('diet_ids', 'Please select at least one Diet.')
        .notEmpty()
        .custom((submitted) => {
            const allowed = ['Meat', 'Fruit', 'Vegetables', 'All', 'None', 'Other'];
            const items = Array.isArray(submitted) ? submitted : [submitted];

            if (!items.every(diet => allowed.includes(diet))) {
                throw new Error('One or more selected diets are invalid.');
            }
            return true;
        }),

    check('is_two', 'Slime must be from the first or second game.').optional().isIn(['0', '1']),

    check('is_largo', 'Slime must be regular or largo.').optional().isIn(['0', '1']),

    async (request, response) => {
        //Validate request; If there any errors, send 400 response back
        const errors = validationResult(request)
        if (!errors.isEmpty()) {
            return response
                .status(400)
                .json({
                    message: 'Request fields or files are invalid.',
                    errors: errors.array(),
                });
        }

        try {
            const foods = Array.isArray(request.body.food_ids)
                ? request.body.food_ids
                : [request.body.food_ids];

            const habitats = Array.isArray(request.body.habitat_ids)
                ? request.body.habitat_ids
                : [request.body.habitat_ids];

            const diets = Array.isArray(request.body.diet_ids)
                ? request.body.diet_ids
                : [request.body.diet_ids];

            const slimeSql = `UPDATE slimes_table SET name = ?, is_two = ?, is_largo = ?, diet = ? WHERE id = ?`;
            const slimeParams = [
                request.body.name,
                request.body.is_two || 0,
                request.body.is_largo || 0,
                diets.join(', '),
                request.params.id,
            ];

            await query(slimeSql, slimeParams);
            await query(`DELETE FROM slimes_to_foods WHERE slimes_id = ?`, [request.params.id]);
            await query(`DELETE FROM slimes_to_habitats WHERE slimes_id = ?`, [request.params.id]);

            for (const fId of foods) {
                await query(`INSERT INTO slimes_to_foods (slimes_id, food_id) VALUES (?, ?)`, [request.params.id, fId]);
            }

            for (const hId of habitats) {
                await query(`INSERT INTO slimes_to_habitats (slimes_id, habitat_id) VALUES (?, ?)`, [request.params.id, hId]);
            }

            response.json({ 'data': 'Slime updated successfully!' });
        } catch (error) {
            console.error(error);
            return response
                .status(500)
                .json({ message: 'Something went wrong with the server.' });
        }
    }
);


app.listen(port, () => {
    console.log(`yo shit ready at http://localhost:${port}`);
})