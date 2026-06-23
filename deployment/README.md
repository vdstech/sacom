# Demo Deployment: Ubuntu, PM2, Caddy, and MongoDB Atlas

This deployment runs every process on one Ubuntu VPS. Only Caddy listens on
public ports. Caddy terminates HTTPS and proxies to loopback-only Node
processes.

## Architecture

```
Internet
  ├─ https://store.example.com ── Caddy ── 127.0.0.1:3001 storefront
  ├─ https://admin.example.com ── Caddy ── 127.0.0.1:3000 admin portal
  └─ https://api.example.com   ── Caddy ── 127.0.0.1:4000 gateway
                                                   ├─ 127.0.0.1:4443 auth
                                                   ├─ 127.0.0.1:4444 catalog
                                                   └─ 127.0.0.1:4445 product

MongoDB Atlas
```

Use MongoDB Atlas for this demo. It avoids exposing or maintaining a local
database, and provides managed backups. Add the VPS public IPv4 address to the
Atlas network access list and create a least-privilege database user.

## Services

| Service | Folder | Runtime | Build | Start | Port | Exposure |
| --- | --- | --- | --- | --- | --- | --- |
| Storefront | `siri-frontend-simple-proxy-v2` | Next.js | `npm run build` | `npm start -- -p 3001 -H 127.0.0.1` | 3001 | Caddy only |
| Admin portal | `admin-portal` | Next.js | `npm run build` | `npm start -- -p 3000 -H 127.0.0.1` | 3000 | Caddy only |
| API gateway | `gateway-svc` | Node/Express | none | `npm start` | 4000 | Caddy only |
| Auth/orders | `auth-svc` | Node/Express | none | `npm start` | 4443 | internal |
| Catalog | `catalog-svc` | Node/Express | none | `npm start` | 4444 | internal |
| Product/cart/reviews | `product-svc` | Node/Express | none | `npm start` | 4445 | internal |
| Navigation | `navigation-svc` | incomplete | n/a | n/a | n/a | do not deploy |

The two Next apps proxy browser API requests through their own same-origin
routes. Their server-side target is `GATEWAY_INTERNAL_URL`; no frontend should
call an internal backend directly. `api.example.com` is available for API
inspection and integrations through the gateway only.

## Environment Files

Copy each committed template to its sibling `.env` on the VPS and replace every
`replace_*` value. Do not commit the generated `.env` files.

```
cp auth-svc/.env.demo.example auth-svc/.env
cp catalog-svc/.env.demo.example catalog-svc/.env
cp product-svc/.env.demo.example product-svc/.env
cp gateway-svc/.env.demo.example gateway-svc/.env
cp admin-portal/.env.demo.example admin-portal/.env
cp siri-frontend-simple-proxy-v2/.env.demo.example siri-frontend-simple-proxy-v2/.env
chmod 600 auth-svc/.env catalog-svc/.env product-svc/.env gateway-svc/.env \
  admin-portal/.env siri-frontend-simple-proxy-v2/.env
```

Required shared values:

| Variable | Services | Value |
| --- | --- | --- |
| `MONGO_URI` | auth, catalog, product | Same Atlas database URI |
| `ACCESS_TOKEN_SECRET` | auth, catalog, product | Same long random secret |
| `CORS_ORIGINS` | auth, catalog, product, gateway | `https://store.<domain>,https://admin.<domain>` |
| `GATEWAY_INTERNAL_URL` | both Next apps | `http://127.0.0.1:4000` |
| `OPENAI_API_KEY` | product | Server-only OpenAI key; never use a `NEXT_PUBLIC_` name |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | auth seed | Unique demo credentials |

`ENABLE_TLS=false` is intentional. Caddy owns public TLS. `HOST=127.0.0.1`
keeps every Node listener private to the VPS.

## Seeding and Indexes

Run `npm run seed` once from `auth-svc` after the Atlas connection is ready.
It idempotently seeds permissions, the roles below, and one super-admin user
from `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`. Re-running the seed resets
that configured super-admin password, so use a unique value and do not run it
casually after user access has been configured.

| Seeded role | Demo responsibility |
| --- | --- |
| `SUPER_ADMIN` | Full system access and seed owner |
| `ADMIN` | Full administrative access |
| `ORDER_ADMIN` | Order oversight and pre-shipment cancellation |
| `PROCESSING_MANAGER` | Pick and hand over orders |
| `PACKAGING_MANAGER` | Receive, verify, pack, and hand over items |
| `SHIPPING_OPERATOR` | Receive, track, ship items |
| `CANCELLATION_MANAGER` | Resolve cancelled stock as restocked, damaged, or lost |
| `RETURN_EXCHANGE_HANDLER` | Investigate returns and exchanges |
| `INVENTORY_MANAGER` | View and update inventory |

