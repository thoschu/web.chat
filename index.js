'use strict';

require('dotenv').config();

const fs = require('fs');
const https = require('https');
const axios = require('axios');
const express = require('express');
const { createServer} = require('node:http');
const { join} = require('node:path');
const { Server } = require('socket.io');
const { OpenAI } = require('openai');
const { createTransport } = require('nodemailer');
const { from, first, of, map} = require('rxjs');
const { head } = require('ramda');
const { v4: uuidv4 } = require('uuid');
const winston = require("winston");

const PORT = 3000;
const app = express();
const protocol = process.env.ENVIRONMENT === 'development' ? 'https' : 'http';
const server = protocol === 'https' ? https.createServer({
    key: fs.readFileSync('./mkcert/localhost-key.pem', 'utf-8'),
    cert: fs.readFileSync('./mkcert/localhost.pem', 'utf-8')
}, app) : createServer(app);
const io = new Server(server);
const openai = new OpenAI({
    apiKey: process.env.OPENAI_APIKEY
});

const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(
            (info) => `${info.timestamp} ${info.level}: ${info.message}`
        )
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: "logs/app.log" }),
    ],
});

const transporter = createTransport({
    service: 'Gmail',
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
        user: 'thoschulte@gmail.com',
        pass: 'dbtw lfvh jozh dwkb'
    }
});

const users = new Set();

io.on('connection', async (socket) => {
    if (process.env.ENVIRONMENT !== 'development') {
        const response = await getBotResponse(`a user connected`);

        emitBotMessage(response, (message) => {
            socket.broadcast.emit('info user', message);
        });
    }

    users.add(socket.id);

    io.emit('users size', users.size);

    socket.broadcast.emit('new user', socket.id);

    socket.on('signal', (data) => {
        socket.broadcast.emit('signal', data);
    });

    socket.on('update', ({from, to}) => {
        io.to(to).emit('new user', from, false);
    });

    socket.on('disconnect', async (reason) => {
        const text = `user ${socket.id} disconnected due to: ${reason}`;

        users.delete(socket.id);

        io.emit('users size', users.size);

        if (process.env.ENVIRONMENT !== 'development') {
            const response = await getBotResponse(`a user disconnected`);

            emitBotMessage(response, (message) => {
                socket.broadcast.emit('info user', message);
            });
        } else {
            socket.broadcast.emit('info user', text);
        }

        io.emit('disconnect user', socket.id);
    });

    socket.on('chat message', async (msg) => {
        const mailOptions = {
            from: 'thoschulte@gmail.com',
            to: 'thoschulte+chat@gmail.com',
            subject: 'Sending Email using Node.js Chat techstack.ch',
            text: msg
        };

        io.emit('chat message', {msg, id: socket.id});

        if (process.env.ENVIRONMENT !== 'development') {
            await transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    logger.error(error);
                } else {
                    logger.info('email sent: ' + info.response);
                }
            });
        }

        if (process.env.ENVIRONMENT !== 'development') {
            const randomNumber = Math.floor(Math.random() * 4) + 1;

            if(randomNumber === 1) {
                const response = await getBotResponse(msg);

                emitBotMessage(response, (message) => {
                    io.emit('info user', message);
                });
            }
        }
    });
});

app.get('/', (req, res) => {
    res.redirect(`/room/${uuidv4(null, null, null)}`);
});

app.get('/room/:room', (req, res) => {
    if(users.size > 1) {
        res.sendStatus(405);
    } else {
        res.sendFile(join(__dirname, 'index.html'));
    }
});

app.get('/bot', async (req, res) => {
    const message = req.query.message ?? 'Hallo, moin und guten Tag!';
    const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
            {
                "role": "system",
                "content": `
                    You are Tom, a chatbot who secretly listens to a conversation between 
                    chat participants and reluctantly makes sarcastic comments in German or english, depending on selected input.
                    You are not answering from the first person perspective and avoid the word chatbot, the AI must not feel addressed.
                `
            }, {
                "role": "user",
                "content": message
            }
        ],
        temperature: 0.5,
        max_tokens: 64,
        top_p: 1,
    });

    res.send(response);
});

app.get('/ping', (_req, res) => {
    res.sendStatus(200);
});

app.get('/status', async (_req, res) => {
    const itr= users.entries();
    const entries = [];

    for(let i= 0; i < users.size; i++) {
        const result = itr.next();
        const values = result.value;

        from(values)
            .pipe(first())
            .subscribe((value) => {
                entries.push(value);
            });
    }

    res.send({ status: users.size, entries });
});

server.listen(PORT, () => {
    logger.info(`Server is listening on ${protocol}://localhost:${PORT} in ${process.env.ENVIRONMENT}`);
});

const emitBotMessage = (response, cb) => {
    of(response)
        .pipe(
            map(obj => obj.data),
            map(obj => obj.choices),
            map(head),
            map(obj => obj.message),
            map(obj => obj.content)
        ).subscribe(cb);
};

const getBotResponse = async (message) => {
    try {
        return await axios.get(`//localhost:3000/bot?message=${message}`);
    } catch (error) {
        logger.error(error);
    }
};
