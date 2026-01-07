import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import pino from 'pino'
import pinoHttp from 'pino-http'
import { connectMongo } from './db.js'
import {getTlsOptions} from './tls.js'
import https from 'https'
import http from 'http'
import cors from "cors";
import categoryRoutes from "./categories/category.routes.js";

const app = express()

const TRUST_PROXY = String(process.env.TRUST_PROXY || 'false').toLowerCase() === 'true';
// Trust proxy if you later put this behind nginx/ingress
if (TRUST_PROXY) app.set('trust proxy', 1);

//This is for security headers in the server.
app.use(helmet())
app.use(helmet.hsts({
    maxAge: 31536000, // 1 year in seconds
    includeSubDomains: true,
    preload: true
}))

const logger = pino({base: {service: 'catalog-svc'}})
app.use(pinoHttp({logger}))
app.use(express.json({limit: '200kb'}))

app.use(cors({
  origin: ["http://localhost:3000"],   // your Next dev origin
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

const corsOptions = {
  origin: ["http://localhost:3000"], // add https://localhost:3000 if you run Next on https
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

// MUST be before routes
app.use(cors(corsOptions));

// preflight for all routes
app.options(/.*/, cors(corsOptions)); 

app.use("/api/categories", categoryRoutes);

app.get('/health', (req, res) => {
    res.json({ok: true, service: 'catalog-svc', time: new Date().toISOString()})
})


;(async () => {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/catalog_db'
        await connectMongo(mongoUri)
        logger.info('Connected to MongoDB at ' + mongoUri)
        
        // Start HTTPS server with TLS
        try {
            const creds = getTlsOptions()
            const httpsPort = process.env.HTTPS_PORT || 4444
            https.createServer(creds, app).listen(httpsPort, () => {
                logger.info(`Catalog Service running on port ${httpsPort} with TLS`)
            })

            // Optional HTTP redirect server
            if (process.env.REDIRECT_SERVER === 'TRUE') {
                const httpPort = process.env.HTTP_PORT || 4044
                http.createServer((req, res) => {
                    const host = req.headers.host || `localhost:${httpsPort}`;
                    const targetHost = host.includes(':') ? host.split(':')[0] + `:${httpsPort}` : `${host}:${httpsPort}`
                    const location = `https://${targetHost}${req.url}`
                    res.writeHead(301, { Location: location })
                    res.end()
                }).listen(httpPort, () => {
                    logger.info(`HTTP redirect server listening on port ${httpPort}`)
                })
            }
        } catch (tlsErr) {
            logger.error('Failed to start server', tlsErr)
            process.exit(1)
        }
    }
    catch (err) {
        logger.error('Failed to start server', err)
        process.exit(1)
    }
})()

//mongod --dbpath ~/spaces/mongo
