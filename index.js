'use strict';

require('dotenv').config();

const fs = require('fs');
const https = require('https');
const axios = require('axios');
const express = require('express');
const winston = require('winston');
const { createServer} = require('node:http');
const { join} = require('node:path');
const { Server } = require('socket.io');
const { OpenAI } = require('openai');
const { createTransport } = require('nodemailer');
const { from, first, of, map} = require('rxjs');
const { head } = require('ramda');
const { v4: uuidv4 } = require('uuid');

//const { WebSocketServer, WebSocket } = require('ws');
//
//const wss = new WebSocketServer({ port: 3030 });
//
// wss.on('connection',  (ws) => {
//     console.log('connection');
//
//     ws.on('message', (data, isBinary) => {
//         console.dir(data);
//
//         // A client WebSocket broadcasting to all connected WebSocket clients, including itself.
//         // wss.clients.forEach((client) => {
//         //     if (client.readyState === WebSocket.OPEN) {
//         //         client.send(data, { binary: isBinary });
//         //     }
//         // });
//
//         // A client WebSocket broadcasting to every other connected WebSocket clients, excluding itself.
//         wss.clients.forEach((client) => {
//             if (client !== ws && client.readyState === WebSocket.OPEN) {
//                 client.send(data, { binary: isBinary });
//             }
//         });
//     });
//
//     ws.on('error', console.error);
// });

// ICU
// const number = 123456.789;
// console.log(new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(number));
// console.log(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(number));
// console.log( ['thomas', 'äpfel', 'Müller', 'Zebra'].sort(new Intl.Collator('de-DE').compare));
// console.log(new Intl.DateTimeFormat('en-GB', {dateStyle: 'full', timeStyle: 'long', timeZone: 'Australia/Sydney',}).format(new Date()));

const env = process.env;
const systemLocale = env.LANG || env.LANGUAGE || env.LOCALE || Intl.DateTimeFormat().resolvedOptions().locale;
const timeZone = env.TIME_ZONE || Intl.DateTimeFormat().resolvedOptions().timeZone;
const PORT = 3000;
const app = express();
const protocol = process.env.ENVIRONMENT === 'development' ? 'https' : 'http';
const key  = fs.readFileSync('./mkcert/localhost-key.pem', 'utf-8');
const cert = fs.readFileSync('./mkcert/localhost.pem', 'utf-8');
const server = protocol === 'https' ? https.createServer({key, cert}, app) : createServer(app);
const io = new Server(server);
const openai = new OpenAI({
    apiKey: env.OPENAI_APIKEY
});

const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ level, message, timestamp }) => {
            const date = new Date(timestamp);
            const dateFormatter = new Intl.DateTimeFormat(systemLocale, {
                dateStyle: 'full',
                timeStyle: 'long',
                timeZone
            });

            return `${dateFormatter.format(date)} ${level}: ${message}`;
        })
    ),
    defaultMeta: { service: 'chat-service' },
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/app.log' }),
    ],
});

const transporter = createTransport({
    service: 'Gmail',
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
        user: 'thoschulte@gmail.com',
        pass: env.GMAIL_PASS
    }
});

const users = new Set();

app.use('/assets', express.static('assets'));

