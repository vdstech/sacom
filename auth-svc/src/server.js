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
import rolesRouter from './admin-roles/admin-roles.routes.js'
import adminUsers from './admin-users/admin-users.routes.js'
import meRouter from './admin-auth/admin-auth.me.routes.js'
import authRouter from './admin-auth/admin-auth.routes.js';
import sessionRouter from './admin-sessions/admin-sessions.routes.js'
import permissionRouter from './admin-permissions/admin-permissions.routes.js'
import customerAuthRouter from "./customer-auth/customer-auth.routes.js";
import customerMeRouter from "./customer-profile/customer-profile.routes.js";
import customerAddressRouter from "./customer-addresses/customer-addresses.routes.js";
import customerWishlistRouter from "./customer-wishlist/customer-wishlist.routes.js";
import customerOrderRouter from "./customer-orders/customer-orders.routes.js";
import adminOrderRouter from "./customer-orders/customer-orders.admin.routes.js";
import { startOrderDeliveryWorker } from "./customer-orders/customer-orders.worker.js";
import { validateRequiredEnv } from './config/validateRequiredEnv.js'
import auditRouter from "./audit/audit.routes.js";
import { requestContextMiddleware } from "../../shared/request-context.js";

const app = express()
const ENABLE_TLS = String(process.env.ENABLE_TLS || 'false').toLowerCase() === 'true';
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

const logger = pino({base: {service: 'auth-svc'}})
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


app.use('/api/admin/roles', rolesRouter)
app.use('/api/admin/users', adminUsers)
app.use('/api/', meRouter)
app.use('/auth', authRouter)
app.use('/', authRouter)
app.use('/auth/customer', customerAuthRouter)
app.use('/auth/session', sessionRouter)
app.use('/api/admin/permissions', permissionRouter)
app.use('/api/admin/orders', adminOrderRouter)
app.use('/api/admin/audit', auditRouter)
app.use('/api/customer/me', customerMeRouter)
app.use('/api/customer/addresses', customerAddressRouter)
app.use('/api/customer/wishlist', customerWishlistRouter)
app.use('/api/customer/orders', customerOrderRouter)

// Deprecated: product routes moved behind gateway to product-svc
app.use('/products', (req, res) => {
    res.status(410).json({ error: 'Products API has moved to product-svc' })
})

app.get('/health', (req, res) => {
    res.json({ok: true, service: 'auth-svc', time: new Date().toISOString()})
})


;(async () => {
    try {
        validateRequiredEnv('auth-svc', logger, ['ACCESS_TOKEN_SECRET', ...(ENABLE_TLS ? ['TLS_CERT_PATH', 'TLS_KEY_PATH'] : [])])
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/commerce_db'
        await connectMongo(mongoUri)
        logger.info('Connected to MongoDB at ' + mongoUri)
        startOrderDeliveryWorker(logger)
        
        try {
            const httpsPort = process.env.HTTPS_PORT || process.env.PORT || 4443
            if (ENABLE_TLS) {
                const creds = getTlsOptions()
                https.createServer(creds, app).listen(httpsPort, () => {
                    logger.info(`Auth Service running on port ${httpsPort} with TLS`)
                })
            } else {
                http.createServer(app).listen(httpsPort, () => {
                    logger.info(`Auth Service running on port ${httpsPort} without TLS`)
                })
            }

            if (ENABLE_TLS && String(process.env.REDIRECT_SERVER || 'false').toLowerCase() === 'true') {
                const httpPort = process.env.HTTP_PORT || 4040
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
