require('dotenv').config();

const axios = require('axios');
const express = require('express');
const { createServer} = require('node:http');
const { join} = require('node:path');
const { Server } = require('socket.io');
const { OpenAI } = require('openai');
const { createTransport } = require('nodemailer');

const PORT = 3000;
const app = express();
const server = createServer(app);
const io = new Server(server);
const openai = new OpenAI({
    apiKey: process.env.OPENAI_APIKEY
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
        try {
            const response = await axios.get('http://localhost:3000/bot?message=\'a user connected\'');
            const data = response.data;

            socket.broadcast.emit('info user', data.choices[0].message.content);
        } catch (error) {
            console.error(error);
        }
    }

    users.add(socket.id);

    io.emit('users size', users.size);

    socket.broadcast.emit('user video', socket.id);

    // ToDo -----------------------------------------------------
    socket.on('offer', (offer, room) => {
        socket.join(room);
        socket.to(room).emit('offer', offer);
    });

    socket.on('answer', (answer, room) => {
        socket.to(room).emit('answer', answer);
    });

    socket.on('candidate', (candidate, room) => {
        socket.to(room).emit('candidate', candidate);
    });
    // ----------------------------------------------------------

    socket.on('disconnect', async (reason) => {
        const text = `user ${socket.id} disconnected due to: ${reason}`;

        users.delete(socket.id);

        io.emit('users size', users.size);

        if (process.env.ENVIRONMENT !== 'development') {
            try {
                const response = await axios.get('http://localhost:3000/bot?message=\'a user disconnected\'');
                const data = response.data;

                socket.broadcast.emit('info user', data.choices[0].message.content);
            } catch (error) {
                console.error(error);
            }
        } else {
            socket.broadcast.emit('info user', text);
        }

        console.log(text);
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
                    console.log(error);
                } else {
                    console.log('Email sent: ' + info.response);
                }
            });
        }

        const randomNumber = Math.floor(Math.random() * 4) + 1;

        if (process.env.ENVIRONMENT !== 'development' && randomNumber === 1) {
            try {
                const response = await axios.get(`http://localhost:3000/bot?message=${msg}`);
                const data = response.data;

                io.emit('info user', data.choices[0].message.content);
            } catch (error) {
                console.error(error);
            }
        }
    });
});

app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'index.html'));
});

app.get('/bot', async (req, res) => {
    const message = req.query.message ?? 'Hi';
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

    // res.send(response.choices[0].message.content);
    res.send(response);
});

app.get('/ping', async (_req, res) => {
    res.sendStatus(200);
});

app.get('/status', async (_req, res) => {
    const itr = users.entries();
    const entries = [];

    for(let i= 0; i < users.size; i++) {
        entries.push(itr.next().value[0]);
    }

    res.send({ status: users.size, entries });
});

server.listen(PORT, () => {
    console.log(`Server is listening on http://localhost:${PORT}`);
});