io.on('connection', async (socket) => {
    const token = socket.handshake.auth.token;

    if(token !== env.TOKEN) {
        socket.disconnect(true);

        return;
    }

    if (env.ENVIRONMENT !== 'development') {
        const response = await getBotResponse(`a user connected`);

        emitBotMessage(response, (message) => {
            socket.broadcast.emit('info user', message);
        });
    }

    users.add(socket.id);

    io.emit('users size', users.size);

    socket.broadcast.emit('new user', socket.id);

    socket.on('signal', data => {

    });

    socket.on('signal', (data, callback = ()=>{}) => {
        const { candidate, sdp } = data;

        if(candidate) {
            logger.info(`candidate: ${JSON.stringify(candidate.usernameFragment)}`);
        } else if(sdp) {
            logger.info(`sdp: ${JSON.stringify(sdp.type)}`);

            callback({
                status: 'success',
                message: sdp.type
            });
        } else {}

        socket.broadcast.emit('signal', data);
    });

    socket.on('update', ({from, to}) => {
        io.to(to).emit('new user', from, false);
    });

    socket.on('disconnect', async (reason) => {
        const text = `user ${socket.id} disconnected due to: ${reason}`;

        users.delete(socket.id);

        io.emit('users size', users.size);

        if (env.ENVIRONMENT !== 'development') {
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

        if (env.ENVIRONMENT !== 'development') {
            await transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    logger.error(error);
                } else {
                    logger.info('email sent: ' + info.response);
                }
            });
        }

        if (env.ENVIRONMENT !== 'development') {
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
        res.status(423);
        res.send(`
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <!-- Simple HttpErrorPages | MIT License | https://github.com/HttpErrorPages -->
                <meta charset="utf-8">
                <meta http-equiv="X-UA-Compatible" content="IE=edge">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>We&#39;ve got some trouble | 423 - Locked</title>
                <style type="text/css">
                    /*! normalize.css v5.0.0 | MIT License | github.com/necolas/normalize.css */
                    html{font-family:sans-serif;line-height:1.15;-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%}body{margin:0}article,aside,footer,header,nav,section{display:block}h1{font-size:2em;margin:.67em 0}figcaption,figure,main{display:block}figure{margin:1em 40px}hr{box-sizing:content-box;height:0;overflow:visible}pre{font-family:monospace,monospace;font-size:1em}a{background-color:transparent;-webkit-text-decoration-skip:objects}a:active,a:hover{outline-width:0}abbr[title]{border-bottom:none;text-decoration:underline;text-decoration:underline dotted}b,strong{font-weight:inherit}b,strong{font-weight:bolder}code,kbd,samp{font-family:monospace,monospace;font-size:1em}dfn{font-style:italic}mark{background-color:#ff0;color:#000}small{font-size:80%}sub,sup{font-size:75%;line-height:0;position:relative;vertical-align:baseline}sub{bottom:-.25em}sup{top:-.5em}audio,video{display:inline-block}audio:not([controls]){display:none;height:0}img{border-style:none}svg:not(:root){overflow:hidden}button,input,optgroup,select,textarea{font-family:sans-serif;font-size:100%;line-height:1.15;margin:0}button,input{overflow:visible}button,select{text-transform:none}[type=reset],[type=submit],button,html [type=button]{-webkit-appearance:button}[type=button]::-moz-focus-inner,[type=reset]::-moz-focus-inner,[type=submit]::-moz-focus-inner,button::-moz-focus-inner{border-style:none;padding:0}[type=button]:-moz-focusring,[type=reset]:-moz-focusring,[type=submit]:-moz-focusring,button:-moz-focusring{outline:1px dotted ButtonText}fieldset{border:1px solid silver;margin:0 2px;padding:.35em .625em .75em}legend{box-sizing:border-box;color:inherit;display:table;max-width:100%;padding:0;white-space:normal}progress{display:inline-block;vertical-align:baseline}textarea{overflow:auto}[type=checkbox],[type=radio]{box-sizing:border-box;padding:0}[type=number]::-webkit-inner-spin-button,[type=number]::-webkit-outer-spin-button{height:auto}[type=search]{-webkit-appearance:textfield;outline-offset:-2px}[type=search]::-webkit-search-cancel-button,[type=search]::-webkit-search-decoration{-webkit-appearance:none}::-webkit-file-upload-button{-webkit-appearance:button;font:inherit}details,menu{display:block}summary{display:list-item}canvas{display:inline-block}template{display:none}[hidden]{display:none}/*! Simple HttpErrorPages | MIT X11 License | https://github.com/AndiDittrich/HttpErrorPages */body,html{width:100%;height:100%;background-color:#21232a}body{color:#fff;text-align:center;text-shadow:0 2px 4px rgba(0,0,0,.5);padding:0;min-height:100%;-webkit-box-shadow:inset 0 0 100px rgba(0,0,0,.8);box-shadow:inset 0 0 100px rgba(0,0,0,.8);display:table;font-family:"Open Sans",Arial,sans-serif}h1{font-family:inherit;font-weight:500;line-height:1.1;color:inherit;font-size:36px}h1 small{font-size:68%;font-weight:400;line-height:1;color:#777}a{text-decoration:none;color:#fff;font-size:inherit;border-bottom:dotted 1px #707070}.lead{color:silver;font-size:21px;line-height:1.4}.cover{display:table-cell;vertical-align:middle;padding:0 20px}footer{position:fixed;width:100%;height:40px;left:0;bottom:0;color:#a0a0a0;font-size:14px}
                </style>
            </head>
            <body>
                <div class="cover">
                    <h1>Locked <small>423</small></h1><p class="lead">The target file or folder is locked!!!</p>
                </div>
            </body>
        </html>
        `);
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
    logger.log({
        level: 'info',
        message: `
            Locale: ${systemLocale}, timezone: ${timeZone}.
            Server is listening on ${protocol}://localhost:${PORT} in ${env.ENVIRONMENT}.
        `
    });
    // logger.info(`Server is listening on ${protocol}://localhost:${PORT} in ${env.ENVIRONMENT}.`);
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
