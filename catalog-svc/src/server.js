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
import { validateRequiredEnv } from './config/validateRequiredEnv.js'
import { requestContextMiddleware } from "../../shared/request-context.js";

const app = express()
const ENABLE_TLS = String(process.env.ENABLE_TLS || 'false').toLowerCase() === 'true';
const BIND_HOST = process.env.HOST || '127.0.0.1';
const corsOrigins = String(process.env.CORS_ORIGINS || "http://localhost:3000,https://localhost:3000,http://localhost:3001,https://localhost:3001")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

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
app.use(requestContextMiddleware)
app.use(express.json({limit: '200kb'}))

const corsOptions = {
  origin: corsOrigins,
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
        validateRequiredEnv('catalog-svc', logger, ['ACCESS_TOKEN_SECRET', ...(ENABLE_TLS ? ['TLS_CERT_PATH', 'TLS_KEY_PATH'] : [])])
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/commerce_db'
        await connectMongo(mongoUri)
        logger.info('Connected to MongoDB at ' + mongoUri)
        
        try {
            const httpsPort = process.env.HTTPS_PORT || process.env.PORT || 4444
            if (ENABLE_TLS) {
                const creds = getTlsOptions()
                https.createServer(creds, app).listen(httpsPort, BIND_HOST, () => {
                    logger.info(`Catalog Service running on ${BIND_HOST}:${httpsPort} with TLS`)
                })
            } else {
                http.createServer(app).listen(httpsPort, BIND_HOST, () => {
                    logger.info(`Catalog Service running on ${BIND_HOST}:${httpsPort} without TLS`)
                })
            }

            if (ENABLE_TLS && String(process.env.REDIRECT_SERVER || 'false').toLowerCase() === 'true') {
                const httpPort = process.env.HTTP_PORT || 4044
                http.createServer((req, res) => {
                    const host = req.headers.host || `localhost:${httpsPort}`;
                    const targetHost = host.includes(':') ? host.split(':')[0] + `:${httpsPort}` : `${host}:${httpsPort}`
                    const location = `https://${targetHost}${req.url}`
                    res.writeHead(301, { Location: location })
                    res.end()
                }).listen(httpPort, BIND_HOST, () => {
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