`product-svc` synchronizes its variant, inventory, cart, and review indexes at
startup. The other Mongoose services use schema index creation on startup.
There is no separate migration command. Legacy status and stock fallbacks exist
for earlier data, but no historical migration is required for a fresh v1 demo.

## DNS and Caddy

Register the domain with GoDaddy or use an existing GoDaddy-managed domain, then
create these DNS records before starting Caddy:

| Type | Name | Value |
| --- | --- | --- |
| A | `store` | VPS public IPv4 |
| A | `admin` | VPS public IPv4 |
| A | `api` | VPS public IPv4 |

Replace `example.com` in `deployment/Caddyfile.example`, install it as
`/etc/caddy/Caddyfile`, validate it, then reload Caddy. Caddy obtains and
renews certificates automatically once public DNS resolves to this VPS.

## Ubuntu Setup

Run the privileged commands as a sudo-capable user. Run Node, PM2, and the
application as the unprivileged `sacom` user.

```bash
sudo apt update
sudo apt install -y git curl build-essential ufw ca-certificates
sudo adduser --disabled-password --gecos "" sacom
sudo mkdir -p /opt/sacom
sudo chown sacom:sacom /opt/sacom

sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy

sudo -iu sacom
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.5/install.sh | bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm install --lts
npm install -g pm2
git clone <your-repository-url> /opt/sacom/app
cd /opt/sacom/app
```

Copy and fill the environment files, then install and build:

```bash
for app in auth-svc catalog-svc product-svc gateway-svc admin-portal siri-frontend-simple-proxy-v2; do
  (cd "$app" && npm ci)
done

(cd admin-portal && npm run build)
(cd siri-frontend-simple-proxy-v2 && npm run build)

(cd auth-svc && npm run seed)
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

`pm2 startup` prints one sudo command. Run exactly that command as instructed,
then run `pm2 save` again. Do not run PM2 as root.

Install Caddy configuration and firewall rules as the sudo-capable user:

```bash
sudo cp /opt/sacom/app/deployment/Caddyfile.example /etc/caddy/Caddyfile
sudoedit /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy

sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Do not open ports `3000`, `3001`, `4000`, `4443`, `4444`, `4445`, or `27017` in
the firewall.

## Updates and Rollback

For an update, back up Atlas, capture the deployed revision, then rebuild the
Next apps and reload PM2:

```bash
cd /opt/sacom/app
git rev-parse HEAD
git pull --ff-only
for app in auth-svc catalog-svc product-svc gateway-svc admin-portal siri-frontend-simple-proxy-v2; do
  (cd "$app" && npm ci)
done
(cd admin-portal && npm run build)
(cd siri-frontend-simple-proxy-v2 && npm run build)
pm2 reload ecosystem.config.js --update-env
```

To roll back code, check out the saved commit or release tag, repeat dependency
installation and both frontend builds, then run `pm2 reload ecosystem.config.js
--update-env`. There are no formal database migration/down-migration scripts in
this repository; restore Atlas from backup if a future release changes stored
data incompatibly.

## Smoke Test

```bash
pm2 status
pm2 logs --lines 100
curl -fsS http://127.0.0.1:4443/health
curl -fsS http://127.0.0.1:4444/health
curl -fsS http://127.0.0.1:4445/health
curl -fsS http://127.0.0.1:4000/health
curl -fsSI https://store.example.com
curl -fsSI https://admin.example.com/login
curl -fsS https://api.example.com/health
```

Then verify: admin login, category/product listing, customer registration and
checkout, order picking/packaging/shipping/delivery, cancellation visibility,
review moderation, and audit-log visibility.

## Demo Limits

- Checkout uses application payment status simulation. There is no configured
  payment provider, webhook verification, or real refund integration.
- No email or SMS delivery provider is configured; notification records are
  placeholders.
- Product images are URL fields; no object-storage upload pipeline is present.
- Audit logs are stored in MongoDB. Set `AUDIT_LOG_RETENTION_DAYS` only when a
  retention policy is agreed.
- The existing Docker Compose file publishes MongoDB and internal backend ports
  and includes placeholder secrets. It is not the recommended demo deployment
  without a separate hardening pass. PM2 + Caddy + Atlas is simpler and safer
  for this target architecture.
